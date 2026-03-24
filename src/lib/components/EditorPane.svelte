<script lang="ts">
  import { Cpu, FileText, Loader2 } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import highlight from '$lib/highlight';
  import { currentStepIndex, editorCode, traceSteps } from '$lib/stores';

  const LINE_HEIGHT_PX = 22;
  const EDITOR_PADDING_PX = 12;
  const AUTO_SCROLL_MARGIN_LINES = 3;

  const dispatch = createEventDispatcher<{
    trace: void;
  }>();

  export let isTracing = false;

  let code = $editorCode;
  let hlLine: number | null = null;
  let lineCount = 1;
  let taRef: HTMLTextAreaElement;
  let preRef: HTMLPreElement;
  let lnRef: HTMLDivElement;
  let scrollTop = 0;
  let lastAutoScrolledStep = -1;

  $: {
    code = $editorCode;
    lineCount = code.split('\n').length;
  }

  $: total = $traceSteps.length;
  $: curStep = $currentStepIndex;
  $: isTraceMode = total > 0;
  $: activeTraceStep = isTraceMode ? $traceSteps[curStep] ?? null : null;
  $: currentLineTop = hlLine
    ? (hlLine - 1) * LINE_HEIGHT_PX + EDITOR_PADDING_PX - scrollTop
    : null;

  $: {
    if ($traceSteps && $traceSteps.length > 0 && $traceSteps[$currentStepIndex]) {
      hlLine = $traceSteps[$currentStepIndex].lineNo;
    } else {
      hlLine = null;
    }
  }

  $: {
    if (!isTraceMode) {
      lastAutoScrolledStep = -1;
    } else if (taRef && hlLine !== null && curStep !== lastAutoScrolledStep) {
      // Keep the active trace line visible, but only when step changes so
      // manual scrolling during a paused step is not overridden repeatedly.
      ensureHighlightedLineVisible(hlLine);
      lastAutoScrolledStep = curStep;
    }
  }

  function syncScroll() {
    if (taRef && preRef && lnRef) {
      scrollTop = taRef.scrollTop;
      preRef.scrollTop = taRef.scrollTop;
      preRef.scrollLeft = taRef.scrollLeft;
      lnRef.scrollTop = taRef.scrollTop;
    }
  }

  function ensureHighlightedLineVisible(lineNo: number) {
    if (!taRef) return;

    const lineTop = EDITOR_PADDING_PX + (lineNo - 1) * LINE_HEIGHT_PX;
    const lineBottom = lineTop + LINE_HEIGHT_PX;
    const viewportTop = taRef.scrollTop;
    const viewportBottom = viewportTop + taRef.clientHeight;
    const margin = AUTO_SCROLL_MARGIN_LINES * LINE_HEIGHT_PX;

    const shouldScrollUp = lineTop < viewportTop + margin;
    const shouldScrollDown = lineBottom > viewportBottom - margin;
    if (!shouldScrollUp && !shouldScrollDown) return;

    const centeredTop = Math.max(
      0,
      lineTop - taRef.clientHeight / 2 + LINE_HEIGHT_PX / 2
    );

    taRef.scrollTop = centeredTop;
    syncScroll();
  }

  function onKey(e: KeyboardEvent) {
    if (isTraceMode) {
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = taRef.selectionStart;
      const end = taRef.selectionEnd;
      code = code.substring(0, start) + '  ' + code.substring(end);
      $editorCode = code;
      setTimeout(() => {
        taRef.selectionStart = taRef.selectionEnd = start + 2;
      }, 0);
    }
  }

  function handleCodeChange() {
    if (isTraceMode) {
      code = $editorCode;
      return;
    }

    $editorCode = code;
    traceSteps.set([]);
  }

  async function runTrace() {
    if (isTracing) return;
    dispatch('trace');
  }
</script>

