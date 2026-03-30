import type { UnifiedAnalysisResult } from '$lib/analysis/unified-analysis';
import { buildMentorViewModel, type MentorViewModel } from '$lib/mentor/view-model';
import type { AnalyzeIntentResult, CompileResult, ExecutionResult, TraceStep, UserProfile } from '$lib/types';
import { predictProgramIntent } from '$lib/visualizer/program-intent';

export interface ConsoleViewModel {
  status: 'empty' | 'ready';
  output: string;
  pendingRunInputEcho: string;
  hasError: boolean;
  compileSummary: string | null;
  runSummary: string | null;
  canSendToStdin: boolean;
  nativeExecutionEnabled: boolean;
  workspaceError: string | null;
}

export interface VisualizerViewModel {
  status: 'empty' | 'loading' | 'error' | 'ready';
  nativeExecutionEnabled: boolean;
  traceUsesRuntimeInput: boolean;
  canStartTrace: boolean;
  hasCapturedRunInput: boolean;
  hasManualTraceInput: boolean;
  isConsoleRunActive: boolean;
  inputReplayNeedsFreshRun: boolean;
  traceConsoleOutput: string;
  traceNotice: string | null;
  capturedRunInputLineCount: number;
  manualTraceInputLineCount: number;
  traceConsoleStatus: string;
  isTracing: boolean;
  traceErr: string | null;
  traceSteps: TraceStep[];
  currentTraceStepData: TraceStep | null;
  loadingSteps: string[];
  intentPrimaryLabel: string;
}

export interface AnalysisCardViewModel {
  id: string;
  label: string;
  confidence: number;
  locations: string[];
  signals: string[];
}

export interface IntentExplainerViewModel {
  result: AnalyzeIntentResult | null;
  loading: boolean;
  error: string | null;
  sourceLabel: string;
}

