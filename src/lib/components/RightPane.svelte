<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { AlertTriangle, Cpu, Loader2, Code2, Keyboard, Play } from 'lucide-svelte';
  import Visualizer from './Visualizer.svelte';
  import type { TraceStep } from '$lib/types';
  import {
    editorCode,
    errorMessage,
    lastCompileResult,
    lastExecutionResult,
    rightPaneTab,
    runConsoleTranscript,
    runSessionId,
    traceInputDraft
  } from '$lib/stores';
  import { predictProgramIntent } from '$lib/visualizer/program-intent';
  import { analyzeCodeType } from '$lib/analysis/code-type-finder';
  import {
    interruptRuntimeSession,
    sendRuntimeEof,
    sendRuntimeInputLine
  } from '$lib/layout/run-actions';
  import { consumeBufferedLines, normalizeTerminalText } from '$lib/terminal/console-input';
  import { RIGHT_PANE_TABS, VISUALIZER_FEATURES } from './right-pane-config';

  export let traceSteps: TraceStep[] = [];
  export let currentStep: number = 0;
  export let isTracing = false;
  export let traceErr: string | null = null;
  export let traceNeedsInput = false;
  const TRACE_LOADING_TICK_MS = 850;
  const dispatch = createEventDispatcher<{
    trace: void;
  }>();
  const STRUCTURE_INTENTS = new Set(['linked-list', 'stack', 'queue', 'tree', 'graph']);
  const ALGORITHM_INTENTS = new Set([
    'sorting',
    'searching',
    'dynamic-programming',
    'recursion',
    'matrix'
  ]);
  const STRUCTURE_TECHNIQUES = new Set(['linked-list', 'stack', 'queue', 'tree', 'graph']);
  const ALGORITHM_TECHNIQUES = new Set([
    'two-pointers',
    'sliding-window',
    'binary-search',
    'dfs',
    'bfs',
    'hashing',
    'greedy',
    'recursion',
    'dynamic-programming',
    'matrix-traversal',
    'sorting'
  ]);

  interface DetectedDsaCard {
    id: string;
    label: string;
    confidence: number;
    locations: string[];
    signals: string[];
  }

  let terminalInputBuffer = '';
  let terminalSending = false;
  let pendingInputLines: string[] = [];
  let flushPromise: Promise<void> | null = null;
  let outputRef: HTMLDivElement;
  let prevRenderedOutput = '';
  let prevSessionId: string | null = null;
  let loadingStepIndex = 0;
  let loadingTicker: number | null = null;

  $: canSendToStdin = Boolean($runSessionId);
  $: requiresTraceInput = /\bscanf\s*\(/.test($editorCode);
  $: traceInputReady = $traceInputDraft.trim().length > 0;
  $: showTraceInputNotice = traceNeedsInput && requiresTraceInput && !traceInputReady;
  $: intentPrediction = predictProgramIntent($editorCode);
  $: analysisReport = analyzeCodeType($editorCode);
  $: programLineCount = Math.max($editorCode.split('\n').length, 1);
  $: detectedSections = getDetectedSections();
  $: detectedDsaCards = buildDetectedDsaCards();
  $: detectedAlgorithmCards = buildDetectedAlgorithmCards();
  $: hasDetectedDsa = detectedDsaCards.length > 0;
  $: hasDetectedAlgorithms = detectedAlgorithmCards.length > 0;
  $: dominantAnalysisSection = pickDominantSection();
  $: recommendedProblems = analysisReport.recommendations.slice(0, 4);
  $: primaryTechniqueLabels = intentPrediction.techniques.slice(0, 4).map(formatDsaLabel);
  $: loadingSteps = getLoadingSteps(intentPrediction.primaryLabel);
  // Runtime transcript takes priority so users always see the latest terminal state.
  $: output = $runConsoleTranscript
    ? $runConsoleTranscript
    : $lastExecutionResult
      ? $lastExecutionResult.stdout + $lastExecutionResult.stderr
    : $lastCompileResult
      ? $lastCompileResult.output || $lastCompileResult.errors.join('\n')
      : '';
  $: renderedOutput = `${output}${canSendToStdin ? terminalInputBuffer : ''}`;

  $: hasError = Boolean($lastExecutionResult?.stderr || $lastCompileResult?.errors?.length);
  $: clampedTraceStepIndex =
    traceSteps.length === 0 ? 0 : Math.min(Math.max(currentStep, 0), traceSteps.length - 1);
  $: currentTraceStepData = traceSteps[clampedTraceStepIndex] || null;
  $: if ($runSessionId !== prevSessionId) {
    prevSessionId = $runSessionId;
    resetTerminalInputQueue({ clearBuffer: true });
    prevRenderedOutput = '';
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
  $: if (outputRef && renderedOutput !== prevRenderedOutput) {
    prevRenderedOutput = renderedOutput;
    queueMicrotask(() => scrollTerminalToBottom());
  }

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

  function getLoadingSteps(intentLabel: string): string[] {
    return [
      'Scanning tokens and control flow...',
      `Predicting algorithm intent: ${intentLabel}`,
      'Building execution timeline...',
      'Preparing interactive visualization...'
    ];
  }

  function enqueueInputLine(line: string) {
    pendingInputLines = [...pendingInputLines, line];
    if (!flushPromise) {
      flushPromise = flushInputQueue();
    }
  }

  function resetTerminalInputQueue(options: { clearBuffer?: boolean } = {}) {
    pendingInputLines = [];
    terminalSending = false;
    flushPromise = null;
    if (options.clearBuffer) {
      terminalInputBuffer = '';
    }
  }

  function focusTerminalOutput() {
    outputRef?.focus();
  }

  function scrollTerminalToBottom() {
    if (!outputRef) return;
    outputRef.scrollTop = outputRef.scrollHeight;
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
        await sendRuntimeInputLine(nextLine);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send runtime input';
      errorMessage.set(message);
      console.error(message);
      pendingInputLines = [];
    } finally {
      terminalSending = false;
      flushPromise = null;
      queueMicrotask(() => focusTerminalOutput());
    }
  }

  async function handleRuntimeInterrupt() {
    resetTerminalInputQueue({ clearBuffer: true });

    try {
      await interruptRuntimeSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to interrupt runtime session';
      errorMessage.set(message);
      console.error(message);
    }

    queueMicrotask(() => focusTerminalOutput());
  }

  async function handleRuntimeEof() {
    try {
      if (flushPromise) {
        await flushPromise;
      }
      await sendRuntimeEof();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send EOF to runtime session';
      errorMessage.set(message);
      console.error(message);
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

  function formatDsaLabel(tag: string): string {
    return tag
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function formatEvidenceLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (first) => first.toUpperCase());
  }

  function getDetectedSections() {
    return analysisReport.sections.filter(
      (section) => section.intent !== 'generic' && section.confidence >= 0.35
    );
  }

  function mergeTextValues(target: string[], source: string[]) {
    for (const item of source) {
      if (item && !target.includes(item)) {
        target.push(item);
      }
    }
  }

  function buildDetectedDsaCards(): DetectedDsaCard[] {
    const cards = new Map<string, DetectedDsaCard>();
    const primaryProgramScore = analysisReport.candidates[0]?.score ?? 1;

    function ensureCard(id: string, label: string): DetectedDsaCard {
      const existing = cards.get(id);
      if (existing) return existing;

      const created: DetectedDsaCard = {
        id,
        label,
        confidence: 0,
        locations: [],
        signals: []
      };
      cards.set(id, created);
      return created;
    }

    for (const candidate of analysisReport.candidates) {
      if (candidate.intent === 'generic' || !STRUCTURE_INTENTS.has(candidate.intent)) {
        continue;
      }

      const normalizedScore =
        candidate.intent === analysisReport.primaryIntent
          ? analysisReport.confidence
          : candidate.score / Math.max(primaryProgramScore, 1);

      if (normalizedScore < 0.4) {
        continue;
      }

      const card = ensureCard(`intent:${candidate.intent}`, candidate.label);
      card.confidence = Math.max(card.confidence, normalizedScore);
      mergeTextValues(card.signals, intentPrediction.matchedSignals.slice(0, 6));
      mergeTextValues(card.locations, [`Program · L1-${programLineCount}`]);
    }

    for (const technique of intentPrediction.techniques) {
      if (!STRUCTURE_TECHNIQUES.has(technique)) {
        continue;
      }

      const card = ensureCard(`technique:${technique}`, formatDsaLabel(technique));
      card.confidence = Math.max(card.confidence, intentPrediction.confidence);
      mergeTextValues(card.signals, intentPrediction.matchedSignals.slice(0, 4));
    }

    for (const candidate of analysisReport.intentBands) {
      if (
        candidate.intent === 'generic' ||
        !STRUCTURE_INTENTS.has(candidate.intent) ||
        candidate.normalized < 0.35
      ) {
        continue;
      }

      const card = ensureCard(`intent:${candidate.intent}`, candidate.label);
      card.confidence = Math.max(card.confidence, candidate.normalized);
    }

    for (const section of analysisReport.sections) {
      if (
        section.intent === 'generic' ||
        !STRUCTURE_INTENTS.has(section.intent) ||
        section.confidence < 0.35
      ) {
        continue;
      }

      const card = ensureCard(`intent:${section.intent}`, section.label);
      card.confidence = Math.max(card.confidence, section.confidence);
      mergeTextValues(card.signals, section.matchedSignals.slice(0, 4));
      mergeTextValues(card.locations, [formatSectionLocation(section.title, section.startLine, section.endLine)]);
    }

    return Array.from(cards.values()).sort((left, right) => right.confidence - left.confidence);
  }

  function buildDetectedAlgorithmCards(): DetectedDsaCard[] {
    const cards = new Map<string, DetectedDsaCard>();
    const primaryProgramScore = analysisReport.candidates[0]?.score ?? 1;
    const sections = getDetectedSections();

    function ensureCard(id: string, label: string): DetectedDsaCard {
      const existing = cards.get(id);
      if (existing) return existing;

      const created: DetectedDsaCard = {
        id,
        label,
        confidence: 0,
        locations: [],
        signals: []
      };
      cards.set(id, created);
      return created;
    }

    for (const candidate of analysisReport.candidates) {
      if (candidate.intent === 'generic' || !ALGORITHM_INTENTS.has(candidate.intent)) {
        continue;
      }

      const normalizedScore =
        candidate.intent === analysisReport.primaryIntent
          ? analysisReport.confidence
          : candidate.score / Math.max(primaryProgramScore, 1);

      if (normalizedScore < 0.28) {
        continue;
      }

      const card = ensureCard(`intent:${candidate.intent}`, candidate.label);
      card.confidence = Math.max(card.confidence, normalizedScore);
      mergeTextValues(card.signals, intentPrediction.matchedSignals.slice(0, 6));
      mergeTextValues(card.locations, [`Program · L1-${programLineCount}`]);
    }

    for (const band of analysisReport.intentBands) {
      if (band.intent === 'generic' || !ALGORITHM_INTENTS.has(band.intent) || band.normalized < 0.3) {
        continue;
      }

      const card = ensureCard(`intent:${band.intent}`, band.label);
      card.confidence = Math.max(card.confidence, band.normalized);
    }

    for (const section of sections) {
      if (!ALGORITHM_INTENTS.has(section.intent) || section.confidence < 0.3) {
        continue;
      }

      const card = ensureCard(`section:${section.id}`, section.label);
      card.confidence = Math.max(card.confidence, section.confidence);
      mergeTextValues(card.locations, [formatSectionLocation(section.title, section.startLine, section.endLine)]);
      mergeTextValues(card.signals, section.matchedSignals.slice(0, 4));
    }

    for (const technique of intentPrediction.techniques) {
      if (!ALGORITHM_TECHNIQUES.has(technique)) {
        continue;
      }

      const card = ensureCard(`technique:${technique}`, formatDsaLabel(technique));
      card.confidence = Math.max(card.confidence, intentPrediction.confidence);
      mergeTextValues(card.signals, intentPrediction.matchedSignals.slice(0, 4));
      mergeTextValues(card.locations, [`Program · L1-${programLineCount}`]);
    }

    return Array.from(cards.values()).sort((left, right) => right.confidence - left.confidence);
  }

  function formatSectionLocation(title: string, startLine: number, endLine: number): string {
    if (title === 'Program' || title === 'Global Scope') {
      return `${title} · L${startLine}-${endLine}`;
    }

    return `${title}() · L${startLine}-${endLine}`;
  }

  function formatSectionTitle(title: string): string {
    return title === 'Program' || title === 'Global Scope' ? title : `${title}()`;
  }

  function pickDominantSection() {
    const sections = getDetectedSections();
    const rankedSections = [
      ...sections,
      ...analysisReport.sections.filter(
        (section) =>
          section.intent !== 'generic' &&
          !sections.some((candidate) => candidate.id === section.id)
      )
    ];
    const mainSection =
      rankedSections.find((section) => section.title === 'main') ??
      rankedSections.find((section) => section.title === 'Program') ??
      analysisReport.sections.find((section) => section.title === 'main') ??
      analysisReport.sections.find((section) => section.title === 'Program');

    if (mainSection) return mainSection;

    rankedSections.sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      const leftSpan = left.endLine - left.startLine;
      const rightSpan = right.endLine - right.startLine;
      return rightSpan - leftSpan;
    });

    return rankedSections[0] ?? analysisReport.sections[0] ?? null;
  }

  function difficultyClass(difficulty: string): string {
    if (difficulty === 'Hard') return 'difficulty-hard';
    if (difficulty === 'Medium') return 'difficulty-medium';
    return 'difficulty-easy';
  }

  function triggerTrace() {
    dispatch('trace');
  }