<div class="editor-pane">
  <!-- File Tab -->
  <div class="file-tab">
    <div class="tab-item active">
      <FileText size={14} />
      <span class="tab-name">main.c</span>
      <span class="tab-dot"></span>
    </div>
  </div>

  <!-- Editor Area -->
  <div class="editor-area">
    <!-- Line Numbers Gutter -->
    <div bind:this={lnRef} class="line-gutter">
      {#each Array.from({ length: lineCount }, (_, i) => i) as i}
        <div class="line-number" class:highlighted={hlLine === i + 1}>
          {i + 1}
        </div>
      {/each}
    </div>

    <!-- Code Area -->
    <div class="code-area">
      {#if hlLine}
        <div
          class="current-line-highlight"
          style="top: {currentLineTop ?? 0}px;"
        ></div>
      {/if}
      <pre
        bind:this={preRef}
        class="code-display"
      >{@html highlight(code)}</pre>
      <textarea
        bind:this={taRef}
        bind:value={code}
        on:input={handleCodeChange}
        on:keydown={onKey}
        on:scroll={syncScroll}
        wrap="off"
        spellcheck={false}
        class="code-input"
        class:readonly-mode={isTraceMode}
        readonly={isTraceMode}
      ></textarea>
    </div>
  </div>

  <!-- Trace Controls -->
  <div class="controls-panel">
    <button
      on:click={runTrace}
      disabled={isTracing}
      class="trace-button"
      class:tracing={isTracing}
    >
      {#if isTracing}
        <Loader2 size={14} class="animate-spin" />
        <span>Interpreting…</span>
      {:else}
        <Cpu size={14} />
        <span>{isTraceMode ? 'Retrace Execution' : 'Trace Execution'}</span>
      {/if}
    </button>

    {#if isTraceMode}
      <div class="trace-status">
        <div class="trace-status-copy">
          <span class="trace-status-label">Trace is active in the Visualizer panel</span>
          <span class="trace-status-meta">
            line {activeTraceStep?.lineNo ?? '—'} · step {curStep + 1} / {total}
          </span>
        </div>
        <span class="trace-status-chip">Right panel controls</span>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Editor Pane Container */
  .editor-pane {
    width: 50%;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #3e4451;
    background: #282c34;
  }

  /* File Tab Styling - VS Code like */
  .file-tab {
    display: flex;
    align-items: stretch;
    background: #21252b;
    border-bottom: 1px solid #3e4451;
    height: 35px;
  }

  .tab-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    background: #282c34;
    border-right: 1px solid #3e4451;
    border-top: 2px solid transparent;
    color: #abb2bf;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-item.active {
    border-top-color: #61afef;
  }

  .tab-item:hover {
    background: #2c313a;
  }

  .tab-name {
    color: #e5e5e5;
  }

  .tab-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #5c6370;
    opacity: 0;
  }

  /* Editor Area */
  .editor-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
    background: #282c34;
  }

  /* Line Number Gutter */
  .line-gutter {
    width: 50px;
    padding: 12px 0;
    background: #21252b;
    border-right: 1px solid #3e4451;
    overflow-y: hidden;
    text-align: right;
    user-select: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #5c6370;
  }

  .line-number {
    line-height: 22px;
    padding-right: 12px;
    transition: color 0.15s ease;
  }

  .line-number.highlighted {
    color: #61afef;
    font-weight: 600;
  }

  /* Code Area */
  .code-area {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  /* Current Line Highlight */
  .current-line-highlight {
    position: absolute;
    left: 0;
    right: 0;
    height: 22px;
    background: rgba(97, 175, 239, 0.08);
    border-left: 2px solid #61afef;
    pointer-events: none;
    z-index: 2;
    transition: top 0.18s ease;
  }

  /* Code Display */
  .code-display {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 12px;
    color: #abb2bf;
    pointer-events: none;
    overflow: hidden;
    z-index: 1;
    background: transparent;
  }

  /* Code Input (transparent overlay) */
  .code-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 12px;
    margin: 0;
    background: transparent;
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: #e5e5e5;
    resize: none;
    outline: none;
    overflow: auto;
    z-index: 3;
    border: none;
  }

  .code-display,
  .code-input {
    box-sizing: border-box;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 22px;
    letter-spacing: normal;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
    tab-size: 2;
    -moz-tab-size: 2;
    font-variant-ligatures: none;
    font-kerning: none;
  }

  .code-input:focus {
    outline: none;
  }

  .code-input.readonly-mode {
    caret-color: transparent;
  }

  /* Controls Panel */
  .controls-panel {
    background: #21252b;
    border-top: 1px solid #3e4451;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
  }

  /* Trace Button */
  .trace-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: #61afef;
    border: none;
    border-radius: 6px;
    color: #282c34;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .trace-button:hover:not(:disabled) {
    background: #528bcc;
    transform: translateY(-1px);
  }

  .trace-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .trace-button.tracing {
    background: rgba(97, 175, 239, 0.4);
    cursor: not-allowed;
  }

  .trace-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    border: 1px solid rgba(97, 175, 239, 0.2);
    background: rgba(97, 175, 239, 0.08);
    border-radius: 8px;
    padding: 10px 12px;
  }

  .trace-status-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .trace-status-label {
    color: #e5e5e5;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .trace-status-meta {
    color: #abb2bf;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
  }

  .trace-status-chip {
    color: #61afef;
    border: 1px solid rgba(97, 175, 239, 0.28);
    background: rgba(97, 175, 239, 0.12);
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* Animation for loader */
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
