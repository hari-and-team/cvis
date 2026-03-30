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

export type VisualizerArrayCellEmphasis = 'default' | 'search' | 'delete' | 'changed';

export interface VisualizerArrayCellView {
  idx: number;
  displayValue: string;
  changed: boolean;
  emphasis: VisualizerArrayCellEmphasis;
}

export interface VisualizerMatrixCellView {
  row: number;
  col: number;
  displayValue: string;
  changed: boolean;
  emphasis: VisualizerArrayCellEmphasis;
}

export interface VisualizerMatrixRowView {
  row: number;
  cells: VisualizerMatrixCellView[];
}

export interface VisualizerMatrixView {
  rowCount: number;
  colCount: number;
  visibleRowCount: number;
  visibleColCount: number;
  rows: VisualizerMatrixRowView[];
}

export interface VisualizerArrayView {
  name: string;
  cellCount: number;
  values: VisualizerArrayCellView[];
  recentDeletedValues: string[];
  matrix: VisualizerMatrixView | null;
}

export interface VisualizerRenderModel {
  intentLabel: string;
  intentConfidence: number;
  techniques: string[];
  flowDescriptor: VisualizerFlowDescriptor | null;
  stackFrames: VisualizerFrameView[];
  globalValues: VisualizerValueView[];
  arrays: VisualizerArrayView[];
  linkedLists: VisualizerLinkedList[];
  structBlocks: VisualizerStructBlock[];
  pointerRefs: VisualizerPointerRef[];
  trees: VisualizerTree[];
  stackItems: string[];
  stackSideLabel: string | null;
  recentlyPoppedStackValues: string[];
  queueItems: string[];
  recentlyDeletedTreeValues: string[];
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

function toIndexedEntries(value: unknown): Array<[number, unknown]> {
  if (Array.isArray(value)) {
    return value.map((entry, index): [number, unknown] => [index, entry]);
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([key, entry]): [number, unknown] => [Number.parseInt(key, 10), entry])
    .sort((left, right) => left[0] - right[0]);
}

function arraySourceAliases(name: string): string[] {
  const aliases = [name];
  const baseName = name.split('.').at(-1)?.trim();

  if (baseName && baseName !== name) {
    aliases.push(baseName);
  }

  return aliases;
}

function displayArrayName(name: string): string {
  return name.split('.').at(-1)?.trim() || name;
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

function getLineText(source: string, lineNo: number | undefined): string {
  if (!source || !Number.isInteger(lineNo) || (lineNo ?? 0) <= 0) {
    return '';
  }

  return source.split(/\r?\n/)[(lineNo ?? 1) - 1] ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNumericScope(
  globalFrame: VisualizerFrame | null,
  stackFrames: VisualizerFrame[]
): Record<string, number> {
  const scope: Record<string, number> = {};

  for (const [name, value] of Object.entries(globalFrame?.locals ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      scope[name] = value;
    }
  }

  for (const frame of stackFrames) {
    for (const [name, value] of Object.entries(frame.locals)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        scope[name] = value;
      }
    }
  }

  return scope;
}

function evaluateIndexExpression(
  expression: string,
  numericScope: Record<string, number>
): number | null {
  const trimmed = expression.trim();
  if (!trimmed) {
    return null;
  }

  const substituted = trimmed.replace(/\b[A-Za-z_]\w*\b/g, (name) =>
    name in numericScope ? String(numericScope[name]) : 'NaN'
  );

  if (!/^[\d\s+\-*/%()NaInityf.]+$/.test(substituted)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${substituted});`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Math.trunc(result);
    }
  } catch {
    return null;
  }

  return null;
}

function findArrayAccessIndices(
  arrayNames: string[],
  lineText: string,
  numericScope: Record<string, number>
): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();

  for (const arrayName of arrayNames) {
    for (const alias of arraySourceAliases(arrayName)) {
      const regex = new RegExp(`\\b${escapeRegExp(alias)}\\s*\\[([^\\]]+)\\]`, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(lineText)) !== null) {
        const resolvedIndex = evaluateIndexExpression(match[1] ?? '', numericScope);
        if (resolvedIndex === null || !Number.isInteger(resolvedIndex) || resolvedIndex < 0) {
          continue;
        }

        if (!result.has(arrayName)) {
          result.set(arrayName, new Set<number>());
        }
        result.get(arrayName)?.add(resolvedIndex);
      }
    }
  }

  return result;
}

function findMatrixAccessCoordinates(
  arrayNames: string[],
  lineText: string,
  numericScope: Record<string, number>
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  for (const arrayName of arrayNames) {
    for (const alias of arraySourceAliases(arrayName)) {
      const regex = new RegExp(
        `\\b${escapeRegExp(alias)}\\s*\\[([^\\]]+)\\]\\s*\\[([^\\]]+)\\]`,
        'g'
      );
      let match: RegExpExecArray | null;

      while ((match = regex.exec(lineText)) !== null) {
        const resolvedRow = evaluateIndexExpression(match[1] ?? '', numericScope);
        const resolvedCol = evaluateIndexExpression(match[2] ?? '', numericScope);
        if (
          resolvedRow === null ||
          resolvedCol === null ||
          !Number.isInteger(resolvedRow) ||
          !Number.isInteger(resolvedCol) ||
          resolvedRow < 0 ||
          resolvedCol < 0
        ) {
          continue;
        }

        if (!result.has(arrayName)) {
          result.set(arrayName, new Set<string>());
        }
        result.get(arrayName)?.add(`${resolvedRow}:${resolvedCol}`);
      }
    }
  }

  return result;
}

function inferArrayOperation(
  lineText: string,
  activeFrameName: string,
  intentLabel: string
): 'search' | 'delete' | 'neutral' {
  const combined = `${activeFrameName} ${lineText}`.toLowerCase();

  if (/\b(delete|remove|erase|shift|pop)\b/.test(combined)) {
    return 'delete';
  }

  if (/\b(search|find|lookup)\b/.test(combined)) {
    return 'search';
  }

  if (/\[[^\]]+\]\s*(?:==|!=|<=|>=|<|>)/.test(lineText) || intentLabel === 'Searching') {
    return 'search';
  }

  return 'neutral';
}

function buildValueCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function diffRemovedValues(previousValues: string[], currentValues: string[]): string[] {
  const remaining = buildValueCounts(currentValues);
  const removed: string[] = [];

  for (const value of previousValues) {
    const count = remaining.get(value) ?? 0;
    if (count > 0) {
      remaining.set(value, count - 1);
      continue;
    }

    removed.push(value);
  }

  return removed;
}

function findRecentlyPoppedValues(previousValues: unknown[], currentValues: unknown[]): string[] {
  if (previousValues.length <= currentValues.length) {
    return [];
  }

  const sharedPrefix = currentValues.every((value, index) => valuesEqual(value, previousValues[index]));
  if (sharedPrefix) {
    return previousValues
      .slice(currentValues.length)
      .reverse()
      .map((value) => formatValue(value));
  }

  return diffRemovedValues(
    previousValues.map((value) => formatValue(value)),
    currentValues.map((value) => formatValue(value))
  );
}

function inferVisibleMatrixSize(
  arrayName: string,
  numericScope: Record<string, number>,
  rowCount: number,
  colCount: number
): { rows: number; cols: number } {
  const normalizedName = displayArrayName(arrayName).toLowerCase();
  const scopeEntries = Object.entries(numericScope).map(([key, value]) => [key.toLowerCase(), value] as const);
  const normalizedScope = new Map<string, number>(scopeEntries);
  const rowHintKeys = [
    `${normalizedName}rows`,
    `${normalizedName}_rows`,
    'rows',
    'row_count',
    'rowcount',
    'height'
  ];
  const colHintKeys = [
    `${normalizedName}cols`,
    `${normalizedName}_cols`,
    'cols',
    'col_count',
    'colcount',
    'width'
  ];

  const resolveHint = (keys: string[], max: number): number | null => {
    for (const key of keys) {
      if (!normalizedScope.has(key)) {
        continue;
      }

      const value = normalizedScope.get(key);
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return Math.min(max, value);
      }
    }

    return null;
  };

  return {
    rows: resolveHint(rowHintKeys, rowCount) ?? rowCount,
    cols: resolveHint(colHintKeys, colCount) ?? colCount
  };
}

function buildMatrixView(
  entry: VisualizerArray,
  previousArray: VisualizerArray | undefined,
  numericScope: Record<string, number>,
  accessedCoordinates: Set<string>,
  arrayOperation: 'search' | 'delete' | 'neutral'
): VisualizerMatrixView | null {
  const rowEntries = entry.cells
    .map((cell) => [cell.idx, toIndexedEntries(cell.value)] as const)
    .filter(([, values]) => values.length > 0);

  if (rowEntries.length === 0 || rowEntries.length !== entry.cells.length) {
    return null;
  }

  const colCount = rowEntries.reduce((max, [, values]) => Math.max(max, values.length), 0);
  if (colCount === 0) {
    return null;
  }

  const previousRowMap = new Map<number, Map<number, unknown>>();
  for (const previousCell of previousArray?.cells ?? []) {
    const nestedValues = toIndexedEntries(previousCell.value);
    if (nestedValues.length === 0) {
      continue;
    }
    previousRowMap.set(previousCell.idx, new Map<number, unknown>(nestedValues));
  }

  const { rows: visibleRowCount, cols: visibleColCount } = inferVisibleMatrixSize(
    entry.name,
    numericScope,
    rowEntries.length,
    colCount
  );

  return {
    rowCount: rowEntries.length,
    colCount,
    visibleRowCount,
    visibleColCount,
    rows: rowEntries.slice(0, visibleRowCount).map(([rowIndex, values]) => ({
      row: rowIndex,
      cells: values.slice(0, visibleColCount).map(([colIndex, value]) => {
        const changed = !valuesEqual(previousRowMap.get(rowIndex)?.get(colIndex), value);
        const coordinateKey = `${rowIndex}:${colIndex}`;
        let emphasis: VisualizerArrayCellEmphasis = 'default';

        if (arrayOperation === 'delete' && changed) {
          emphasis = 'delete';
        } else if (accessedCoordinates.has(coordinateKey)) {
          emphasis = 'search';
        } else if (changed) {
          emphasis = 'changed';
        }

        return {
          row: rowIndex,
          col: colIndex,
          displayValue: formatValue(value),
          changed,
          emphasis
        };
      })
    }))
  };
}

function findActivePopTargets(
  lineText: string,
  activeFrameName: string,
  description: string | undefined,
  currentStackValues: unknown[]
): string[] {
  if (currentStackValues.length === 0) {
    return [];
  }

  const combined = `${activeFrameName} ${lineText} ${description ?? ''}`.toLowerCase();
  const looksLikePopContext =
    /\bpop\b/.test(combined) ||
    /\bpopped\b/.test(combined) ||
    /top\s*--|--\s*top/.test(lineText) ||
    /stack\s*\[\s*top\s*\]/.test(lineText);

  if (!looksLikePopContext) {
    return [];
  }

  return [formatValue(currentStackValues[currentStackValues.length - 1])];
}

function findRecentlyDeletedTreeValues(
  previousTrees: VisualizerTree[],
  currentTrees: VisualizerTree[]
): string[] {
  const currentKeys = new Set(
    currentTrees.flatMap((tree) =>
      tree.levels.flatMap((level) => level.filter(Boolean).map((node) => node?.key ?? ''))
    )
  );

  const removed: string[] = [];
  for (const tree of previousTrees) {
    for (const level of tree.levels) {
      for (const node of level) {
        if (!node || currentKeys.has(node.key)) {
          continue;
        }
        removed.push(node.label);
      }
    }
  }

  return removed;
}

export function buildVisualizerRenderModel(
  traceStep: TraceStep | null,
  previousTraceStep: TraceStep | null,
  editorCode: string
): VisualizerRenderModel {
  const normalizedTrace = normalizeTraceStep(traceStep);
  const previousNormalizedTrace = normalizeTraceStep(previousTraceStep);
  const intentPrediction = predictProgramIntent(editorCode);
  const structBlocks = normalizedTrace.structBlocks;
  const previousFrames = previousNormalizedTrace.stackFrames;
  const previousGlobalFrame = previousNormalizedTrace.globalFrame;
  const lineText = getLineText(editorCode, traceStep?.lineNo);
  const activeFrameName = normalizedTrace.stackFrames.at(-1)?.name ?? '';
  const numericScope = buildNumericScope(normalizedTrace.globalFrame, normalizedTrace.stackFrames);
  const arrayAccessIndices = findArrayAccessIndices(
    normalizedTrace.arrays.map((entry) => entry.name),
    lineText,
    numericScope
  );
  const matrixAccessCoordinates = findMatrixAccessCoordinates(
    normalizedTrace.arrays.map((entry) => entry.name),
    lineText,
    numericScope
  );
  const arrayOperation = inferArrayOperation(lineText, activeFrameName, intentPrediction.primaryLabel);

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

  const previousArrayMap = new Map(previousNormalizedTrace.arrays.map((entry) => [entry.name, entry]));
  const arrays = normalizedTrace.arrays.map((entry) => {
    const previousArray = previousArrayMap.get(entry.name);
    const previousCellMap = new Map(previousArray?.cells.map((cell) => [cell.idx, cell.value]) ?? []);
    const accessedIndices = arrayAccessIndices.get(entry.name) ?? new Set<number>();
    const accessedCoordinates = matrixAccessCoordinates.get(entry.name) ?? new Set<string>();
    const previousValues = previousArray?.cells.map((cell) => formatValue(cell.value)) ?? [];
    const currentValues = entry.cells.map((cell) => formatValue(cell.value));
    const matrix = buildMatrixView(
      entry,
      previousArray,
      numericScope,
      accessedCoordinates,
      arrayOperation
    );
    const cellCount = matrix
      ? matrix.visibleRowCount * matrix.visibleColCount
      : entry.cells.length;

    return {
      name: displayArrayName(entry.name),
      cellCount,
      values: entry.cells.map((cell) => {
        const changed = !valuesEqual(previousCellMap.get(cell.idx), cell.value);
        let emphasis: VisualizerArrayCellEmphasis = 'default';

        if (arrayOperation === 'delete' && changed) {
          emphasis = 'delete';
        } else if (accessedIndices.has(cell.idx)) {
          emphasis = 'search';
        } else if (changed) {
          emphasis = 'changed';
        }

        return {
          idx: cell.idx,
          displayValue: formatValue(cell.value),
          changed,
          emphasis
        };
      }),
      recentDeletedValues: arrayOperation === 'delete' ? diffRemovedValues(previousValues, currentValues) : [],
      matrix
    };
  });

  const stackItems = normalizedTrace.stack.values.map((item) => formatValue(item));
  const activePopTargets = findActivePopTargets(
    lineText,
    activeFrameName,
    traceStep?.description,
    normalizedTrace.stack.values
  );
  const recentlyPoppedStackValues = findRecentlyPoppedValues(
    previousNormalizedTrace.stack.values,
    normalizedTrace.stack.values
  );
  const stackSideValues =
    activePopTargets.length > 0 ? activePopTargets : recentlyPoppedStackValues;
  const stackSideLabel =
    activePopTargets.length > 0
      ? 'Popping now'
      : recentlyPoppedStackValues.length > 0
        ? 'Popped values'
        : null;
  const queueItems = normalizedTrace.queue.values.map((item) => formatValue(item));
  const recentlyDeletedTreeValues = findRecentlyDeletedTreeValues(
    previousNormalizedTrace.trees,
    normalizedTrace.trees
  );

  const hasStructureViews =
    arrays.length > 0 ||
    normalizedTrace.linkedLists.length > 0 ||
    structBlocks.length > 0 ||
    normalizedTrace.trees.length > 0 ||
    stackItems.length > 0 ||
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
    stackSideLabel,
    recentlyPoppedStackValues: stackSideValues,
    queueItems,
    recentlyDeletedTreeValues,
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
