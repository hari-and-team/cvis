import type { StackFrame, TraceRuntimeSnapshot, TraceStep } from '$lib/types';

export type VisualizerDetectedMode =
  | 'array'
  | 'linkedlist'
  | 'stack'
  | 'tree'
  | 'graph'
  | 'unknown';

export interface VisualizerArrayCell {
  idx: number;
  value: unknown;
  active: boolean;
}

export interface VisualizerArray {
  name: string;
  cells: VisualizerArrayCell[];
}

export interface VisualizerLinkedNode {
  id: string;
  label: string;
  next: string | null;
  raw: unknown;
}

export interface VisualizerFrame {
  name: string;
  locals: Record<string, unknown>;
  isGlobal: boolean;
}

export interface VisualizerPointerRef {
  label: string;
  targetKey: string;
  targetLabel: string;
  owner: string;
  ownerType: 'global' | 'frame' | 'struct';
  fieldName: string;
}

export interface VisualizerMemoryEntry {
  key: string;
  value: unknown;
}

export interface VisualizerLinkedListNode {
  key: string;
  label: string;
  nextKey: string | null;
  addressLabel: string;
  fields: VisualizerStructField[];
}

export interface VisualizerLinkedList {
  id: string;
  nodes: VisualizerLinkedListNode[];
}

export interface VisualizerTreeNode {
  key: string;
  label: string;
  leftKey: string | null;
  rightKey: string | null;
}

export interface VisualizerTree {
  id: string;
  levels: Array<Array<VisualizerTreeNode | null>>;
}

export interface VisualizerStructField {
  name: string;
  value: unknown;
  displayValue: string;
  isPointer: boolean;
  targetKey: string | null;
}

export interface VisualizerStructBlock {
  key: string;
  title: string;
  addressLabel: string;
  origin: 'heap' | 'inline';
  scopeLabel: string;
  isMalloc: boolean;
  fields: VisualizerStructField[];
}

export interface VisualizerLinearStructure {
  name: string;
  values: unknown[];
}

export interface VisualizerGraphNode {
  id: string;
  label: string;
}

export interface VisualizerGraphEdge {
  from: string;
  to: string;
}

export interface VisualizerGraph {
  id: string;
  label: string;
  directed: boolean;
  nodes: VisualizerGraphNode[];
  edges: VisualizerGraphEdge[];
}

export interface NormalizedTraceState {
  arrays: VisualizerArray[];
  linkedNodes: VisualizerLinkedNode[];
  linkedLists: VisualizerLinkedList[];
  trees: VisualizerTree[];
  structBlocks: VisualizerStructBlock[];
  pointerRefs: VisualizerPointerRef[];
  stack: VisualizerLinearStructure;
  queue: VisualizerLinearStructure;
  graphs: VisualizerGraph[];
  globalFrame: VisualizerFrame | null;
  stackFrames: VisualizerFrame[];
  registers: Record<string, number>;
  memoryEntries: VisualizerMemoryEntry[];
  heapEntries: VisualizerMemoryEntry[];
  detectedMode: VisualizerDetectedMode;
  hasArrayData: boolean;
  hasLinkedListData: boolean;
  hasStackData: boolean;
  hasTreeData: boolean;
  hasQueueData: boolean;
  hasGraphData: boolean;
  hasRenderableData: boolean;
  fallbackReason: string | null;
}

