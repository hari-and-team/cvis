<script lang="ts">
  import { AlertTriangle, Cpu, Loader2, Scan, Check, Code2 } from 'lucide-svelte';
  import Visualizer from './Visualizer.svelte';
  import type { TraceStep } from '$lib/types';
  import {
    hasScannedInput,
    lastCompileResult,
    lastExecutionResult,
    runtimeInput,
    scannedInput
  } from '$lib/stores';
  import { RIGHT_PANE_TABS, type RightPaneTabId, VISUALIZER_FEATURES, OneDark } from './right-pane-config';

  export let traceSteps: TraceStep[] = [];
  export let currentStep: number = 0;
  export let isTracing = false;
  export let traceErr: string | null = null;

  let activeTab: RightPaneTabId = 'output';

  $: output = $lastExecutionResult
    ? $lastExecutionResult.stdout + $lastExecutionResult.stderr
    : $lastCompileResult
      ? $lastCompileResult.output || $lastCompileResult.errors.join('\n')
      : '';

  $: hasError = $lastExecutionResult?.stderr || $lastCompileResult?.errors?.length;
  $: currentTraceStepData = traceSteps[currentStep] || null;

  function handleScanInput() {
    scannedInput.set($runtimeInput);
    hasScannedInput.set(true);
  }
</script>

