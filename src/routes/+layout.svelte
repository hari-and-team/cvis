<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import EditorPane from '$lib/components/EditorPane.svelte';
  import HeaderBar from '$lib/components/HeaderBar.svelte';
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';
  import RightPane from '$lib/components/RightPane.svelte';
  import { runBinaryAction, runCompileAction, runTraceAction } from '$lib/layout/run-actions';
  import {
    lastBinaryPath,
    lastRunInputTranscript,
    rightPaneTab,
    editorCode,
    traceSteps,
    currentStepIndex,
    isPlaying,
    mentorSelectionMode,
    selectedPracticeProblemId,
    activeMilestoneIndex,
    milestoneProgress,
    profileEditorOpen,
    userProfile
  } from '$lib/stores';
  import type { UserProfile } from '$lib/types';

  let isTracing = false;
  let traceErr: string | null = null;
  let persistenceReady = false;
  let persistTimer: number | null = null;
  let lastEditorCodeSnapshot = '';
  let lastPersistedDraftRaw = '';
  let competingDraft: PersistedDraft | null = null;
  let competingDraftSavedAtLabel = '';

  const DRAFT_STORAGE_KEY = 'cvis:draft:v1';
  const DRAFT_BACKUP_STORAGE_KEY = 'cvis:draft:backup:v1';
  const PROFILE_STORAGE_KEY = 'cvis:profile:v1';

  interface PersistedDraft {
    code: string;
    rightPaneTab: 'console' | 'visualizer' | 'analysis' | 'mentor';
    mentorSelectionMode: 'guided' | 'manual';
    selectedPracticeProblemId: string | null;
    activeMilestoneIndex: number;
    milestoneProgress: Record<string, boolean>;
    savedAt: number;
  }

  function createDraftSnapshot(savedAt = Date.now()): PersistedDraft {
    return {
      code: $editorCode,
      rightPaneTab: $rightPaneTab,
      mentorSelectionMode: $mentorSelectionMode,
      selectedPracticeProblemId: $selectedPracticeProblemId,
      activeMilestoneIndex: $activeMilestoneIndex,
      milestoneProgress: $milestoneProgress,
      savedAt
    };
  }

  function serializeDraft(draft: PersistedDraft): string {
    return JSON.stringify(draft);
  }

  function applyDraftToState(draft: PersistedDraft) {
    editorCode.set(draft.code);
    rightPaneTab.set(draft.rightPaneTab);
    mentorSelectionMode.set(draft.mentorSelectionMode);
    selectedPracticeProblemId.set(draft.selectedPracticeProblemId);
    activeMilestoneIndex.set(draft.activeMilestoneIndex);
    milestoneProgress.set(draft.milestoneProgress);
  }

  function normalizeMilestoneProgress(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(([, entryValue]) => typeof entryValue === 'boolean')
    );
  }

  function persistBackupDraft(draft: PersistedDraft) {
    localStorage.setItem(DRAFT_BACKUP_STORAGE_KEY, serializeDraft(draft));
  }

  function parseProfile(raw: string | null): UserProfile | null {
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.displayName !== 'string' || !parsed.displayName.trim()) return null;
      if (!['student', 'mentor', 'staff'].includes(String(parsed.role))) return null;

      const leetCode =
        parsed.leetCode &&
        typeof parsed.leetCode === 'object' &&
        typeof parsed.leetCode.username === 'string' &&
        typeof parsed.leetCode.profileUrl === 'string'
          ? {
              username: parsed.leetCode.username,
              profileUrl: parsed.leetCode.profileUrl
            }
          : null;

      return {
        displayName: parsed.displayName.trim(),
        role: parsed.role as UserProfile['role'],
        learningGoal: typeof parsed.learningGoal === 'string' ? parsed.learningGoal : '',
        leetCode,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
      };
    } catch {
      return null;
    }
  }

  function restoreProfileFromStorage() {
    try {
      const restored = parseProfile(localStorage.getItem(PROFILE_STORAGE_KEY));
      userProfile.set(restored);
      profileEditorOpen.set(false);
    } catch (err) {
      console.error('Failed to restore profile from local storage:', err);
      userProfile.set(null);
      profileEditorOpen.set(false);
    }
  }

  function persistProfileToStorage(profile: UserProfile | null) {
    try {
      if (!profile) {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        return;
      }

      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
      console.error('Failed to persist profile to local storage:', err);
    }
  }

  function formatSavedAtLabel(timestamp: number): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(timestamp);
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  }

  function parseDraft(raw: string | null): PersistedDraft | null {
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<PersistedDraft>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.code !== 'string') return null;
      if (!['console', 'visualizer', 'analysis', 'mentor'].includes(String(parsed.rightPaneTab))) return null;
      if (!['guided', 'manual'].includes(String(parsed.mentorSelectionMode ?? 'guided'))) return null;

      return {
        code: parsed.code,
        rightPaneTab: parsed.rightPaneTab as PersistedDraft['rightPaneTab'],
        mentorSelectionMode: parsed.mentorSelectionMode as PersistedDraft['mentorSelectionMode'] ?? 'guided',
        selectedPracticeProblemId:
          typeof parsed.selectedPracticeProblemId === 'string' ? parsed.selectedPracticeProblemId : null,
        activeMilestoneIndex:
          typeof parsed.activeMilestoneIndex === 'number' && parsed.activeMilestoneIndex >= 0
            ? Math.floor(parsed.activeMilestoneIndex)
            : 0,
        milestoneProgress: normalizeMilestoneProgress(parsed.milestoneProgress),
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now()
      };
    } catch {
      return null;
    }
  }

  function restoreDraftFromStorage() {
    try {
      const primaryRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
      const primary = parseDraft(primaryRaw);
      const backup = parseDraft(localStorage.getItem(DRAFT_BACKUP_STORAGE_KEY));
      const restored = primary ?? backup;

      if (!restored) return;

      applyDraftToState(restored);
      lastPersistedDraftRaw = primaryRaw ?? serializeDraft(restored);
    } catch (err) {
      console.error('Failed to restore draft from local storage:', err);
    }
  }

  function persistDraftToStorage() {
    try {
      const payload: PersistedDraft = {
        ...createDraftSnapshot(),
        savedAt: Date.now()
      };
      const serialized = serializeDraft(payload);
      const previousRaw = localStorage.getItem(DRAFT_STORAGE_KEY);

      if (previousRaw && previousRaw !== serialized) {
        localStorage.setItem(DRAFT_BACKUP_STORAGE_KEY, previousRaw);
      }

      localStorage.setItem(DRAFT_STORAGE_KEY, serialized);
      lastPersistedDraftRaw = serialized;
      if (competingDraft && serialized === serializeDraft(competingDraft)) {
        competingDraft = null;
        competingDraftSavedAtLabel = '';
      }
    } catch (err) {
      console.error('Failed to persist draft to local storage:', err);
    }
  }

  function handleStorageConflict(event: StorageEvent) {
    if (!persistenceReady || event.storageArea !== localStorage || event.key !== DRAFT_STORAGE_KEY) {
      return;
    }

    const incomingDraft = parseDraft(event.newValue);
    if (!incomingDraft) {
      return;
    }

    const incomingRaw = serializeDraft(incomingDraft);
    if (incomingRaw === lastPersistedDraftRaw) {
      return;
    }

    const currentDraftRaw = serializeDraft(createDraftSnapshot(incomingDraft.savedAt));
    if (incomingRaw === currentDraftRaw) {
      lastPersistedDraftRaw = incomingRaw;
      return;
    }

    competingDraft = incomingDraft;
    competingDraftSavedAtLabel = formatSavedAtLabel(incomingDraft.savedAt);
  }

  function keepCurrentDraft() {
    if (!browser || !competingDraft) return;

    persistBackupDraft(competingDraft);
    competingDraft = null;
    competingDraftSavedAtLabel = '';
    persistDraftToStorage();
  }

  function loadCompetingDraft() {
    if (!browser || !competingDraft) return;

    const currentDraft = createDraftSnapshot();
    persistBackupDraft(currentDraft);
    applyDraftToState(competingDraft);
    lastPersistedDraftRaw = serializeDraft(competingDraft);
    competingDraft = null;
    competingDraftSavedAtLabel = '';
  }

  function scheduleDraftPersist() {
    if (!browser || !persistenceReady) return;

    if (persistTimer !== null) {
      clearTimeout(persistTimer);
    }

    persistTimer = window.setTimeout(() => {
      persistDraftToStorage();
      persistTimer = null;
    }, 250);
  }

  onMount(() => {
    restoreProfileFromStorage();
    restoreDraftFromStorage();
    lastEditorCodeSnapshot = $editorCode;
    persistenceReady = true;
    window.addEventListener('storage', handleStorageConflict);
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener('storage', handleStorageConflict);
    }
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
    }
    if (browser && persistenceReady) {
      persistDraftToStorage();
    }
  });

  $: if (browser && persistenceReady) {
    $userProfile;
    persistProfileToStorage($userProfile);
  }

  $: if (browser && persistenceReady) {
    $editorCode;
    $rightPaneTab;
    $mentorSelectionMode;
    $selectedPracticeProblemId;
    $activeMilestoneIndex;
    $milestoneProgress;
    scheduleDraftPersist();
  }

  $: if (browser && persistenceReady && $editorCode !== lastEditorCodeSnapshot) {
    lastEditorCodeSnapshot = $editorCode;
    lastBinaryPath.set(null);
    lastRunInputTranscript.set('');
    traceErr = null;
  }

  function resetTraceUiState() {
    traceSteps.set([]);
    currentStepIndex.set(0);
    isPlaying.set(false);
    traceErr = null;
  }

  async function handleCompile() {
    if (!browser) return;

    resetTraceUiState();
    rightPaneTab.set('console');

    await runCompileAction({
      code: $editorCode
    });
  }

  async function handleRun() {
    if (!browser) return;

    resetTraceUiState();
    rightPaneTab.set('console');

    await runBinaryAction($lastBinaryPath);
  }

  async function handleTrace() {
    if (!browser) return;

    traceErr = null;
    isPlaying.set(false);
    rightPaneTab.set('visualizer');

    const requiresRuntimeReplay = /\bscanf\s*\(/.test($editorCode);
    const traceInput = $lastRunInputTranscript;

    if (requiresRuntimeReplay && traceInput.length === 0) {
      traceErr = 'Run the program once in the Console and enter stdin there before tracing scanf()-based code.';
      traceSteps.set([]);
      currentStepIndex.set(0);
      return;
    }

    isTracing = true;

    try {
      const result = await runTraceAction({
        code: $editorCode,
        input: traceInput
      });
      traceErr = result.traceErr;
    } finally {
      isTracing = false;
    }
  }

  function handleProfileSave(event: CustomEvent<{ profile: UserProfile }>) {
    userProfile.set(event.detail.profile);
    profileEditorOpen.set(false);
  }

  function handleProfileCancel() {
    if (!$userProfile) {
      return;
    }

    profileEditorOpen.set(false);
  }
</script>

<div class="app">
  <HeaderBar
    on:compile={handleCompile}
    on:run={handleRun}
    on:editProfile={() => {
      if ($userProfile) {
        profileEditorOpen.set(true);
      }
    }}
  />
  {#if competingDraft}
    <div class="draft-conflict-banner" role="status" aria-live="polite">
      <div class="draft-conflict-copy">
        <span class="draft-conflict-title">Competing draft detected</span>
        <span class="draft-conflict-text">
          A newer draft was saved in another tab or window{#if competingDraftSavedAtLabel} at {competingDraftSavedAtLabel}{/if}.
          Choose which version to keep as the active draft.
        </span>
      </div>
      <div class="draft-conflict-actions">
        <button type="button" class="draft-conflict-btn secondary" on:click={keepCurrentDraft}>
          Keep current draft
        </button>
        <button type="button" class="draft-conflict-btn primary" on:click={loadCompetingDraft}>
          Load newer draft
        </button>
      </div>
    </div>
  {/if}
  <div class="main">
    <EditorPane {isTracing} on:trace={handleTrace} />
    <RightPane
      on:trace={handleTrace}
      traceSteps={$traceSteps}
      currentStep={$currentStepIndex}
      {isTracing}
      {traceErr}
    />
  </div>
  <slot />
</div>

<OnboardingModal
  open={$profileEditorOpen && Boolean($userProfile)}
  existingProfile={$userProfile}
  on:save={handleProfileSave}
  on:cancel={handleProfileCancel}
/>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .draft-conflict-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 16px;
    background: linear-gradient(135deg, rgba(209, 154, 102, 0.16), rgba(224, 108, 117, 0.14));
    border-bottom: 1px solid rgba(209, 154, 102, 0.28);
  }

  .draft-conflict-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .draft-conflict-title {
    color: #f3d19c;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .draft-conflict-text {
    color: rgba(229, 229, 229, 0.88);
    font-size: 11px;
    line-height: 1.5;
  }

  .draft-conflict-actions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .draft-conflict-btn {
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease;
  }

  .draft-conflict-btn:hover {
    transform: translateY(-1px);
  }

  .draft-conflict-btn.primary {
    background: #d19a66;
    color: #1f232a;
  }

  .draft-conflict-btn.secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e5e5e5;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  @media (max-width: 900px) {
    .draft-conflict-banner {
      flex-direction: column;
      align-items: stretch;
    }

    .draft-conflict-actions {
      width: 100%;
    }

    .draft-conflict-btn {
      flex: 1;
    }
  }
</style>
