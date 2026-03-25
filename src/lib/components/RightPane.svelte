<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Circle,
    Code2,
    Cpu,
    Lightbulb,
    Loader2,
    Play,
    Target
  } from 'lucide-svelte';
  import Visualizer from './Visualizer.svelte';
  import type { AnalyzeIntentResult, TraceStep } from '$lib/types';
  import {
    activeMilestoneIndex,
    editorCode,
    errorMessage,
    lastCompileResult,
    lastExecutionResult,
    lastRunInputTranscript,
    milestoneProgress,
    mentorSelectionMode,
    rightPaneTab,
    runConsoleTranscript,
    runSessionId,
    selectedPracticeProblemId,
    userProfile
  } from '$lib/stores';
  import { analyzeProgramIntent as requestIntentAnalysis } from '$lib/api';
  import { predictProgramIntent } from '$lib/visualizer/program-intent';
  import {
    analyzeCodeType,
    getPracticeRecommendationsForIntent,
    type PracticeRecommendation
  } from '$lib/analysis/code-type-finder';
  import { analyzeDynamicBehavior } from '$lib/analysis/dynamic-analysis';
  import { analyzeReverse } from '$lib/analysis/reverse-analysis';
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

  interface MentorHintCard {
    title: string;
    body: string;
  }

  interface ScoredMentorRecommendation {
    recommendation: PracticeRecommendation;
    score: number;
    notes: string[];
  }

  let terminalInputBuffer = '';
  let terminalSending = false;
  let pendingInputLines: string[] = [];
  let flushPromise: Promise<void> | null = null;
  let outputRef: HTMLDivElement;
  let prevRenderedOutput = '';
  let prevSessionId: string | null = null;
  let prevMentorProblemId: string | null = null;
  let aiIntentResult: AnalyzeIntentResult | null = null;
  let aiIntentLoading = false;
  let aiIntentError: string | null = null;
  let aiIntentTimer: number | null = null;
  let aiIntentRequestId = 0;
  let loadingStepIndex = 0;
  let loadingTicker: number | null = null;

  $: canSendToStdin = Boolean($runSessionId);
  $: traceUsesRuntimeInput = /\bscanf\s*\(/.test($editorCode);
  $: hasCapturedRunInput = $lastRunInputTranscript.length > 0;
  $: intentPrediction = predictProgramIntent($editorCode);
  $: analysisReport = analyzeCodeType($editorCode);
  $: dynamicAnalysisReport = analyzeDynamicBehavior($editorCode, traceSteps);
  $: reverseAnalysisReport = analyzeReverse($editorCode, analysisReport);
  $: programLineCount = Math.max($editorCode.split('\n').length, 1);
  $: detectedSections = getDetectedSections();
  $: detectedDsaCards = buildDetectedDsaCards();
  $: detectedAlgorithmCards = buildDetectedAlgorithmCards();
  $: hasDetectedDsa = detectedDsaCards.length > 0;
  $: hasDetectedAlgorithms = detectedAlgorithmCards.length > 0;
  $: dominantAnalysisSection = pickDominantSection();
  $: mainAnalysisSection =
    analysisReport.sections.find((section) => {
      const title = section.title.trim().toLowerCase();
      return title === 'main' || title === 'main()';
    }) ?? null;
  $: recommendedProblems = getRecommendedProblems();
  $: reverseRiskCount = reverseAnalysisReport.safetyFindings.filter((finding) => finding.severity === 'risk').length;
  $: reverseOptimizationCount = reverseAnalysisReport.optimizationFindings.filter(
    (finding) => finding.severity !== 'info'
  ).length;
  $: personalizedMentorQueue = buildPersonalizedMentorQueue(recommendedProblems);
  $: guidedMentorSelection = personalizedMentorQueue[0] ?? null;
  $: if (recommendedProblems.length === 0 && $selectedPracticeProblemId !== null) {
    selectedPracticeProblemId.set(null);
    activeMilestoneIndex.set(0);
  } else if (
    $mentorSelectionMode === 'manual' &&
    recommendedProblems.length > 0 &&
    !recommendedProblems.some((recommendation) => recommendation.id === $selectedPracticeProblemId)
  ) {
    const fallbackRecommendation = guidedMentorSelection?.recommendation ?? recommendedProblems[0];
    selectedPracticeProblemId.set(fallbackRecommendation.id);
    activeMilestoneIndex.set(firstIncompleteMilestoneIndex(fallbackRecommendation));
  }
  $: selectedMentorProblem =
    $mentorSelectionMode === 'guided'
      ? guidedMentorSelection?.recommendation ?? null
      : recommendedProblems.find((recommendation) => recommendation.id === $selectedPracticeProblemId) ??
        guidedMentorSelection?.recommendation ??
        null;
  $: selectedMentorSummary =
    personalizedMentorQueue.find((entry) => entry.recommendation.id === selectedMentorProblem?.id) ?? null;
  $: mentorSelectionSummary =
    $mentorSelectionMode === 'guided'
      ? selectedMentorSummary?.notes.join(' ') || 'AI is choosing the next practice problem for you.'
      : 'Manual mode keeps the currently selected problem pinned until you change it.';
  $: mentorCompletedCount = countCompletedMilestones(selectedMentorProblem);
  $: mentorTotalCount = selectedMentorProblem?.milestones.length ?? 0;
  $: mentorCompletionPercent =
    mentorTotalCount > 0 ? Math.round((mentorCompletedCount / mentorTotalCount) * 100) : 0;
  $: if (selectedMentorProblem?.id !== prevMentorProblemId) {
    prevMentorProblemId = selectedMentorProblem?.id ?? null;
    if (selectedMentorProblem) {
      activeMilestoneIndex.set(firstIncompleteMilestoneIndex(selectedMentorProblem));
    } else {
      activeMilestoneIndex.set(0);
    }
  }
  $: mentorCurrentMilestoneIndex = getCurrentMilestoneIndex(selectedMentorProblem);
  $: mentorCurrentMilestone =
    selectedMentorProblem?.milestones[mentorCurrentMilestoneIndex] ?? null;
  $: mentorHintCards = buildMentorHintCards(selectedMentorProblem, mentorCurrentMilestone);
  $: primaryTechniqueLabels = intentPrediction.techniques.slice(0, 4).map(formatDsaLabel);
  $: loadingSteps = getLoadingSteps(intentPrediction.primaryLabel);
  $: if (browser) {
    const source = $editorCode.trim();
    aiIntentRequestId += 1;
    const requestId = aiIntentRequestId;

    if (aiIntentTimer !== null) {
      clearTimeout(aiIntentTimer);
      aiIntentTimer = null;
    }

    if (source.length < 12) {
      aiIntentResult = null;
      aiIntentError = null;
      aiIntentLoading = false;
    } else {
      aiIntentLoading = true;
      aiIntentTimer = window.setTimeout(async () => {
        try {
          const result = await requestIntentAnalysis({ code: $editorCode });
          if (requestId !== aiIntentRequestId) return;
          aiIntentResult = result;
          aiIntentError = result.success ? null : result.error ?? 'AI analysis failed';
        } catch (err) {
          if (requestId !== aiIntentRequestId) return;
          aiIntentResult = null;
          aiIntentError = err instanceof Error ? err.message : 'AI analysis failed';
        } finally {
          if (requestId === aiIntentRequestId) {
            aiIntentLoading = false;
          }
        }
      }, 320);
    }
  }
  // Runtime transcript takes priority so users always see the latest terminal state.
  $: output = $runConsoleTranscript
    ? $runConsoleTranscript
    : $lastExecutionResult
      ? $lastExecutionResult.stdout + $lastExecutionResult.stderr
    : $lastCompileResult
      ? $lastCompileResult.output || $lastCompileResult.errors.join('\n')
      : '';
  $: renderedOutput = `${output}${canSendToStdin ? terminalInputBuffer : ''}`;
  $: traceConsoleOutput = renderedOutput || output;
  $: capturedRunInputLineCount = $lastRunInputTranscript.length === 0
    ? 0
    : $lastRunInputTranscript.split('\n').filter((line, index, lines) => line.length > 0 || index < lines.length - 1).length;
  $: traceConsoleStatus = traceUsesRuntimeInput
    ? hasCapturedRunInput
      ? 'stdin replay ready'
      : 'run first'
    : traceConsoleOutput
      ? 'latest console output'
      : 'optional';

  $: hasError = Boolean($lastExecutionResult?.stderr || $lastCompileResult?.errors?.length);
  $: compileSummary = $lastCompileResult
    ? `Compile ${formatDuration($lastCompileResult.compilationTime)}`
    : null;
  $: runSummary = $lastExecutionResult
    ? `Runtime ${formatDuration($lastExecutionResult.executionTime)}${
        $lastExecutionResult.peakMemoryBytes ? ` · Memory ${formatMemory($lastExecutionResult.peakMemoryBytes)}` : ''
      }`
    : null;
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
    if (aiIntentTimer !== null) {
      clearTimeout(aiIntentTimer);
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

  function formatDuration(ms: number | null | undefined): string {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
    return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)} s`;
  }

  function formatMemory(bytes: number | null | undefined): string {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '—';
    const mb = bytes / (1024 * 1024);
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  }

  function formatEvidenceLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (first) => first.toUpperCase());
  }

  function getDynamicIntentFallback(primaryType: string | null): string | null {
    if (primaryType === 'Stack') return 'stack';
    if (primaryType === 'Queue') return 'queue';
    if (primaryType === 'Tree / BST') return 'tree';
    if (primaryType === 'Recursion') return 'recursion';
    return null;
  }

  function getRecommendedProblems(): PracticeRecommendation[] {
    const staticRecommendations = analysisReport.recommendations.slice(0, 4);
    const hasStrongStaticRead =
      analysisReport.primaryIntent !== 'generic' || hasDetectedDsa || hasDetectedAlgorithms;
    const dynamicIntent = getDynamicIntentFallback(dynamicAnalysisReport.primaryType);

    if (!hasStrongStaticRead && dynamicIntent && dynamicAnalysisReport.confidence >= 0.55) {
      return getPracticeRecommendationsForIntent(dynamicIntent as
        | 'stack'
        | 'queue'
        | 'tree'
        | 'recursion').slice(0, 4);
    }

    return staticRecommendations;
  }

  function reviewToneLabel(value: 'keep' | 'review' | 'refactor'): string {
    if (value === 'keep') return 'Keep';
    if (value === 'review') return 'Review';
    return 'Refactor';
  }

  function findingSeverityLabel(value: 'info' | 'watch' | 'risk'): string {
    if (value === 'info') return 'Info';
    if (value === 'watch') return 'Watch';
    return 'Risk';
  }

  function analysisSourceLabel(
    source: AnalyzeIntentResult['source'],
    engine?: AnalyzeIntentResult['engine']
  ): string {
    if (source === 'ai' && engine?.startsWith('ollama:')) return 'Ollama semantic read';
    if (source === 'ai' && engine?.startsWith('openai:')) return 'AI semantic read';
    if (source === 'ai') return 'AI semantic read';
    if (source === 'heuristic-fallback') return 'Heuristic fallback';
    return 'Local classifier';
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

  function overallMentorCompletionCount(): number {
    return Object.values($milestoneProgress).filter(Boolean).length;
  }

  function buildPersonalizedMentorQueue(
    recommendations: PracticeRecommendation[]
  ): ScoredMentorRecommendation[] {
    const completedAcrossQueue = overallMentorCompletionCount();

    return recommendations
      .map((recommendation, recommendationIndex) => {
        const completed = countCompletedMilestones(recommendation);
        const total = recommendation.milestones.length;
        const incomplete = Math.max(total - completed, 0);
        let score = Math.max(0, 40 - recommendationIndex * 6);
        const notes: string[] = [];

        if (completed > 0 && incomplete > 0) {
          score += 18;
          notes.push('You already started this plan, so continuing it keeps momentum.');
        } else if (incomplete > 0) {
          score += 8;
        } else if (total > 0) {
          score -= 12;
          notes.push('This one is already complete, so it is deprioritized for now.');
        }

        if (recommendationIndex === 0) {
          score += 6;
          notes.push('It matches the strongest current analysis signal.');
        }

        if (completedAcrossQueue === 0) {
          if (recommendation.difficulty === 'Easy') {
            score += 8;
            notes.push('Starting with an easier warm-up should reduce friction.');
          } else if (recommendation.difficulty === 'Medium') {
            score += 3;
          } else {
            score -= 5;
          }
        } else if (completedAcrossQueue >= 3) {
          if (recommendation.difficulty === 'Medium') score += 4;
          if (recommendation.difficulty === 'Hard') score += 2;
        }

        if (analysisReport.confidence < 0.55 && recommendation.difficulty === 'Hard') {
          score -= 3;
          notes.push('The current code signal is still fuzzy, so a hard jump is delayed.');
        }

        if (notes.length === 0) {
          notes.push('This is the best next match based on your current code and milestone state.');
        }

        return {
          recommendation,
          score,
          notes
        };
      })
      .sort((left, right) => right.score - left.score);
  }

  function milestoneKey(problemId: string, milestoneIndex: number): string {
    return `${problemId}:${milestoneIndex}`;
  }

  function isMilestoneComplete(problemId: string, milestoneIndex: number): boolean {
    return Boolean($milestoneProgress[milestoneKey(problemId, milestoneIndex)]);
  }

  function countCompletedMilestones(recommendation: PracticeRecommendation | null): number {
    if (!recommendation) return 0;

    return recommendation.milestones.reduce((count, _milestone, milestoneIndex) => {
      return count + (isMilestoneComplete(recommendation.id, milestoneIndex) ? 1 : 0);
    }, 0);
  }

  function firstIncompleteMilestoneIndex(recommendation: PracticeRecommendation): number {
    const firstIncomplete = recommendation.milestones.findIndex(
      (_milestone, milestoneIndex) => !isMilestoneComplete(recommendation.id, milestoneIndex)
    );

    return firstIncomplete >= 0 ? firstIncomplete : Math.max(recommendation.milestones.length - 1, 0);
  }

  function getCurrentMilestoneIndex(recommendation: PracticeRecommendation | null): number {
    if (!recommendation || recommendation.milestones.length === 0) {
      return 0;
    }

    const clampedIndex = Math.min(
      Math.max($activeMilestoneIndex, 0),
      recommendation.milestones.length - 1
    );
    if ($activeMilestoneIndex !== clampedIndex) {
      activeMilestoneIndex.set(clampedIndex);
    }
    return clampedIndex;
  }

  function activateMentorPlan(recommendation: PracticeRecommendation) {
    mentorSelectionMode.set('manual');
    selectedPracticeProblemId.set(recommendation.id);
    activeMilestoneIndex.set(firstIncompleteMilestoneIndex(recommendation));
    rightPaneTab.set('mentor');
  }

  function activateGuidedMentorPlan() {
    mentorSelectionMode.set('guided');
    if (guidedMentorSelection?.recommendation) {
      activeMilestoneIndex.set(firstIncompleteMilestoneIndex(guidedMentorSelection.recommendation));
    }
    rightPaneTab.set('mentor');
  }

  function activateManualMentorPlan(recommendation: PracticeRecommendation | null) {
    if (!recommendation) return;
    mentorSelectionMode.set('manual');
    selectedPracticeProblemId.set(recommendation.id);
    activeMilestoneIndex.set(firstIncompleteMilestoneIndex(recommendation));
    rightPaneTab.set('mentor');
  }

  function focusMilestone(milestoneIndex: number) {
    activeMilestoneIndex.set(milestoneIndex);
  }

  function toggleMentorMilestone(recommendation: PracticeRecommendation, milestoneIndex: number) {
    const key = milestoneKey(recommendation.id, milestoneIndex);
    const nextCompleted = !Boolean($milestoneProgress[key]);

    milestoneProgress.update((current) => ({
      ...current,
      [key]: nextCompleted
    }));

    if (nextCompleted) {
      const nextIncomplete = recommendation.milestones.findIndex(
        (_milestone, nextIndex) =>
          nextIndex > milestoneIndex && !Boolean($milestoneProgress[milestoneKey(recommendation.id, nextIndex)])
      );
      activeMilestoneIndex.set(nextIncomplete >= 0 ? nextIncomplete : milestoneIndex);
      return;
    }

    activeMilestoneIndex.set(milestoneIndex);
  }

  function buildMentorHintCards(
    recommendation: PracticeRecommendation | null,
    milestone: string | null
  ): MentorHintCard[] {
    if (!recommendation || !milestone) {
      return [];
    }

    const techniqueAnchor =
      intentPrediction.techniques.slice(0, 4).map(formatDsaLabel)[0] ?? analysisReport.primaryLabel;
    const sectionAnchor = dominantAnalysisSection
      ? formatSectionTitle(dominantAnalysisSection.title)
      : 'your next helper or loop';

    return [
      {
        title: 'Tiny Hint',
        body: `Turn this milestone into one concrete code edit inside ${sectionAnchor}: ${milestone}`
      },
      {
        title: 'Guided Hint',
        body: `Use ${techniqueAnchor} as the organizing idea. Write the invariant or state transition you expect before you code.`
      },
      {
        title: 'Definition of Done',
        body: `You are done with this checkpoint when you can explain why it works, name one edge case to test, and connect it back to ${recommendation.reason.toLowerCase()}`
      }
    ];
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
        {#if traceUsesRuntimeInput || traceConsoleOutput}
          <section class="trace-runtime-card">
            <div class="trace-runtime-header">
              <div class="trace-runtime-copy">
                <span class="trace-runtime-title">Runtime context</span>
                <span class="trace-runtime-subtitle">
                  {#if traceUsesRuntimeInput}
                    {#if hasCapturedRunInput}
                      Trace reuses the stdin you already entered in the Console for scanf().
                    {:else}
                      This program uses scanf(). Compile and run it once in the Console, then Trace will reuse that exact stdin.
                    {/if}
                  {:else}
                    The latest compile or run transcript stays visible here while you inspect the trace.
                  {/if}
                </span>
              </div>
              <div class="trace-runtime-actions">
                <span class:ready={hasCapturedRunInput || !traceUsesRuntimeInput} class="trace-runtime-status">
                  {traceConsoleStatus}
                </span>
                <button
                  type="button"
                  class="trace-runtime-run"
                  disabled={isTracing || (traceUsesRuntimeInput && !hasCapturedRunInput)}
                  on:click={triggerTrace}
                >
                  {#if isTracing}
                    <Loader2 size={14} class="loader-spin" />
                    <span>Tracing…</span>
                  {:else}
                    <Play size={13} />
                    <span>{traceSteps.length > 0 ? 'Retrace' : 'Trace now'}</span>
                  {/if}
                </button>
              </div>
            </div>

            {#if hasCapturedRunInput}
              <div class="trace-runtime-meta">
                Replaying {capturedRunInputLineCount} stdin line{capturedRunInputLineCount === 1 ? '' : 's'}
                from the latest run session.
              </div>
            {/if}

            {#if traceConsoleOutput}
              <pre class="trace-runtime-output">{normalizeTerminalText(traceConsoleOutput)}</pre>
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
                  Compile + Run remains the source of truth if the visual trace hits an unsupported C feature.
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
                    Start with what the code appears to be, then review why each section exists,
                    where risk lives, and what is worth tightening next.
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
                    <span class="analysis-metric-label">Signals</span>
                    <span class="analysis-metric-value">
                      {detectedDsaCards.length + detectedAlgorithmCards.length}
                    </span>
                  </div>
                  <div class="analysis-metric-card">
                    <span class="analysis-metric-label">Sections</span>
                    <span class="analysis-metric-value">{analysisReport.sections.length}</span>
                  </div>
                  <div class="analysis-metric-card">
                    <span class="analysis-metric-label">Risks</span>
                    <span class="analysis-metric-value">{reverseRiskCount}</span>
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

          {#if hasDetectedDsa || hasDetectedAlgorithms}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Code Identity</span>
                <span class="analysis-meta">{analysisReport.primaryLabel}</span>
              </div>
              {#if hasDetectedDsa}
                <div class="analysis-evidence-label">Structures</div>
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
                      {#if card.signals.length > 0}
                        <div class="analysis-signal-row">
                          {#each card.signals.slice(0, 4) as signal}
                            <span class="analysis-signal analysis-signal-muted">
                              {formatEvidenceLabel(signal)}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </article>
                  {/each}
                </div>
              {/if}
              {#if hasDetectedAlgorithms}
                <div class="analysis-evidence-label">Techniques</div>
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
                      {#if card.signals.length > 0}
                        <div class="analysis-signal-row">
                          {#each card.signals.slice(0, 4) as signal}
                            <span class="analysis-signal analysis-signal-muted">
                              {formatEvidenceLabel(signal)}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </article>
                  {/each}
                </div>
              {/if}
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
                <span class="analysis-meta">
                  Overall{#if mainAnalysisSection} + main(){:else} + dominant section{/if}
                </span>
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
                {#if mainAnalysisSection}
                  <div class="complexity-card">
                    <span class="complexity-label">main() Time</span>
                    <span class="complexity-value">{mainAnalysisSection.estimatedTimeComplexity}</span>
                  </div>
                  <div class="complexity-card">
                    <span class="complexity-label">main() Space</span>
                    <span class="complexity-value">{mainAnalysisSection.estimatedSpaceComplexity}</span>
                  </div>
                {:else}
                  <div class="complexity-card">
                    <span class="complexity-label">Dominant Section Time</span>
                    <span class="complexity-value">{dominantAnalysisSection.estimatedTimeComplexity}</span>
                  </div>
                  <div class="complexity-card">
                    <span class="complexity-label">Dominant Section Space</span>
                    <span class="complexity-value">{dominantAnalysisSection.estimatedSpaceComplexity}</span>
                  </div>
                {/if}
              </div>
              {#if analysisReport.overallComplexityReasoning.length > 0}
                <div class="analysis-notes">
                  {#each analysisReport.overallComplexityReasoning as note}
                    <div class="analysis-note">{note}</div>
                  {/each}
                </div>
              {/if}
              {#if mainAnalysisSection && mainAnalysisSection.complexityReasoning.length > 0}
                <div class="analysis-evidence-label">Why main() has this estimate</div>
                <div class="analysis-notes">
                  {#each mainAnalysisSection.complexityReasoning as reason}
                    <div class="analysis-note">{reason}</div>
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

          <section class="analysis-card">
            <div class="analysis-header">
              <span class="analysis-title">Dynamic Analysis</span>
              <span class="analysis-meta">
                {#if dynamicAnalysisReport.hasTrace}
                  {dynamicAnalysisReport.stepCount} trace steps
                {:else}
                  trace required
                {/if}
              </span>
            </div>

            {#if dynamicAnalysisReport.hasTrace}
              <div class="analysis-primary-label">
                {dynamicAnalysisReport.primaryType ?? 'No strong runtime type yet'}
              </div>
              <div class="analysis-summary-text">{dynamicAnalysisReport.summary}</div>

              <div class="complexity-grid">
                <div class="complexity-card">
                  <span class="complexity-label">Observed Type</span>
                  <span class="complexity-value">{dynamicAnalysisReport.primaryType ?? 'Pending'}</span>
                </div>
                <div class="complexity-card">
                  <span class="complexity-label">Implementation</span>
                  <span class="complexity-value">{dynamicAnalysisReport.implementationStyle ?? 'Needs more coverage'}</span>
                </div>
                <div class="complexity-card">
                  <span class="complexity-label">Runtime Pattern</span>
                  <span class="complexity-value">{dynamicAnalysisReport.accessPattern ?? 'Undetermined'}</span>
                </div>
                <div class="complexity-card">
                  <span class="complexity-label">Coverage</span>
                  <span class="complexity-value">
                    {dynamicAnalysisReport.executedLineCount} lines · depth {dynamicAnalysisReport.maxCallDepth}
                  </span>
                </div>
              </div>

              {#if dynamicAnalysisReport.signals.length > 0}
                <div class="analysis-evidence-label">Runtime evidence</div>
                <div class="analysis-signal-row">
                  {#each dynamicAnalysisReport.signals as signal}
                    <span class="analysis-signal analysis-signal-strong">{signal}</span>
                  {/each}
                </div>
              {/if}

              {#if dynamicAnalysisReport.observations.length > 0}
                <div class="analysis-notes">
                  {#each dynamicAnalysisReport.observations as observation}
                    <div class="analysis-note">{observation}</div>
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="analysis-empty-copy">
                Trace the code once to let the app classify what the program actually does at runtime, even when names like `push`, `pop`, or `top` are not used.
              </div>
            {/if}
          </section>

          <section class="analysis-card">
            <div class="analysis-header">
              <span class="analysis-title">Reverse Review</span>
              <span class="analysis-meta">{reverseAnalysisReport.sectionReviews.length} sections</span>
            </div>
            <div class="section-list">
              {#each reverseAnalysisReport.sectionReviews as sectionReview}
                <article class="section-item">
                  <div class="section-top">
                    <span class="section-name">{sectionReview.title}</span>
                    <span class="analysis-badge analysis-badge-{sectionReview.verdict}">
                      {reviewToneLabel(sectionReview.verdict)}
                    </span>
                  </div>
                  <div class="analysis-subtitle">{sectionReview.location}</div>
                  <div class="analysis-summary-text">{sectionReview.purpose}</div>
                  <div class="analysis-summary-hint analysis-summary-hint-block">
                    {sectionReview.recommendation}
                  </div>
                </article>
              {/each}
            </div>
          </section>

          <section class="analysis-card">
            <div class="analysis-header">
              <span class="analysis-title">Safety Review</span>
              <span class="analysis-meta">{reverseRiskCount} high-risk</span>
            </div>
            <div class="section-list">
              {#each reverseAnalysisReport.safetyFindings as finding}
                <article class="section-item">
                  <div class="section-top">
                    <span class="section-name">{finding.title}</span>
                    <span class="analysis-badge analysis-badge-{finding.severity}">
                      {findingSeverityLabel(finding.severity)}
                    </span>
                  </div>
                  <div class="analysis-summary-text">{finding.detail}</div>
                  <div class="analysis-summary-hint analysis-summary-hint-block">
                    {finding.recommendation}
                  </div>
                </article>
              {/each}
            </div>
          </section>

          <section class="analysis-card">
            <div class="analysis-header">
              <span class="analysis-title">Optimization Opportunities</span>
              <span class="analysis-meta">{reverseOptimizationCount} active</span>
            </div>
            <div class="section-list">
              {#each reverseAnalysisReport.optimizationFindings as finding}
                <article class="section-item">
                  <div class="section-top">
                    <span class="section-name">{finding.title}</span>
                    <span class="analysis-badge analysis-badge-{finding.severity}">
                      {findingSeverityLabel(finding.severity)}
                    </span>
                  </div>
                  <div class="analysis-summary-text">{finding.detail}</div>
                  <div class="analysis-summary-hint analysis-summary-hint-block">
                    {finding.recommendation}
                  </div>
                </article>
              {/each}
            </div>
          </section>

          {#if aiIntentLoading || aiIntentResult || aiIntentError}
            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Code Identification</span>
                <span class="analysis-meta">
                  {#if aiIntentLoading}
                    analyzing...
                  {:else if aiIntentResult}
                    {analysisSourceLabel(aiIntentResult.source, aiIntentResult.engine)} · {Math.round((aiIntentResult.confidence ?? 0) * 100)}%
                  {:else}
                    unavailable
                  {/if}
                </span>
              </div>

              {#if aiIntentLoading}
                <div class="analysis-summary-hint analysis-summary-hint-block">
                  Reading code text, extracting structural cues, and ranking likely problem types...
                </div>
              {:else if aiIntentError}
                <div class="analysis-note">{aiIntentError}</div>
              {:else if aiIntentResult}
                <div class="analysis-primary-label">{aiIntentResult.primaryLabel}</div>
                {#if aiIntentResult.summary}
                  <div class="analysis-summary-text">{aiIntentResult.summary}</div>
                {/if}
                <div class="analysis-summary-hint">
                  time: {analysisReport.overallTimeComplexity} · space: {analysisReport.overallSpaceComplexity}
                  {#if mainAnalysisSection}
                    · main(): {mainAnalysisSection.estimatedTimeComplexity} / {mainAnalysisSection.estimatedSpaceComplexity}
                  {/if}
                </div>
                {#if aiIntentResult.explanation && aiIntentResult.explanation.length > 0}
                  <div class="analysis-notes">
                    {#each aiIntentResult.explanation.slice(0, 2) as explanation}
                      <div class="analysis-note">{explanation}</div>
                    {/each}
                  </div>
                {/if}
                {#if aiIntentResult.sectionPurposes && aiIntentResult.sectionPurposes.length > 0}
                  <div class="analysis-evidence-label">Section read</div>
                  <div class="section-list">
                    {#each aiIntentResult.sectionPurposes.slice(0, 3) as sectionPurpose}
                      <article class="section-item">
                        <div class="section-top">
                          <span class="section-name">{sectionPurpose.title}</span>
                        </div>
                        <div class="analysis-summary-text">{sectionPurpose.purpose}</div>
                      </article>
                    {/each}
                  </div>
                {/if}
                {#if aiIntentResult.optimizationIdeas && aiIntentResult.optimizationIdeas.length > 0}
                  <div class="analysis-evidence-label">AI improvement ideas</div>
                  <div class="analysis-notes">
                    {#each aiIntentResult.optimizationIdeas.slice(0, 3) as idea}
                      <div class="analysis-note">{idea}</div>
                    {/each}
                  </div>
                {/if}
                {#if aiIntentResult.candidates && aiIntentResult.candidates.length > 0}
                  <div class="analysis-evidence-label">Top matches</div>
                  <div class="analysis-signal-row">
                    {#each aiIntentResult.candidates.slice(0, 3) as candidate}
                      <span class="analysis-signal">
                        {candidate.label} {Math.round(candidate.confidence * 100)}%
                      </span>
                    {/each}
                  </div>
                {/if}
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
                    <div class="recommendation-actions">
                      <button
                        type="button"
                        class="recommendation-action recommendation-action-secondary"
                        on:click={activateGuidedMentorPlan}
                      >
                        AI pick for me
                      </button>
                      <button
                        type="button"
                        class="recommendation-action"
                        on:click={() => activateMentorPlan(recommendation)}
                      >
                        Mentor plan
                      </button>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      </div>
    {/if}

    {#if $rightPaneTab === 'mentor'}
      <div class="analysis-panel mentor-panel">
        <div class="analysis-scroll">
          {#if selectedMentorProblem}
            <section class="analysis-card mentor-summary-card">
              <div class="analysis-header">
                <span class="analysis-title">AI Mentor</span>
                <span class="analysis-meta">{mentorCompletionPercent}% complete</span>
              </div>

              <div class="mentor-mode-row">
                <button
                  type="button"
                  class="mentor-mode-btn"
                  class:mentor-mode-btn-active={$mentorSelectionMode === 'guided'}
                  on:click={activateGuidedMentorPlan}
                >
                  AI-guided queue
                </button>
                <button
                  type="button"
                  class="mentor-mode-btn"
                  class:mentor-mode-btn-active={$mentorSelectionMode === 'manual'}
                  on:click={() => activateManualMentorPlan(selectedMentorProblem)}
                >
                  Manual choice
                </button>
              </div>

              <div class="mentor-summary-top">
                <div class="mentor-summary-copy">
                  <div class="analysis-primary-label">{selectedMentorProblem.title}</div>
                  <div class="recommendation-category">{selectedMentorProblem.category}</div>
                  <div class="mentor-summary-text">{selectedMentorProblem.reason}</div>
                  <div class="mentor-selection-summary">{mentorSelectionSummary}</div>
                </div>
                <span class="difficulty-pill {difficultyClass(selectedMentorProblem.difficulty)}">
                  {selectedMentorProblem.difficulty}
                </span>
              </div>

              <div class="mentor-progress-bar" aria-hidden="true">
                <span style="width: {mentorCompletionPercent}%;"></span>
              </div>

              <div class="mentor-progress-meta">
                <span>{mentorCompletedCount} of {mentorTotalCount} milestones checked</span>
                <span>Current focus: step {mentorCurrentMilestoneIndex + 1}</span>
              </div>

              <div class="mentor-action-row">
                <a
                  href={selectedMentorProblem.url}
                  target="_blank"
                  rel="noreferrer"
                  class="recommendation-action recommendation-action-link"
                >
                  Open problem <ArrowRight size={12} />
                </a>
                <button
                  type="button"
                  class="recommendation-action"
                  on:click={() => activeMilestoneIndex.set(firstIncompleteMilestoneIndex(selectedMentorProblem))}
                >
                  Jump to next incomplete
                </button>
              </div>
            </section>

            {#if $userProfile?.leetCode}
              <section class="analysis-card">
                <div class="analysis-header">
                  <span class="analysis-title">LeetCode Integration</span>
                  <span class="analysis-meta">@{$userProfile.leetCode.username}</span>
                </div>
                <div class="mentor-summary-text">
                  Your account is linked, so mentor recommendations can flow straight into your LeetCode routine.
                </div>
                <div class="mentor-action-row">
                  <a
                    href={$userProfile.leetCode.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    class="recommendation-action recommendation-action-link"
                  >
                    Open LeetCode profile <ArrowRight size={12} />
                  </a>
                </div>
              </section>
            {/if}

            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Problem Queue</span>
                <span class="analysis-meta">{recommendedProblems.length} picks</span>
              </div>
              <div class="mentor-problem-list">
                {#each personalizedMentorQueue as entry}
                  {@const recommendation = entry.recommendation}
                  <button
                    type="button"
                    class="mentor-problem-item"
                    class:mentor-problem-active={selectedMentorProblem.id === recommendation.id}
                    on:click={() => activateManualMentorPlan(recommendation)}
                  >
                    <div class="mentor-problem-top">
                      <span class="mentor-problem-title">{recommendation.title}</span>
                      <span class="difficulty-pill {difficultyClass(recommendation.difficulty)}">
                        {recommendation.difficulty}
                      </span>
                    </div>
                    <div class="recommendation-category">{recommendation.category}</div>
                    <div class="mentor-problem-reason">{recommendation.reason}</div>
                    <div class="mentor-problem-hint">{entry.notes[0]}</div>
                    {#if guidedMentorSelection?.recommendation.id === recommendation.id}
                      <span class="mentor-focus-pill mentor-queue-pill">AI pick</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </section>

            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Milestone Plan</span>
                <span class="analysis-meta">{mentorTotalCount} checkpoints</span>
              </div>
              <div class="mentor-milestone-list">
                {#each selectedMentorProblem.milestones as milestone, milestoneIndex}
                  <article
                    class="mentor-milestone-item"
                    class:mentor-milestone-active={mentorCurrentMilestoneIndex === milestoneIndex}
                  >
                    <button
                      type="button"
                      class="mentor-milestone-toggle"
                      aria-label={isMilestoneComplete(selectedMentorProblem.id, milestoneIndex) ? 'Mark milestone incomplete' : 'Mark milestone complete'}
                      on:click={() => toggleMentorMilestone(selectedMentorProblem, milestoneIndex)}
                    >
                      {#if isMilestoneComplete(selectedMentorProblem.id, milestoneIndex)}
                        <CheckCircle2 size={16} />
                      {:else}
                        <Circle size={16} />
                      {/if}
                    </button>

                    <button
                      type="button"
                      class="mentor-milestone-copy"
                      on:click={() => focusMilestone(milestoneIndex)}
                    >
                      <span class="mentor-milestone-step">Step {milestoneIndex + 1}</span>
                      <span class="mentor-milestone-text">{milestone}</span>
                    </button>

                    {#if mentorCurrentMilestoneIndex === milestoneIndex}
                      <span class="mentor-focus-pill">Focus</span>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>

            <section class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-title">Mentor Nudges</span>
                <span class="analysis-meta">small, guided, deeper</span>
              </div>

              {#if mentorCurrentMilestone}
                <div class="mentor-current-milestone">
                  <Target size={14} />
                  <span>{mentorCurrentMilestone}</span>
                </div>
              {/if}

              <div class="mentor-hint-grid">
                {#each mentorHintCards as hint}
                  <article class="mentor-hint-card">
                    <div class="mentor-hint-title">
                      <Lightbulb size={13} />
                      <span>{hint.title}</span>
                    </div>
                    <div class="mentor-hint-body">{hint.body}</div>
                  </article>
                {/each}
              </div>
            </section>
          {:else}
            <div class="empty-visualizer mentor-empty">
              <div class="viz-icon-wrapper">
                <Target size={48} class="viz-icon" />
                <div class="viz-icon-pulse"></div>
              </div>
              <div class="viz-title">Mentor plan will appear here</div>
              <div class="viz-description">
                Analyze or trace code first so the mentor can turn the strongest recommendation into a guided checkpoint list.
              </div>
            </div>
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

  .console-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .console-stat-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--od-border) 78%, transparent);
    background: color-mix(in srgb, var(--od-bg-deep) 82%, transparent);
    color: var(--od-text-bright);
    font-size: 11px;
    font-weight: 700;
    padding: 6px 10px;
  }

  .console-stat-pill-run {
    border-color: color-mix(in srgb, var(--od-blue) 28%, var(--od-border));
    background: color-mix(in srgb, var(--od-blue) 10%, transparent);
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

  .trace-runtime-card {
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

  .trace-runtime-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .trace-runtime-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .trace-runtime-title {
    color: var(--od-text-bright);
    font-size: 12px;
    font-weight: 700;
  }

  .trace-runtime-subtitle,
  .trace-runtime-meta {
    color: var(--od-text-dim);
    font-size: 10px;
    line-height: 1.6;
  }

  .trace-runtime-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .trace-runtime-status {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--od-orange) 28%, transparent);
    background: color-mix(in srgb, var(--od-orange) 12%, transparent);
    color: var(--od-orange);
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .trace-runtime-status.ready {
    border-color: color-mix(in srgb, var(--od-green) 32%, transparent);
    background: color-mix(in srgb, var(--od-green) 12%, transparent);
    color: var(--od-green);
  }

  .trace-runtime-run {
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

  .trace-runtime-run:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--od-blue) 46%, transparent);
    background: color-mix(in srgb, var(--od-blue) 20%, var(--od-bg-deep));
  }

  .trace-runtime-run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .trace-runtime-output {
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--od-border) 80%, transparent);
    background: color-mix(in srgb, var(--od-bg-deep) 94%, transparent);
    color: var(--od-text-bright);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
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

  .analysis-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    border: 1px solid transparent;
  }

  .analysis-badge-keep,
  .analysis-badge-info {
    color: var(--od-green);
    border-color: color-mix(in srgb, var(--od-green) 30%, transparent);
    background: color-mix(in srgb, var(--od-green) 10%, transparent);
  }

  .analysis-badge-review,
  .analysis-badge-watch {
    color: var(--od-orange);
    border-color: color-mix(in srgb, var(--od-orange) 30%, transparent);
    background: color-mix(in srgb, var(--od-orange) 10%, transparent);
  }

  .analysis-badge-refactor,
  .analysis-badge-risk {
    color: var(--od-red);
    border-color: color-mix(in srgb, var(--od-red) 30%, transparent);
    background: color-mix(in srgb, var(--od-red) 10%, transparent);
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

  .recommendation-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .recommendation-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--od-orange) 42%, transparent);
    background: color-mix(in srgb, var(--od-orange) 12%, transparent);
    color: var(--od-orange);
    padding: 6px 10px;
    font-size: 10px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  .recommendation-action:hover {
    background: color-mix(in srgb, var(--od-orange) 18%, transparent);
  }

  .recommendation-action-secondary {
    color: var(--od-blue);
    border-color: color-mix(in srgb, var(--od-blue) 40%, transparent);
    background: color-mix(in srgb, var(--od-blue) 12%, transparent);
  }

  .recommendation-action-secondary:hover {
    background: color-mix(in srgb, var(--od-blue) 18%, transparent);
  }

  .recommendation-action-link {
    justify-content: center;
  }

  .mentor-mode-row {
    display: inline-flex;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  .mentor-mode-btn {
    border: 1px solid color-mix(in srgb, var(--od-border) 78%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
    color: var(--od-text);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .mentor-mode-btn-active {
    border-color: color-mix(in srgb, var(--od-orange) 50%, transparent);
    background: color-mix(in srgb, var(--od-orange) 12%, transparent);
    color: var(--od-orange);
  }

  .mentor-summary-card {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--od-orange) 22%, transparent), transparent 46%),
      color-mix(in srgb, var(--od-bg-main) 82%, transparent);
  }

  .mentor-summary-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .mentor-summary-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mentor-summary-text {
    color: var(--od-text);
    font-size: 11px;
    line-height: 1.6;
  }

  .mentor-selection-summary {
    color: color-mix(in srgb, var(--od-blue) 80%, white 6%);
    font-size: 10px;
    line-height: 1.6;
  }

  .mentor-progress-bar {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--od-border) 65%, transparent);
    margin-top: 14px;
    overflow: hidden;
  }

  .mentor-progress-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--od-orange), color-mix(in srgb, var(--od-green) 72%, var(--od-orange)));
  }

  .mentor-progress-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--od-text-dim);
    font-size: 10px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .mentor-action-row {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    flex-wrap: wrap;
  }

  .mentor-problem-list {
    display: grid;
    gap: 10px;
  }

  .mentor-problem-item {
    border: 1px solid color-mix(in srgb, var(--od-border) 75%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 76%, transparent);
    border-radius: 10px;
    padding: 10px;
    text-align: left;
    cursor: pointer;
  }

  .mentor-problem-active {
    border-color: color-mix(in srgb, var(--od-orange) 58%, transparent);
    background: color-mix(in srgb, var(--od-orange) 10%, transparent);
  }

  .mentor-problem-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }

  .mentor-problem-title {
    color: var(--od-text-bright);
    font-size: 11px;
    font-weight: 700;
  }

  .mentor-problem-reason {
    color: var(--od-text);
    font-size: 10px;
    line-height: 1.5;
    margin-top: 6px;
  }

  .mentor-problem-hint {
    color: var(--od-text-dim);
    font-size: 10px;
    line-height: 1.5;
    margin-top: 6px;
  }

  .mentor-queue-pill {
    margin-top: 8px;
    display: inline-flex;
  }

  .mentor-milestone-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mentor-milestone-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: start;
    border: 1px solid color-mix(in srgb, var(--od-border) 72%, transparent);
    border-radius: 10px;
    padding: 10px;
    background: color-mix(in srgb, var(--od-bg-main) 78%, transparent);
  }

  .mentor-milestone-active {
    border-color: color-mix(in srgb, var(--od-blue) 52%, transparent);
    background: color-mix(in srgb, var(--od-blue) 8%, transparent);
  }

  .mentor-milestone-toggle {
    border: none;
    background: transparent;
    color: var(--od-green);
    cursor: pointer;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mentor-milestone-copy {
    border: none;
    background: transparent;
    text-align: left;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mentor-milestone-step {
    color: var(--od-text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .mentor-milestone-text {
    color: var(--od-text-bright);
    font-size: 11px;
    line-height: 1.5;
  }

  .mentor-focus-pill {
    color: var(--od-blue);
    border: 1px solid color-mix(in srgb, var(--od-blue) 32%, transparent);
    background: color-mix(in srgb, var(--od-blue) 12%, transparent);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
  }

  .mentor-current-milestone {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--od-text-bright);
    border: 1px solid color-mix(in srgb, var(--od-orange) 30%, transparent);
    background: color-mix(in srgb, var(--od-orange) 10%, transparent);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 11px;
    line-height: 1.5;
  }

  .mentor-hint-grid {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }

  .mentor-hint-card {
    border: 1px solid color-mix(in srgb, var(--od-border) 72%, transparent);
    background: color-mix(in srgb, var(--od-bg-main) 76%, transparent);
    border-radius: 10px;
    padding: 10px;
  }

  .mentor-hint-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--od-orange);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .mentor-hint-body {
    color: var(--od-text);
    font-size: 11px;
    line-height: 1.6;
    margin-top: 8px;
  }

  .mentor-empty {
    min-height: 100%;
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
