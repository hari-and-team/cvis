import type {
  AnalyzeIntentRequest,
  AnalyzeIntentResult,
  CompileRequest,
  CompileResult,
  ExecutionRequest,
  ExecutionResult,
  RunSessionEofResult,
  RunSessionInputRequest,
  RunSessionInputResult,
  RunSessionPollResult,
  RunSessionStartRequest,
  RunSessionStartResult,
  TraceRequest,
  TraceResult
} from './types';

const API_BASE = '';

function backendUnavailableMessage(action: string, error: unknown): Error {
  const base =
    `${action} failed because the backend is unavailable. Start the app with \`npm run dev:all\`. ` +
    'If this machine does not have the repo-local compiler yet, run `npm run setup:toolchain` first.';

  if (error instanceof Error && error.message) {
    return new Error(`${base} (${error.message})`);
  }

  return new Error(base);
}

async function requestJson<T>(endpoint: string, init: RequestInit, action: string): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, init);
  } catch (error) {
    throw backendUnavailableMessage(action, error);
  }

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`${action} failed: ${error}`);
  }

  return res.json();
}

export async function analyzeProgramIntent(req: AnalyzeIntentRequest): Promise<AnalyzeIntentResult> {
  return requestJson<AnalyzeIntentResult>('/api/analyze/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  }, 'Intent analysis');
}

export async function compileCode(req: CompileRequest): Promise<CompileResult> {
  return requestJson<CompileResult>('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  }, 'Compile');
}

export async function runBinary(req: ExecutionRequest): Promise<ExecutionResult> {
  return requestJson<ExecutionResult>('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  }, 'Run');
}

export async function traceCode(req: TraceRequest): Promise<TraceResult> {
  return requestJson<TraceResult>('/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  }, 'Trace');
}

export async function startRunSession(req: RunSessionStartRequest): Promise<RunSessionStartResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  } catch (error) {
    throw backendUnavailableMessage('Run session start', error);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to start run session';
    throw new Error(`Run session start failed: ${message}`);
  }

  return body;
}

export async function pollRunSession(sessionId: string): Promise<RunSessionPollResult> {
  const params = new URLSearchParams({ sessionId });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/poll?${params.toString()}`);
  } catch (error) {
    throw backendUnavailableMessage('Run session poll', error);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to poll run session';
    throw new Error(`Run session poll failed: ${message}`);
  }

  return body;
}

export async function sendRunInput(req: RunSessionInputRequest): Promise<RunSessionInputResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  } catch (error) {
    throw backendUnavailableMessage('Run session input', error);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to send run input';
    throw new Error(`Run session input failed: ${message}`);
  }

  return body;
}

export async function stopRunSession(sessionId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (error) {
    throw backendUnavailableMessage('Run session stop', error);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error || res.statusText || 'Failed to stop run session';
    throw new Error(`Run session stop failed: ${message}`);
  }
}

export async function closeRunInput(sessionId: string): Promise<RunSessionEofResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/eof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (error) {
    throw backendUnavailableMessage('Run session eof', error);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to close run input';
    throw new Error(`Run session eof failed: ${message}`);
  }

  return body;
}