interface TraceRuntimeContract {
  memory: Record<string, unknown>;
  globalFrame: VisualizerFrame | null;
  stackFrames: VisualizerFrame[];
  heap: Record<string, unknown>;
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeFrameValue(
  name: unknown,
  locals: unknown,
  isGlobal: boolean
): VisualizerFrame | null {
  if (typeof name !== 'string') {
    return null;
  }

  return {
    name,
    locals: toObjectRecord(locals),
    isGlobal
  };
}

function normalizeFrames(frames: StackFrame[] | undefined): VisualizerFrame[] {
  if (!Array.isArray(frames)) return [];

  return frames
    .filter((frame) => {
      if (!frame || typeof frame !== 'object') return false;
      if (typeof frame.name !== 'string') return false;
      return Boolean(frame.locals) && typeof frame.locals === 'object' && !Array.isArray(frame.locals);
    })
    .map((frame) => ({
      name: frame.name,
      locals: frame.locals,
      isGlobal: frame.name.trim().toLowerCase() === 'global'
    }));
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.slice().sort((left, right) => left.name.localeCompare(right.name));
}

function parseArrays(memory: Record<string, unknown>): VisualizerArray[] {
  const arrayMap = new Map<string, Map<number, unknown>>();

  function upsertArrayCell(name: string, idx: number, value: unknown): void {
    if (!Number.isInteger(idx) || idx < 0) return;
    if (!arrayMap.has(name)) {
      arrayMap.set(name, new Map<number, unknown>());
    }
    arrayMap.get(name)?.set(idx, value);
  }

  for (const [key, value] of Object.entries(memory)) {
    const indexedMatch = key.match(/^(.+)\[(\d+)\]$/);
    if (indexedMatch) {
      const [, name, idx] = indexedMatch;
      upsertArrayCell(name, Number.parseInt(idx, 10), value);
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, idx) => {
        upsertArrayCell(key, idx, entry);
      });
      continue;
    }

    if (!value || typeof value !== 'object') {
      continue;
    }

    const numericEntries = Object.entries(value).filter(([entryKey]) => /^\d+$/.test(entryKey));
    for (const [entryKey, entryValue] of numericEntries) {
      upsertArrayCell(key, Number.parseInt(entryKey, 10), entryValue);
    }
  }

  return sortByName(
    Array.from(arrayMap.entries()).map(([name, values]) => ({
      name,
      cells: Array.from(values.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([idx, value]) => ({
          idx,
          value,
          active: false
        }))
    }))
  );
}

function toDisplayLabel(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;

  if (value && typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>;
    if ('data' in valueRecord) return toDisplayLabel(valueRecord.data);
    if ('val' in valueRecord) return toDisplayLabel(valueRecord.val);
    if ('value' in valueRecord) return toDisplayLabel(valueRecord.value);
  }

  return '{...}';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function flattenStructuredMemory(
  globalFrame: VisualizerFrame | null,
  stackFrames: VisualizerFrame[]
): Record<string, unknown> {
  const memory: Record<string, unknown> = {
    ...(globalFrame?.locals ?? {})
  };

  for (const frame of stackFrames) {
    for (const [key, value] of Object.entries(frame.locals)) {
      memory[`${frame.name}.${key}`] = value;
    }
  }

  return memory;
}

function normalizeRuntimeContract(
  runtime: TraceRuntimeSnapshot | undefined
): TraceRuntimeContract | null {
  if (!runtime || typeof runtime !== 'object') {
    return null;
  }

  const globalFrame = normalizeFrameValue('global', runtime.globals, true);
  const stackFrames = normalizeFrames(runtime.frames).filter((frame) => !frame.isGlobal);
  const explicitMemory = toObjectRecord(runtime.flatMemory);
  const memory =
    Object.keys(explicitMemory).length > 0
      ? explicitMemory
      : flattenStructuredMemory(globalFrame, stackFrames);

  if (
    stackFrames.length === 0 &&
    Object.keys(globalFrame?.locals ?? {}).length === 0 &&
    Object.keys(memory).length === 0
  ) {
    return null;
  }

  return {
    memory,
    globalFrame,
    stackFrames,
    heap: toObjectRecord(runtime.heap)
  };
}

function resolveTraceRuntimeContract(traceStep: TraceStep | null): TraceRuntimeContract {
  const structured = normalizeRuntimeContract(traceStep?.runtime);
  if (structured) {
    return structured;
  }

  const frames = normalizeFrames(traceStep?.stackFrames);
  const globalFrame = frames.find((frame) => frame.isGlobal) ?? null;
  const stackFrames = frames.filter((frame) => !frame.isGlobal);

  return {
    memory: toObjectRecord(traceStep?.memory),
    globalFrame,
    stackFrames,
    heap: {}
  };
}

function normalizeAddressKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim().replace(/^@/, '');
  }

  if (typeof value === 'object') {
    const record = asRecord(value);
    if (!record) return null;
    if ('addr' in record) return normalizeAddressKey(record.addr);
    if ('id' in record) return normalizeAddressKey(record.id);
  }

  return null;
}

