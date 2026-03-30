import {
  closeRunInput,
  compileCode,
  getTraceReadiness,
  pollRunSession,
  sendRunInput,
  startRunSession,
  stopRunSession,
  traceCode
} from '$lib/api';
import type { TraceReadinessResult } from '$lib/types';
import {
  currentStepIndex,
  errorMessage,
  isCompiling,
  isPlaying,
  isRunning,
  lastBinaryPath,
  lastCompileResult,
  lastExecutionResult,
  lastRunInputTranscript,
  pendingRunInputEcho,
  runConsoleTranscript,
  runSessionId,
  traceSteps
} from '$lib/stores';
import {
  hydrateRuntimeCapabilities,
  nativeExecutionEnabled,
  nativeExecutionUnavailableMessage
} from '$lib/runtime-capabilities';
import { validateCompileRequest, validateTraceRequest } from '$lib/validation';

interface CompileRunActionParams {
  code: string;
}

interface TraceActionParams {
  code: string;
  breakpoints?: number[];
  input?: string;
  force?: boolean;
}

interface TraceActionResult {
  traceErr: string | null;
  readiness: TraceReadinessResult | null;
  didTrace: boolean;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

type TraceStepFrameCarrier = {
  runtime?: {
    frames?: Array<{ name?: unknown }>;
  };
  stackFrames?: Array<{ name?: unknown }>;
};

function getTraceStepFrames(step: TraceStepFrameCarrier): Array<{ name?: unknown }> {
  if (Array.isArray(step.runtime?.frames)) {
    return step.runtime.frames;
  }

  if (Array.isArray(step.stackFrames)) {
    return step.stackFrames;
  }

  return [];
}

function hasNonGlobalFrame(step: TraceStepFrameCarrier): boolean {
  return getTraceStepFrames(step).some((frame) => {
    if (!frame || typeof frame !== 'object') return false;
    const name = typeof frame.name === 'string' ? frame.name.trim().toLowerCase() : '';
    return name !== '' && name !== 'global';
  });
}

function getInitialTraceStepIndex(steps: TraceStepFrameCarrier[]): number {
  const firstExecutableFrame = steps.findIndex((step) => hasNonGlobalFrame(step));
  if (firstExecutableFrame >= 0) {
    return firstExecutableFrame;
  }

  const firstWithFrames = steps.findIndex((step) => getTraceStepFrames(step).length > 0);
  return firstWithFrames >= 0 ? firstWithFrames : 0;
}

const RUN_POLL_INTERVAL_MS = 120;
const RUN_POLL_RETRY_LIMIT = 3;
let activeRunSessionId: string | null = null;
let activeRunOutputCursor = '';
let activeRunInputClosed = false;
let activePendingRunInputEcho = '';

function setPendingRunInputEcho(value: string): void {
  activePendingRunInputEcho = value;
  pendingRunInputEcho.set(value);
}

function appendPendingRunInputEcho(value: string): void {
  if (!value) {
    return;
  }

  setPendingRunInputEcho(`${activePendingRunInputEcho}${value}`);
}

function trimPendingRunInputEcho(count: number): void {
  if (count <= 0) {
    return;
  }

  setPendingRunInputEcho(activePendingRunInputEcho.slice(count));
}

function clearPendingRunInputEcho(): void {
  setPendingRunInputEcho('');
}

function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;

