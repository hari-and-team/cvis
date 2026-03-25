import type { TraceStep } from '$lib/types';

export interface DynamicAnalysisReport {
  hasTrace: boolean;
  primaryType: string | null;
  implementationStyle: string | null;
  accessPattern: string | null;
  confidence: number;
  summary: string;
  signals: string[];
  observations: string[];
  executedLineCount: number;
  stepCount: number;
  maxCallDepth: number;
}

interface CandidateMatch {
  type: string;
  implementationStyle: string | null;
  accessPattern: string | null;
  score: number;
  signals: string[];
  observations: string[];
  summary: string;
}

export function analyzeDynamicBehavior(code: string, steps: TraceStep[]): DynamicAnalysisReport {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      hasTrace: false,
      primaryType: null,
      implementationStyle: null,
      accessPattern: null,
      confidence: 0,
      summary: 'Trace the program once to unlock runtime-based DSA recognition.',
      signals: [],
      observations: [],
      executedLineCount: 0,
      stepCount: 0,
      maxCallDepth: 0
    };
  }

  const lines = code.split('\n');
  const executedLines = new Map<number, number>();
  const globalSnapshots: Array<Record<string, unknown>> = [];
  let maxCallDepth = 0;
  let hasRecursiveFrame = false;

  for (const step of steps) {
    if (typeof step.lineNo === 'number' && step.lineNo > 0) {
      executedLines.set(step.lineNo, (executedLines.get(step.lineNo) ?? 0) + 1);
    }

    const frames = Array.isArray(step.runtime?.frames) ? step.runtime.frames : [];
    maxCallDepth = Math.max(maxCallDepth, frames.length);
    const names = frames
      .map((frame) => (typeof frame?.name === 'string' ? frame.name : ''))
      .filter(Boolean);
    if (new Set(names).size !== names.length) {
      hasRecursiveFrame = true;
    }

    if (step.runtime?.globals && typeof step.runtime.globals === 'object') {
      globalSnapshots.push(step.runtime.globals as Record<string, unknown>);
    }
  }

  const executedLineEntries = Array.from(executedLines.entries())
    .map(([lineNo, hitCount]) => ({
      lineNo,
      hitCount,
      text: lines[lineNo - 1]?.trim() ?? ''
    }))
    .filter((entry) => entry.text.length > 0);

  const matches = [
    detectStackBehavior(lines, executedLineEntries, globalSnapshots),
    detectQueueBehavior(lines, executedLineEntries, globalSnapshots),
    detectTreeBehavior(executedLineEntries, hasRecursiveFrame),
    detectRecursionBehavior(executedLineEntries, hasRecursiveFrame, maxCallDepth)
  ].filter((candidate): candidate is CandidateMatch => candidate !== null);

  const best = matches.sort((a, b) => b.score - a.score)[0] ?? null;
  if (!best) {
    return {
      hasTrace: true,
      primaryType: null,
      implementationStyle: null,
      accessPattern: null,
      confidence: 0.24,
      summary: 'The current trace did not expose a strong runtime fingerprint yet.',
      signals: [],
      observations: [
        `Traced ${steps.length} steps across ${executedLineEntries.length} executed lines.`,
        'Try tracing a path that exercises the main operations to reveal stronger behavior.'
      ],
      executedLineCount: executedLineEntries.length,
      stepCount: steps.length,
      maxCallDepth
    };
  }

  return {
    hasTrace: true,
    primaryType: best.type,
    implementationStyle: best.implementationStyle,
    accessPattern: best.accessPattern,
    confidence: clamp(best.score / 10, 0.35, 0.98),
    summary: best.summary,
    signals: best.signals.slice(0, 5),
    observations: best.observations.slice(0, 4),
    executedLineCount: executedLineEntries.length,
    stepCount: steps.length,
    maxCallDepth
  };
}