</script>

<div class="right-pane">
  <!-- Tab Bar -->
  <div class="tab-bar">
    {#each RIGHT_PANE_TABS as tab}
      <button
        class="tab-btn"
        class:active={$rightPaneTab === tab.id}
        style="--tab-color: {tab.color}"
        on:click={() => rightPaneTab.set(tab.id)}
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
    {#if $rightPaneTab === 'console'}
      <div class="output-panel terminal-panel">
        <div
          bind:this={outputRef}
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
    {/if}

    {#if $rightPaneTab === 'visualizer'}
      <div class="visualizer-tab-shell">
        {#if requiresTraceInput}
          <section class="trace-input-card">
            <div class="trace-input-header">
              <div class="trace-input-title-row">
                <span class="trace-input-icon"><Keyboard size={14} /></span>
                <div class="trace-input-copy">
                  <span class="trace-input-title">Trace stdin</span>
                  <span class="trace-input-subtitle">
                    `scanf()` needs preset input before trace playback can begin.
                  </span>
                </div>
              </div>
              <span class:ready={traceInputReady} class="trace-input-status">
                {traceInputReady ? 'Ready' : 'Needed'}
              </span>
            </div>

            <textarea
              class="trace-input-editor"
              spellcheck={false}
              value={$traceInputDraft}
              on:input={(event) => traceInputDraft.set((event.currentTarget as HTMLTextAreaElement).value)}
              placeholder="stdin for scanf()...&#10;Example: 1 10 3 4"
            ></textarea>

            <div class="trace-input-actions">
              <span class="trace-input-note">
                This matches the reference flow, but stays inside the TS/Svelte visualizer instead of using a popup.
              </span>
              <button
                type="button"
                class="trace-input-run"
                disabled={isTracing || !traceInputReady}
                on:click={triggerTrace}
              >
                {#if isTracing}
                  <Loader2 size={14} class="loader-spin" />
                  <span>Tracing…</span>
                {:else}
                  <Play size={13} />
                  <span>Trace with Input</span>
                {/if}
              </button>
            </div>

            {#if showTraceInputNotice}
              <div class="trace-input-warning">
                Add the values above, then run Trace Execution again.
              </div>
            {/if}
          </section>
        {/if}

        <div class="visualizer-panel-body">
          {#if isTracing}
            <div class="loading-state">
              <div class="loader-wrapper">
                <Loader2 size={36} class="loader-spin" />
              </div>
              <span class="loading-text">Interpreting C code…</span>
              <span class="loading-intent">
                predicted:
                <span class="loading-intent-value">{intentPrediction.primaryLabel}</span>
                ({Math.round(intentPrediction.confidence * 100)}%)
              </span>
              <span class="loading-step">{loadingSteps[loadingStepIndex]}</span>
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
                  Use compile plus run for exact output from complex programs.
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
                {#if requiresTraceInput}
                  with the stdin captured above.
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
    {/if}

    {#if $rightPaneTab === 'analysis'}
      <div class="analysis-panel">
        <div class="analysis-scroll">
          {#if hasDetectedDsa || hasDetectedAlgorithms}
            <section class="analysis-card analysis-summary-card">
              <div class="analysis-header">
                <span class="analysis-title">Analysis Snapshot</span>
                <span class="analysis-meta">{analysisReport.sections.length} sections scanned</span>
              </div>
              <div class="analysis-summary-grid">
                <div class="analysis-summary-copy">
                  <div class="analysis-primary-label">{analysisReport.primaryLabel}</div>
                  <div class="analysis-summary-text">
                    The analyzer is most confident about this shape of code, then layers section-level
                    complexity and practice guidance on top.
                  </div>
                  {#if dominantAnalysisSection}
                    <div class="analysis-summary-hint">
                      Highest-signal section: {formatSectionTitle(dominantAnalysisSection.title)}
                    </div>
                  {/if}
                  <div class="analysis-summary-hint">
                    Overall estimate: {analysisReport.overallTimeComplexity} time · {analysisReport.overallSpaceComplexity} space
                  </div>
                </div>
                <div class="analysis-summary-metrics">
                  <div class="analysis-metric-card">
                    <span class="analysis-metric-label">Detected</span>
                    <span class="analysis-metric-value">
                      {detectedDsaCards.length + detectedAlgorithmCards.length}
                    </span>
                  </div>
                  <div class="analysis-metric-card">
                    <span class="analysis-metric-label">Sections</span>
                    <span class="analysis-metric-value">{analysisReport.sections.length}</span>
                  </div>
                  <div class="analysis-metric-card">
                    <span class="analysis-metric-label">Picks</span>
                    <span class="analysis-metric-value">{recommendedProblems.length}</span>
                  </div>
                </div>
              </div>

              {#if primaryTechniqueLabels.length > 0}
                <div class="analysis-signal-row analysis-signal-row-strong">
                  {#each primaryTechniqueLabels as technique}
                    <span class="analysis-signal analysis-signal-strong">{technique}</span>
                  {/each}
                </div>
              {/if}
            </section>
          {/if}

          {#if hasDetectedDsa}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Detected Structures</span>
                <span class="analysis-meta">{detectedDsaCards.length} found</span>
              </div>
              <div class="section-list">
                {#each detectedDsaCards as card}
                  <article class="section-item">
                    <div class="section-top">
                      <span class="section-name">{card.label}</span>
                      <span class="section-confidence">{Math.round(card.confidence * 100)}%</span>
                    </div>
                    {#if card.locations.length > 0}
                      <div class="analysis-subtitle">{card.locations.join(' · ')}</div>
                    {/if}
                    <div class="analysis-evidence-label">Why this matched</div>
                    {#if card.signals.length > 0}
                      <div class="analysis-signal-row">
                        {#each card.signals.slice(0, 5) as signal}
                          <span class="analysis-signal analysis-signal-muted">
                            {formatEvidenceLabel(signal)}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>
          {/if}

          {#if hasDetectedAlgorithms}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Technique Signals</span>
                <span class="analysis-meta">{detectedAlgorithmCards.length} found</span>
              </div>
              <div class="section-list">
                {#each detectedAlgorithmCards as card}
                  <article class="section-item">
                    <div class="section-top">
                      <span class="section-name">{card.label}</span>
                      <span class="section-confidence">{Math.round(card.confidence * 100)}%</span>
                    </div>
                    {#if card.locations.length > 0}
                      <div class="analysis-subtitle">{card.locations.join(' · ')}</div>
                    {/if}
                    <div class="analysis-evidence-label">Why this technique was detected</div>
                    {#if card.signals.length > 0}
                      <div class="analysis-signal-row">
                        {#each card.signals.slice(0, 5) as signal}
                          <span class="analysis-signal analysis-signal-muted">
                            {formatEvidenceLabel(signal)}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>
          {/if}

          {#if !hasDetectedDsa && !hasDetectedAlgorithms}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Analysis Summary</span>
                <span class="analysis-meta">Awaiting stronger signals</span>
              </div>
              <div class="analysis-empty-copy">
                No strong DSA or algorithm pattern is confidently detected yet, but complexity and
                practice recommendations are still available below.
              </div>
            </section>
          {/if}

          {#if dominantAnalysisSection}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Complexity Overview</span>
                <span class="analysis-meta">Overall + dominant section</span>
              </div>
              <div class="complexity-grid">
                <div class="complexity-card">
                  <span class="complexity-label">Overall Time</span>
                  <span class="complexity-value">{analysisReport.overallTimeComplexity}</span>
                </div>
                <div class="complexity-card">
                  <span class="complexity-label">Overall Space</span>
                  <span class="complexity-value">{analysisReport.overallSpaceComplexity}</span>
                </div>
                <div class="complexity-card">
                  <span class="complexity-label">Dominant Section Time</span>
                  <span class="complexity-value">{dominantAnalysisSection.estimatedTimeComplexity}</span>
                </div>
                <div class="complexity-card">
                  <span class="complexity-label">Dominant Section Space</span>
                  <span class="complexity-value">{dominantAnalysisSection.estimatedSpaceComplexity}</span>
                </div>
              </div>
              {#if analysisReport.overallComplexityReasoning.length > 0}
                <div class="analysis-notes">
                  {#each analysisReport.overallComplexityReasoning as note}
                    <div class="analysis-note">{note}</div>
                  {/each}
                </div>
              {/if}
              {#if dominantAnalysisSection.notes.length > 0}
                <div class="analysis-summary-hint analysis-summary-hint-block">
                  {dominantAnalysisSection.notes[0]}
                </div>
              {/if}
            </section>
          {/if}

          {#if detectedSections.length > 0}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Detected Sections</span>
                <span class="analysis-meta">{detectedSections.length} sections</span>
              </div>
              <div class="section-list">
                {#each detectedSections as section}
                  <article class="section-item">
                    <div class="section-top">
                      <span class="section-name">{section.title}</span>
                      <span class="section-range">L{section.startLine}-{section.endLine}</span>
                    </div>
                    <div class="section-meta-row">
                      <span class="section-intent">{section.label}</span>
                      <span class="section-confidence">{Math.round(section.confidence * 100)}%</span>
                    </div>
                    <div class="section-complexity">
                      <span>time: {section.estimatedTimeComplexity}</span>
                      <span>space: {section.estimatedSpaceComplexity}</span>
                    </div>
                    {#if section.notes.length > 0}
                      <div class="analysis-notes">
                        {#each section.notes as note}
                          <div class="analysis-note">{note}</div>
                        {/each}
                      </div>
                    {/if}
                    {#if section.complexityReasoning.length > 0}
                      <div class="analysis-evidence-label">Why this complexity estimate fits</div>
                      <div class="analysis-notes">
                        {#each section.complexityReasoning as reason}
                          <div class="analysis-note">{reason}</div>
                        {/each}
                      </div>
                    {/if}
                    {#if section.matchedSignals.length > 0}
                      <div class="analysis-evidence-label">Why this section matched</div>
                      <div class="analysis-signal-row">
                        {#each section.matchedSignals.slice(0, 4) as signal}
                          <span class="analysis-signal analysis-signal-muted">{signal}</span>
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>
          {/if}

          {#if recommendedProblems.length > 0}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Recommended Problems</span>
                <span class="analysis-meta">{recommendedProblems.length} picks</span>
              </div>
              <div class="recommendation-list">
                {#each recommendedProblems as recommendation}
                  <article class="recommendation-item">
                    <div class="recommendation-top">
                      <a
                        href={recommendation.url}
                        target="_blank"
                        rel="noreferrer"
                        class="recommendation-link"
                      >
                        {recommendation.title}
                      </a>
                      <span class="difficulty-pill {difficultyClass(recommendation.difficulty)}">
                        {recommendation.difficulty}
                      </span>
                    </div>
                    <div class="recommendation-category">{recommendation.category}</div>
                    <div class="recommendation-reason">{recommendation.reason}</div>
                    {#if recommendation.milestones.length > 0}
                      <div class="analysis-signal-row">
                        {#each recommendation.milestones.slice(0, 3) as milestone}
                          <span class="analysis-signal analysis-signal-muted">{milestone}</span>
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>
          {/if}
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
    padding: 16px;
    overflow: hidden;
  }

  .output-content {
    min-height: 100%;
  }

  .terminal-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .terminal-output {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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

  .terminal-output.terminal-active {
    outline: 1px solid color-mix(in srgb, var(--od-green) 35%, var(--od-border));
    outline-offset: -1px;
    border-radius: 8px;
  }

  .terminal-caret {
    display: inline-block;
    width: 7px;
    height: 1.05em;
    vertical-align: text-bottom;
    background: var(--od-green);
    margin-left: 1px;
    animation: blink 1s steps(2, start) infinite;
  }

  @keyframes blink {
    to { visibility: hidden; }
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

  /* Visualizer States */
  .visualizer-tab-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .visualizer-panel-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .trace-input-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--od-border) 72%, transparent);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--od-bg-deep) 92%, transparent) 0%,
        color-mix(in srgb, var(--od-bg-main) 84%, transparent) 100%
      );
  }

  .trace-input-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .trace-input-title-row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .trace-input-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--od-orange);
    background: color-mix(in srgb, var(--od-orange) 14%, var(--od-bg-deep));
    border: 1px solid color-mix(in srgb, var(--od-orange) 28%, transparent);
    flex-shrink: 0;
  }

  .trace-input-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .trace-input-title {
    color: var(--od-text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .trace-input-subtitle,
  .trace-input-note {
    color: var(--od-text-dim);
    font-size: 10px;
    line-height: 1.6;
  }

  .trace-input-status {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--od-orange) 28%, transparent);
    background: color-mix(in srgb, var(--od-orange) 12%, transparent);
    color: var(--od-orange);
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .trace-input-status.ready {
    border-color: color-mix(in srgb, var(--od-green) 32%, transparent);
    background: color-mix(in srgb, var(--od-green) 12%, transparent);
    color: var(--od-green);
  }

  .trace-input-editor {
    width: 100%;
    min-height: 78px;
    resize: vertical;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--od-border) 80%, transparent);
    background: color-mix(in srgb, var(--od-bg-deep) 94%, transparent);
    color: var(--od-text-bright);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    padding: 10px 12px;
    outline: none;
  }

  .trace-input-editor:focus {
    border-color: color-mix(in srgb, var(--od-blue) 48%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--od-blue) 32%, transparent);
  }

  .trace-input-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .trace-input-run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid color-mix(in srgb, var(--od-blue) 30%, transparent);
    background: color-mix(in srgb, var(--od-blue) 14%, var(--od-bg-deep));
    color: var(--od-text-bright);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease;
    white-space: nowrap;
  }

  .trace-input-run:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--od-blue) 46%, transparent);
    background: color-mix(in srgb, var(--od-blue) 20%, var(--od-bg-deep));
  }

  .trace-input-run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .trace-input-warning {
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--od-orange) 30%, transparent);
    background: color-mix(in srgb, var(--od-orange) 10%, transparent);
    color: var(--od-orange);
    font-size: 10px;
    font-weight: 600;
    padding: 8px 10px;
  }

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

  .loading-intent {
    font-size: 11px;
    color: var(--od-text-dim);
  }

  .loading-intent-value {
    color: var(--od-cyan);
    font-weight: 700;
  }

  .loading-step {
    font-size: 10px;
    color: color-mix(in srgb, var(--od-blue) 75%, var(--od-text-dim));
    letter-spacing: 0.25px;
    animation: pulse-step 0.9s ease-in-out infinite;
  }

  @keyframes pulse-step {
    0%, 100% { opacity: 0.6; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(-1px); }
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
    overflow: hidden;
  }

  .analysis-scroll {
    height: 100%;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .analysis-card {
    border: 1px solid var(--od-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--od-bg-deep) 70%, transparent);
    padding: 10px 12px;
  }

  .analysis-summary-card {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--od-bg-deep) 84%, transparent) 0%, color-mix(in srgb, var(--od-bg-main) 72%, transparent) 100%);
    border-color: color-mix(in srgb, var(--od-purple) 22%, var(--od-border));
  }

  .analysis-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .analysis-title {
    color: var(--od-text-bright);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.25px;
    text-transform: uppercase;
  }

  .analysis-meta {
    color: var(--od-text-dim);
    font-size: 10px;
    font-weight: 600;
  }

  .analysis-summary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.85fr);
    gap: 10px;
    align-items: stretch;
  }

  .analysis-summary-copy {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .analysis-primary-label {
    color: var(--od-text-bright);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.01em;
  }

  .analysis-summary-text {
    color: var(--od-text);
    font-size: 11px;
    line-height: 1.6;
  }

  .analysis-summary-hint {
    border-left: 2px solid color-mix(in srgb, var(--od-cyan) 42%, transparent);
    padding: 6px 8px;
    color: color-mix(in srgb, var(--od-text-bright) 90%, var(--od-cyan));
    font-size: 10px;
    line-height: 1.5;
    background: color-mix(in srgb, var(--od-cyan) 8%, transparent);
    border-radius: 0 8px 8px 0;
  }

  .analysis-summary-hint-block {
    margin-top: 10px;
  }

  .analysis-summary-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .analysis-metric-card {
    border: 1px solid color-mix(in srgb, var(--od-border) 75%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .analysis-metric-label {
    color: var(--od-text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .analysis-metric-value {
    color: var(--od-text-bright);
    font-size: 16px;
    font-weight: 800;
  }

  .analysis-subtitle {
    color: var(--od-text-dim);
    font-size: 11px;
    line-height: 1.5;
  }

  .analysis-empty-copy {
    color: var(--od-text-dim);
    font-size: 11px;
    line-height: 1.6;
  }

  .analysis-signal-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .analysis-signal-row-strong {
    margin-top: 10px;
  }

  .analysis-signal {
    font-size: 10px;
    color: var(--od-blue);
    border: 1px solid color-mix(in srgb, var(--od-blue) 30%, transparent);
    background: color-mix(in srgb, var(--od-blue) 10%, transparent);
    border-radius: 999px;
    padding: 2px 7px;
  }

  .analysis-signal.analysis-signal-muted {
    color: var(--od-text);
    border-color: color-mix(in srgb, var(--od-border) 75%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
  }

  .analysis-signal.analysis-signal-strong {
    color: color-mix(in srgb, var(--od-text-bright) 92%, var(--od-purple));
    border-color: color-mix(in srgb, var(--od-purple) 45%, transparent);
    background: color-mix(in srgb, var(--od-purple) 10%, transparent);
  }

  .analysis-evidence-label {
    color: var(--od-text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 8px;
  }

  .complexity-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .complexity-card {
    border: 1px solid color-mix(in srgb, var(--od-border) 75%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .complexity-label {
    color: var(--od-text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .complexity-value {
    color: var(--od-text-bright);
    font-size: 15px;
    font-weight: 700;
  }

  .section-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-item {
    border: 1px solid color-mix(in srgb, var(--od-border) 75%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
    border-radius: 8px;
    padding: 8px 10px;
  }

  .section-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .section-name {
    color: var(--od-text-bright);
    font-size: 11px;
    font-weight: 700;
    text-decoration: none;
  }

  .section-confidence {
    color: var(--od-text-dim);
    font-size: 10px;
  }

  .section-range {
    color: var(--od-text-dim);
    font-size: 10px;
  }

  .section-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
  }

  .section-intent {
    color: var(--od-cyan);
    font-size: 10px;
    font-weight: 700;
  }

  .section-complexity {
    margin-top: 6px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    color: var(--od-text);
    font-size: 10px;
  }

  .analysis-notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }

  .analysis-note {
    color: color-mix(in srgb, var(--od-orange) 78%, white 8%);
    border: 1px solid color-mix(in srgb, var(--od-orange) 26%, transparent);
    background: color-mix(in srgb, var(--od-orange) 12%, transparent);
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 10px;
    line-height: 1.5;
  }

  .recommendation-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .recommendation-item {
    border: 1px solid color-mix(in srgb, var(--od-border) 75%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
    border-radius: 8px;
    padding: 8px 10px;
  }

  .recommendation-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .recommendation-link {
    color: var(--od-text-bright);
    font-size: 11px;
    font-weight: 700;
    text-decoration: none;
  }

  .recommendation-link:hover {
    color: var(--od-blue);
  }

  .recommendation-category {
    color: var(--od-text-dim);
    font-size: 10px;
    margin-top: 4px;
  }

  .recommendation-reason {
    color: var(--od-text);
    font-size: 10px;
    line-height: 1.5;
    margin-top: 6px;
  }

  .difficulty-pill {
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 10px;
    font-weight: 700;
  }

  .difficulty-easy {
    color: var(--od-green);
    background: color-mix(in srgb, var(--od-green) 12%, transparent);
    border-color: color-mix(in srgb, var(--od-green) 35%, transparent);
  }

  .difficulty-medium {
    color: var(--od-orange);
    background: color-mix(in srgb, var(--od-orange) 12%, transparent);
    border-color: color-mix(in srgb, var(--od-orange) 35%, transparent);
  }

  .difficulty-hard {
    color: var(--od-red);
    background: color-mix(in srgb, var(--od-red) 12%, transparent);
    border-color: color-mix(in srgb, var(--od-red) 35%, transparent);
  }
</style>
