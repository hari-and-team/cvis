import {
  containsWord,
  countRegexMatches,
  escapeRegExp,
  extractCodeFeatures,
  type CodeFeatureSnapshot
} from '$lib/visualizer/code-features';

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

export type ProgramTechniqueTag =
  | 'two-pointers'
  | 'sliding-window'
  | 'binary-search'
  | 'dfs'
  | 'bfs'
  | 'hashing'
  | 'greedy'
  | 'recursion'
  | 'dynamic-programming'
  | 'matrix-traversal'
  | 'linked-list'
  | 'stack'
  | 'queue'
  | 'tree'
  | 'graph'
  | 'sorting';

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
  techniques: ProgramTechniqueTag[];
  candidates: ProgramIntentCandidate[];
}

interface IntentProfile {
  intent: ProgramIntentType;
  label: string;
  keywords: string[];
  patterns: Array<{ regex: RegExp; weight: number; signal: string }>;
}

interface TechniqueProfile {
  tag: ProgramTechniqueTag;
  label: string;
  keywords: string[];
  patterns: Array<{ regex: RegExp; weight: number }>;
}

const SIGNAL_EXPLANATIONS: Record<string, string> = {
  'nested-loops': 'uses an outer loop plus an inner loop, so items are revisited repeatedly',
  'array-compare': 'compares array values while scanning for order or position',
  'mid-low-high': 'tracks the search window with `low`, `mid`, and `high`',
  'binary-search-loop': 'shrinks the search window with `low <= high`',
  'node-next-struct': 'defines linked-list nodes with a `next` pointer',
  'head-tail-next-hop': 'moves from one node to the next through `head` or `tail`',
  'stack-top-index': 'tracks stack position with `top` or `tos`',
  'stack-empty-check': 'checks whether the stack is empty before removing an item',
  'stack-full-check': 'checks whether the stack is full before adding an item',
  'top-pointer-shift': 'moves the stack top pointer up or down',
  'push-pop-api': 'uses push/pop-style stack operations',
  'circular-queue-index': 'wraps queue indices with modulo arithmetic',
  'enqueue-dequeue-api': 'uses enqueue/dequeue queue operations',
  'left-right-struct': 'stores left and right child pointers',
  'tree-child-navigation': 'walks through left and right children',
  'adjacency-vector': 'stores neighbors in adjacency lists',
  'adjacency-iteration': 'iterates over neighbors from an adjacency list',
  'dp-array': 'stores subproblem results in a `dp` table',
  'dp-memo-init': 'initializes memoization storage',
  'recursive-combination': 'combines recursive subresults',
  'base-case-guard': 'stops recursion with a base case',
  '2d-indexing': 'accesses grid cells with row and column indices',
  'nested-grid-loop': 'scans a grid with nested row and column loops',
  'stack-api': 'calls stack helper functions such as push and pop',
  'queue-api': 'calls queue helper functions such as enqueue and dequeue',
  'list-api': 'calls linked-list helper functions',
  'tree-api': 'calls tree helper functions',
  'graph-api': 'calls graph traversal helpers',
  'sorting-api': 'calls sorting helpers',
  'search-api': 'calls search helpers',
  'helper-api': 'uses a helper function for recursion'
};

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
    keywords: ['stack', 'push', 'pop', 'peek', 'top', 'overflow', 'underflow', 'lifo'],
    patterns: [
      { regex: /\b\w+\s*\[\s*(top|tos)\s*\]/, weight: 2, signal: 'stack-top-index' },
      { regex: /\b(top|tos)\s*==\s*-\s*1\b/, weight: 1.8, signal: 'stack-empty-check' },
      { regex: /\b(top|tos)\s*==\s*\w+\s*-\s*1\b/, weight: 1.8, signal: 'stack-full-check' },
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
    keywords: ['tree', 'bst', 'avl', 'inorder', 'preorder', 'postorder', 'root'],
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

const INTENT_ALIASES: Record<ProgramIntentType, string[]> = {
  sorting: [],
  searching: ['target', 'key', 'find'],
  'linked-list': ['ll', 'head', 'tail', 'curr', 'prev'],
  stack: ['stk', 'st', 'sk', 'top', 'tos'],
  queue: ['q', 'qu', 'front', 'rear', 'fq', 'rq'],
  tree: ['root', 'parent', 'leaf'],
  graph: ['adj', 'visited', 'edges', 'vertices', 'nbr'],
  'dynamic-programming': ['memo', 'cache', 'state'],
  recursion: ['helper', 'recurse'],
  matrix: ['grid', 'mat', 'board', 'row', 'col'],
  generic: []
};

const CALL_SIGNAL_PATTERNS: Array<{
  intent: ProgramIntentType;
  regex: RegExp;
  weight: number;
  signal: string;
}> = [
  { intent: 'stack', regex: /\b(push|pop|peek)\s*\(/, weight: 2.4, signal: 'stack-api' },
  { intent: 'queue', regex: /\b(enqueue|dequeue)\s*\(/, weight: 2.4, signal: 'queue-api' },
  { intent: 'linked-list', regex: /\b(insert|append|prepend|delete|remove)\w*\s*\(/, weight: 1.1, signal: 'list-api' },
  { intent: 'tree', regex: /\b(inorder|preorder|postorder|insertnode|deletenode)\s*\(/, weight: 2.0, signal: 'tree-api' },
  { intent: 'graph', regex: /\b(bfs|dfs|toposort|dijkstra)\s*\(/, weight: 2.4, signal: 'graph-api' },
  { intent: 'sorting', regex: /\b(merge|partition|quicksort|heapsort|bubblesort)\s*\(/, weight: 2.2, signal: 'sorting-api' },
  { intent: 'searching', regex: /\b(binarysearch|linearsearch|lowerbound|upperbound)\s*\(/, weight: 2.2, signal: 'search-api' },
  { intent: 'recursion', regex: /\b(helper|recurse)\s*\(/, weight: 0.8, signal: 'helper-api' }
];

const TECHNIQUE_PROFILES: TechniqueProfile[] = [
  {
    tag: 'two-pointers',
    label: 'Two Pointers',
    keywords: ['left', 'right', 'slow', 'fast'],
    patterns: [
      { regex: /\b(left|i)\s*<\s*(right|j)\b/, weight: 1.6 },
      { regex: /\bslow\b[\s\S]{0,120}\bfast\b/, weight: 1.8 }
    ]
  },
  {
    tag: 'sliding-window',
    label: 'Sliding Window',
    keywords: ['window', 'start', 'end', 'expand', 'shrink', 'substring', 'subarray'],
    patterns: [
      { regex: /\bwhile\s*\([^)]*\)\s*\{[\s\S]{0,220}\b(start|left)\+\+/, weight: 1.7 },
      { regex: /\b(sum|window_sum|count)\s*[+\-]=/, weight: 1.2 }
    ]
  },
  {
    tag: 'binary-search',
    label: 'Binary Search',
    keywords: ['mid', 'low', 'high', 'binary'],
    patterns: [
      { regex: /\bwhile\s*\(\s*low\s*<=\s*high\s*\)/, weight: 2.4 },
      { regex: /\bmid\s*=\s*\(\s*low\s*\+\s*high\s*\)/, weight: 1.6 }
    ]
  },
  {
    tag: 'dfs',
    label: 'DFS',
    keywords: ['dfs', 'depth'],
    patterns: [
      { regex: /\bdfs\s*\(/, weight: 2.2 },
      { regex: /\bvisited\b[\s\S]{0,180}\bdfs\s*\(/, weight: 1.4 }
    ]
  },
  {
    tag: 'bfs',
    label: 'BFS',
    keywords: ['bfs', 'queue', 'level'],
    patterns: [
      { regex: /\bbfs\s*\(/, weight: 2.2 },
      { regex: /\b(front|rear|queue)\b[\s\S]{0,180}\bvisited\b/, weight: 1.5 }
    ]
  },
  {
    tag: 'hashing',
    label: 'Hashing',
    keywords: ['hash', 'unordered_map', 'unordered_set', 'map', 'set', 'seen', 'freq', 'count'],
    patterns: [
      { regex: /\b(hash|map|set|seen|freq|count)\b/, weight: 1.4 },
      { regex: /\b(unordered_map|unordered_set|map<|set<)\b/, weight: 2.1 },
      { regex: /\bvisited\s*\[/, weight: 1.1 }
    ]
  },
  {
    tag: 'greedy',
    label: 'Greedy',
    keywords: ['greedy', 'minimum', 'maximum', 'best', 'choose', 'take', 'skip', 'optimum'],
    patterns: [
      { regex: /\bif\s*\([^)]*\)\s*\w+\s*=\s*\w+/, weight: 1.0 },
      { regex: /\b(min|max)(imum)?\b/, weight: 1.2 }
    ]
  },
  {
    tag: 'recursion',
    label: 'Recursion',
    keywords: ['recursive', 'base case'],
    patterns: [
      { regex: /\bif\s*\([^)]*\)\s*return\b/, weight: 1.0 },
      { regex: /\breturn\s+\w+\s*\(/, weight: 1.0 }
    ]
  },
  {
    tag: 'dynamic-programming',
    label: 'Dynamic Programming',
    keywords: ['dp', 'memo', 'tabulation'],
    patterns: [
      { regex: /\bdp\s*\[[^\]]+\]/, weight: 2.2 },
      { regex: /\bmemo\s*\(|\bmemset\s*\(\s*dp/, weight: 1.6 }
    ]
  },
  {
    tag: 'matrix-traversal',
    label: 'Matrix Traversal',
    keywords: ['matrix', 'grid', 'row', 'col'],
    patterns: [
      { regex: /\[[^\]]+\]\[[^\]]+\]/, weight: 1.8 },
      { regex: /\bfor\s*\([^)]*\)[\s\S]{0,200}\bfor\s*\([^)]*\)/, weight: 1.3 }
    ]
  },
  {
    tag: 'linked-list',
    label: 'Linked List',
    keywords: ['node', 'next', 'head', 'tail'],
    patterns: [{ regex: /\b->next\b|\bstruct\s+\w+\s*\{[\s\S]*\*\s*next\s*;/, weight: 2.2 }]
  },
  {
    tag: 'stack',
    label: 'Stack',
    keywords: ['stack', 'push', 'pop', 'top'],
    patterns: [
      { regex: /\bpush\s*\(|\bpop\s*\(/, weight: 2.0 },
      { regex: /\b\w+\s*\[\s*(top|tos)\s*\]/, weight: 1.6 },
      { regex: /\b(top|tos)\s*==\s*-\s*1\b/, weight: 1.3 }
    ]
  },
  {
    tag: 'queue',
    label: 'Queue',
    keywords: ['queue', 'enqueue', 'dequeue', 'front', 'rear'],
    patterns: [{ regex: /\benqueue\s*\(|\bdequeue\s*\(/, weight: 2.0 }]
  },
  {
    tag: 'tree',
    label: 'Tree',
    keywords: ['tree', 'root', 'leaf', 'parent'],
    patterns: [{ regex: /\b->left\b|\b->right\b/, weight: 2.0 }]
  },
  {
    tag: 'graph',
    label: 'Graph',
    keywords: ['graph', 'adj', 'vertex', 'edge', 'bfs', 'dfs'],
    patterns: [{ regex: /\badj(acency)?\b|\bedge\b|\bvertex\b/, weight: 2.0 }]
  },
  {
    tag: 'sorting',
    label: 'Sorting',
    keywords: ['sort', 'swap', 'partition', 'merge'],
    patterns: [{ regex: /\bswap\s*\(|\bnested-loops\b/, weight: 1.6 }]
  }
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapCode(value: string): string {
  return `\`${value}\``;
}

function describeKeywordSignal(intent: ProgramIntentType, keyword: string): string {
  if (intent === 'searching' && ['low', 'high', 'mid'].includes(keyword)) {
    return `tracks the search window with ${wrapCode(keyword)}`;
  }

  if (intent === 'dynamic-programming' && keyword === 'dp') {
    return 'stores answers in a `dp` table';
  }

  if (intent === 'dynamic-programming' && ['memo', 'tabulation'].includes(keyword)) {
    return `uses ${wrapCode(keyword)} to reuse subproblem results`;
  }

  if (intent === 'graph' && ['adj', 'visited', 'edges', 'vertices'].includes(keyword)) {
    return `uses ${wrapCode(keyword)}-style graph bookkeeping`;
  }

  if (intent === 'linked-list' && ['head', 'tail', 'next', 'prev'].includes(keyword)) {
    return `mentions ${wrapCode(keyword)} while moving through nodes`;
  }

  if (intent === 'stack' && ['top', 'tos', 'push', 'pop'].includes(keyword)) {
    return `mentions ${wrapCode(keyword)} in stack operations`;
  }

  if (intent === 'queue' && ['front', 'rear', 'enqueue', 'dequeue'].includes(keyword)) {
    return `mentions ${wrapCode(keyword)} in queue operations`;
  }

  if (intent === 'tree' && ['root', 'left', 'right', 'parent'].includes(keyword)) {
    return `mentions ${wrapCode(keyword)} while walking a tree`;
  }

  if (intent === 'matrix' && ['row', 'col', 'grid', 'matrix'].includes(keyword)) {
    return `mentions ${wrapCode(keyword)} while scanning a grid`;
  }

  if (intent === 'recursion' && ['recursive', 'base case'].includes(keyword)) {
    return `mentions ${wrapCode(keyword)} as part of recursion`;
  }

  return `mentions ${wrapCode(keyword)}`;
}

function describeAliasSignal(intent: ProgramIntentType, alias: string): string {
  if (alias.length <= 2) {
    return `uses ${wrapCode(alias)} as a shorthand for ${LABEL_BY_INTENT[intent].toLowerCase()}`;
  }

  return `uses ${wrapCode(alias)} as a shorthand for ${LABEL_BY_INTENT[intent].toLowerCase()}`;
}

function describePatternSignal(intent: ProgramIntentType, signal: string): string {
  const phrase = SIGNAL_EXPLANATIONS[signal];
  if (phrase) {
    return phrase;
  }

  if (signal === 'binary-search-loop') {
    return `shrinks the search window with ${wrapCode('low <= high')}`;
  }

  if (signal === 'nested-loops' && intent === 'sorting') {
    return 'uses nested loops to compare and reorder values';
  }

  return signal.replace(/-/g, ' ');
}

function describeCallSignal(signal: string): string {
  const phrase = SIGNAL_EXPLANATIONS[signal];
  if (phrase) {
    return phrase;
  }

  return signal.replace(/-/g, ' ');
}

function aliasScore(features: CodeFeatureSnapshot, intent: ProgramIntentType): number {
  let score = 0;
  for (const alias of INTENT_ALIASES[intent]) {
    if (containsWord(features.normalizedSource, alias) || features.identifierSet.has(alias)) {
      score += alias.length <= 3 ? 0.55 : 0.85;
    }
  }
  return score;
}

function structuralScore(features: CodeFeatureSnapshot, intent: ProgramIntentType): number {
  const source = features.normalizedSource;
  const functionNames = features.functionNames;

  if (intent === 'stack') {
    let score = 0;
    if (/\b(top|tos)\s*(\+\+|--)/.test(source)) score += 2;
    if (/\b\w+\s*\[\s*(top|tos)\s*\]/.test(source)) score += 1.4;
    if (/\bstack\s*\[\s*(top|tos)\s*\]\s*=/.test(source)) score += 1.6;
    if (/\b(top|tos)\s*==\s*-\s*1\b/.test(source)) score += 1.2;
    if (/\b(top|tos)\s*==\s*\w+\s*-\s*1\b/.test(source)) score += 1.2;
    if (features.identifierSet.has('stack') && (features.identifierSet.has('top') || features.identifierSet.has('tos'))) {
      score += 1.4;
    }
    if (functionNames.some((name) => /^(push|pop|peek|isfull|isempty)$/.test(name))) score += 2;
    if (functionNames.some((name) => /^(display|printstack)$/.test(name)) && /\bstack\b/.test(source)) score += 0.8;
    return score;
  }

  if (intent === 'queue') {
    let score = 0;
    if (/\b(front|rear)\b/.test(source) && /\bqueue\b|\bq\b/.test(source)) score += 1.4;
    if (/\b(front|rear)\s*=\s*\(.*\)\s*%\s*\w+/.test(source)) score += 2.2;
    if (functionNames.some((name) => /^(enqueue|dequeue|peek|displayqueue)$/.test(name))) score += 2;
    return score;
  }

  if (intent === 'linked-list') {
    let score = 0;
    if (/\b(head|tail|curr|temp|prev)\s*->\s*next/.test(source)) score += 2.3;
    if (/\bstruct\s+\w+\s*\{[\s\S]*\*\s*next\s*;/.test(source)) score += 2.6;
    if (functionNames.some((name) => /^(insert|append|prepend|deletenode|displaylist|reverse)$/.test(name))) score += 1.8;
    return score;
  }

  if (intent === 'tree') {
    let score = 0;
    if (/\b(root|node)\s*->\s*(left|right)/.test(source)) score += 2.4;
    if (/\bstruct\s+\w+\s*\{[\s\S]*\*\s*left\s*;[\s\S]*\*\s*right\s*;/.test(source)) score += 2.8;
    if (functionNames.some((name) => /^(insert|delete|search|inorder|preorder|postorder)$/.test(name))) score += 1.7;
    return score;
  }

  if (intent === 'graph') {
    let score = 0;
    if (/\badj(acency)?\b/.test(source) && /\bvisited\b/.test(source)) score += 2.4;
    if (/\b(bfs|dfs)\s*\(/.test(source)) score += 2.2;
    if (functionNames.some((name) => /^(bfs|dfs|dijkstra|toposort|addedge)$/.test(name))) score += 2;
    return score;
  }

  if (intent === 'searching') {
    let score = 0;
    if (/\b(low|left)\b/.test(source) && /\b(high|right)\b/.test(source) && /\bmid\b/.test(source)) score += 2.5;
    if (functionNames.some((name) => /search/.test(name))) score += 1.6;
    return score;
  }

  if (intent === 'sorting') {
    let score = 0;
    if (/\bfor\s*\([^)]*\)[\s\S]{0,220}\bfor\s*\(/.test(source)) score += 1.8;
    if (/\bswap\s*\(|\btemp\s*=/.test(source) && /\[[^\]]+\]/.test(source)) score += 1.8;
    if (functionNames.some((name) => /sort|partition|merge/.test(name))) score += 1.8;
    return score;
  }

  if (intent === 'dynamic-programming') {
    let score = 0;
    if (/\bdp\s*\[[^\]]+\]/.test(source)) score += 2.3;
    if (/\bmemo\b|\bcache\b/.test(source)) score += 1.6;
    return score;
  }

  if (intent === 'recursion') {
    let score = 0;
    for (const name of functionNames) {
      const recursiveCalls = countRegexMatches(source, new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g'));
      if (recursiveCalls >= 2) {
        score += 2.2;
        break;
      }
    }
    if (/\bif\s*\([^)]*\)\s*return\b/.test(source)) score += 0.8;
    return score;
  }

  if (intent === 'matrix') {
    let score = 0;
    if (/\[[^\]]+\]\[[^\]]+\]/.test(source)) score += 2.2;
    if (/\bfor\s*\([^)]*\)[\s\S]{0,220}\bfor\s*\([^)]*\)/.test(source)) score += 1.4;
    return score;
  }

  return 0;
}

function scoreSource(features: CodeFeatureSnapshot): ProgramIntentCandidate[] {
  const candidates: ProgramIntentCandidate[] = [];
  const source = features.normalizedSource;

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

    score += aliasScore(features, profile.intent);
    score += structuralScore(features, profile.intent);

    for (const callSignal of CALL_SIGNAL_PATTERNS) {
      if (callSignal.intent === profile.intent && callSignal.regex.test(source)) {
        score += callSignal.weight;
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

function scoreTechnique(features: CodeFeatureSnapshot, profile: TechniqueProfile): number {
  let score = 0;
  const source = features.normalizedSource;
  const functionNames = features.functionNames;

  for (const keyword of profile.keywords) {
    if (containsWord(source, keyword) || features.identifierSet.has(keyword)) {
      score += keyword.length > 8 ? 1.2 : 1;
    }
  }

  for (const pattern of profile.patterns) {
    if (pattern.regex.test(source)) {
      score += pattern.weight;
    }
  }

  if (profile.tag === 'binary-search' && /\b(low|high|mid)\b/.test(source)) {
    score += 1;
  }

  if (profile.tag === 'two-pointers' && /\b(left|right|slow|fast)\b/.test(source)) {
    score += 0.8;
  }

  if (profile.tag === 'sliding-window' && /\b(start|end|window)\b/.test(source)) {
    score += 0.8;
  }

  if (profile.tag === 'dfs' && functionNames.some((name) => /^dfs|traverse|explore/.test(name))) {
    score += 1.2;
  }

  if (profile.tag === 'bfs' && functionNames.some((name) => /^bfs|level|visit/.test(name))) {
    score += 1.2;
  }

  if (profile.tag === 'hashing' && /\b(unordered_map|unordered_set|seen|visited|freq|count)\b/.test(source)) {
    score += 1;
  }

  if (profile.tag === 'matrix-traversal' && /\[[^\]]+\]\[[^\]]+\]/.test(source)) {
    score += 1;
  }

  return score;
}

function collectTechniques(
  features: CodeFeatureSnapshot,
  primaryIntent: ProgramIntentType,
  candidates: ProgramIntentCandidate[]
): ProgramTechniqueTag[] {
  const scoredTechniques = TECHNIQUE_PROFILES
    .map((profile) => ({
      tag: profile.tag,
      label: profile.label,
      score: scoreTechnique(features, profile)
    }))
    .filter((entry) => entry.score >= 1.8)
    .sort((left, right) => right.score - left.score);

  const tags: ProgramTechniqueTag[] = [];
  const seen = new Set<ProgramTechniqueTag>();

  function add(tag: ProgramTechniqueTag) {
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  const primaryIntentTechniqueMap: Partial<Record<ProgramIntentType, ProgramTechniqueTag>> = {
    sorting: 'sorting',
    searching: 'binary-search',
    'linked-list': 'linked-list',
    stack: 'stack',
    queue: 'queue',
    tree: 'tree',
    graph: 'graph',
    'dynamic-programming': 'dynamic-programming',
    recursion: 'recursion',
    matrix: 'matrix-traversal'
  };

  const mappedPrimary = primaryIntentTechniqueMap[primaryIntent];
  if (mappedPrimary) {
    add(mappedPrimary);
  }

  for (const entry of scoredTechniques) {
    add(entry.tag);
    if (tags.length >= 5) break;
  }

  if (tags.length === 0 && candidates.length > 0) {
    const fallback = primaryIntentTechniqueMap[candidates[0].intent];
    if (fallback) add(fallback);
  }

  return tags;
}

function pushReadableSignal(target: string[], seen: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  target.push(normalized);
}

function collectSignals(source: string, intent: ProgramIntentType): string[] {
  const profile = PROFILES.find((entry) => entry.intent === intent);
  if (!profile) return [];

  const signals: string[] = [];
  const seen = new Set<string>();

  for (const pattern of profile.patterns) {
    if (pattern.regex.test(source)) {
      pushReadableSignal(signals, seen, describePatternSignal(intent, pattern.signal));
    }
    if (signals.length >= 6) break;
  }

  if (signals.length < 6) {
    for (const keyword of profile.keywords) {
      if (containsWord(source, keyword)) {
        pushReadableSignal(signals, seen, describeKeywordSignal(intent, keyword));
      }
      if (signals.length >= 6) break;
    }
  }

  if (signals.length < 6) {
    for (const alias of INTENT_ALIASES[intent]) {
      if (containsWord(source, alias)) {
        pushReadableSignal(signals, seen, describeAliasSignal(intent, alias));
      }
      if (signals.length >= 6) break;
    }
  }

  if (signals.length < 6) {
    for (const callSignal of CALL_SIGNAL_PATTERNS) {
      if (callSignal.intent === intent && callSignal.regex.test(source)) {
        pushReadableSignal(signals, seen, describeCallSignal(callSignal.signal));
      }
      if (signals.length >= 6) break;
    }
  }

  return signals;
}

export function predictProgramIntent(code: string): ProgramIntentPrediction {
  const features = extractCodeFeatures(code);
  const normalized = features.normalizedSource;
  const candidates = scoreSource(features);
  const fallbackTechniques = collectTechniques(features, 'generic', candidates);

  if (candidates.length === 0) {
    return {
      primaryIntent: 'generic',
      primaryLabel: LABEL_BY_INTENT.generic,
      confidence: 0.35,
      matchedSignals: [],
      techniques: fallbackTechniques,
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
    techniques: collectTechniques(features, best.intent, candidates),
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
