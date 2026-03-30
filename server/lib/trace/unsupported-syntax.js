import { createTraceFailure } from './trace-errors.js';

const UNSUPPORTED_TRACE_FEATURES = [
  {
    regex: /\bdo\s*\{/,
    message:
      'Trace does not support do/while loops yet. Use a while loop for tracing or use compile/run for exact execution.'
  },
  {
    regex: /\?/,
    message: 'Trace does not support ternary expressions yet. Rewrite them as if/else for tracing.'
  },
  {
    regex: /<<|>>|\^|~/,
    message: 'Trace does not support these bitwise operators yet. Use compile/run for exact execution.'
  },
  {
    regex: /\bunion\b/,
    message: 'Trace does not support union declarations yet. Use compile/run for exact execution.'
  },
  {
    regex: /\benum\b/,
    message: 'Trace does not support enum declarations yet. Use explicit integer constants for tracing.'
  },
  {
    regex: /\bgoto\b/,
    message: 'Trace does not support goto statements yet. Use structured control flow for tracing.'
  }
];

export function detectUnsupportedTraceFeature(code) {
  if (typeof code !== 'string' || !code.trim()) {
    return null;
  }

  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

  for (const feature of UNSUPPORTED_TRACE_FEATURES) {
    const match = stripped.match(feature.regex);
    if (!match) continue;

    const before = stripped.slice(0, match.index ?? 0);
    const line = before.split('\n').length;
    return createTraceFailure(feature.message, { line, phase: 'unsupported' });
  }

  return null;
}
