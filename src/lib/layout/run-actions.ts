import { compileCode, runBinary, traceCode } from '$lib/api';
import {
  currentStepIndex,
  errorMessage,
  isCompiling,
  isRunning,
  lastBinaryPath,
  lastCompileResult,
  lastExecutionResult,
  traceSteps
} from '$lib/stores';
import { validateCompileRequest, validateTraceRequest } from '$lib/validation';

interface CompileRunActionParams {
  code: string;
  runtimeInput: string;
  scannedInput: string;
  hasScannedInput: boolean;
}

interface TraceActionParams {
  code: string;
}

interface TraceActionResult {
  traceErr: string | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function runCompileAndRunAction({
  code,
  runtimeInput,
  scannedInput,
  hasScannedInput
}: CompileRunActionParams): Promise<void> {
  try {
    const validationError = validateCompileRequest(code);
    if (validationError) {
      errorMessage.set(validationError);
      return;
    }

    isRunning.set(true);
    errorMessage.set(null);

    isCompiling.set(true);
    const compileResult = await compileCode({ code });
    lastCompileResult.set(compileResult);
    isCompiling.set(false);

    if (!compileResult.success) {
      errorMessage.set(compileResult.errors.join('\n'));
      return;
    }

    if (compileResult.binary) {
      lastBinaryPath.set(compileResult.binary);
      const stdin = hasScannedInput ? scannedInput : runtimeInput;
      const executionResult = await runBinary({
        binaryPath: compileResult.binary,
        args: [],
        input: stdin
      });
      lastExecutionResult.set(executionResult);
    }
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred');
    errorMessage.set(message);
    console.error('Compile/Run error:', err);
  } finally {
    isRunning.set(false);
    isCompiling.set(false);
  }
}

export async function runTraceAction({ code }: TraceActionParams): Promise<TraceActionResult> {
  try {
    const validationError = validateTraceRequest(code);
    if (validationError) {
      errorMessage.set(validationError);
      return { traceErr: validationError };
    }

    errorMessage.set(null);

    const result = await traceCode({
      code,
      breakpoints: []
    });

    if (result.success) {
      traceSteps.set(result.steps);
      currentStepIndex.set(0);
      return { traceErr: null };
    }

    return { traceErr: result.errors.join('\n') || 'Trace failed' };
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred during tracing');
    console.error('Trace error:', err);
    return { traceErr: message };
  }
}
