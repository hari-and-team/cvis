<script lang="ts">
  import { ChevronLeft, ChevronRight, Cpu, FileText, Loader2, SkipBack, SkipForward, Play, Pause } from 'lucide-svelte';
  import { createEventDispatcher, onMount } from 'svelte';
  import highlight from '$lib/highlight';
  import { currentStepIndex, editorCode, isPlaying, traceSteps } from '$lib/stores';

  const dispatch = createEventDispatcher<{
    trace: void;
  }>();

  let code = $editorCode;
  let isTracing = false;
  let hlLine: number | null = null;
  let lineCount = 1;
  let taRef: HTMLTextAreaElement;
  let preRef: HTMLPreElement;
  let lnRef: HTMLDivElement;
  let playing = false;

  $: {
    code = $editorCode;
    lineCount = code.split('\n').length;
  }

  $: total = $traceSteps.length;
  $: curStep = $currentStepIndex;
  $: playing = $isPlaying;

  $: {
    if ($traceSteps && $traceSteps.length > 0 && $traceSteps[$currentStepIndex]) {
      hlLine = $traceSteps[$currentStepIndex].lineNo;
    } else {
      hlLine = null;
    }
  }

  function syncScroll() {
    if (taRef && preRef && lnRef) {
      preRef.scrollTop = taRef.scrollTop;
      preRef.scrollLeft = taRef.scrollLeft;
      lnRef.scrollTop = taRef.scrollTop;
    }
  }

  function onKey(e: KeyboardEvent) {
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
    $editorCode = code;
    traceSteps.set([]);
  }

  async function runTrace() {
    isTracing = true;
    dispatch('trace');
    setTimeout(() => {
      isTracing = false;
    }, 500);
  }

  function setCurStep(val: number | ((prev: number) => number)) {
    if (typeof val === 'function') {
      currentStepIndex.update(val);
    } else {
      currentStepIndex.set(val);
    }
  }

  function setPlaying(val: boolean | ((prev: boolean) => boolean)) {
    if (typeof val === 'function') {
      isPlaying.update(val);
    } else {
      isPlaying.set(val);
    }
  }

  let playInterval: number | undefined;

  $: {
    if (playing && total > 0) {
      if (playInterval) clearInterval(playInterval);
      playInterval = window.setInterval(() => {
        if ($currentStepIndex < total - 1) {
          currentStepIndex.update((i) => i + 1);
        } else {
          isPlaying.set(false);
        }
      }, 800);
    } else if (playInterval) {
      clearInterval(playInterval);
      playInterval = undefined;
    }
  }

  onMount(() => () => {
    if (playInterval) clearInterval(playInterval);
  });
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
          style="top: {(hlLine - 1) * 22 + 12}px;"
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
        spellcheck={false}
        class="code-input"
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
        <span>Trace Execution</span>
      {/if}
    </button>

    {#if $traceSteps && $traceSteps.length > 0}
      <div class="playback-controls">
        <button
          on:click={() => { setCurStep(0); setPlaying(false); }}
          class="ctrl-btn icon-only"
          title="Go to start"
        >
          <SkipBack size={12} />
        </button>
        <button
          on:click={() => setCurStep((p) => Math.max(0, p - 1))}
          disabled={curStep === 0}
          class="ctrl-btn flex-1"
        >
          <ChevronLeft size={14} />
          <span>Prev</span>
        </button>
        <button
          on:click={() => setPlaying((p) => !p)}
          class="ctrl-btn flex-1 play-btn"
          class:playing={playing}
        >
          {#if playing}
            <Pause size={12} />
            <span>Pause</span>
          {:else}
            <Play size={12} />
            <span>Play</span>
          {/if}
        </button>
        <button
          on:click={() => setCurStep((p) => Math.min(total - 1, p + 1))}
          disabled={curStep === total - 1}
          class="ctrl-btn flex-1"
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
        <button
          on:click={() => { setCurStep(total - 1); setPlaying(false); }}
          class="ctrl-btn icon-only"
          title="Go to end"
        >
          <SkipForward size={12} />
        </button>
      </div>

      <!-- Progress Slider -->
      <div class="progress-container">
        <div
          role="slider"
          tabindex="0"
          aria-valuenow={curStep + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          on:click={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = e instanceof MouseEvent ? e.clientX : 0;
            setCurStep(Math.min(total - 1, Math.floor(((x - r.left) / r.width) * total)));
            setPlaying(false);
          }}
          on:keydown={(e) => {
            if (e.key === 'ArrowRight') setCurStep((p) => Math.min(total - 1, p + 1));
            else if (e.key === 'ArrowLeft') setCurStep((p) => Math.max(0, p - 1));
          }}
          class="progress-track"
        >
          <div
            class="progress-fill"
            style="width: {((curStep + 1) / total) * 100}%;"
          ></div>
          <div
            class="progress-thumb"
            style="left: {((curStep + 1) / total) * 100}%;"
          ></div>
        </div>
        <span class="step-counter">
          {curStep + 1} / {total}
        </span>
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
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 22px;
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
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 22px;
    background: transparent;
    color: transparent;
    caret-color: #e5e5e5;
    resize: none;
    outline: none;
    overflow: auto;
    z-index: 3;
    border: none;
    tab-size: 2;
  }

  .code-input:focus {
    outline: none;
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

  /* Playback Controls */
  .playback-controls {
    display: flex;
    gap: 6px;
  }

  /* Control Buttons */
  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 12px;
    background: #2c313a;
    border: 1px solid #3e4451;
    border-radius: 5px;
    color: #abb2bf;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .ctrl-btn:hover:not(:disabled) {
    background: #3e4451;
    border-color: #5c6370;
    color: #e5e5e5;
  }

  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .ctrl-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ctrl-btn.icon-only {
    padding: 8px 10px;
  }

  .ctrl-btn.flex-1 {
    flex: 1;
  }

  .ctrl-btn.play-btn {
    background: #2c313a;
  }

  .ctrl-btn.play-btn.playing {
    background: rgba(198, 120, 221, 0.15);
    border-color: #c678dd;
    color: #c678dd;
  }

  .ctrl-btn.play-btn:hover:not(:disabled) {
    background: rgba(97, 175, 239, 0.15);
    border-color: #61afef;
    color: #61afef;
  }

  /* Progress Slider */
  .progress-container {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .progress-track {
    flex: 1;
    height: 6px;
    background: #3e4451;
    border-radius: 3px;
    cursor: pointer;
    position: relative;
    overflow: visible;
  }

  .progress-track:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(97, 175, 239, 0.3);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #61afef, #56b6c2);
    border-radius: 3px;
    transition: width 0.15s ease;
  }

  .progress-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    background: #e5e5e5;
    border: 2px solid #61afef;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: left 0.15s ease, transform 0.1s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .progress-track:hover .progress-thumb {
    transform: translate(-50%, -50%) scale(1.1);
  }

  .step-counter {
    color: #5c6370;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    min-width: 50px;
    text-align: right;
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