function formatAddressLabel(key: string): string {
  return `@${key}`;
}

function pointerTargetKey(value: unknown, heap: Record<string, unknown>): string | null {
  const key = normalizeAddressKey(value);
  if (!key) return null;
  return key in heap ? key : null;
}

function isRenderableStructRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildStructField(
  fieldName: string,
  value: unknown,
  heap: Record<string, unknown>
): VisualizerStructField {
  const targetKey = pointerTargetKey(value, heap);
  return {
    name: fieldName,
    value,
    displayValue: targetKey ? formatAddressLabel(targetKey) : toDisplayLabel(value),
    isPointer: Boolean(targetKey),
    targetKey
  };
}

function collectInlineStructBlocks(
  globalFrame: VisualizerFrame | null,
  stackFrames: VisualizerFrame[],
  heap: Record<string, unknown>
): VisualizerStructBlock[] {
  const blocks: VisualizerStructBlock[] = [];

  const addStructBlock = (
    scopeLabel: string,
    ownerName: string,
    value: unknown,
    scope: 'global' | 'frame'
  ) => {
    if (!isRenderableStructRecord(value)) return;
    if (Object.keys(value).length === 0) return;

    blocks.push({
      key: `${scope}:${scopeLabel}.${ownerName}`,
      title: ownerName,
      addressLabel: scope === 'global' ? 'global' : scopeLabel,
      origin: 'inline',
      scopeLabel,
      isMalloc: false,
      fields: Object.entries(value).map(([fieldName, fieldValue]) =>
        buildStructField(fieldName, fieldValue, heap)
      )
    });
  };

  for (const [name, value] of Object.entries(globalFrame?.locals ?? {})) {
    addStructBlock('Global Scope', name, value, 'global');
  }

  for (const frame of stackFrames) {
    for (const [name, value] of Object.entries(frame.locals)) {
      addStructBlock(`${frame.name}()`, name, value, 'frame');
    }
  }

  return blocks;
}

function buildHeapStructBlocks(heap: Record<string, unknown>): VisualizerStructBlock[] {
  return Object.entries(heap)
    .flatMap(([key, value]) => {
      if (!isRenderableStructRecord(value)) {
        return [];
      }

      return [{
        key,
        title: 'malloc block',
        addressLabel: formatAddressLabel(key),
        origin: 'heap' as const,
        scopeLabel: 'Heap',
        isMalloc: true,
        fields: Object.entries(value).map(([fieldName, fieldValue]) =>
          buildStructField(fieldName, fieldValue, heap)
        )
      }];
    })
    .sort((left, right) => left.addressLabel.localeCompare(right.addressLabel, undefined, { numeric: true }));
}

function buildPointerRefs(
  globalFrame: VisualizerFrame | null,
  stackFrames: VisualizerFrame[],
  structBlocks: VisualizerStructBlock[],
  heap: Record<string, unknown>
): VisualizerPointerRef[] {
  const refs: VisualizerPointerRef[] = [];
  const heapLabels = new Map(structBlocks.map((block) => [block.key, block.addressLabel]));

  const pushRef = (
    owner: string,
    ownerType: 'global' | 'frame' | 'struct',
    fieldName: string,
    value: unknown
  ) => {
    const targetKey = pointerTargetKey(value, heap);
    if (!targetKey) return;

    refs.push({
      label: `${owner}.${fieldName} -> ${formatAddressLabel(targetKey)}`,
      targetKey,
      targetLabel: heapLabels.get(targetKey) ?? formatAddressLabel(targetKey),
      owner,
      ownerType,
      fieldName
    });
  };

  for (const [name, value] of Object.entries(globalFrame?.locals ?? {})) {
    pushRef('global', 'global', name, value);
  }

  for (const frame of stackFrames) {
    for (const [name, value] of Object.entries(frame.locals)) {
      pushRef(frame.name, 'frame', name, value);
    }
  }

  for (const block of structBlocks) {
    for (const field of block.fields) {
      if (field.isPointer) {
        refs.push({
          label: `${block.addressLabel}.${field.name} -> ${field.displayValue}`,
          targetKey: field.targetKey ?? '',
          targetLabel: field.displayValue,
          owner: block.addressLabel,
          ownerType: 'struct',
          fieldName: field.name
        });
      }
    }
  }

  return refs;
}

function toNextLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>;
    if (typeof valueRecord.addr === 'string') return valueRecord.addr;
    if (typeof valueRecord.id === 'string') return valueRecord.id;
  }

  return '{...}';
}

function parseLinkedNodes(memory: Record<string, unknown>): VisualizerLinkedNode[] {
  const nodes: VisualizerLinkedNode[] = [];

  for (const [key, value] of Object.entries(memory)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const valueRecord = value as Record<string, unknown>;
    if (!('next' in valueRecord) && !key.startsWith('node_')) {
      continue;
    }

    nodes.push({
      id: key.replace(/^node_/, ''),
      label: toDisplayLabel(valueRecord.data ?? valueRecord.val ?? valueRecord.value ?? value),
      next: toNextLabel(valueRecord.next),
      raw: value
    });
  }

  return nodes.sort((left, right) => left.id.localeCompare(right.id));
}

function buildLinkedLists(nodes: VisualizerLinkedNode[]): VisualizerLinkedList[] {
  if (nodes.length === 0) {
    return [];
  }

  const nodeByKey = new Map<string, VisualizerLinkedNode>();
  for (const node of nodes) {
    nodeByKey.set(node.id, node);
    nodeByKey.set(`node_${node.id}`, node);
  }

  const pointed = new Set<string>();
  for (const node of nodes) {
    if (node.next && nodeByKey.has(node.next)) {
      pointed.add(node.next);
    }
  }

  const heads = nodes.filter(
    (node) => !pointed.has(node.id) && !pointed.has(`node_${node.id}`)
  );
  const orderedHeads = heads.length > 0 ? heads : [nodes[0]];
  const consumed = new Set<string>();
  const lists: VisualizerLinkedList[] = [];

  for (const head of orderedHeads) {
    if (consumed.has(head.id)) continue;

    const chain: VisualizerLinkedListNode[] = [];
    let current: VisualizerLinkedNode | undefined = head;
    while (current && !consumed.has(current.id)) {
      const currentNext = current.next;
      const currentNextKey =
        currentNext && nodeByKey.has(currentNext) ? nodeByKey.get(currentNext)?.id ?? null : null;
      const currentRaw = asRecord(current.raw) ?? {};

      chain.push({
        key: current.id,
        label: current.label,
        nextKey: currentNextKey,
        addressLabel: formatAddressLabel(current.id),
        fields: Object.entries(currentRaw).map(([fieldName, fieldValue]) => ({
          name: fieldName,
          value: fieldValue,
          displayValue: toDisplayLabel(fieldValue),
          isPointer: fieldName === 'next' && Boolean(currentNextKey),
          targetKey: fieldName === 'next' ? currentNextKey : null
        }))
      });
      consumed.add(current.id);

      if (!current.next) {
        break;
      }
      current = nodeByKey.get(current.next);
    }

    if (chain.length > 0) {
      lists.push({
        id: `list-${lists.length + 1}`,
        nodes: chain
      });
    }
  }

  for (const node of nodes) {
    if (consumed.has(node.id)) continue;
    lists.push({
      id: `list-${lists.length + 1}`,
      nodes: [
        {
          key: node.id,
          label: node.label,
          nextKey: null,
          addressLabel: formatAddressLabel(node.id),
          fields: Object.entries(asRecord(node.raw) ?? {}).map(([fieldName, fieldValue]) => ({
            name: fieldName,
            value: fieldValue,
            displayValue: toDisplayLabel(fieldValue),
            isPointer: false,
            targetKey: null
          }))
        }
      ]
    });
  }

  return lists;
}

function resolveNodeKey(
  value: unknown,
  aliases: Map<string, string>
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    const record = asRecord(value);
    if (record) {
      if (typeof record.addr === 'string' || typeof record.addr === 'number') {
        return resolveNodeKey(record.addr, aliases);
      }
      if (typeof record.id === 'string' || typeof record.id === 'number') {
        return resolveNodeKey(record.id, aliases);
      }
    }
  }

  const raw = String(value);
  return aliases.get(raw) ?? aliases.get(raw.replace(/^node_/, '')) ?? null;
}