  while (index < max && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function findPromptInsertionIndex(text: string): number {
  const firstNewlineIndex = text.indexOf('\n');
  const searchLimit = firstNewlineIndex >= 0 ? firstNewlineIndex : text.length;
  const head = text.slice(0, searchLimit);
  const promptMarkers = [': ', '? ', '> ', '$ ', '# '];
  let bestIndex = -1;

  for (const marker of promptMarkers) {
    const markerIndex = head.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }

    const insertionIndex = markerIndex + marker.length;
    if (insertionIndex >= head.length) {
      continue;
    }

    if (bestIndex < 0 || insertionIndex < bestIndex) {
      bestIndex = insertionIndex;
    }
  }

  return bestIndex;
}

function reconcilePendingRunInputEcho(delta: string, pollDone: boolean): string {
  if (!activePendingRunInputEcho) {
    return delta;
  }

  if (!delta) {
    if (pollDone) {
      const fallback = activePendingRunInputEcho;
      clearPendingRunInputEcho();
      return fallback;
    }

    return delta;
  }

  const matchedPrefix = commonPrefixLength(delta, activePendingRunInputEcho);
  if (matchedPrefix > 0) {
    trimPendingRunInputEcho(matchedPrefix);
    return delta;
  }

  if (delta.includes(activePendingRunInputEcho)) {
    clearPendingRunInputEcho();
    return delta;
  }

  // When stdout is pipe-buffered, prompts can arrive only after stdin has already
  // been sent. Preserve terminal-like ordering by stitching the pending input
  // after the first prompt marker in the newly received line.
  if (!activeRunOutputCursor) {
    const promptInsertionIndex = findPromptInsertionIndex(delta);
    if (promptInsertionIndex >= 0) {
      const latePromptDelta = [
        delta.slice(0, promptInsertionIndex),
        activePendingRunInputEcho,
        delta.slice(promptInsertionIndex)
      ].join('');
      clearPendingRunInputEcho();
      return latePromptDelta;
    }
  }

  const optimisticDelta = `${activePendingRunInputEcho}${delta}`;
  clearPendingRunInputEcho();
  return optimisticDelta;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function stopActiveRuntimeSession(): Promise<void> {
  if (!activeRunSessionId) {
    runSessionId.set(null);
    clearPendingRunInputEcho();
    return;
  }

  const sessionId = activeRunSessionId;
  activeRunSessionId = null;
  activeRunInputClosed = false;
  activeRunOutputCursor = '';
  runSessionId.set(null);
  clearPendingRunInputEcho();
  await stopRunSession(sessionId).catch(() => {});
}

function resetRuntimeOutputState(): void {
  lastExecutionResult.set(null);
  runSessionId.set(null);
  runConsoleTranscript.set('');
  lastRunInputTranscript.set('');
  clearPendingRunInputEcho();
  activeRunOutputCursor = '';
  activeRunInputClosed = false;
}

export async function runCompileAction({
  code
}: CompileRunActionParams): Promise<boolean> {
  try {
    await hydrateRuntimeCapabilities();

    if (!nativeExecutionEnabled()) {
      errorMessage.set(nativeExecutionUnavailableMessage());
      lastCompileResult.set(null);
      lastBinaryPath.set(null);
      return false;
    }

    const validationError = validateCompileRequest(code);
    if (validationError) {
      errorMessage.set(validationError);
      lastCompileResult.set(null);
      lastBinaryPath.set(null);
      return false;
    }

    await stopActiveRuntimeSession();

    errorMessage.set(null);
    isRunning.set(false);
    resetRuntimeOutputState();
    lastCompileResult.set(null);
    lastBinaryPath.set(null);

    isCompiling.set(true);
    const compileResult = await compileCode({ code });
    lastCompileResult.set(compileResult);

    if (!compileResult.success) {
      errorMessage.set(compileResult.errors.join('\n'));
      return false;
    }

    if (!compileResult.binary) {
      errorMessage.set('Compilation succeeded, but no executable binary was returned.');
      return false;
    }

    lastBinaryPath.set(compileResult.binary);
    return true;
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred during compilation');
    errorMessage.set(message);
    lastCompileResult.set(null);
    lastBinaryPath.set(null);
    console.error('Compile error:', err);
    return false;
  } finally {
    isCompiling.set(false);
  }
}

export async function runBinaryAction(binaryPath: string | null): Promise<void> {
  let startedSessionId: string | null = null;
  let consecutivePollFailures = 0;

  try {
    await hydrateRuntimeCapabilities();

    if (!nativeExecutionEnabled()) {
      errorMessage.set(nativeExecutionUnavailableMessage());
      return;
    }

    if (!binaryPath) {
      errorMessage.set('Compile successfully before running the program.');
      return;
    }

    await stopActiveRuntimeSession();

    isRunning.set(true);
    errorMessage.set(null);
    resetRuntimeOutputState();
    const runStart = await startRunSession({
      binaryPath,
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
      executionTime: 0,
      peakMemoryBytes: null,
      inputClosed: false,
      completionReason: null
    });

    while (activeRunSessionId === startedSessionId) {
      let poll;
      try {
        poll = await pollRunSession(startedSessionId);
        consecutivePollFailures = 0;
      } catch (err) {
        consecutivePollFailures += 1;

        if (consecutivePollFailures >= RUN_POLL_RETRY_LIMIT) {
          throw err;
        }

        await delay(RUN_POLL_INTERVAL_MS * consecutivePollFailures);
        continue;
      }

      const mergedOutput = poll.output ?? `${poll.stdout}${poll.stderr}`;

      if (mergedOutput.startsWith(activeRunOutputCursor)) {
        const rawDelta = mergedOutput.slice(activeRunOutputCursor.length);
        const delta = reconcilePendingRunInputEcho(rawDelta, Boolean(poll.done));
        if (delta) {
          runConsoleTranscript.update((prev) => `${prev}${delta}`);
        }
      } else if (mergedOutput !== activeRunOutputCursor) {
        runConsoleTranscript.set(mergedOutput);
        if (activePendingRunInputEcho) {
          if (mergedOutput.includes(activePendingRunInputEcho)) {
            clearPendingRunInputEcho();
          } else if (poll.done) {
            runConsoleTranscript.update((prev) => `${prev}${activePendingRunInputEcho}`);
            clearPendingRunInputEcho();
          }
        }
      } else if (poll.done && activePendingRunInputEcho) {
        runConsoleTranscript.update((prev) => `${prev}${activePendingRunInputEcho}`);
        clearPendingRunInputEcho();
      }
      activeRunOutputCursor = mergedOutput;

      lastExecutionResult.set({
        stdout: poll.stdout,
        stderr: poll.stderr,
        exitCode: poll.done ? (poll.exitCode ?? 1) : 0,
        executionTime: poll.executionTime,
        peakMemoryBytes: poll.peakMemoryBytes ?? null,
        inputClosed: Boolean(poll.inputClosed),
        completionReason: poll.completionReason ?? null
      });

      if (poll.done) {
        activeRunSessionId = null;
        activeRunInputClosed = Boolean(poll.inputClosed);
        activeRunOutputCursor = '';
        runSessionId.set(null);
        clearPendingRunInputEcho();
        if (poll.completionReason !== 'stopped' && (poll.exitCode ?? 1) !== 0 && poll.stderr) {
          errorMessage.set(poll.stderr);
        }
        break;
      }

      await delay(RUN_POLL_INTERVAL_MS);
    }
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred');
    errorMessage.set(message);
    console.error('Run error:', err);

    if (startedSessionId) {
      await stopRunSession(startedSessionId).catch(() => {});
      if (activeRunSessionId === startedSessionId) {
        activeRunSessionId = null;
      }
      activeRunInputClosed = false;
      activeRunOutputCursor = '';
      runSessionId.set(null);
      clearPendingRunInputEcho();
    }
  } finally {
    isRunning.set(false);
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
  appendPendingRunInputEcho(payload);
  try {
    await sendRunInput({
      sessionId,
      input: payload
    });
  } catch (err) {
    trimPendingRunInputEcho(payload.length);
    throw err;
  }
  lastRunInputTranscript.update((current) => `${current}${payload}`);
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
  clearPendingRunInputEcho();
  lastExecutionResult.update((current) =>
    current
      ? {
          ...current,
          exitCode: 130,
          completionReason: 'stopped'
        }
      : {
          stdout: '',
          stderr: '',
          exitCode: 130,
          executionTime: 0,
          peakMemoryBytes: null,
          inputClosed: false,
          completionReason: 'stopped'
        }
  );
  runConsoleTranscript.update((prev) => `${prev}^C\n`);

  await stopRunSession(sessionId).catch(() => {});
}

export async function runTraceAction({
  code,
  breakpoints = [],
  input,
  force = false
}: TraceActionParams): Promise<TraceActionResult> {
  try {
    const validationError = validateTraceRequest(code);
    if (validationError) {
      isPlaying.set(false);
      errorMessage.set(validationError);
      traceSteps.set([]);
      currentStepIndex.set(0);
      return { traceErr: validationError, readiness: null, didTrace: false };
    }

    errorMessage.set(null);
    isPlaying.set(false);
    traceSteps.set([]);
    currentStepIndex.set(0);

    let readiness: TraceReadinessResult | null = null;
    if (!force) {
      readiness = await getTraceReadiness({ code });
      if (readiness.status !== 'supported') {
        return { traceErr: null, readiness, didTrace: false };
      }
    }

    const result = await traceCode({
      code,
      breakpoints,
      input: input ?? '',
      force
    });
    readiness = result.readiness ?? readiness;

    if (result.success) {
      traceSteps.set(result.steps);
      currentStepIndex.set(getInitialTraceStepIndex(result.steps));
      return { traceErr: null, readiness, didTrace: true };
    }

    const traceErr = result.errors.join('\n') || 'Trace failed';
    isPlaying.set(false);
    traceSteps.set([]);
    currentStepIndex.set(0);
    errorMessage.set(traceErr);
    return { traceErr, readiness, didTrace: false };
  } catch (err) {
    const message = getErrorMessage(err, 'An error occurred during tracing');
    console.error('Trace error:', err);
    isPlaying.set(false);
    traceSteps.set([]);
    currentStepIndex.set(0);
    errorMessage.set(message);
    return { traceErr: message, readiness: null, didTrace: false };
  }
}