function detectStackBehavior(
  lines: string[],
  executed: Array<{ lineNo: number; hitCount: number; text: string }>,
  globalSnapshots: Array<Record<string, unknown>>
): CandidateMatch | null {
  const pushLines = executed.filter((entry) =>
    /\[\s*(\+\+|--)\s*[A-Za-z_]\w*|[A-Za-z_]\w*\s*(\+\+|--)\s*\]\s*=/.test(entry.text)
  );
  const popLines = executed.filter((entry) =>
    /\[[^\]]*(\+\+|--)[^\]]*\]/.test(entry.text) && !/\]\s*=/.test(entry.text)
  );
  const reverseTraversal = executed.some((entry) =>
    /for\s*\([^;]+;[^;]+>=\s*0;[^)]*--/.test(entry.text)
  );
  const hasUnderflowGuard = lines.some((line) => /<\s*0|==\s*-?1/.test(line) && /if\s*\(/.test(line));
  const hasOverflowGuard = lines.some((line) => />=\s*[^;]+-\s*1/.test(line) && /if\s*\(/.test(line));
  const scalarDelta = findScalarDeltaEvidence(globalSnapshots);
  const pointerLikeDelta = scalarDelta.find((entry) => entry.incrementSteps > 0 && entry.decrementSteps > 0);
  const capacityArray = lines.some((line) => /\[[A-Z_][A-Z0-9_]*\]/.test(line));

  let score = 0;
  const signals: string[] = [];
  const observations: string[] = [];

  if (pushLines.length > 0) {
    score += 3;
    signals.push('Executed a push-like line that writes through an incremented index.');
  }

  if (popLines.length > 0) {
    score += 3;
    signals.push('Executed a pop-like line that reads through a decrementing index.');
  }

  if (pointerLikeDelta) {
    score += 2;
    signals.push(`Runtime state shows ${pointerLikeDelta.name} moving by one in both directions.`);
  }

  if (hasUnderflowGuard) {
    score += 1;
    observations.push('The traced code includes an empty-stack guard before removal.');
  }

  if (hasOverflowGuard) {
    score += 1;
    observations.push('The traced code includes a capacity guard before insertion.');
  }

  if (reverseTraversal) {
    score += 1;
    observations.push('The display path iterates from the current marker down to the base, which matches LIFO output.');
  }

  if (capacityArray) {
    observations.push('The state is stored in a fixed-size array, which points to a static array implementation.');
  }

  if (score < 5) {
    return null;
  }

  return {
    type: 'Stack',
    implementationStyle: capacityArray ? 'Static array stack' : 'Stack-like indexed storage',
    accessPattern: 'LIFO',
    score,
    signals,
    observations,
    summary:
      'This trace behaves like a stack: one marker moves up for insertions, down for removals, and the active contents are read back in LIFO order.'
  };
}

function detectQueueBehavior(
  lines: string[],
  executed: Array<{ lineNo: number; hitCount: number; text: string }>,
  globalSnapshots: Array<Record<string, unknown>>
): CandidateMatch | null {
  const mentionsFront = lines.some((line) => /\bfront\b/.test(line));
  const mentionsRear = lines.some((line) => /\brear\b/.test(line));
  const wrapAround = lines.some((line) => /%\s*[A-Za-z_]\w*/.test(line));
  const scalarDelta = findScalarDeltaEvidence(globalSnapshots);
  const frontMove = scalarDelta.find((entry) => entry.name === 'front');
  const rearMove = scalarDelta.find((entry) => entry.name === 'rear');
  const queueOps = executed.filter((entry) => /\b(enqueue|dequeue)\b/.test(entry.text)).length;

  let score = 0;
  const signals: string[] = [];
  const observations: string[] = [];

  if (mentionsFront && mentionsRear) {
    score += 3;
    signals.push('The code keeps separate front and rear positions.');
  }

  if (frontMove && rearMove) {
    score += 3;
    signals.push('Runtime state shows both front and rear changing independently.');
  }

  if (wrapAround) {
    score += 2;
    observations.push('Modulo-based index movement suggests a circular queue.');
  }

  if (queueOps > 0) {
    score += 1;
    observations.push('Executed line names also line up with queue-style operations.');
  }

  if (score < 5) {
    return null;
  }

  return {
    type: 'Queue',
    implementationStyle: wrapAround ? 'Circular array queue' : 'Queue-like indexed storage',
    accessPattern: 'FIFO',
    score,
    signals,
    observations,
    summary:
      'This trace behaves like a queue: insertion and removal move through different positions, which matches FIFO behavior.'
  };
}

function detectTreeBehavior(
  executed: Array<{ lineNo: number; hitCount: number; text: string }>,
  hasRecursiveFrame: boolean
): CandidateMatch | null {
  const childNavigationCount = executed.filter((entry) => /->(left|right)|\.(left|right)/.test(entry.text)).length;
  const traversalCount = executed.filter((entry) => /\b(inorder|preorder|postorder)\b/.test(entry.text)).length;
  const score = childNavigationCount * 2 + traversalCount + (hasRecursiveFrame ? 2 : 0);

  if (score < 5) {
    return null;
  }

  return {
    type: 'Tree / BST',
    implementationStyle: 'Pointer-based node tree',
    accessPattern: 'Recursive traversal',
    score,
    signals: [
      'Executed lines navigate left/right child links.',
      hasRecursiveFrame ? 'The call stack shows recursive descent during the trace.' : 'Traversal-style function flow appears in the trace.'
    ],
    observations: [],
    summary:
      'This trace behaves like a tree traversal or tree update path, with child navigation and recursive call flow.'
  };
}

function detectRecursionBehavior(
  executed: Array<{ lineNo: number; hitCount: number; text: string }>,
  hasRecursiveFrame: boolean,
  maxCallDepth: number
): CandidateMatch | null {
  const selfCallHints = executed.filter((entry) => /\breturn\s+\w+\s*\([^)]*\)/.test(entry.text)).length;
  const score = (hasRecursiveFrame ? 4 : 0) + (maxCallDepth > 1 ? 2 : 0) + Math.min(selfCallHints, 2);

  if (score < 5) {
    return null;
  }

  return {
    type: 'Recursion',
    implementationStyle: 'Recursive call flow',
    accessPattern: 'Depth-first',
    score,
    signals: [
      'The trace reaches repeated function frames on the call stack.',
      `Maximum runtime call depth reached ${maxCallDepth}.`
    ],
    observations: [],
    summary:
      'This trace shows recursive behavior: the same function shape re-enters through deeper call frames.'
  };
}

function findScalarDeltaEvidence(snapshots: Array<Record<string, unknown>>) {
  const names = new Set<string>();
  for (const snapshot of snapshots) {
    for (const [name, value] of Object.entries(snapshot)) {
      if (typeof value === 'number') {
        names.add(name);
      }
    }
  }

  return Array.from(names).map((name) => {
    let incrementSteps = 0;
    let decrementSteps = 0;

    for (let i = 1; i < snapshots.length; i += 1) {
      const prev = snapshots[i - 1]?.[name];
      const next = snapshots[i]?.[name];
      if (typeof prev !== 'number' || typeof next !== 'number') continue;
      if (next - prev === 1) incrementSteps += 1;
      if (next - prev === -1) decrementSteps += 1;
    }

    return {
      name,
      incrementSteps,
      decrementSteps
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
