// @ts-nocheck
import { createTraceFailure } from './trace-errors.js';

const UNSUPPORTED_TRACE_FEATURES = [
  {
    code: 'do-while',
    regex: /\bdo\s*\{/,
    message:
      'Trace does not support do/while loops yet. Use a while loop for tracing or use compile/run for exact execution.'
  },
  {
    code: 'ternary',
    regex: /\?/,
    message: 'Trace does not support ternary expressions yet. Rewrite them as if/else for tracing.'
  },
  {
    code: 'bitwise',
    regex: /<<|>>|\^|~/,
    message: 'Trace does not support these bitwise operators yet. Use compile/run for exact execution.'
  },
  {
    code: 'union',
    regex: /\bunion\b/,
    message: 'Trace does not support union declarations yet. Use compile/run for exact execution.'
  },
  {
    code: 'enum',
    regex: /\benum\b/,
    message: 'Trace does not support enum declarations yet. Use explicit integer constants for tracing.'
  },
  {
    code: 'goto',
    regex: /\bgoto\b/,
    message: 'Trace does not support goto statements yet. Use structured control flow for tracing.'
  }
];

function stripCodeForFeatureChecks(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function lineForMatch(source, index) {
  const before = source.slice(0, index);
  return before.split('\n').length;
}

export function collectUnsupportedTraceReasons(code) {
  if (typeof code !== 'string' || !code.trim()) {
    return [];
  }

  const stripped = stripCodeForFeatureChecks(code);
  const reasons = [];
  const seen = new Set();

  for (const feature of UNSUPPORTED_TRACE_FEATURES) {
    const match = stripped.match(feature.regex);
    if (!match) continue;

    const line = lineForMatch(stripped, match.index ?? 0);
    const dedupeKey = `${feature.code}:${line}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    reasons.push({
      line,
      severity: 'block',
      code: feature.code,
      message: feature.message
    });
  }

  return reasons;
}

export function detectUnsupportedTraceFeature(code) {
  const reasons = collectUnsupportedTraceReasons(code);
  if (reasons.length > 0) {
    const primary = reasons[0];
    return createTraceFailure(primary.message, { line: primary.line, phase: 'unsupported' });
  }

  return null;
}