function buildTrees(entries: VisualizerMemoryEntry[]): VisualizerTree[] {
  const candidates = entries
    .map((entry) => {
      const record = asRecord(entry.value);
      if (!record) return null;
      if (!('left' in record) && !('right' in record)) return null;

      return {
        key: entry.key,
        id: entry.key.replace(/^node_/, ''),
        label: toDisplayLabel(record.data ?? record.val ?? record.value ?? record.key ?? record),
        record
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (candidates.length === 0) {
    return [];
  }

  const aliases = new Map<string, string>();
  for (const node of candidates) {
    aliases.set(node.key, node.key);
    aliases.set(node.id, node.key);
  }

  const nodes = candidates.map((entry) => ({
    key: entry.key,
    label: entry.label,
    leftKey: resolveNodeKey(entry.record.left, aliases),
    rightKey: resolveNodeKey(entry.record.right, aliases)
  }));

  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const pointed = new Set<string>();
  for (const node of nodes) {
    if (node.leftKey) pointed.add(node.leftKey);
    if (node.rightKey) pointed.add(node.rightKey);
  }

  const roots = nodes.filter((node) => !pointed.has(node.key));
  const orderedRoots = roots.length > 0 ? roots : [nodes[0]];
  const consumed = new Set<string>();
  const trees: VisualizerTree[] = [];

  for (const root of orderedRoots) {
    if (consumed.has(root.key)) continue;

    const levels: Array<Array<VisualizerTreeNode | null>> = [];
    let currentLevel: Array<string | null> = [root.key];
    let depth = 0;

    while (currentLevel.some(Boolean) && depth < 6) {
      const levelNodes: Array<VisualizerTreeNode | null> = [];
      const nextLevel: Array<string | null> = [];

      for (const key of currentLevel) {
        if (!key) {
          levelNodes.push(null);
          nextLevel.push(null, null);
          continue;
        }

        const node = nodeByKey.get(key) ?? null;
        if (!node) {
          levelNodes.push(null);
          nextLevel.push(null, null);
          continue;
        }

        levelNodes.push(node);
        consumed.add(node.key);
        nextLevel.push(node.leftKey, node.rightKey);
      }

      levels.push(levelNodes);
      currentLevel = nextLevel;
      depth += 1;
    }

    if (levels.length > 0) {
      trees.push({
        id: `tree-${trees.length + 1}`,
        levels
      });
    }
  }

  return trees;
}

function normalizeMemoryEntries(memory: Record<string, unknown>): VisualizerMemoryEntry[] {
  return Object.entries(memory)
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function mergeMemoryEntries(
  primary: VisualizerMemoryEntry[],
  secondary: VisualizerMemoryEntry[]
): VisualizerMemoryEntry[] {
  const merged = new Map<string, VisualizerMemoryEntry>();

  for (const entry of [...primary, ...secondary]) {
    if (!merged.has(entry.key)) {
      merged.set(entry.key, entry);
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.key.localeCompare(right.key)
  );
}

function toIndexedValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .filter(([key]) => /^\d+$/.test(key))
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([, entryValue]) => entryValue);
}

function lookupNamedValue(
  name: string,
  globalFrame: VisualizerFrame | null,
  frames: VisualizerFrame[],
  entries: VisualizerMemoryEntry[]
): unknown {
  const globals = globalFrame?.locals ?? {};
  if (name in globals) {
    return globals[name];
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const locals = frames[index]?.locals ?? {};
    if (name in locals) {
      return locals[name];
    }
  }

  const direct = entries.find((entry) => entry.key === name);
  if (direct) return direct.value;

  return entries.find((entry) => entry.key.endsWith(`.${name}`))?.value;
}

function buildStackContract(
  globalFrame: VisualizerFrame | null,
  frames: VisualizerFrame[],
  entries: VisualizerMemoryEntry[]
): VisualizerLinearStructure {
  const stack = toIndexedValues(lookupNamedValue('stack', globalFrame, frames, entries));
  const top = lookupNamedValue('top', globalFrame, frames, entries);

  if (stack.length === 0) {
    return { name: 'stack', values: [] };
  }

  if (typeof top === 'number' && Number.isInteger(top)) {
    return {
      name: 'stack',
      values: stack.slice(0, Math.max(0, top + 1))
    };
  }

  return { name: 'stack', values: stack };
}

function buildQueueContract(
  globalFrame: VisualizerFrame | null,
  frames: VisualizerFrame[],
  entries: VisualizerMemoryEntry[]
): VisualizerLinearStructure {
  const queue = toIndexedValues(lookupNamedValue('queue', globalFrame, frames, entries));
  const front = lookupNamedValue('front', globalFrame, frames, entries);
  const rear = lookupNamedValue('rear', globalFrame, frames, entries);

  if (queue.length === 0) {
    return { name: 'queue', values: [] };
  }

  if (
    typeof front === 'number' &&
    Number.isInteger(front) &&
    typeof rear === 'number' &&
    Number.isInteger(rear)
  ) {
    if (rear >= front) {
      return {
        name: 'queue',
        values: queue.slice(Math.max(0, front), Math.min(queue.length, rear + 1))
      };
    }

    return {
      name: 'queue',
      values: [
        ...queue.slice(Math.max(0, front)),
        ...queue.slice(0, Math.min(queue.length, rear + 1))
      ]
    };
  }

  return { name: 'queue', values: queue };
}

function toGraphNodeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const record = asRecord(value);
  if (!record) return null;

  if (typeof record.id === 'string' || typeof record.id === 'number') return String(record.id);
  if (typeof record.key === 'string' || typeof record.key === 'number') return String(record.key);
  if (typeof record.addr === 'string' || typeof record.addr === 'number') return String(record.addr);

  return null;
}

function toGraphNeighbors(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toGraphNodeId(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const direct = toGraphNodeId(value);
  if (direct) return [direct];

  const record = asRecord(value);
  if (!record) return [];

  if (Array.isArray(record.neighbors)) {
    return toGraphNeighbors(record.neighbors);
  }
  if (Array.isArray(record.neighbours)) {
    return toGraphNeighbors(record.neighbours);
  }
  if (Array.isArray(record.to)) {
    return toGraphNeighbors(record.to);
  }
  if (Array.isArray(record.adj)) {
    return toGraphNeighbors(record.adj);
  }

  const numericKeys = Object.keys(record).filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    return numericKeys
      .map((key) => toGraphNodeId(record[key]))
      .filter((entry): entry is string => Boolean(entry));
  }

  return [];
}

function buildGraphs(entries: VisualizerMemoryEntry[]): VisualizerGraph[] {
  const GRAPH_KEY_PATTERN = /\b(adj|graph|edge|edges|neighbor|neighbour)\b/i;
  const graphs: VisualizerGraph[] = [];

  for (const entry of entries) {
    if (!GRAPH_KEY_PATTERN.test(entry.key)) {
      continue;
    }

    const nodeSet = new Set<string>();
    const edgeSet = new Set<string>();
    const edges: VisualizerGraphEdge[] = [];

    const addEdge = (from: string, to: string) => {
      if (!from || !to) return;
      const edgeKey = `${from}=>${to}`;
      if (edgeSet.has(edgeKey)) return;
      edgeSet.add(edgeKey);
      nodeSet.add(from);
      nodeSet.add(to);
      edges.push({ from, to });
    };

    if (Array.isArray(entry.value)) {
      const rows = entry.value;
      for (let index = 0; index < rows.length; index += 1) {
        const from = String(index);
        const row = rows[index];

        if (Array.isArray(row)) {
          const isBooleanMatrix = row.every(
            (cell) => typeof cell === 'number' || typeof cell === 'boolean'
          );
          if (isBooleanMatrix) {
            row.forEach((cell, cellIndex) => {
              if (Boolean(cell)) {
                addEdge(from, String(cellIndex));
              }
            });
            continue;
          }
        }

        const neighbors = toGraphNeighbors(row);
        neighbors.forEach((neighbor) => addEdge(from, neighbor));
      }
    } else {
      const record = asRecord(entry.value);
      if (!record) continue;

      for (const [fromRaw, neighborValue] of Object.entries(record)) {
        const from = String(fromRaw);
        const neighbors = toGraphNeighbors(neighborValue);
        neighbors.forEach((neighbor) => addEdge(from, neighbor));
      }
    }

    if (edges.length === 0 || nodeSet.size < 2) {
      continue;
    }

    const nodes = Array.from(nodeSet)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((id) => ({ id, label: id }));

    graphs.push({
      id: `graph:${entry.key}`,
      label: entry.key,
      directed: true,
      nodes,
      edges
    });
  }

  return graphs;
}

function pickDetectedMode(
  hasArrayData: boolean,
  hasLinkedListData: boolean,
  hasStackData: boolean,
  hasTreeData: boolean,
  hasGraphData: boolean
): VisualizerDetectedMode {
  if (hasGraphData) return 'graph';
  if (hasTreeData) return 'tree';
  if (hasLinkedListData) return 'linkedlist';
  if (hasStackData) return 'stack';
  if (hasArrayData) return 'array';
  return 'unknown';
}

function pickFallbackReason(
  traceStep: TraceStep | null,
  hasRenderableData: boolean,
  memoryEntries: VisualizerMemoryEntry[],
  registers: Record<string, number>,
  stackFrames: VisualizerFrame[],
  globalFrame: VisualizerFrame | null
): string | null {
  if (!traceStep) {
    return 'Awaiting trace data.';
  }

  if (hasRenderableData) {
    return null;
  }

  if (
    memoryEntries.length === 0 &&
    Object.keys(registers).length === 0 &&
    stackFrames.length === 0 &&
    (!globalFrame || Object.keys(globalFrame.locals).length === 0)
  ) {
    return 'No runtime state was captured for this step.';
  }

  return 'No structure inferred from runtime data.';
}

export function normalizeTraceStep(traceStep: TraceStep | null): NormalizedTraceState {
  const { memory, globalFrame, stackFrames, heap } = resolveTraceRuntimeContract(traceStep);
  const arrays = parseArrays(memory);
  const linkedNodes = parseLinkedNodes(memory);
  const memoryEntries = normalizeMemoryEntries(memory);
  const heapEntries = normalizeMemoryEntries(heap);
  const structureEntries = mergeMemoryEntries(heapEntries, memoryEntries);
  const linkedLists = buildLinkedLists(linkedNodes);
  const trees = buildTrees(structureEntries);
  const structBlocks = [
    ...buildHeapStructBlocks(heap),
    ...collectInlineStructBlocks(globalFrame, stackFrames, heap)
  ];
  const pointerRefs = buildPointerRefs(globalFrame, stackFrames, structBlocks, heap);
  const stack = buildStackContract(globalFrame, stackFrames, memoryEntries);
  const queue = buildQueueContract(globalFrame, stackFrames, memoryEntries);
  const graphs = buildGraphs(memoryEntries);
  const registers = traceStep?.registers ?? {};

  const hasArrayData = arrays.length > 0;
  const hasLinkedListData = linkedLists.length > 0;
  const hasStackData = stack.values.length > 0;
  const hasTreeData = trees.length > 0;
  const hasQueueData = queue.values.length > 0;
  const hasGraphData = graphs.length > 0;
  const hasRenderableData =
    hasArrayData ||
    hasLinkedListData ||
    hasStackData ||
    hasQueueData ||
    hasTreeData ||
    hasGraphData ||
    stackFrames.length > 0 ||
    Boolean(globalFrame && Object.keys(globalFrame.locals).length > 0) ||
    memoryEntries.length > 0;

  return {
    arrays,
    linkedNodes,
    linkedLists,
    trees,
    structBlocks,
    pointerRefs,
    stack,
    queue,
    graphs,
    globalFrame,
    stackFrames,
    registers,
    memoryEntries,
    heapEntries,
    detectedMode: pickDetectedMode(
      hasArrayData,
      hasLinkedListData,
      hasStackData,
      hasTreeData,
      hasGraphData
    ),
    hasArrayData,
    hasLinkedListData,
    hasStackData,
    hasTreeData,
    hasQueueData,
    hasGraphData,
    hasRenderableData,
    fallbackReason: pickFallbackReason(
      traceStep,
      hasRenderableData,
      memoryEntries,
      registers,
      stackFrames,
      globalFrame
    )
  };
}
