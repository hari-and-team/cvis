<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import EditorPane from '$lib/components/EditorPane.svelte';
  import HeaderBar from '$lib/components/HeaderBar.svelte';
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';
  import RightPane from '$lib/components/RightPane.svelte';
  import {
    hydrateRuntimeCapabilities,
    nativeExecutionEnabledStore,
    nativeExecutionUnavailableMessage
  } from '$lib/runtime-capabilities';
  import TraceControlDock from '$lib/components/TraceControlDock.svelte';
  import { buildVisualizerViewModel } from '$lib/app-shell/right-pane/view-models';
  import { runBinaryAction, runCompileAction, runTraceAction } from '$lib/runtime/actions';
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
    pendingRunInputEcho,
    profileEditorOpen,
    traceInputDraft,
    lastCompileResult,
    lastExecutionResult,
    runConsoleTranscript,
    runSessionId,
    userProfile
  } from '$lib/stores';
  import type { TraceReadinessResult, UserProfile } from '$lib/types';

  let isTracing = false;
  let traceErr: string | null = null;
  let traceNotice: string | null = null;
  let traceReadiness: TraceReadinessResult | null = null;
  let showTraceReadinessPrompt = false;
  let persistenceReady = false;
  let persistTimer: number | null = null;
  let lastEditorCodeSnapshot = '';
  let lastPersistedDraftRaw = '';
  let competingDraft: PersistedDraft | null = null;
  let competingDraftSavedAtLabel = '';
  let mainRef: HTMLDivElement | null = null;
  let isResizingPanels = false;
  let editorPaneWidthPercent = 50;

  const LAYOUT_SPLIT_STORAGE_KEY = 'cvis:layout:editor-width:v1';
  const MIN_EDITOR_WIDTH_PX = 360;
  const MIN_RIGHT_PANE_WIDTH_PX = 360;

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
    traceInputDraft: string;
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
      traceInputDraft: $traceInputDraft,
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
    traceInputDraft.set(draft.traceInputDraft);
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

  function clampEditorPaneWidth(percent: number) {
    if (!mainRef) {
      return Math.max(35, Math.min(65, percent));
    }

    const containerWidth = mainRef.clientWidth;
    if (containerWidth <= 0) {
      return Math.max(35, Math.min(65, percent));
    }

    const minPercent = (MIN_EDITOR_WIDTH_PX / containerWidth) * 100;
    const maxPercent = 100 - (MIN_RIGHT_PANE_WIDTH_PX / containerWidth) * 100;

    return Math.max(minPercent, Math.min(maxPercent, percent));
  }

  function persistLayoutSplit() {
    if (!browser) return;

    try {
      localStorage.setItem(LAYOUT_SPLIT_STORAGE_KEY, String(editorPaneWidthPercent));
    } catch (err) {
      console.error('Failed to persist layout split:', err);
    }
  }

  function restoreLayoutSplit() {
    if (!browser) return;

    try {
      const raw = localStorage.getItem(LAYOUT_SPLIT_STORAGE_KEY);
      if (!raw) return;

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      editorPaneWidthPercent = clampEditorPaneWidth(parsed);
    } catch (err) {
      console.error('Failed to restore layout split:', err);
    }
  }

  function resizeFromPointer(clientX: number) {
    if (!mainRef) return;

    const bounds = mainRef.getBoundingClientRect();
    const relativeX = clientX - bounds.left;
    const nextPercent = (relativeX / bounds.width) * 100;
    editorPaneWidthPercent = clampEditorPaneWidth(nextPercent);
  }

  function stopPanelResize() {
    if (!browser || !isResizingPanels) return;

    isResizingPanels = false;
    window.removeEventListener('pointermove', handlePanelResizeMove);
    window.removeEventListener('pointerup', stopPanelResize);
    window.removeEventListener('pointercancel', stopPanelResize);
    persistLayoutSplit();
  }

  function handlePanelResizeMove(event: PointerEvent) {
    resizeFromPointer(event.clientX);
  }

  function startPanelResize(event: PointerEvent) {
    if (!browser || !mainRef) return;
    if (window.innerWidth <= 960) return;

    event.preventDefault();
    isResizingPanels = true;
    resizeFromPointer(event.clientX);
    window.addEventListener('pointermove', handlePanelResizeMove);
    window.addEventListener('pointerup', stopPanelResize);
    window.addEventListener('pointercancel', stopPanelResize);
  }

  function resetPanelResize() {
    editorPaneWidthPercent = 50;
    persistLayoutSplit();
  }

  function handleResizerKeydown(event: KeyboardEvent) {
    if (window.innerWidth <= 960) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      editorPaneWidthPercent = clampEditorPaneWidth(editorPaneWidthPercent - 2);
      persistLayoutSplit();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      editorPaneWidthPercent = clampEditorPaneWidth(editorPaneWidthPercent + 2);
      persistLayoutSplit();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      editorPaneWidthPercent = clampEditorPaneWidth(50);
      persistLayoutSplit();
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
        traceInputDraft: typeof parsed.traceInputDraft === 'string' ? parsed.traceInputDraft : '',
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
    void hydrateRuntimeCapabilities();
    restoreProfileFromStorage();
    restoreDraftFromStorage();
    restoreLayoutSplit();
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
    stopPanelResize();
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
    $traceInputDraft;
    scheduleDraftPersist();
  }

  $: if (browser && persistenceReady && $editorCode !== lastEditorCodeSnapshot) {
    lastEditorCodeSnapshot = $editorCode;
    lastBinaryPath.set(null);
    lastRunInputTranscript.set('');
    traceErr = null;
    traceNotice = null;
    traceReadiness = null;
    showTraceReadinessPrompt = false;
  }

  $: floatingVisualizerViewModel = buildVisualizerViewModel({
    editorCode: $editorCode,
    runConsoleTranscript: $runConsoleTranscript,
    runSessionId: $runSessionId,
    lastExecutionResult: $lastExecutionResult,
    lastCompileResult: $lastCompileResult,
    lastRunInputTranscript: $lastRunInputTranscript,
    manualTraceInput: $traceInputDraft,
    pendingRunInputEcho: $pendingRunInputEcho,
    traceSteps: $traceSteps,
    currentTraceStepData: $traceSteps[$currentStepIndex] ?? null,
    isTracing,
    traceErr,
    nativeExecutionEnabled: $nativeExecutionEnabledStore,
    traceNotice,
    traceReadiness,
    showTraceReadinessPrompt
  });

  function resetTraceUiState() {
    traceSteps.set([]);
    currentStepIndex.set(0);
    isPlaying.set(false);
    traceErr = null;
    traceNotice = null;
    traceReadiness = null;
    showTraceReadinessPrompt = false;
  }

  async function handleCompile() {
    if (!browser) return;

    resetTraceUiState();
    rightPaneTab.set('console');

    return runCompileAction({
      code: $editorCode
    });
  }

  async function handleRun() {
    if (!browser) return;

    resetTraceUiState();
    rightPaneTab.set('console');

    await runBinaryAction($lastBinaryPath);
  }

  async function handleTrace(force: boolean | Event = false) {
    if (!browser) return;
    const shouldForce = force === true;

    traceErr = null;
    traceNotice = null;
    if (!shouldForce) {
      traceReadiness = null;
      showTraceReadinessPrompt = false;
    }
    isPlaying.set(false);
    rightPaneTab.set('visualizer');

    const requiresRuntimeReplay = /\bscanf\s*\(/.test($editorCode);
    const hasManualTraceInput = $traceInputDraft.length > 0;
    const staleCapturedInput = $lastExecutionResult?.completionReason === 'stopped';
    const traceInput =
      staleCapturedInput && hasManualTraceInput ? $traceInputDraft : $lastRunInputTranscript || $traceInputDraft;

    if ($runSessionId) {
      traceNotice =
        'Finish the active Console run before tracing. Send EOF if the program is waiting for more input, or stop the run and start again.';
      traceSteps.set([]);
      currentStepIndex.set(0);
      return;
    }

    if (requiresRuntimeReplay && traceInput.length === 0) {
      traceNotice = $nativeExecutionEnabledStore
        ? 'This program uses scanf(). Run it once in the Console or enter stdin in the Visualizer tab, then retrace.'
        : 'This program uses scanf(). Enter stdin in the Visualizer tab, then trace it again.';
      traceSteps.set([]);
      currentStepIndex.set(0);
      return;
    }

    if (requiresRuntimeReplay && staleCapturedInput && !hasManualTraceInput) {
      traceNotice =
        'The latest Console run was stopped before the program finished, so its stdin replay may be incomplete. Run it again to completion, or send EOF, then trace again.';
      traceSteps.set([]);
      currentStepIndex.set(0);
      return;
    }

    isTracing = true;

    try {
      const result = await runTraceAction({
        code: $editorCode,
        input: traceInput,
        force: shouldForce
      });
      traceErr = result.traceErr;
      traceReadiness = result.readiness;
      showTraceReadinessPrompt = Boolean(
        result.readiness && result.readiness.status !== 'supported' && !result.didTrace
      );
    } finally {
      isTracing = false;
    }
  }

  async function handleCompileAndRunExact() {
    if (!browser) return;

    const compileSucceeded = await handleCompile();
    if (compileSucceeded) {
      await handleRun();
    }
  }

  function handleDismissTraceReadiness() {
    showTraceReadinessPrompt = false;
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
  {#if !$nativeExecutionEnabledStore}
    <div class="deployment-banner" role="status" aria-live="polite">
      {nativeExecutionUnavailableMessage()}
    </div>
  {/if}
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
  <div
    bind:this={mainRef}
    class="main"
    class:resizing={isResizingPanels}
    style="--editor-pane-width: {editorPaneWidthPercent}%; --right-pane-width: {100 - editorPaneWidthPercent}%;"
  >
    <div class="pane-shell editor-shell">
      <div class="workspace-column">
        <EditorPane />
        <div class="execution-dock">
          <TraceControlDock viewModel={floatingVisualizerViewModel} onTrace={handleTrace} />
        </div>
      </div>
    </div>

    <button
      type="button"
      class="pane-resizer"
      aria-label="Resize editor and right panel"
      title="Drag to resize panels. Double-click to reset."
      on:pointerdown={startPanelResize}
      on:dblclick={resetPanelResize}
      on:keydown={handleResizerKeydown}
    >
      <span class="pane-resizer-grip"></span>
    </button>

    <div class="pane-shell right-shell">
      <RightPane
        on:trace={(event) => handleTrace(event.detail?.force === true)}
        on:runexact={handleCompileAndRunExact}
        on:dismisstracereadiness={handleDismissTraceReadiness}
        traceSteps={$traceSteps}
        currentStep={$currentStepIndex}
        {isTracing}
        {traceErr}
        {traceNotice}
        {traceReadiness}
        {showTraceReadinessPrompt}
      />
    </div>
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
    min-height: 0;
    min-width: 0;
  }

  .main.resizing,
  .main.resizing * {
    cursor: col-resize;
    user-select: none;
  }

  .pane-shell {
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .workspace-column {
    width: 100%;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #282c34;
    border-right: 1px solid #3e4451;
    min-height: 0;
  }

  .execution-dock {
    flex-shrink: 0;
    width: 100%;
    padding: 8px 12px 12px;
    background:
      linear-gradient(180deg, rgba(40, 44, 52, 0.96) 0%, rgba(33, 37, 43, 0.98) 100%);
    border-top: 1px solid rgba(92, 99, 112, 0.45);
  }

  .editor-shell {
    flex: 0 0 var(--editor-pane-width);
    min-width: 360px;
  }

  .right-shell {
    flex: 0 0 var(--right-pane-width);
    min-width: 360px;
  }

  .pane-resizer {
    position: relative;
    flex: 0 0 12px;
    border: none;
    padding: 0;
    background: color-mix(in srgb, var(--bg-deep) 98%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
    cursor: col-resize;
  }

  .pane-resizer::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--blue) 6%, transparent) 0%,
      transparent 100%
    );
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .pane-resizer:hover::before,
  .main.resizing .pane-resizer::before {
    opacity: 1;
  }

  .pane-resizer-grip {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 44px;
    transform: translate(-50%, -50%);
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-dim) 72%, var(--border));
    box-shadow:
      -3px 0 0 color-mix(in srgb, var(--text-dim) 40%, transparent),
      3px 0 0 color-mix(in srgb, var(--text-dim) 40%, transparent);
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

  .deployment-banner {
    padding: 10px 16px;
    background: rgba(97, 175, 239, 0.14);
    border-bottom: 1px solid rgba(97, 175, 239, 0.22);
    color: #dceeff;
    font-size: 12px;
    line-height: 1.5;
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
    .main {
      flex-direction: column;
    }

    .workspace-column {
      min-height: 0;
      border-right: none;
      border-bottom: 1px solid #3e4451;
    }

    .execution-dock {
      width: 100%;
      padding: 12px;
    }

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

  @media (max-width: 960px) {
    .main {
      flex-direction: column;
    }

    .editor-shell,
    .right-shell {
      min-width: 0;
      flex: 1 1 auto;
      width: 100%;
    }

    .workspace-column {
      border-right: none;
      border-bottom: 1px solid #3e4451;
    }

    .pane-resizer {
      display: none;
    }
  }
</style>
