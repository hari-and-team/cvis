export type ProgramIntentType =
  | 'sorting'
  | 'searching'
  | 'linked-list'
  | 'stack'
  | 'queue'
  | 'tree'
  | 'graph'
  | 'dynamic-programming'
  | 'recursion'
  | 'matrix'
  | 'generic';

export type IntentVisualizationMode = 'array' | 'linkedlist' | 'stack' | 'tree' | 'graph';

export interface ProgramIntentCandidate {
  intent: ProgramIntentType;
  label: string;
  score: number;
}

export interface ProgramIntentPrediction {
  primaryIntent: ProgramIntentType;
  primaryLabel: string;
  confidence: number; // 0..1
  matchedSignals: string[];
  candidates: ProgramIntentCandidate[];
}

interface IntentProfile {
  intent: ProgramIntentType;
  label: string;
  keywords: string[];
  patterns: Array<{ regex: RegExp; weight: number; signal: string }>;
}

const PROFILES: IntentProfile[] = [
  {
    intent: 'sorting',
    label: 'Sorting',
    keywords: [
      'sort',
      'quicksort',
      'mergesort',
      'heapsort',
      'bubblesort',
      'insertionsort',
      'selectionsort',
      'partition',
      'swap'
    ],
    patterns: [
      { regex: /\bfor\s*\([^)]*\)\s*\{[\s\S]{0,240}\bfor\s*\(/, weight: 2, signal: 'nested-loops' },
      { regex: /\b(a|arr|array)\s*\[[^\]]+\]\s*[<>]=?\s*(a|arr|array)\s*\[[^\]]+\]/, weight: 2, signal: 'array-compare' }
    ]
  },
  {
    intent: 'searching',
    label: 'Searching',
    keywords: ['search', 'binary', 'linear', 'target', 'key', 'mid', 'lower_bound', 'upper_bound'],
    patterns: [
      { regex: /\b(mid|low|high)\b/, weight: 1.5, signal: 'mid-low-high' },
      { regex: /\bwhile\s*\(\s*low\s*<=\s*high\s*\)/, weight: 2.5, signal: 'binary-search-loop' }
    ]
  },
  {
    intent: 'linked-list',
    label: 'Linked List',
    keywords: ['linked list', 'node', 'next', 'prev', 'head', 'tail'],
    patterns: [
      { regex: /\bstruct\s+\w+\s*\{[\s\S]*\*\s*next\s*;/, weight: 3, signal: 'node-next-struct' },
      { regex: /\b(head|tail)\s*=\s*(head|tail)->next/, weight: 2, signal: 'head-tail-next-hop' }
    ]
  },
  {
    intent: 'stack',
    label: 'Stack',
    keywords: ['stack', 'push', 'pop', 'peek', 'top', 'lifo'],
    patterns: [
      { regex: /\b(top|sp)\s*[\+\-]{2}/, weight: 2, signal: 'top-pointer-shift' },
      { regex: /\bpush\s*\(|\bpop\s*\(/, weight: 2, signal: 'push-pop-api' }
    ]
  },
  {
    intent: 'queue',
    label: 'Queue',
    keywords: ['queue', 'enqueue', 'dequeue', 'front', 'rear', 'fifo'],
    patterns: [
      { regex: /\b(front|rear)\s*=\s*\(.*\)\s*%\s*\w+/, weight: 2, signal: 'circular-queue-index' },
      { regex: /\benqueue\s*\(|\bdequeue\s*\(/, weight: 2, signal: 'enqueue-dequeue-api' }
    ]
  },
  {
    intent: 'tree',
    label: 'Tree / BST',
    keywords: ['tree', 'bst', 'avl', 'inorder', 'preorder', 'postorder', 'left', 'right'],
    patterns: [
      { regex: /\bstruct\s+\w+\s*\{[\s\S]*\*\s*left\s*;[\s\S]*\*\s*right\s*;/, weight: 3, signal: 'left-right-struct' },
      { regex: /\b(root|node)->(left|right)/, weight: 2, signal: 'tree-child-navigation' }
    ]
  },
  {
    intent: 'graph',
    label: 'Graph',
    keywords: ['graph', 'vertex', 'edge', 'adjacency', 'adj', 'bfs', 'dfs', 'dijkstra', 'topological'],
    patterns: [
      { regex: /\bvector\s*<\s*vector\s*<\s*int\s*>\s*>\s*\w+/, weight: 2.5, signal: 'adjacency-vector' },
      { regex: /\bfor\s*\(\s*.*\s*:\s*adj\[/, weight: 2, signal: 'adjacency-iteration' }
    ]
  },
  {
    intent: 'dynamic-programming',
    label: 'Dynamic Programming',
    keywords: ['dp', 'memo', 'tabulation', 'knapsack', 'lcs', 'lis', 'state', 'transition'],
    patterns: [
      { regex: /\bdp\s*\[[^\]]+\]/, weight: 2.5, signal: 'dp-array' },
      { regex: /\bmemo\s*\(|\bmemset\s*\(\s*dp/, weight: 2, signal: 'dp-memo-init' }
    ]
  },
  {
    intent: 'recursion',
    label: 'Recursion',
    keywords: ['recursive', 'base case'],
    patterns: [
      { regex: /\breturn\s+\w+\s*\([^)]*\)\s*[+\-*/]\s*\w+\s*\(/, weight: 2, signal: 'recursive-combination' },
      { regex: /\bif\s*\([^)]*\)\s*return\b/, weight: 1, signal: 'base-case-guard' }
    ]
  },
  {
    intent: 'matrix',
    label: 'Matrix / Grid',
    keywords: ['matrix', 'grid', 'row', 'col', 'rows', 'cols'],
    patterns: [
      { regex: /\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/, weight: 2, signal: '2d-indexing' },
      { regex: /\bfor\s*\([^)]*\)\s*\{[\s\S]{0,180}\bfor\s*\([^)]*\)\s*\{[\s\S]{0,180}\[[^\]]+\]\[[^\]]+\]/, weight: 2.5, signal: 'nested-grid-loop' }
    ]
  }
];

const LABEL_BY_INTENT: Record<ProgramIntentType, string> = {
  sorting: 'Sorting',
  searching: 'Searching',
  'linked-list': 'Linked List',
  stack: 'Stack',
  queue: 'Queue',
  tree: 'Tree / BST',
  graph: 'Graph',
  'dynamic-programming': 'Dynamic Programming',
  recursion: 'Recursion',
  matrix: 'Matrix / Grid',
  generic: 'Generic Algorithm'
};

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWord(source: string, keyword: string): boolean {
  if (keyword.includes(' ')) {
    return source.includes(keyword);
  }
  const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`);
  return regex.test(source);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreSource(source: string): ProgramIntentCandidate[] {
  const candidates: ProgramIntentCandidate[] = [];

  for (const profile of PROFILES) {
    let score = 0;

    for (const keyword of profile.keywords) {
      if (containsWord(source, keyword)) {
        score += keyword.length > 8 ? 1.5 : 1;
      }
    }

    for (const pattern of profile.patterns) {
      if (pattern.regex.test(source)) {
        score += pattern.weight;
      }
    }

    if (score > 0) {
      candidates.push({
        intent: profile.intent,
        label: profile.label,
        score
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function collectSignals(source: string, intent: ProgramIntentType): string[] {
  const profile = PROFILES.find((entry) => entry.intent === intent);
  if (!profile) return [];

  const signals: string[] = [];
  for (const keyword of profile.keywords) {
    if (containsWord(source, keyword)) {
      signals.push(keyword);
    }
    if (signals.length >= 6) break;
  }

  if (signals.length < 6) {
    for (const pattern of profile.patterns) {
      if (pattern.regex.test(source)) {
        signals.push(pattern.signal);
      }
      if (signals.length >= 6) break;
    }
  }

  return signals;
}

export function predictProgramIntent(code: string): ProgramIntentPrediction {
  const normalized = stripCommentsAndStrings(code).toLowerCase();
  const candidates = scoreSource(normalized);

  if (candidates.length === 0) {
    return {
      primaryIntent: 'generic',
      primaryLabel: LABEL_BY_INTENT.generic,
      confidence: 0.35,
      matchedSignals: [],
      candidates: [{ intent: 'generic', label: LABEL_BY_INTENT.generic, score: 1 }]
    };
  }

  const [best, second] = candidates;
  const secondScore = second?.score ?? 0;
  const topScore = best.score;
  const gapScore = Math.max(0, topScore - secondScore);
  const confidence = clamp(
    0.4 + topScore / (topScore + 6) * 0.35 + gapScore / (topScore + secondScore + 2) * 0.25,
    0.4,
    0.98
  );

  return {
    primaryIntent: best.intent,
    primaryLabel: best.label,
    confidence,
    matchedSignals: collectSignals(normalized, best.intent),
    candidates: candidates.slice(0, 4)
  };
}

export function intentToVisualizerMode(intent: ProgramIntentType): IntentVisualizationMode {
  if (intent === 'linked-list') return 'linkedlist';
  if (intent === 'stack' || intent === 'queue') return 'stack';
  if (intent === 'tree') return 'tree';
  if (intent === 'graph') return 'graph';
  return 'array';
}
