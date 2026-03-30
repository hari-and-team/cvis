<script lang="ts">
  import { onDestroy } from 'svelte';
  import { AlertTriangle, Cpu, Loader2 } from 'lucide-svelte';
  import type { VisualizerViewModel } from '$lib/app-shell/right-pane/view-models';
  import Visualizer from '$lib/components/Visualizer.svelte';
  import { traceInputDraft } from '$lib/stores';
  import { normalizeTerminalText } from '$lib/terminal/console-input';
  import { VISUALIZER_FEATURES } from '$lib/components/right-pane-config';

  export let viewModel: VisualizerViewModel;

  const TRACE_LOADING_TICK_MS = 850;
  let loadingStepIndex = 0;
  let loadingTicker: number | null = null;

  $: traceUsesRuntimeInput = viewModel.traceUsesRuntimeInput;
  $: nativeExecutionEnabled = viewModel.nativeExecutionEnabled;
  $: canStartTrace = viewModel.canStartTrace;
  $: hasCapturedRunInput = viewModel.hasCapturedRunInput;
  $: hasManualTraceInput = viewModel.hasManualTraceInput;
  $: isConsoleRunActive = viewModel.isConsoleRunActive;
  $: inputReplayNeedsFreshRun = viewModel.inputReplayNeedsFreshRun;
  $: traceConsoleOutput = viewModel.traceConsoleOutput;
  $: traceNotice = viewModel.traceNotice;
  $: capturedRunInputLineCount = viewModel.capturedRunInputLineCount;
  $: manualTraceInputLineCount = viewModel.manualTraceInputLineCount;
  $: traceConsoleStatus = viewModel.traceConsoleStatus;
  $: isTracing = viewModel.isTracing;
  $: traceErr = viewModel.traceErr;
  $: traceStepList = viewModel.traceSteps;
  $: currentTraceStepData = viewModel.currentTraceStepData;
  $: loadingSteps = viewModel.loadingSteps;
  $: intentPrimaryLabel = viewModel.intentPrimaryLabel;

  $: {
    if (isTracing && typeof window !== 'undefined') {
      if (loadingTicker === null) {
        loadingTicker = window.setInterval(() => {
          const stepCount = Math.max(loadingSteps.length, 1);
          loadingStepIndex = (loadingStepIndex + 1) % stepCount;
        }, TRACE_LOADING_TICK_MS);
      }
    } else {
      if (loadingTicker !== null) {
        clearInterval(loadingTicker);
        loadingTicker = null;
      }
      loadingStepIndex = 0;
    }
  }

  onDestroy(() => {
    if (loadingTicker !== null) {
      clearInterval(loadingTicker);
    }
  });
</script>