<div class="right-pane">
  <!-- Tab Bar -->
  <div class="tab-bar">
    {#each RIGHT_PANE_TABS as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        style="--tab-color: {tab.color}"
        on:click={() => (activeTab = tab.id)}
      >
        <span class="tab-icon">
          <svelte:component this={tab.Icon} size={14} />
        </span>
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </div>

  <!-- Content Area -->
  <div class="content-area">
    {#if activeTab === 'output'}
      <div class="output-panel">
        <div class="output-content">
          {#if output}
            <pre class="output-text" class:error-output={hasError}>{output}</pre>
          {:else}
            <div class="empty-output">
              <Code2 size={28} class="empty-icon" />
              <span class="empty-title">No output yet</span>
              <span class="empty-hint">Click "Compile & Run" to execute your code</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if activeTab === 'input'}
      <div class="input-panel">
        <div class="input-header">
          <button class="scan-btn" on:click={handleScanInput}>
            <Scan size={14} />
            <span>Scan Input</span>
          </button>
          <div class="scan-status" class:captured={$hasScannedInput}>
            {#if $hasScannedInput}
              <Check size={12} />
              <span>Input captured</span>
            {:else}
              <span>Not scanned</span>
            {/if}
          </div>
        </div>
        <div class="textarea-wrapper" class:captured={$hasScannedInput}>
          <textarea
            bind:value={$runtimeInput}
            on:input={() => hasScannedInput.set(false)}
            placeholder="Enter stdin input for scanf()..."
            spellcheck="false"
            class="input-textarea"
          ></textarea>
        </div>
      </div>
    {/if}

    {#if activeTab === 'visualizer'}
      {#if isTracing}
        <div class="loading-state">
          <div class="loader-wrapper">
            <Loader2 size={36} class="loader-spin" />
          </div>
          <span class="loading-text">Interpreting C code…</span>
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
              Use "Compile & Run" for exact output from complex programs.
            </div>
          </div>
        </div>
      {:else if traceSteps && traceSteps.length > 0}
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
    {/if}

    {#if activeTab === 'analysis'}
      <div class="analysis-panel">
        <div class="coming-soon">
          <Code2 size={32} class="coming-soon-icon" />
          <span class="coming-soon-title">Code Analysis</span>
          <span class="coming-soon-text">Advanced analysis features coming soon...</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* One Dark Variables */
  :root {
    --od-bg-main: #282c34;
    --od-bg-deep: #21252b;
    --od-bg-hover: #2c313a;
    --od-border: #3e4451;
    --od-text: #abb2bf;
    --od-text-dim: #5c6370;
    --od-text-bright: #e5e5e5;
    --od-green: #98c379;
    --od-blue: #61afef;
    --od-purple: #c678dd;
    --od-cyan: #56b6c2;
    --od-red: #e06c75;
    --od-orange: #d19a66;
  }

  .right-pane {
    width: 50%;
    display: flex;
    flex-direction: column;
    background: var(--od-bg-main);
    border-left: 1px solid var(--od-border);
  }

  /* Tab Bar */
  .tab-bar {
    display: flex;
    background: var(--od-bg-deep);
    border-bottom: 1px solid var(--od-border);
    flex-shrink: 0;
    padding: 0 4px;
  }

  .tab-btn {
    flex: 1;
    padding: 10px 8px;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--od-text-dim);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
  }

  .tab-btn:hover {
    color: var(--od-text);
    background: var(--od-bg-hover);
  }

  .tab-btn.active {
    color: var(--od-text-bright);
    background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--tab-color) 8%, transparent) 100%);
    border-bottom-color: var(--tab-color);
  }

  .tab-btn.active .tab-icon {
    color: var(--tab-color);
  }

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
  }

  .tab-label {
    letter-spacing: 0.3px;
  }

  /* Content Area */
  .content-area {
    flex: 1;
    overflow: hidden;
    position: relative;
    background: 
      linear-gradient(180deg, var(--od-bg-main) 0%, color-mix(in srgb, var(--od-bg-deep) 50%, var(--od-bg-main)) 100%),
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 24px,
        color-mix(in srgb, var(--od-border) 20%, transparent) 24px,
        color-mix(in srgb, var(--od-border) 20%, transparent) 25px
      );
  }

  /* Output Panel */
  .output-panel {
    height: 100%;
    overflow-y: auto;
    padding: 16px;
  }

  .output-content {
    min-height: 100%;
  }

  .output-text {
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
    font-size: 12px;
    color: var(--od-text-bright);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.8;
    padding: 12px;
    background: var(--od-bg-deep);
    border-radius: 8px;
    border: 1px solid var(--od-border);
  }

  .output-text.error-output {
    color: var(--od-red);
    border-color: color-mix(in srgb, var(--od-red) 30%, var(--od-border));
    background: color-mix(in srgb, var(--od-red) 5%, var(--od-bg-deep));
  }

  .empty-output {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    gap: 8px;
    color: var(--od-text-dim);
  }

  .empty-output :global(.empty-icon) {
    color: var(--od-text-dim);
    opacity: 0.5;
    margin-bottom: 4px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--od-text);
  }

  .empty-hint {
    font-size: 12px;
    color: var(--od-text-dim);
  }

  /* Input Panel */
  .input-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .input-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--od-border);
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--od-bg-deep);
  }

  .scan-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: linear-gradient(135deg, var(--od-blue), color-mix(in srgb, var(--od-blue) 80%, var(--od-purple)));
    border: none;
    border-radius: 6px;
    color: var(--od-bg-deep);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--od-blue) 30%, transparent);
  }

  .scan-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--od-blue) 40%, transparent);
  }

  .scan-btn:active {
    transform: translateY(0);
  }

  .scan-status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--od-text-dim);
    padding: 4px 10px;
    border-radius: 12px;
    background: var(--od-bg-hover);
    transition: all 0.3s ease;
  }

  .scan-status.captured {
    color: var(--od-green);
    background: color-mix(in srgb, var(--od-green) 12%, var(--od-bg-hover));
  }

  .textarea-wrapper {
    flex: 1;
    padding: 12px;
    transition: all 0.3s ease;
  }

  .textarea-wrapper.captured {
    background: color-mix(in srgb, var(--od-green) 3%, transparent);
  }

  .input-textarea {
    width: 100%;
    height: 100%;
    padding: 14px;
    background: var(--od-bg-deep);
    color: var(--od-text-bright);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.6;
    resize: none;
    outline: none;
    border: 1px solid var(--od-border);
    border-radius: 8px;
    box-sizing: border-box;
    transition: border-color 0.2s ease;
  }

  .input-textarea::placeholder {
    color: var(--od-text-dim);
  }

  .input-textarea:focus {
    border-color: var(--od-blue);
  }

  /* Visualizer States */
  .loading-state {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .loader-wrapper {
    color: var(--od-blue);
  }

  .loader-wrapper :global(.loader-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading-text {
    color: var(--od-text);
    font-size: 13px;
    font-weight: 600;
  }

  .error-state {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .error-card {
    background: color-mix(in srgb, var(--od-red) 8%, var(--od-bg-deep));
    border: 1px solid color-mix(in srgb, var(--od-red) 30%, var(--od-border));
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    text-align: center;
  }

  .error-icon-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--od-red) 15%, var(--od-bg-deep));
    color: var(--od-red);
    margin-bottom: 12px;
  }

  .error-title {
    color: var(--od-text-bright);
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 12px;
  }

  .error-message {
    color: var(--od-text);
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.8;
    text-align: left;
    margin: 0 0 12px 0;
    padding: 12px;
    background: var(--od-bg-main);
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .error-hint {
    color: var(--od-text-dim);
    font-size: 11px;
  }

  /* Empty Visualizer */
  .empty-visualizer {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
  }

  .viz-icon-wrapper {
    position: relative;
    margin-bottom: 8px;
  }

  .viz-icon-wrapper :global(.viz-icon) {
    color: var(--od-blue);
    animation: float 3s ease-in-out infinite;
  }

  .viz-icon-pulse {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--od-blue);
    opacity: 0.15;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  @keyframes pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.15; }
    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.08; }
  }

  .viz-title {
    color: var(--od-text-bright);
    font-weight: 700;
    font-size: 16px;
  }

  .viz-description {
    font-size: 12px;
    color: var(--od-text-dim);
    max-width: 280px;
    line-height: 1.6;
  }

  .viz-description .highlight {
    color: var(--od-blue);
    font-weight: 700;
  }

  .feature-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 8px;
    max-width: 320px;
  }

  .feature-tag {
    background: color-mix(in srgb, var(--tag-color) 12%, var(--od-bg-deep));
    color: var(--tag-color);
    font-size: 10px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--tag-color) 25%, transparent);
    transition: all 0.2s ease;
  }

  .feature-tag:hover {
    background: color-mix(in srgb, var(--tag-color) 20%, var(--od-bg-deep));
    transform: translateY(-1px);
  }

  /* Analysis Panel */
  .analysis-panel {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--od-text-dim);
  }

  .coming-soon :global(.coming-soon-icon) {
    color: var(--od-purple);
    opacity: 0.5;
    margin-bottom: 4px;
  }

  .coming-soon-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--od-text);
  }

  .coming-soon-text {
    font-size: 12px;
    color: var(--od-text-dim);
  }
</style>
