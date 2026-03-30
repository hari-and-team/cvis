<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    Cpu,
    Loader2,
    Pause,
    Play,
    SkipBack,
    SkipForward
  } from 'lucide-svelte';
  import type { VisualizerViewModel } from '$lib/app-shell/right-pane/view-models';
  import { currentStepIndex, isPlaying, traceSteps as traceStepsStore } from '$lib/stores';

  export let viewModel: VisualizerViewModel;
  export let onTrace: () => void;

  $: traceUsesRuntimeInput = viewModel.traceUsesRuntimeInput;
  $: canStartTrace = viewModel.canStartTrace;
  $: hasCapturedRunInput = viewModel.hasCapturedRunInput;
  $: isConsoleRunActive = viewModel.isConsoleRunActive;
  $: inputReplayNeedsFreshRun = viewModel.inputReplayNeedsFreshRun;
  $: capturedRunInputLineCount = viewModel.capturedRunInputLineCount;
  $: traceConsoleStatus = viewModel.traceConsoleStatus;
  $: isTracing = viewModel.isTracing;
  $: traceErr = viewModel.traceErr;
  $: traceNotice = viewModel.traceNotice;
  $: traceStepList = viewModel.traceSteps;
  $: currentTraceStepData = viewModel.currentTraceStepData;
  $: totalSteps = $traceStepsStore.length;
  $: isTraceComplete = totalSteps > 0 && $currentStepIndex >= totalSteps - 1;

  function goToTraceStart() {
    isPlaying.set(false);
    currentStepIndex.set(0);
  }

  function goToTraceEnd() {
    if (totalSteps === 0) return;
    isPlaying.set(false);
    currentStepIndex.set(totalSteps - 1);
  }

  function stepTrace(delta: number) {
    if (totalSteps === 0) return;
    isPlaying.set(false);
    currentStepIndex.update((index) => Math.max(0, Math.min(totalSteps - 1, index + delta)));
  }

  function toggleTracePlayback() {
    if (totalSteps === 0) return;

    if (!$isPlaying && $currentStepIndex >= totalSteps - 1) {
      currentStepIndex.set(0);
    }

    isPlaying.update((playing) => !playing);
  }
</script>

