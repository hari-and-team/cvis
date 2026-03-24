<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import EditorPane from '$lib/components/EditorPane.svelte';
  import HeaderBar from '$lib/components/HeaderBar.svelte';
  import RightPane from '$lib/components/RightPane.svelte';
  import { runBinaryAction, runCompileAction, runTraceAction } from '$lib/layout/run-actions';
  import {
    lastBinaryPath,
    rightPaneTab,
    editorCode,
    traceSteps,
    currentStepIndex,
    traceInputDraft,
    isPlaying
  } from '$lib/stores';

  let isTracing = false;
  let traceErr: string | null = null;
  let traceNeedsInput = false;
  let persistenceReady = false;
  let persistTimer: number | null = null;
  let lastEditorCodeSnapshot = '';
  let lastPersistedDraftRaw = '';
  let competingDraft: PersistedDraft | null = null;
  let competingDraftSavedAtLabel = '';

  const DRAFT_STORAGE_KEY = 'cvis:draft:v1';
  const DRAFT_BACKUP_STORAGE_KEY = 'cvis:draft:backup:v1';

  interface PersistedDraft {
    code: string;
    rightPaneTab: 'console' | 'visualizer' | 'analysis';
    traceInput: string;
    savedAt: number;
  }

  function createDraftSnapshot(savedAt = Date.now()): PersistedDraft {
    return {
      code: $editorCode,
      rightPaneTab: $rightPaneTab,
      traceInput: $traceInputDraft,
      savedAt
    };
  }

  function serializeDraft(draft: PersistedDraft): string {
    return JSON.stringify(draft);
  }

  function applyDraftToState(draft: PersistedDraft) {
    editorCode.set(draft.code);
    rightPaneTab.set(draft.rightPaneTab);
    traceInputDraft.set(draft.traceInput);
  }

  function persistBackupDraft(draft: PersistedDraft) {
    localStorage.setItem(DRAFT_BACKUP_STORAGE_KEY, serializeDraft(draft));
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
      if (!['console', 'visualizer', 'analysis'].includes(String(parsed.rightPaneTab))) return null;

      return {
        code: parsed.code,
        rightPaneTab: parsed.rightPaneTab as PersistedDraft['rightPaneTab'],
        traceInput: typeof parsed.traceInput === 'string' ? parsed.traceInput : '',
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
    $editorCode;
    $rightPaneTab;
    $traceInputDraft;
    scheduleDraftPersist();
  }

  $: if (browser && persistenceReady && $editorCode !== lastEditorCodeSnapshot) {
    lastEditorCodeSnapshot = $editorCode;
    lastBinaryPath.set(null);
    traceErr = null;
    traceNeedsInput = false;
  }

  function resetTraceUiState() {
    traceSteps.set([]);
    currentStepIndex.set(0);
    isPlaying.set(false);
    traceErr = null;
    traceNeedsInput = false;
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
    traceNeedsInput = false;
    isPlaying.set(false);
    rightPaneTab.set('visualizer');

    const requiresTraceInput = /\bscanf\s*\(/.test($editorCode);
    const traceInput = $traceInputDraft;

    if (requiresTraceInput && traceInput.trim() === '') {
      traceNeedsInput = true;
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
</script>

<div class="app">
  <HeaderBar on:compile={handleCompile} on:run={handleRun} />
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
      {traceNeedsInput}
    />
  </div>
  <slot />
</div>

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
