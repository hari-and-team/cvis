import type { TraceStep } from '$lib/types';
import { predictProgramIntent } from '$lib/visualizer/program-intent';
import {
  normalizeTraceStep,
  type VisualizerArray,
  type VisualizerFrame,
  type VisualizerGraph,
  type VisualizerLinkedList,
  type VisualizerMemoryEntry,
  type VisualizerPointerRef,
  type VisualizerStructBlock,
  type VisualizerTree
} from '$lib/visualizer/trace-normalization';

export interface VisualizerValueView {
  name: string;
  displayValue: string;
  isPointer: boolean;
  changed: boolean;
}

export interface VisualizerFrameView {
  name: string;
  locals: VisualizerValueView[];
  pointerRefs: VisualizerPointerRef[];
  isActive: boolean;
}

export interface VisualizerFlowDescriptor {
  label: string;
  color: string;
  text: string;
}

export interface VisualizerLinearItemView {
  displayValue: string;
  state: 'active' | 'top' | 'popped';
}

export interface VisualizerRenderModel {
  intentLabel: string;
  intentConfidence: number;
  techniques: string[];
  flowDescriptor: VisualizerFlowDescriptor | null;
  stackFrames: VisualizerFrameView[];
  globalValues: VisualizerValueView[];
  arrays: Array<{ name: string; values: Array<{ idx: number; displayValue: string }> }>;
  linkedLists: VisualizerLinkedList[];
  structBlocks: VisualizerStructBlock[];
  pointerRefs: VisualizerPointerRef[];
  trees: VisualizerTree[];
  stackItems: VisualizerLinearItemView[];
  poppedStackItems: string[];
  queueItems: string[];
  graphs: VisualizerGraph[];
  memoryEntries: VisualizerMemoryEntry[];
  rawGlobalFrame: VisualizerFrame | null;
  rawStackFrames: VisualizerFrame[];
  fallbackReason: string | null;
  hasRenderableSections: boolean;
  hasStructureViews: boolean;
  isPartialSnapshot: boolean;
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
}

function pointerTarget(value: unknown, structBlocks: VisualizerStructBlock[]): string | null {
  if (value === null || value === undefined) return null;

  if (structBlocks.some((block) => block.key === String(value))) {
    return String(value);
  }

  if (typeof value === 'object' && value) {
    const record = value as Record<string, unknown>;
    if (typeof record.addr === 'string' || typeof record.addr === 'number') {
      const key = String(record.addr);
      return structBlocks.some((block) => block.key === key) ? key : null;
    }
    if (typeof record.id === 'string' || typeof record.id === 'number') {
      const key = String(record.id);
      return structBlocks.some((block) => block.key === key) ? key : null;
    }
  }

  return null;
}

function pointerLabel(value: unknown, structBlocks: VisualizerStructBlock[]): string {
  const target = pointerTarget(value, structBlocks);
  return target ? `ref @${target}` : formatValue(value);
}

function describeTraceStep(description: string | undefined): VisualizerFlowDescriptor | null {
  if (!description) return null;

  const normalized = description.toLowerCase();

  if (/\bprintf\b|\bputs\b|\bputchar\b|output/.test(normalized)) {
    return { label: 'Output', color: 'var(--green)', text: description };
  }

  if (/return/.test(normalized)) {
    return { label: 'Return', color: 'var(--red)', text: description };
  }

  if (/call /.test(normalized)) {
    return { label: 'Call', color: 'var(--orange)', text: description };
  }

  if (/\bfor\b|\bwhile\b|\bloop\b/.test(normalized)) {
    return { label: 'Loop', color: 'var(--purple)', text: description };
  }

  if (/\bif\b|\bcondition\b|\bswitch\b/.test(normalized)) {
    return { label: 'Branch', color: 'var(--cyan)', text: description };
  }

  if (/\bdeclare\b|declaration/.test(normalized)) {
    return { label: 'Declare', color: 'var(--purple)', text: description };
  }

  if (/\bscanf\b|\binput\b/.test(normalized)) {
    return { label: 'Input', color: 'var(--orange)', text: description };
  }

  return { label: 'State', color: 'var(--text-mid)', text: description };
}

