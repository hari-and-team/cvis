const TRACE_FAILURE_STEP_LIMIT = 250;

export function createTraceFailure(message, options = {}) {
  const {
    steps = [],
    output = '',
    line = null,
    phase = 'trace'
  } = options;
  const limitedSteps =
    steps.length > TRACE_FAILURE_STEP_LIMIT ? steps.slice(0, TRACE_FAILURE_STEP_LIMIT) : steps;
  const prefix = line ? `Line ${line}: ` : '';
  const baseDetail = typeof message === 'string' && message.trim() ? message.trim() : 'Trace failed.';
  const detail =
    steps.length > TRACE_FAILURE_STEP_LIMIT
      ? `${baseDetail} Showing the first ${TRACE_FAILURE_STEP_LIMIT} trace steps before the failure.`
      : baseDetail;

  return {
    success: false,
    steps: limitedSteps,
    totalSteps: limitedSteps.length,
    errors: [`${prefix}${detail}`],
    output,
    phase
  };
}

function extractLineNumber(message) {
  if (typeof message !== 'string') {
    return null;
  }

  const match = message.match(/\bline\s+(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function normalizeTraceError(error, options = {}) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Trace failed');
  const line = extractLineNumber(rawMessage);
  const exhaustedInputLine =
    Number.isInteger(options.inputReplayExhaustedLine) ? options.inputReplayExhaustedLine : null;

  if (/Maximum steps exceeded/.test(rawMessage)) {
    if (exhaustedInputLine !== null) {
      return createTraceFailure(
        'Trace replay ran out of captured stdin before the program exited, so a later scanf() left execution spinning. Run the program again and finish the full input sequence, or check scanf() return values before looping.',
        { ...options, line: exhaustedInputLine, phase: 'runtime' }
      );
    }

    return createTraceFailure(
      'Trace stopped after hitting the maximum step limit. This usually means an infinite loop or very large loop body. Use breakpoints or compile/run for the full execution.',
      { ...options, line, phase: 'runtime' }
    );
  }

  if (/Maximum call stack size exceeded|Trace call-depth limit exceeded/.test(rawMessage)) {
    return createTraceFailure(
      'Trace stopped because the function call depth grew too large. This usually means deep recursion or runaway recursive calls. Use smaller input, add a base case, or use compile/run for the full execution.',
      { ...options, line, phase: 'runtime' }
    );
  }

  if (/Expected\s+\w+/.test(rawMessage)) {
    return createTraceFailure(
      'The trace parser could not understand part of this C syntax. The trace engine supports a simplified subset of C, so try compile/run for exact output or simplify the construct before tracing.',
      { ...options, line, phase: 'parse' }
    );
  }

  if (/No main function found/.test(rawMessage)) {
    return createTraceFailure('Trace needs a main() function to start execution.', {
      ...options,
      phase: 'parse'
    });
  }

  return createTraceFailure(rawMessage, { ...options, line, phase: options.phase ?? 'trace' });
}
