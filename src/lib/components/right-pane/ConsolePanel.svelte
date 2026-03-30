<script lang="ts">
  import { Code2 } from 'lucide-svelte';
  import type { ConsoleViewModel } from '$lib/app-shell/right-pane/view-models';
  import { consumeBufferedLines, normalizeTerminalText } from '$lib/terminal/console-input';

  export let viewModel: ConsoleViewModel;
  export let onSendInputLine: (line: string) => Promise<void>;
  export let onInterrupt: () => Promise<void>;
  export let onEof: () => Promise<void>;

  let outputRef: HTMLDivElement;
  let terminalInputRef: HTMLTextAreaElement;
  let terminalInputBuffer = '';
  let terminalSending = false;
  let pendingInputLines: string[] = [];
  let flushPromise: Promise<void> | null = null;
  let previousSessionState = false;
  let previousRenderedOutput = '';

  $: output = viewModel.output;
  $: pendingRunInputEcho = viewModel.pendingRunInputEcho;
  $: hasError = viewModel.hasError;
  $: compileSummary = viewModel.compileSummary;
  $: runSummary = viewModel.runSummary;
  $: canSendToStdin = viewModel.canSendToStdin;
  $: workspaceError = viewModel.workspaceError;
  $: renderedOutput = `${output}${pendingRunInputEcho}${canSendToStdin ? terminalInputBuffer : ''}`;

  $: if (canSendToStdin !== previousSessionState) {
    previousSessionState = canSendToStdin;
    resetInputQueue({ clearBuffer: true });
    previousRenderedOutput = '';
    if (canSendToStdin) {
      queueMicrotask(() => {
        focusTerminalInput();
        scrollTerminalToBottom();
      });
    }
  }

  $: if (canSendToStdin && outputRef) {
    queueMicrotask(() => focusTerminalInput());
  }

  $: if (outputRef && renderedOutput !== previousRenderedOutput) {
    previousRenderedOutput = renderedOutput;
    queueMicrotask(() => scrollTerminalToBottom());
  }

  function focusTerminalInput() {
    if (!terminalInputRef) {
      return;
    }

    terminalInputRef.focus();
    const cursor = terminalInputRef.value.length;
    terminalInputRef.setSelectionRange(cursor, cursor);
  }

  function scrollTerminalToBottom() {
    if (!outputRef) return;
    outputRef.scrollTop = outputRef.scrollHeight;
  }

  function resetInputQueue(options: { clearBuffer?: boolean } = {}) {
    pendingInputLines = [];
    terminalSending = false;
    flushPromise = null;
    if (options.clearBuffer) {
      terminalInputBuffer = '';
    }
  }

  function enqueueInputLine(line: string) {
    pendingInputLines = [...pendingInputLines, line];
    if (!flushPromise) {
      flushPromise = flushInputQueue();
    }
  }

  async function flushInputQueue() {
    if (terminalSending) {
      return;
    }

    terminalSending = true;
    try {
      while (canSendToStdin && pendingInputLines.length > 0) {
        const [nextLine, ...rest] = pendingInputLines;
        pendingInputLines = rest;
        await onSendInputLine(nextLine);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send runtime input';
      console.error(message);
      pendingInputLines = [];
    } finally {
      terminalSending = false;
      flushPromise = null;
      queueMicrotask(() => focusTerminalInput());
    }
  }

  async function handleRuntimeInterrupt() {
    resetInputQueue({ clearBuffer: true });

    try {
      await onInterrupt();
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Failed to interrupt runtime session');
    }

    queueMicrotask(() => focusTerminalInput());
  }

  async function handleRuntimeEof() {
    try {
      if (flushPromise) {
        await flushPromise;
      }
      await onEof();
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Failed to send EOF to runtime session');
    } finally {
      queueMicrotask(() => focusTerminalInput());
    }
  }

  function syncTerminalInputBuffer(value: string) {
    terminalInputBuffer = value;
    if (terminalInputRef && terminalInputRef.value !== value) {
      terminalInputRef.value = value;
    }
  }

  function handleTerminalKeydown(event: KeyboardEvent) {
    if (!canSendToStdin) {
      return;
    }

    const lowerKey = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && lowerKey === 'c') {
      event.preventDefault();
      void handleRuntimeInterrupt();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && lowerKey === 'd') {
      event.preventDefault();
      if (terminalInputBuffer.length > 0) {
        const line = terminalInputBuffer;
        terminalInputBuffer = '';
        enqueueInputLine(line);
      }
      void handleRuntimeEof();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      queueMicrotask(() => focusTerminalInput());
      return;
    }

    if (event.altKey) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const line = terminalInputBuffer;
      syncTerminalInputBuffer('');
      enqueueInputLine(line);
      queueMicrotask(() => focusTerminalInput());
    }
  }

  function handleTerminalInput(event: Event) {
    if (!canSendToStdin) {
      syncTerminalInputBuffer('');
      return;
    }

    const target = event.currentTarget;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    const normalized = normalizeTerminalText(target.value);
    const { lines, remainder } = consumeBufferedLines(normalized);
    syncTerminalInputBuffer(remainder);

    if (lines.length > 0) {
      pendingInputLines = [...pendingInputLines, ...lines];
      if (!flushPromise) {
        flushPromise = flushInputQueue();
      }
    }

    queueMicrotask(() => {
      focusTerminalInput();
      scrollTerminalToBottom();
    });
  }

  function handleTerminalPointerdown(event: PointerEvent) {
    if (!canSendToStdin) {
      return;
    }

    focusTerminalInput();
  }
</script>

<div class="output-panel terminal-panel">
  {#if workspaceError}
    <div class="output-error">{workspaceError}</div>
  {/if}
  {#if runSummary || compileSummary}
    <div class="console-stats">
      {#if runSummary}
        <span class="console-stat-pill console-stat-pill-run">{runSummary}</span>
      {/if}
      {#if compileSummary}
        <span class="console-stat-pill">{compileSummary}</span>
      {/if}
    </div>
  {/if}
  <div
    bind:this={outputRef}
    class="output-content terminal-output"
    class:terminal-active={canSendToStdin}
    role="textbox"
    aria-label="Program console"
    aria-multiline="true"
    tabindex="0"
    on:focus={focusTerminalInput}
    on:pointerdown={handleTerminalPointerdown}
  >
    {#if output}
      <pre class="output-text" class:error-output={hasError}>{renderedOutput}{#if canSendToStdin}<span class="terminal-caret"></span>{/if}</pre>
    {:else if canSendToStdin}
      <pre class="output-text">{terminalInputBuffer}<span class="terminal-caret"></span></pre>
    {:else}
      <div class="empty-output">
        <Code2 size={28} class="empty-icon" />
        <span class="empty-title">Console is idle</span>
        <span class="empty-hint">Compile to validate, then run to start a live console session</span>
      </div>
    {/if}
    {#if canSendToStdin}
      <textarea
        bind:this={terminalInputRef}
        class="terminal-input-proxy"
        aria-label="Program stdin"
        autocapitalize="off"
        autocomplete="off"
        rows="1"
        spellcheck={false}
        on:input={handleTerminalInput}
        on:keydown={handleTerminalKeydown}
      ></textarea>
    {/if}
  </div>
</div>

<style>
  .terminal-output {
    position: relative;
  }

  .terminal-input-proxy {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    color: transparent;
    caret-color: transparent;
    opacity: 0;
    pointer-events: none;
    resize: none;
  }
</style>