<div class="visualizer-tab-shell">
  <section class="trace-runtime-card">
    <div class="trace-runtime-header">
      <div class="trace-runtime-copy">
        <span class="trace-runtime-title">Runtime context</span>
        <span class="trace-runtime-subtitle">
          {#if traceUsesRuntimeInput}
            {#if isConsoleRunActive}
              Finish the active Console run before starting a trace for `scanf()`.
            {:else if inputReplayNeedsFreshRun}
              The latest stdin came from a stopped run. Re-run to completion or enter stdin below.
            {:else if hasCapturedRunInput}
              Trace reuses the stdin you already entered in the Console for `scanf()`.
            {:else if hasManualTraceInput}
              Trace will replay the manual stdin you entered below.
            {:else if nativeExecutionEnabled}
              This program uses `scanf()`. Run it once in the Console or enter stdin below, then trace it.
            {:else}
              This program uses `scanf()`. Enter stdin below, then trace it directly in this deployment.
            {/if}
          {:else if nativeExecutionEnabled}
            The latest compile or run transcript stays visible here while you inspect the trace.
          {:else}
            Trace runs in-place on Vercel without a separate backend process.
          {/if}
        </span>
      </div>
      <div class="trace-runtime-actions">
        <span class:ready={canStartTrace} class="trace-runtime-status">
          {traceConsoleStatus}
        </span>
      </div>
    </div>

    {#if hasCapturedRunInput}
      <div class="trace-runtime-meta">
        Replaying {capturedRunInputLineCount} stdin line{capturedRunInputLineCount === 1 ? '' : 's'}
        from the latest run session.
      </div>
    {/if}

    {#if traceUsesRuntimeInput && (!hasCapturedRunInput || inputReplayNeedsFreshRun)}
      <div class="trace-runtime-input-shell">
        <label class="trace-runtime-input-label" for="trace-stdin-input">
          Manual stdin for `scanf()`
        </label>
        <textarea
          id="trace-stdin-input"
          class="trace-runtime-input"
          rows="4"
          bind:value={$traceInputDraft}
          placeholder="Enter the exact stdin that the program should read, line by line."
        ></textarea>
        <div class="trace-runtime-input-meta">
          {#if hasManualTraceInput}
            Ready to replay {manualTraceInputLineCount} stdin line{manualTraceInputLineCount === 1 ? '' : 's'}.
          {:else}
            Leave one value per line when the program expects multiple reads.
          {/if}
        </div>
      </div>
    {/if}

    {#if traceConsoleOutput}
      <pre class="trace-runtime-output">{normalizeTerminalText(traceConsoleOutput)}</pre>
    {/if}
  </section>

  <div class="visualizer-panel-body">
    {#if isTracing}
      <div class="loading-state">
        <div class="loader-wrapper">
          <Loader2 size={36} class="loader-spin" />
        </div>
        <span class="loading-text">Interpreting C code...</span>
        <span class="loading-intent">
          predicted:
          <span class="loading-intent-value">{intentPrimaryLabel}</span>
        </span>
        <span class="loading-step">{loadingSteps[loadingStepIndex]}</span>
      </div>
    {:else if traceNotice}
      <div class="error-state">
        <div class="error-card error-card-notice">
          <div class="error-icon-wrapper error-icon-wrapper-notice">
            <AlertTriangle size={24} />
          </div>
          <div class="error-title">Runtime Input Needed</div>
          <pre class="error-message">{traceNotice}</pre>
          <div class="error-hint">
            {#if nativeExecutionEnabled}
              Compile + Run stays in sync with the real program while Trace waits for captured stdin.
            {:else}
              Enter stdin above and trace again. This deployment does not keep long-lived runtime sessions.
            {/if}
          </div>
        </div>
      </div>
    {:else if traceErr}
      <div class="error-state">
        <div class="error-card">
          <div class="error-icon-wrapper">
            <AlertTriangle size={24} />
          </div>
          <div class="error-title">Interpreter Error</div>
          <pre class="error-message">{traceErr}</pre>
          <div class="error-hint">
            {#if nativeExecutionEnabled}
              Compile + Run remains the source of truth if the visual trace hits an unsupported C feature.
            {:else}
              This deployment only supports the interpreter path. Use an external backend if you need real GCC execution.
            {/if}
          </div>
        </div>
      </div>
    {:else if traceStepList && traceStepList.length > 0}
      <Visualizer traceStep={currentTraceStepData} />
    {:else}
      <div class="empty-visualizer">
        <div class="viz-icon-wrapper">
          <Cpu size={48} class="viz-icon" />
          <div class="viz-icon-pulse"></div>
        </div>
        <div class="viz-title">Ready to Visualize</div>
        <div class="viz-description">
          Use the <span class="highlight">bottom-left trace controls</span> to generate visualization data
          {#if traceUsesRuntimeInput}
            after stdin is available for scanf().
          {/if}
        </div>
        <div class="feature-tags">
          {#each VISUALIZER_FEATURES as feature}
            <span class="feature-tag" style="--tag-color: {feature.color}">
              {feature.label}
            </span>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