export interface AnalysisViewModel {
  status: 'empty' | 'ready';
  report: UnifiedAnalysisResult;
  hasDetectedDsa: boolean;
  hasDetectedAlgorithms: boolean;
  dominantAnalysisSection: UnifiedAnalysisResult['staticReport']['sections'][number] | null;
  mainAnalysisSection: UnifiedAnalysisResult['staticReport']['sections'][number] | null;
  detectedDsaCards: AnalysisCardViewModel[];
  detectedAlgorithmCards: AnalysisCardViewModel[];
  reverseRiskCount: number;
  reverseOptimizationCount: number;
  detectedSections: UnifiedAnalysisResult['staticReport']['sections'];
  primaryTechniqueLabels: string[];
  recommendedProblems: UnifiedAnalysisResult['recommendedPractice'];
  intentExplainer: IntentExplainerViewModel;
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

function formatDsaLabel(tag: string): string {
  return tag
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSectionLocation(title: string, startLine: number, endLine: number): string {
  if (title === 'Program' || title === 'Global Scope') {
    return `${title} · L${startLine}-${endLine}`;
  }

  return `${title}() · L${startLine}-${endLine}`;
}

function getLoadingSteps(intentLabel: string): string[] {
  return [
    'Scanning tokens and control flow...',
    `Predicting algorithm intent: ${intentLabel}`,
    'Building execution timeline...',
    'Preparing interactive visualization...'
  ];
}

function buildAnalysisCards(
  analysis: UnifiedAnalysisResult,
  predictedTechniques: string[],
  allowedIntents: Set<string>,
  allowedTechniques: Set<string>,
  programLineCount: number
): AnalysisCardViewModel[] {
  const cards = new Map<string, AnalysisCardViewModel>();
  const candidates = analysis.staticReport.candidates;
  const primaryProgramScore = candidates[0]?.score ?? 1;

  function ensureCard(id: string, label: string): AnalysisCardViewModel {
    const existing = cards.get(id);
    if (existing) return existing;

    const created: AnalysisCardViewModel = {
      id,
      label,
      confidence: 0,
      locations: [],
      signals: []
    };
    cards.set(id, created);
    return created;
  }

  function mergeTextValues(target: string[], source: string[]) {
    for (const item of source) {
      if (item && !target.includes(item)) {
        target.push(item);
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate.intent === 'generic' || !allowedIntents.has(candidate.intent)) {
      continue;
    }

    const normalizedScore =
      candidate.intent === analysis.staticReport.primaryIntent
        ? analysis.staticReport.confidence
        : candidate.score / Math.max(primaryProgramScore, 1);

    if (normalizedScore < 0.32) {
      continue;
    }

    const card = ensureCard(`intent:${candidate.intent}`, candidate.label);
    card.confidence = Math.max(card.confidence, normalizedScore);
    mergeTextValues(card.signals, analysis.evidence);
    mergeTextValues(card.locations, [`Program · L1-${programLineCount}`]);
  }

  for (const band of analysis.staticReport.intentBands) {
    if (band.intent === 'generic' || !allowedIntents.has(band.intent) || band.normalized < 0.3) {
      continue;
    }

    const card = ensureCard(`intent:${band.intent}`, band.label);
    card.confidence = Math.max(card.confidence, band.normalized);
  }

  for (const section of analysis.staticReport.sections) {
    if (section.intent === 'generic' || !allowedIntents.has(section.intent) || section.confidence < 0.3) {
      continue;
    }

    const card = ensureCard(`section:${section.id}`, section.label);
    card.confidence = Math.max(card.confidence, section.confidence);
    mergeTextValues(card.locations, [formatSectionLocation(section.title, section.startLine, section.endLine)]);
    mergeTextValues(card.signals, section.matchedSignals.slice(0, 4));
  }

  for (const technique of predictedTechniques) {
    if (!allowedTechniques.has(technique)) continue;
    const card = ensureCard(`technique:${technique}`, formatDsaLabel(technique));
    card.confidence = Math.max(card.confidence, analysis.confidence);
    mergeTextValues(card.signals, analysis.evidence);
    mergeTextValues(card.locations, [`Program · L1-${programLineCount}`]);
  }

  return Array.from(cards.values()).sort((left, right) => right.confidence - left.confidence);
}

function pickDominantSection(
  sections: UnifiedAnalysisResult['staticReport']['sections']
): UnifiedAnalysisResult['staticReport']['sections'][number] | null {
  const filtered = sections.filter((section) => section.intent !== 'generic' && section.confidence >= 0.3);
  const mainSection =
    filtered.find((section) => section.title === 'main') ??
    filtered.find((section) => section.title === 'Program') ??
    sections.find((section) => section.title === 'main') ??
    sections.find((section) => section.title === 'Program');

  if (mainSection) return mainSection;

  return [...filtered].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    const leftSpan = left.endLine - left.startLine;
    const rightSpan = right.endLine - right.startLine;
    return rightSpan - leftSpan;
  })[0] ?? sections[0] ?? null;
}

export function buildConsoleViewModel({
  output,
  pendingRunInputEcho,
  lastCompileResult,
  lastExecutionResult,
  canSendToStdin,
  nativeExecutionEnabled,
  workspaceError
}: {
  output: string;
  pendingRunInputEcho: string;
  lastCompileResult: CompileResult | null;
  lastExecutionResult: ExecutionResult | null;
  canSendToStdin: boolean;
  nativeExecutionEnabled: boolean;
  workspaceError: string | null;
}): ConsoleViewModel {
  return {
    status: output || canSendToStdin || lastCompileResult || lastExecutionResult ? 'ready' : 'empty',
    output,
    pendingRunInputEcho,
    hasError: Boolean(lastExecutionResult?.stderr || lastCompileResult?.errors?.length),
    compileSummary: lastCompileResult
      ? `Compile ${formatDuration(lastCompileResult.compilationTime)}`
      : null,
    runSummary: lastExecutionResult
      ? `Runtime ${formatDuration(lastExecutionResult.executionTime)}${
          lastExecutionResult.peakMemoryBytes
            ? ` · Memory ${formatMemory(lastExecutionResult.peakMemoryBytes)}`
            : ''
        }`
      : null,
    canSendToStdin,
    nativeExecutionEnabled,
    workspaceError
  };
}

export function buildVisualizerViewModel({
  editorCode,
  runConsoleTranscript,
  runSessionId,
  lastExecutionResult,
  lastCompileResult,
  lastRunInputTranscript,
  manualTraceInput,
  pendingRunInputEcho,
  traceSteps,
  currentTraceStepData,
  isTracing,
  traceErr,
  nativeExecutionEnabled,
  traceNotice
}: {
  editorCode: string;
  runConsoleTranscript: string;
  runSessionId: string | null;
  lastExecutionResult: ExecutionResult | null;
  lastCompileResult: CompileResult | null;
  lastRunInputTranscript: string;
  manualTraceInput: string;
  pendingRunInputEcho: string;
  traceSteps: TraceStep[];
  currentTraceStepData: TraceStep | null;
  isTracing: boolean;
  traceErr: string | null;
  nativeExecutionEnabled: boolean;
  traceNotice: string | null;
}): VisualizerViewModel {
  const intentPrediction = predictProgramIntent(editorCode);
  const output = runConsoleTranscript
    ? runConsoleTranscript
    : lastExecutionResult
      ? `${lastExecutionResult.stdout}${lastExecutionResult.stderr}`
      : lastCompileResult
        ? lastCompileResult.output || lastCompileResult.errors.join('\n')
        : '';
  const renderedOutput = `${output}${pendingRunInputEcho}`;
  const traceUsesRuntimeInput = /\bscanf\s*\(/.test(editorCode);
  const hasCapturedRunInput = lastRunInputTranscript.length > 0;
  const hasManualTraceInput = manualTraceInput.length > 0;
  const isConsoleRunActive = typeof runSessionId === 'string' && runSessionId.length > 0;
  const inputReplayNeedsFreshRun =
    traceUsesRuntimeInput &&
    hasCapturedRunInput &&
    lastExecutionResult?.completionReason === 'stopped';
  const canReplayCapturedInput = hasCapturedRunInput && !inputReplayNeedsFreshRun;
  const canStartTrace =
    !isConsoleRunActive &&
    (!traceUsesRuntimeInput || canReplayCapturedInput || hasManualTraceInput);
  const capturedRunInputLineCount =
    lastRunInputTranscript.length === 0
      ? 0
      : lastRunInputTranscript
          .split('\n')
          .filter((line, index, lines) => line.length > 0 || index < lines.length - 1).length;
  const manualTraceInputLineCount =
    manualTraceInput.length === 0
      ? 0
      : manualTraceInput
          .split('\n')
          .filter((line, index, lines) => line.length > 0 || index < lines.length - 1).length;

  return {
    status: isTracing
      ? 'loading'
      : traceNotice || traceErr
        ? 'error'
        : traceSteps.length > 0
          ? 'ready'
          : 'empty',
    nativeExecutionEnabled,
    traceUsesRuntimeInput,
    canStartTrace,
    hasCapturedRunInput,
    hasManualTraceInput,
    isConsoleRunActive,
    inputReplayNeedsFreshRun,
    traceConsoleOutput: renderedOutput || output,
    traceNotice,
    capturedRunInputLineCount,
    manualTraceInputLineCount,
    traceConsoleStatus: traceUsesRuntimeInput
      ? isConsoleRunActive
        ? 'finish current run'
        : hasManualTraceInput
          ? 'manual stdin ready'
          : inputReplayNeedsFreshRun
            ? 'rerun before trace'
            : canReplayCapturedInput
              ? 'stdin replay ready'
              : nativeExecutionEnabled
                ? 'run first or enter stdin'
                : 'enter stdin'
      : isConsoleRunActive
        ? 'finish current run'
        : renderedOutput
          ? 'latest console output'
          : 'optional',
    isTracing,
    traceErr,
    traceSteps,
    currentTraceStepData,
    loadingSteps: getLoadingSteps(intentPrediction.primaryLabel),
    intentPrimaryLabel: intentPrediction.primaryLabel
  };
}

export function buildAnalysisViewModel({
  editorCode,
  analysis,
  intentExplainer
}: {
  editorCode: string;
  analysis: UnifiedAnalysisResult;
  intentExplainer: IntentExplainerViewModel;
}): AnalysisViewModel {
  const structureIntents = new Set(['linked-list', 'stack', 'queue', 'tree', 'graph']);
  const algorithmIntents = new Set([
    'sorting',
    'searching',
    'dynamic-programming',
    'recursion',
    'matrix'
  ]);
  const structureTechniques = new Set(['linked-list', 'stack', 'queue', 'tree', 'graph']);
  const algorithmTechniques = new Set([
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
  const predictedTechniques = predictProgramIntent(editorCode).techniques;
  const detectedDsaCards = buildAnalysisCards(
    analysis,
    predictedTechniques,
    structureIntents,
    structureTechniques,
    Math.max(editorCode.split('\n').length, 1)
  );
  const detectedAlgorithmCards = buildAnalysisCards(
    analysis,
    predictedTechniques,
    algorithmIntents,
    algorithmTechniques,
    Math.max(editorCode.split('\n').length, 1)
  );

  return {
    status: editorCode.trim().length > 0 ? 'ready' : 'empty',
    report: analysis,
    hasDetectedDsa: detectedDsaCards.length > 0,
    hasDetectedAlgorithms: detectedAlgorithmCards.length > 0,
    dominantAnalysisSection: pickDominantSection(analysis.staticReport.sections),
    mainAnalysisSection:
      analysis.staticReport.sections.find((section) => {
        const title = section.title.trim().toLowerCase();
        return title === 'main' || title === 'main()';
      }) ?? null,
    detectedDsaCards,
    detectedAlgorithmCards,
    reverseRiskCount: analysis.reverseReport.safetyFindings.filter((finding) => finding.severity === 'risk').length,
    reverseOptimizationCount: analysis.reverseReport.optimizationFindings.filter((finding) => finding.severity !== 'info').length,
    detectedSections: analysis.staticReport.sections.filter(
      (section) => section.intent !== 'generic' && section.confidence >= 0.35
    ),
    primaryTechniqueLabels: Array.from(
      new Set(
        [analysis.primaryType, ...analysis.staticReport.sections.filter((section) => section.intent !== 'generic').map((section) => section.label)]
      )
    ).slice(0, 4),
    recommendedProblems: analysis.recommendedPractice,
    intentExplainer
  };
}

export function buildMentorPanelViewModel(args: {
  analysis: UnifiedAnalysisResult;
  userProfile: UserProfile | null;
  mentorSelectionMode: 'guided' | 'manual';
  selectedPracticeProblemId: string | null;
  activeMilestoneIndex: number;
  milestoneProgress: Record<string, boolean>;
}): MentorViewModel {
  return buildMentorViewModel(args);
}