<div class="trace-control-dock">
  <div class="trace-control-primary-row">
    <div class="trace-control-head">
      <div class="trace-control-copy">
        <span class="trace-control-title">Execution Controls</span>
        <span class="trace-control-subtitle">Trace actions below the editor</span>
      </div>
      <span class:ready={canStartTrace} class="trace-control-status">
        {traceConsoleStatus}
      </span>
    </div>

    <button
      type="button"
      class="trace-control-run"
      disabled={isTracing || !canStartTrace}
      on:click={onTrace}
    >
      {#if isTracing}
        <Loader2 size={14} class="loader-spin" />
        <span>Interpreting...</span>
      {:else}
        <Cpu size={14} />
        <span>{traceStepList.length > 0 ? 'Retrace Execution' : 'Trace Execution'}</span>
      {/if}
    </button>
  </div>

  {#if isConsoleRunActive}
    <div class="trace-control-note">
      Finish the current Console run before starting a trace.
    </div>
  {:else if traceUsesRuntimeInput && !hasCapturedRunInput}
    <div class="trace-control-note">
      Run once in Console to capture stdin for `scanf()`.
    </div>
  {:else if inputReplayNeedsFreshRun}
    <div class="trace-control-note">
      Latest stdin came from a stopped run. Run again to completion or send EOF before tracing.
    </div>
  {:else if hasCapturedRunInput}
    <div class="trace-control-note">
      Reusing {capturedRunInputLineCount} stdin line{capturedRunInputLineCount === 1 ? '' : 's'} from the latest run.
    </div>
  {/if}

  {#if traceErr}
    <div class="trace-control-note trace-control-note-error">{traceErr}</div>
  {:else if traceNotice}
    <div class="trace-control-note trace-control-note-warning">{traceNotice}</div>
  {/if}

  {#if traceStepList.length > 0}
    <div class="trace-playback-row">
      <div class="trace-playback-headline">
        <span>Trace playback</span>
        <span>line {currentTraceStepData?.lineNo ?? '-'} · step {$currentStepIndex + 1} / {totalSteps}</span>
      </div>

      <div class="trace-playback-buttons">
        <button type="button" class="trace-playback-btn trace-playback-icon" on:click={goToTraceStart} title="Go to start">
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          class="trace-playback-btn"
          on:click={() => stepTrace(-1)}
          disabled={$currentStepIndex === 0}
        >
          <ChevronLeft size={15} />
        </button>
        <button type="button" class="trace-playback-btn trace-playback-primary" on:click={toggleTracePlayback}>
          {#if $isPlaying}
            <Pause size={15} />
          {:else}
            <Play size={15} />
          {/if}
        </button>
        <button
          type="button"
          class="trace-playback-btn"
          on:click={() => stepTrace(1)}
          disabled={$currentStepIndex >= totalSteps - 1}
        >
          <ChevronRight size={15} />
        </button>
        <button type="button" class="trace-playback-btn trace-playback-icon" on:click={goToTraceEnd} title="Go to end">
          <SkipForward size={14} />
        </button>
      </div>
    </div>

    {#if isTraceComplete}
      <div class="trace-control-note trace-control-note-success">Trace complete. Press play to replay.</div>
    {/if}
  {/if}
</div>

<style>
  .trace-control-dock {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--blue) 22%, var(--border));
    border-radius: 12px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 96%, transparent) 0%, color-mix(in srgb, var(--bg-deep) 94%, transparent) 100%),
      radial-gradient(circle at top left, color-mix(in srgb, var(--blue) 12%, transparent), transparent 44%);
    box-shadow:
      0 18px 38px rgba(0, 0, 0, 0.34),
      0 0 0 1px rgba(255, 255, 255, 0.02);
    backdrop-filter: blur(18px);
    color: var(--text-bright);
  }

  .trace-control-primary-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }

  .trace-control-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .trace-control-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .trace-control-title {
    font-size: 11px;
    font-weight: 800;
    color: var(--text-bright);
  }

  .trace-control-subtitle {
    font-size: 9px;
    color: var(--text-dim);
  }

  .trace-control-status {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--orange) 28%, transparent);
    background: color-mix(in srgb, var(--orange) 12%, transparent);
    color: var(--orange);
    font-size: 9px;
    font-weight: 700;
    padding: 3px 7px;
    white-space: nowrap;
  }

  .trace-control-status.ready {
    border-color: color-mix(in srgb, var(--green) 32%, transparent);
    background: color-mix(in srgb, var(--green) 12%, transparent);
    color: var(--green);
  }

  .trace-control-run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 156px;
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--blue) 46%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--blue) 78%, #0f1520);
    color: #10161f;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .trace-control-run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .trace-control-note {
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
    color: var(--text);
    font-size: 9px;
    line-height: 1.4;
    padding: 5px 8px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .trace-control-note-warning {
    border-color: color-mix(in srgb, var(--orange) 28%, transparent);
    background: color-mix(in srgb, var(--orange) 10%, transparent);
    color: var(--orange);
  }

  .trace-control-note-error {
    border-color: color-mix(in srgb, var(--red) 30%, transparent);
    background: color-mix(in srgb, var(--red) 10%, transparent);
    color: var(--red);
  }

  .trace-control-note-success {
    border-color: color-mix(in srgb, var(--green) 30%, transparent);
    background: color-mix(in srgb, var(--green) 10%, transparent);
    color: var(--green);
  }

  .trace-playback-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }

  .trace-playback-headline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 9px;
    color: var(--text-dim);
    min-width: 0;
  }

  .trace-playback-buttons {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    min-width: 198px;
  }

  .trace-playback-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
    background: color-mix(in srgb, var(--bg-hover) 82%, var(--bg-deep));
    color: var(--text-bright);
    cursor: pointer;
  }

  .trace-playback-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .trace-playback-primary {
    border-color: color-mix(in srgb, var(--green) 28%, var(--border));
    background: color-mix(in srgb, var(--green) 14%, var(--bg-hover));
    color: var(--green);
  }

  :global(.loader-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 900px) {
    .trace-control-dock {
      border-radius: 12px;
      padding: 10px;
    }

    .trace-control-primary-row,
    .trace-playback-row {
      grid-template-columns: 1fr;
    }

    .trace-control-run,
    .trace-playback-buttons {
      min-width: 0;
      width: 100%;
    }
  }
</style>
