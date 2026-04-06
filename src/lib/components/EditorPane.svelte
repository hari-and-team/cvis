<script lang="ts">
  import { FileText } from 'lucide-svelte';
  import highlight from '$lib/highlight';
  import { currentStepIndex, editorCode, isPlaying, traceSteps } from '$lib/stores';

  const LINE_HEIGHT_PX = 22;
  const EDITOR_PADDING_PX = 12;
  const AUTO_SCROLL_MARGIN_LINES = 3;
  const INDENT = '    ';
  const PAIRS: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '"': '"',
    "'": "'"
  };

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

  function updateCodeAndSelection(nextCode: string, selectionStart: number, selectionEnd = selectionStart) {
    code = nextCode;
    $editorCode = nextCode;
    setTimeout(() => {
      taRef.selectionStart = selectionStart;
      taRef.selectionEnd = selectionEnd;
    }, 0);
  }

  function findLineStart(source: string, index: number) {
    return source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  }

  function findLineEnd(source: string, index: number) {
    const nextBreak = source.indexOf('\n', index);
    return nextBreak === -1 ? source.length : nextBreak;
  }

  function currentLineIndentAt(source: string, index: number) {
    const lineStart = findLineStart(source, index);
    return source.slice(lineStart, index).match(/^\s*/)?.[0] ?? '';
  }

  function onKey(e: KeyboardEvent) {
    const start = taRef.selectionStart;
    const end = taRef.selectionEnd;
    const selectedText = code.slice(start, end);
    const currentLineStart = findLineStart(code, start);
    const currentLineIndent = currentLineIndentAt(code, start);

    if (e.key === 'Tab') {
      e.preventDefault();
      const selectionTouchesMultipleLines = selectedText.includes('\n') || start !== end;

      if (selectionTouchesMultipleLines) {
        const blockStart = currentLineStart;
        const blockEnd = findLineEnd(code, end);
        const block = code.slice(blockStart, blockEnd);
        const lines = block.split('\n');

        if (e.shiftKey) {
          let removed = 0;
          const updated = lines.map((line) => {
            if (line.startsWith(INDENT)) {
              removed += INDENT.length;
              return line.slice(INDENT.length);
            }
            const partialIndent = line.match(/^ {1,3}/)?.[0]?.length ?? 0;
            if (partialIndent > 0) {
              removed += partialIndent;
              return line.slice(partialIndent);
            }
            return line;
          });

          const nextCode = code.slice(0, blockStart) + updated.join('\n') + code.slice(blockEnd);
          const nextStart = start === end ? Math.max(blockStart, start - INDENT.length) : blockStart;
          const nextEnd = Math.max(nextStart, end - removed);
          updateCodeAndSelection(nextCode, nextStart, nextEnd);
        } else {
          const updated = lines.map((line) => `${INDENT}${line}`);
          const nextCode = code.slice(0, blockStart) + updated.join('\n') + code.slice(blockEnd);
          const added = lines.length * INDENT.length;
          const nextStart = start === end ? start + INDENT.length : blockStart;
          const nextEnd = start === end ? nextStart : end + added;
          updateCodeAndSelection(nextCode, nextStart, nextEnd);
        }
      } else if (e.shiftKey) {
        const removable = code.slice(Math.max(currentLineStart, start - INDENT.length), start);
        const removeWidth = removable === INDENT ? INDENT.length : removable.match(/ +$/)?.[0]?.length ?? 0;
        if (removeWidth > 0) {
          const nextCode = code.slice(0, start - removeWidth) + code.slice(end);
          updateCodeAndSelection(nextCode, start - removeWidth);
        }
      } else {
        const nextCode = code.substring(0, start) + INDENT + code.substring(end);
        updateCodeAndSelection(nextCode, start + INDENT.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const beforeCursor = code[start - 1] ?? '';
      const afterCursor = code[end] ?? '';
      const beforeLine = code.slice(currentLineStart, start);
      const shouldIndentNextLine = /\{\s*$/.test(beforeLine);
      const shouldExpandBlock = beforeCursor === '{' && afterCursor === '}';
      const nextIndent = shouldIndentNextLine ? `${currentLineIndent}${INDENT}` : currentLineIndent;
      const insertion = shouldExpandBlock
        ? `\n${nextIndent}\n${currentLineIndent}`
        : `\n${nextIndent}`;

      const nextCode = code.slice(0, start) + insertion + code.slice(end);
      const nextCursor = start + 1 + nextIndent.length;
      updateCodeAndSelection(nextCode, nextCursor);
      return;
    }

    if (e.key in PAIRS && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const closing = PAIRS[e.key];
      const nextChar = code[end] ?? '';

      if ((e.key === '"' || e.key === "'") && nextChar === e.key) {
        e.preventDefault();
        updateCodeAndSelection(code, start + 1);
        return;
      }

      e.preventDefault();
      const wrapSelection = selectedText.length > 0 && e.key !== '"' && e.key !== "'";
      const insertion = wrapSelection ? `${e.key}${selectedText}${closing}` : `${e.key}${closing}`;
      const cursorPosition = wrapSelection ? start + insertion.length : start + 1;
      updateCodeAndSelection(code.slice(0, start) + insertion + code.slice(end), cursorPosition);
      return;
    }

    if ((e.key === ')' || e.key === ']' || e.key === '}') && code[end] === e.key) {
      e.preventDefault();
      updateCodeAndSelection(code, start + 1);
      return;
    }

    if (e.key === 'Backspace' && start === end && start > 0) {
      const beforeCursor = code[start - 1] ?? '';
      const afterCursor = code[start] ?? '';
      if (PAIRS[beforeCursor] === afterCursor) {
        e.preventDefault();
        updateCodeAndSelection(code.slice(0, start - 1) + code.slice(start + 1), start - 1);
      }
      return;
    }
  }

  function handleCodeChange(event: Event) {
    const nextCode =
      event.currentTarget instanceof HTMLTextAreaElement ? event.currentTarget.value : code;

    code = nextCode;
    $editorCode = nextCode;
    isPlaying.set(false);
    currentStepIndex.set(0);
    traceSteps.set([]);
  }

  function focusEditor() {
    taRef?.focus();
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
  <div class="editor-area" role="presentation" on:pointerdown={focusEditor}>
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
        aria-hidden="true"
      >{@html highlight(code)}</pre>
      <textarea
        bind:this={taRef}
        value={code}
        on:input={handleCodeChange}
        on:keydown={onKey}
        on:scroll={syncScroll}
        wrap="off"
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
        class="code-input"
      ></textarea>
    </div>
  </div>

</div>

<style>
  /* Editor Pane Container */
  .editor-pane {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
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
    color: #e5e5e5;
    -webkit-text-fill-color: currentColor;
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

</style>
