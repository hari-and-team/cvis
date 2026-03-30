<script lang="ts">
  import { onDestroy } from 'svelte';
  import { AlertTriangle, Cpu, Info, Loader2 } from 'lucide-svelte';
  import type { VisualizerViewModel } from '$lib/app-shell/right-pane/view-models';
  import Visualizer from '$lib/components/Visualizer.svelte';
  import { VISUALIZER_FEATURES } from '$lib/components/right-pane-config';

  export let viewModel: VisualizerViewModel;
  export let onTrace: (force?: boolean) => void;
  export let onRunExact: () => void;
  export let onDismissTraceReadiness: () => void;

  const TRACE_LOADING_TICK_MS = 850;
  let loadingStepIndex = 0;
  let loadingTicker: number | null = null;

  $: traceUsesRuntimeInput = viewModel.traceUsesRuntimeInput;
  $: traceNotice = viewModel.traceNotice;
  $: isTracing = viewModel.isTracing;
  $: traceErr = viewModel.traceErr;
  $: traceReadiness = viewModel.traceReadiness;
  $: showTraceReadinessPrompt = viewModel.showTraceReadinessPrompt;
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

  function getTraceReadinessTitle() {
    if (!traceReadiness) return 'Trace readiness';
    if (traceReadiness.status === 'partial') {
      return 'Trace may be approximate';
    }
    if (traceReadiness.status === 'unsupported') {
      return 'Trace is outside the supported subset';
    }
    return 'Trace is supported';
  }

  function getTraceReadinessSummary() {
    if (!traceReadiness) return '';
    if (traceReadiness.status === 'partial') {
      return 'This code mixes supported DSA patterns with C constructs that the visual trace may only approximate.';
    }
    if (traceReadiness.status === 'unsupported') {
      return 'Compile + Run is the exact path for this program. You can still force trace if you want to inspect the best-effort visualization.';
    }
    return 'This program fits the current DSA-focused trace subset.';
  }
</script>

<div class="visualizer-tab-shell">
  {#if showTraceReadinessPrompt && traceReadiness}
    <section class="trace-readiness-card">
      <div class="trace-readiness-header">
        <div class="trace-readiness-copy">
          <span class="trace-readiness-kicker">Trace readiness</span>
          <span class="trace-readiness-title">{getTraceReadinessTitle()}</span>
          <span class="trace-readiness-subtitle">{getTraceReadinessSummary()}</span>
        </div>
        <span class={`trace-readiness-pill trace-readiness-pill-${traceReadiness.status}`}>
          {traceReadiness.status}
        </span>
      </div>

      {#if traceReadiness.reasons.length > 0}
        <div class="trace-readiness-reasons">
          {#each traceReadiness.reasons.slice(0, 3) as reason}
            <div class="trace-readiness-reason">
              <div class="trace-readiness-reason-icon">
                {#if reason.severity === 'info'}
                  <Info size={14} />
                {:else}
                  <AlertTriangle size={14} />
                {/if}
              </div>
              <div class="trace-readiness-reason-copy">
                <span class="trace-readiness-reason-line">
                  {#if reason.line}L{reason.line}{:else}Trace engine{/if}
                </span>
                <span class="trace-readiness-reason-text">{reason.message}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="trace-readiness-actions">
        <button type="button" class="panel-action-btn panel-action-btn-primary" on:click={onRunExact}>
          <Cpu size={14} />
          <span>Compile + Run Exact</span>
        </button>
        <button type="button" class="panel-action-btn panel-action-btn-secondary" on:click={() => onTrace(true)}>
          <AlertTriangle size={14} />
          <span>Trace Anyway</span>
        </button>
        <button type="button" class="trace-readiness-dismiss" on:click={onDismissTraceReadiness}>
          Dismiss
        </button>
      </div>
    </section>
  {/if}

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
            Compile + Run stays in sync with the real program while Trace waits for captured stdin.
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
            Compile + Run remains the source of truth if the visual trace hits an unsupported C feature.
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
          Click <span class="highlight">Trace Execution</span> for a step-by-step visualization
          {#if traceUsesRuntimeInput}
            after a Console run captures the stdin for scanf().
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