function formatTechniqueLabel(tag: string): string {
  return tag
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildStackItems(currentValues: unknown[]): VisualizerLinearItemView[] {
  const formattedCurrent = currentValues.map((item) => formatValue(item));
  const topIndex = formattedCurrent.length - 1;

  return formattedCurrent.map((displayValue, index) => ({
    displayValue,
    state: index === topIndex ? 'top' : 'active'
  }));
}

function buildPoppedStackHistory(traceHistory: TraceStep[]): string[] {
  const poppedHistory: string[] = [];

  for (let index = 1; index < traceHistory.length; index += 1) {
    const previousValues = normalizeTraceStep(traceHistory[index - 1]).stack.values.map((item) =>
      formatValue(item)
    );
    const currentValues = normalizeTraceStep(traceHistory[index]).stack.values.map((item) =>
      formatValue(item)
    );
    const isPrefixPop =
      previousValues.length > currentValues.length &&
      currentValues.every((item, currentIndex) => item === previousValues[currentIndex]);

    if (!isPrefixPop) {
      continue;
    }

    const poppedOnThisStep = previousValues.slice(currentValues.length).reverse();
    for (const poppedValue of poppedOnThisStep) {
      poppedHistory.unshift(poppedValue);
    }
  }

  return poppedHistory;
}

export function buildVisualizerRenderModel(
  traceStep: TraceStep | null,
  previousTraceStep: TraceStep | null,
  editorCode: string,
  traceHistory: TraceStep[] = []
): VisualizerRenderModel {
  const normalizedTrace = normalizeTraceStep(traceStep);
  const previousNormalizedTrace = normalizeTraceStep(previousTraceStep);
  const intentPrediction = predictProgramIntent(editorCode);
  const structBlocks = normalizedTrace.structBlocks;
  const previousFrames = previousNormalizedTrace.stackFrames;
  const previousGlobalFrame = previousNormalizedTrace.globalFrame;

  const stackFrames = normalizedTrace.stackFrames.map((frame, index, frames) => {
    const previousFrame = previousFrames[index] ?? null;
    return {
      name: frame.name,
      locals: Object.entries(frame.locals).map(([name, value]) => ({
        name,
        displayValue: pointerLabel(value, structBlocks),
        isPointer: pointerTarget(value, structBlocks) !== null,
        changed: !valuesEqual(previousFrame?.locals[name], value)
      })),
      pointerRefs: normalizedTrace.pointerRefs.filter(
        (ref) => ref.ownerType === 'frame' && ref.owner === frame.name
      ),
      isActive: index === frames.length - 1
    };
  });

  const globalValues = normalizedTrace.globalFrame
    ? Object.entries(normalizedTrace.globalFrame.locals).map(([name, value]) => ({
        name,
        displayValue: pointerLabel(value, structBlocks),
        isPointer: pointerTarget(value, structBlocks) !== null,
        changed: !valuesEqual(previousGlobalFrame?.locals[name], value)
      }))
    : [];

  const arrays = normalizedTrace.arrays.map((entry) => ({
    name: entry.name,
    values: entry.cells.map((cell) => ({
      idx: cell.idx,
      displayValue: formatValue(cell.value)
    }))
  }));

  const stackItems = buildStackItems(normalizedTrace.stack.values);
  const poppedStackItems = buildPoppedStackHistory(traceHistory);
  const queueItems = normalizedTrace.queue.values.map((item) => formatValue(item));

  const hasStructureViews =
    arrays.length > 0 ||
    normalizedTrace.linkedLists.length > 0 ||
    structBlocks.length > 0 ||
    normalizedTrace.trees.length > 0 ||
    stackItems.length > 0 ||
    poppedStackItems.length > 0 ||
    queueItems.length > 0 ||
    normalizedTrace.graphs.length > 0;
  const hasRenderableSections =
    stackFrames.length > 0 ||
    globalValues.length > 0 ||
    arrays.length > 0 ||
    normalizedTrace.linkedLists.length > 0 ||
    structBlocks.length > 0 ||
    normalizedTrace.trees.length > 0 ||
    stackItems.length > 0 ||
    poppedStackItems.length > 0 ||
    queueItems.length > 0 ||
    normalizedTrace.graphs.length > 0;

  return {
    intentLabel: intentPrediction.primaryLabel,
    intentConfidence: intentPrediction.confidence,
    techniques: intentPrediction.techniques.slice(0, 4).map(formatTechniqueLabel),
    flowDescriptor: describeTraceStep(traceStep?.description),
    stackFrames,
    globalValues,
    arrays,
    linkedLists: normalizedTrace.linkedLists,
    structBlocks,
    pointerRefs: normalizedTrace.pointerRefs,
    trees: normalizedTrace.trees,
    stackItems,
    poppedStackItems,
    queueItems,
    graphs: normalizedTrace.graphs,
    memoryEntries: normalizedTrace.memoryEntries,
    rawGlobalFrame: normalizedTrace.globalFrame,
    rawStackFrames: normalizedTrace.stackFrames,
    fallbackReason: normalizedTrace.fallbackReason,
    hasRenderableSections,
    hasStructureViews,
    isPartialSnapshot: Boolean(traceStep) && !hasStructureViews && hasRenderableSections
  };
}
