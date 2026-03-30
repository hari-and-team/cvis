<script lang="ts">
  import { Code2 } from 'lucide-svelte';
  import type { ConsoleViewModel } from '$lib/app-shell/right-pane/view-models';
  import { inertialScroll } from '$lib/shared/inertial-scroll';
  import { consumeBufferedLines, normalizeTerminalText } from '$lib/terminal/console-input';

  export let viewModel: ConsoleViewModel;
  export let onSendInputLine: (line: string) => Promise<void>;
  export let onInterrupt: () => Promise<void>;
  export let onEof: () => Promise<void>;

  let outputRef: HTMLDivElement;
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
        focusTerminalOutput();
        scrollTerminalToBottom();
      });
    }
  }

  $: if (canSendToStdin && outputRef) {
    queueMicrotask(() => focusTerminalOutput());
  }

  $: if (outputRef && renderedOutput !== previousRenderedOutput) {
    previousRenderedOutput = renderedOutput;
    queueMicrotask(() => scrollTerminalToBottom());
  }

  function focusTerminalOutput() {
    outputRef?.focus();
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
      queueMicrotask(() => focusTerminalOutput());
    }
  }

  async function handleRuntimeInterrupt() {
    resetInputQueue({ clearBuffer: true });

    try {
      await onInterrupt();
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Failed to interrupt runtime session');
    }

    queueMicrotask(() => focusTerminalOutput());
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
      queueMicrotask(() => focusTerminalOutput());
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
      queueMicrotask(() => focusTerminalOutput());
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const line = terminalInputBuffer;
      terminalInputBuffer = '';
      enqueueInputLine(line);
      queueMicrotask(() => focusTerminalOutput());
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      if (terminalInputBuffer.length > 0) {
        terminalInputBuffer = terminalInputBuffer.slice(0, -1);
      }
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      terminalInputBuffer += event.key;
    }
  }

  function handleTerminalPaste(event: ClipboardEvent) {
    if (!canSendToStdin) {
      return;
    }

    const text = event.clipboardData?.getData('text') ?? '';
    if (!text) return;

    event.preventDefault();

    const normalized = normalizeTerminalText(text);
    const combined = `${terminalInputBuffer}${normalized}`;
    const { lines, remainder } = consumeBufferedLines(combined);

    terminalInputBuffer = remainder;
    if (lines.length > 0) {
      pendingInputLines = [...pendingInputLines, ...lines];
      if (!flushPromise) {
        flushPromise = flushInputQueue();
      }
    }

    queueMicrotask(() => {
      focusTerminalOutput();
      scrollTerminalToBottom();
    });
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
    use:inertialScroll
    class="output-content terminal-output"
    class:terminal-active={canSendToStdin}
    role="textbox"
    aria-label="Program console"
    aria-multiline="true"
    tabindex="0"
    on:keydown={handleTerminalKeydown}
    on:paste={handleTerminalPaste}
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
  </div>
</div>
