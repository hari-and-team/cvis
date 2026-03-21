import {
  closeRunInput,
  compileCode,
  pollRunSession,
  sendRunInput,
  startRunSession,
  stopRunSession,
  traceCode
} from '$lib/api';
import {
  currentStepIndex,
  errorMessage,
  isCompiling,
  isRunning,
  lastBinaryPath,
  lastCompileResult,
  lastExecutionResult,
  runConsoleTranscript,
  runSessionId,
  traceSteps
} from '$lib/stores';
import { validateCompileRequest, validateTraceRequest } from '$lib/validation';

interface CompileRunActionParams {
  code: string;
}

interface TraceActionParams {
  code: string;
  breakpoints?: number[];
}

interface TraceActionResult {
  traceErr: string | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function hasNonGlobalFrame(step: { stackFrames?: Array<{ name?: unknown }> }): boolean {
  if (!Array.isArray(step.stackFrames)) return false;
  return step.stackFrames.some((frame) => {
    if (!frame || typeof frame !== 'object') return false;
    const name = typeof frame.name === 'string' ? frame.name.trim().toLowerCase() : '';
    return name !== '' && name !== 'global';
  });
}

function getInitialTraceStepIndex(steps: Array<{ stackFrames?: Array<{ name?: unknown }> }>): number {
  const firstExecutableFrame = steps.findIndex((step) => hasNonGlobalFrame(step));
  if (firstExecutableFrame >= 0) {
    return firstExecutableFrame;
  }

  const firstWithFrames = steps.findIndex(
    (step) => Array.isArray(step.stackFrames) && step.stackFrames.length > 0
  );
  return firstWithFrames >= 0 ? firstWithFrames : 0;
}

const RUN_POLL_INTERVAL_MS = 120;
let activeRunSessionId: string | null = null;
let activeRunOutputCursor = '';
let activeRunInputClosed = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runCompileAndRunAction({
  code
}: CompileRunActionParams): Promise<void> {
  let startedSessionId: string | null = null;

  try {
    const validationError = validateCompileRequest(code);
    if (validationError) {
      errorMessage.set(validationError);
      return;
    }

    if (activeRunSessionId) {
      await stopRunSession(activeRunSessionId).catch(() => {});
      activeRunSessionId = null;
      runSessionId.set(null);
    }

    isRunning.set(true);
    errorMessage.set(null);
    lastExecutionResult.set(null);
    lastBinaryPath.set(null);
    runSessionId.set(null);
    runConsoleTranscript.set('');
    activeRunOutputCursor = '';
    activeRunInputClosed = false;

    isCompiling.set(true);
    const compileResult = await compileCode({ code });
    lastCompileResult.set(compileResult);
    isCompiling.set(false);

    if (!compileResult.success) {
      errorMessage.set(compileResult.errors.join('\n'));
      return;
    }

    if (!compileResult.binary) {
      errorMessage.set('Compilation succeeded, but no executable binary was returned.');
      return;
    }

    lastBinaryPath.set(compileResult.binary);
    const runStart = await startRunSession({
      binaryPath: compileResult.binary,
      args: []
    });
    if (!runStart.sessionId) {
      throw new Error('Run session failed to start');
    }

    startedSessionId = runStart.sessionId;
    activeRunSessionId = runStart.sessionId;
    activeRunOutputCursor = '';
    activeRunInputClosed = false;
    runSessionId.set(runStart.sessionId);
    lastExecutionResult.set({
      stdout: '',
      stderr: '',
      exitCode: 0,
      executionTime: 0
    });

    while (activeRunSessionId === startedSessionId) {
      const poll = await pollRunSession(startedSessionId);
      const mergedOutput = poll.output ?? `${poll.stdout}${poll.stderr}`;

      if (mergedOutput.startsWith(activeRunOutputCursor)) {
        const delta = mergedOutput.slice(activeRunOutputCursor.length);
        if (delta) {
          runConsoleTranscript.update((prev) => `${prev}${delta}`);
        }
      } else if (mergedOutput !== activeRunOutputCursor) {
        runConsoleTranscript.set(mergedOutput);
      }
      activeRunOutputCursor = mergedOutput;

      lastExecutionResult.set({
        stdout: poll.stdout,
        stderr: poll.stderr,
        exitCode: poll.done ? (poll.exitCode ?? 1) : 0,
        executionTime: poll.executionTime
      });

      if (poll.done) {
        activeRunSessionId = null;
        activeRunInputClosed = false;
        activeRunOutputCursor = '';
        runSessionId.set(null);
        if ((poll.exitCode ?? 1) !== 0 && poll.stderr) {
          errorMessage.set(poll.stderr);
        }
        break;
      }

      await delay(RUN_POLL_INTERVAL_MS);
    }
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred');
    errorMessage.set(message);
    console.error('Compile/Run error:', err);

    if (startedSessionId) {
      await stopRunSession(startedSessionId).catch(() => {});
      if (activeRunSessionId === startedSessionId) {
        activeRunSessionId = null;
      }
      activeRunInputClosed = false;
      activeRunOutputCursor = '';
      runSessionId.set(null);
    }
  } finally {
    isRunning.set(false);
    isCompiling.set(false);
  }
}

export async function sendRuntimeInputLine(line: string): Promise<void> {
  const sessionId = activeRunSessionId;
  if (!sessionId) {
    throw new Error('No active run session');
  }

  if (activeRunInputClosed) {
    throw new Error('Program stdin is closed (EOF already sent)');
  }

  const payload = line.endsWith('\n') ? line : `${line}\n`;
  await sendRunInput({
    sessionId,
    input: payload
  });
}

export async function sendRuntimeEof(): Promise<void> {
  const sessionId = activeRunSessionId;
  if (!sessionId) {
    throw new Error('No active run session');
  }

  if (activeRunInputClosed) {
    return;
  }

  await closeRunInput(sessionId);
  activeRunInputClosed = true;
}

export async function interruptRuntimeSession(): Promise<void> {
  const sessionId = activeRunSessionId;
  if (!sessionId) {
    return;
  }

  activeRunSessionId = null;
  activeRunInputClosed = false;
  activeRunOutputCursor = '';
  runSessionId.set(null);
  runConsoleTranscript.update((prev) => `${prev}^C\n`);

  await stopRunSession(sessionId).catch(() => {});
}

export async function runTraceAction({
  code,
  breakpoints = []
}: TraceActionParams): Promise<TraceActionResult> {
  try {
    const validationError = validateTraceRequest(code);
    if (validationError) {
      errorMessage.set(validationError);
      traceSteps.set([]);
      currentStepIndex.set(0);
      return { traceErr: validationError };
    }

    errorMessage.set(null);

    const result = await traceCode({
      code,
      breakpoints
    });

    if (result.success) {
      traceSteps.set(result.steps);
      currentStepIndex.set(getInitialTraceStepIndex(result.steps));
      return { traceErr: null };
    }

    const traceErr = result.errors.join('\n') || 'Trace failed';
    traceSteps.set([]);
    currentStepIndex.set(0);
    errorMessage.set(traceErr);
    return { traceErr };
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred during tracing');
    console.error('Trace error:', err);
    traceSteps.set([]);
    currentStepIndex.set(0);
    errorMessage.set(message);
    return { traceErr: message };
  }
}
