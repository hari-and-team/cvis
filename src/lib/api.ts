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

const RAW_API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim();
const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

function connectionHelp(): string {
  if (API_BASE) {
    return `Backend unavailable at ${API_BASE}. Ask your teammate to start the shared backend or update VITE_API_BASE.`;
  }

  return 'Backend unavailable. Start a local backend, use Docker, or set VITE_API_BASE to a shared backend URL.';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(apiUrl(path), init);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new Error(`${connectionHelp()} (${message})`);
  }

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(error || `${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function analyzeProgramIntent(req: AnalyzeIntentRequest): Promise<AnalyzeIntentResult> {
  try {
    return await requestJson<AnalyzeIntentResult>('/api/analyze/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Intent analysis failed';
    throw new Error(`Intent analysis failed: ${message}`);
  }
}

export async function compileCode(req: CompileRequest): Promise<CompileResult> {
  try {
    return await requestJson<CompileResult>('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compile failed';
    throw new Error(`Compile failed: ${message}`);
  }
}

export async function runBinary(req: ExecutionRequest): Promise<ExecutionResult> {
  try {
    return await requestJson<ExecutionResult>('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Run failed';
    throw new Error(`Run failed: ${message}`);
  }
}

export async function traceCode(req: TraceRequest): Promise<TraceResult> {
  try {
    return await requestJson<TraceResult>('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Trace failed';
    throw new Error(`Trace failed: ${message}`);
  }
}

export async function startRunSession(req: RunSessionStartRequest): Promise<RunSessionStartResult> {
  try {
    const body = await requestJson<RunSessionStartResult>('/api/run/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });

    if (!body?.success) {
      throw new Error(body?.error || 'Failed to start run session');
    }

    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start run session';
    throw new Error(`Run session start failed: ${message}`);
  }
}

export async function pollRunSession(sessionId: string): Promise<RunSessionPollResult> {
  const params = new URLSearchParams({ sessionId });
  try {
    const body = await requestJson<RunSessionPollResult>(`/api/run/poll?${params.toString()}`);
    if (!body?.success) {
      throw new Error(body?.error || 'Failed to poll run session');
    }
    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to poll run session';
    throw new Error(`Run session poll failed: ${message}`);
  }
}

export async function sendRunInput(req: RunSessionInputRequest): Promise<RunSessionInputResult> {
  try {
    const body = await requestJson<RunSessionInputResult>('/api/run/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if (!body?.success) {
      throw new Error(body?.error || 'Failed to send run input');
    }
    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send run input';
    throw new Error(`Run session input failed: ${message}`);
  }
}

export async function stopRunSession(sessionId: string): Promise<void> {
  try {
    await requestJson('/api/run/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to stop run session';
    throw new Error(`Run session stop failed: ${message}`);
  }
}

export async function closeRunInput(sessionId: string): Promise<RunSessionEofResult> {
  try {
    const body = await requestJson<RunSessionEofResult>('/api/run/eof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    if (!body?.success) {
      throw new Error(body?.error || 'Failed to close run input');
    }
    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to close run input';
    throw new Error(`Run session eof failed: ${message}`);
  }
}
