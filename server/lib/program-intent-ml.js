const LABELS = {
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

const PROFILES = [
  {
    intent: 'sorting',
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
      { regex: /\bfor\s*\([^)]*\)\s*\{[\s\S]{0,240}\bfor\s*\(/, weight: 2.4, signal: 'nested-loops' },
      {
        regex: /\b(a|arr|array)\s*\[[^\]]+\]\s*[<>]=?\s*(a|arr|array)\s*\[[^\]]+\]/,
        weight: 2.2,
        signal: 'array-compare'
      },
      { regex: /\bswap\s*\(/, weight: 1.6, signal: 'swap-op' }
    ]
  },
  {
    intent: 'searching',
    keywords: ['search', 'binary', 'linear', 'target', 'key', 'mid', 'lower_bound', 'upper_bound'],
    patterns: [
      { regex: /\b(mid|low|high)\b/, weight: 1.3, signal: 'mid-low-high' },
      { regex: /\bwhile\s*\(\s*low\s*<=\s*high\s*\)/, weight: 2.8, signal: 'binary-search-loop' }
    ]
  },
  {
    intent: 'linked-list',
    keywords: ['linked list', 'node', 'next', 'prev', 'head', 'tail'],
    patterns: [
      { regex: /\bstruct\s+\w+\s*\{[\s\S]*\*\s*next\s*;/, weight: 3, signal: 'node-next-struct' },
      { regex: /\b(head|tail)\s*=\s*(head|tail)->next/, weight: 2.2, signal: 'head-tail-next-hop' }
    ]
  },
  {
    intent: 'stack',
    keywords: ['stack', 'push', 'pop', 'peek', 'top', 'lifo'],
    patterns: [
      { regex: /\b(top|sp)\s*[+-]{2}/, weight: 2.1, signal: 'top-pointer-shift' },
      { regex: /\bpush\s*\(|\bpop\s*\(/, weight: 2, signal: 'push-pop-api' }
    ]
  },
  {
    intent: 'queue',
    keywords: ['queue', 'enqueue', 'dequeue', 'front', 'rear', 'fifo'],
    patterns: [
      { regex: /\b(front|rear)\s*=\s*\(.*\)\s*%\s*\w+/, weight: 2.2, signal: 'circular-queue-index' },
      { regex: /\benqueue\s*\(|\bdequeue\s*\(/, weight: 2, signal: 'enqueue-dequeue-api' }
    ]
  },
  {
    intent: 'tree',
    keywords: ['tree', 'bst', 'avl', 'inorder', 'preorder', 'postorder', 'root', 'leaf'],
    patterns: [
      {
        regex: /\bstruct\s+\w+\s*\{[\s\S]*\*\s*left\s*;[\s\S]*\*\s*right\s*;/,
        weight: 3,
        signal: 'left-right-struct'
      },
      { regex: /\b(root|node)->(left|right)/, weight: 2.1, signal: 'tree-child-navigation' }
    ]
  },
  {
    intent: 'graph',
    keywords: ['graph', 'vertex', 'edge', 'adjacency', 'adj', 'bfs', 'dfs', 'dijkstra', 'topological'],
    patterns: [
      { regex: /\bvector\s*<\s*vector\s*<\s*int\s*>\s*>\s*\w+/, weight: 2.4, signal: 'adjacency-vector' },
      { regex: /\bfor\s*\(\s*.*\s*:\s*adj\[/, weight: 2.2, signal: 'adjacency-iteration' }
    ]
  },
  {
    intent: 'dynamic-programming',
    keywords: ['dp', 'memo', 'tabulation', 'knapsack', 'lcs', 'lis', 'state', 'transition'],
    patterns: [
      { regex: /\bdp\s*\[[^\]]+\]/, weight: 2.8, signal: 'dp-array' },
      { regex: /\bmemo\s*\(|\bmemset\s*\(\s*dp/, weight: 2.2, signal: 'dp-memo-init' }
    ]
  },
  {
    intent: 'recursion',
    keywords: ['recursive', 'base case'],
    patterns: [
      { regex: /\breturn\s+\w+\s*\([^)]*\)\s*[+\-*/]\s*\w+\s*\(/, weight: 2.2, signal: 'recursive-combination' },
      { regex: /\bif\s*\([^)]*\)\s*return\b/, weight: 1.2, signal: 'base-case-guard' }
    ]
  },
  {
    intent: 'matrix',
    keywords: ['matrix', 'grid', 'row', 'col', 'rows', 'cols'],
    patterns: [
      { regex: /\[\s*\w+\s*\]\s*\[\s*\w+\s*\]/, weight: 2.2, signal: '2d-indexing' },
      {
        regex: /\bfor\s*\([^)]*\)\s*\{[\s\S]{0,180}\bfor\s*\([^)]*\)\s*\{[\s\S]{0,180}\[[^\]]+\]\[[^\]]+\]/,
        weight: 2.6,
        signal: 'nested-grid-loop'
      }
    ]
  }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ')
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countOccurrences(source, keyword) {
  if (keyword.includes(' ')) {
    return source.includes(keyword) ? 1 : 0;
  }

  const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'g');
  return (source.match(regex) ?? []).length;
}

function structuralBoost(source, intent) {
  if (intent === 'sorting') {
    const hasNestedLoops = /\bfor\s*\([^)]*\)\s*\{[\s\S]{0,260}\b(for|while)\s*\(/.test(source);
    const hasArrayWrites = /\w+\s*\[[^\]]+\]\s*=/.test(source);
    return hasNestedLoops && hasArrayWrites ? 1.2 : 0;
  }

  if (intent === 'searching') {
    const hasBinaryBounds = /\b(low|left)\b/.test(source) && /\b(high|right)\b/.test(source) && /\bmid\b/.test(source);
    return hasBinaryBounds ? 1.2 : 0;
  }

  if (intent === 'recursion') {
    const functionNames = Array.from(source.matchAll(/\b([a-z_]\w*)\s*\([^;{}]*\)\s*\{/g), (match) => match[1]);
    for (const name of functionNames) {
      const regex = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, 'g');
      const callCount = (source.match(regex) ?? []).length;
      if (callCount >= 2) {
        return 1.4;
      }
    }
  }

  if (intent === 'graph') {
    const hasTraversal = /\b(bfs|dfs)\b/.test(source);
    const hasAdjacency = /\badj(acency)?\b/.test(source) || /\badj\s*\[/.test(source);
    const hasVisited = /\bvisited\b/.test(source);
    if (hasTraversal && hasAdjacency && hasVisited) {
      return 3;
    }
    if (hasTraversal && hasAdjacency) {
      return 2.2;
    }
  }

  return 0;
}

function conflictPenalty(source, intent) {
  if (intent === 'queue' && /\b(graph|vertex|edge|adj|bfs|dfs)\b/.test(source)) {
    return 1.6;
  }

  return 0;
}

function keywordContribution(source, intent, keyword, occurrences) {
  let cappedOccurrences = Math.min(occurrences, 6);
  let weight = keyword.length > 8 ? 1.4 : 1;

  if (intent === 'queue' && (keyword === 'front' || keyword === 'rear')) {
    cappedOccurrences = Math.min(occurrences, 1);
    weight = 0.45;
  }

  if (intent === 'graph' && (keyword === 'graph' || keyword === 'adj' || keyword === 'bfs' || keyword === 'dfs')) {
    weight = 1.35;
  }

  if (intent === 'searching' && keyword === 'mid' && /\b(low|high)\b/.test(source)) {
    weight = 1.25;
  }

  return cappedOccurrences * weight;
}

function collectSignals(source, profile) {
  const signals = [];

  for (const keyword of profile.keywords) {
    if (countOccurrences(source, keyword) > 0) {
      signals.push(keyword);
      if (signals.length >= 6) {
        return signals;
      }
    }
  }

  for (const pattern of profile.patterns) {
    if (pattern.regex.test(source)) {
      signals.push(pattern.signal);
      if (signals.length >= 6) {
        break;
      }
    }
  }

  return signals;
}

function scoreIntent(source, profile) {
  let score = 0;

  for (const keyword of profile.keywords) {
    const occurrences = countOccurrences(source, keyword);
    if (occurrences > 0) {
      score += keywordContribution(source, profile.intent, keyword, occurrences);
    }
  }

  for (const pattern of profile.patterns) {
    if (pattern.regex.test(source)) {
      score += pattern.weight;
    }
  }

  score += structuralBoost(source, profile.intent);
  return Math.max(0, score - conflictPenalty(source, profile.intent));
}

function candidateConfidence(score, topScore) {
  if (topScore <= 0) return 0.35;
  return clamp(0.35 + (score / topScore) * 0.58, 0.35, 0.95);
}

function buildSummary(best, confidence, matchedSignals, nextCandidate) {
  const leadingSignal = matchedSignals[0] ?? 'general code structure';
  const confidenceLabel =
    confidence >= 0.8 ? 'high confidence' : confidence >= 0.6 ? 'moderate confidence' : 'early confidence';
  const nextLabel = nextCandidate ? ` Secondary signal: ${nextCandidate.label}.` : '';

  return `${best.label} detected with ${confidenceLabel}, led by ${leadingSignal}.${nextLabel}`;
}

function buildExplanation(best, matchedSignals, nextCandidate) {
  const explanation = [];

  if (matchedSignals.length > 0) {
    explanation.push(`Key signals: ${matchedSignals.slice(0, 4).join(', ')}`);
  }

  explanation.push(`The classifier sees the strongest match as ${best.label.toLowerCase()}.`);

  if (nextCandidate) {
    explanation.push(`A weaker competing match was ${nextCandidate.label.toLowerCase()}.`);
  }

  return explanation;
}

export async function analyzeProgramIntent(code) {
  const source = stripCommentsAndStrings(code);
  const candidates = [];

  for (const profile of PROFILES) {
    const score = scoreIntent(source, profile);
    if (score > 0) {
      candidates.push({
        intent: profile.intent,
        score,
        label: LABELS[profile.intent]
      });
    }
  }

  if (candidates.length === 0) {
    return {
      success: true,
      engine: 'heuristic-v2',
      primaryIntent: 'generic',
      primaryLabel: LABELS.generic,
      confidence: 0.35,
      matchedSignals: [],
      candidates: [
        {
          intent: 'generic',
          label: LABELS.generic,
          score: 1,
          confidence: 0.35
        }
      ],
      summary: 'No strong algorithm fingerprint was detected yet.',
      explanation: ['Add more structure, function names, or data-structure cues for a stronger match.']
    };
  }

  candidates.sort((a, b) => b.score - a.score);

  const [best, second] = candidates;
  const topScore = best.score;
  const secondScore = second?.score ?? 0;
  const scoreGap = Math.max(0, topScore - secondScore);
  const confidence = clamp(
    0.42 + (topScore / (topScore + 7)) * 0.35 + (scoreGap / (topScore + secondScore + 2)) * 0.23,
    0.4,
    0.97
  );

  const profile = PROFILES.find((entry) => entry.intent === best.intent);
  const matchedSignals = profile ? collectSignals(source, profile) : [];
  const topCandidates = candidates.slice(0, 3).map((candidate) => ({
    intent: candidate.intent,
    label: candidate.label,
    score: candidate.score,
    confidence: candidateConfidence(candidate.score, topScore)
  }));

  return {
    success: true,
    engine: 'heuristic-v2',
    primaryIntent: best.intent,
    primaryLabel: best.label,
    confidence,
    matchedSignals,
    candidates: topCandidates,
    summary: buildSummary(best, confidence, matchedSignals, second),
    explanation: buildExplanation(best, matchedSignals, second)
  };
}
