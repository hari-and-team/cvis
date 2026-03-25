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

export async function analyzeProgramIntent(req: AnalyzeIntentRequest): Promise<AnalyzeIntentResult> {
  const res = await fetch(`${API_BASE}/api/analyze/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`Intent analysis failed: ${error}`);
  }

  return res.json();
}

export async function compileCode(req: CompileRequest): Promise<CompileResult> {
  const res = await fetch(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`Compile failed: ${error}`);
  }
  return res.json();
}

export async function runBinary(req: ExecutionRequest): Promise<ExecutionResult> {
  const res = await fetch(`${API_BASE}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`Run failed: ${error}`);
  }
  return res.json();
}

export async function traceCode(req: TraceRequest): Promise<TraceResult> {
  const res = await fetch(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`Trace failed: ${error}`);
  }
  return res.json();
}

export async function startRunSession(req: RunSessionStartRequest): Promise<RunSessionStartResult> {
  const res = await fetch(`${API_BASE}/api/run/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to start run session';
    throw new Error(`Run session start failed: ${message}`);
  }

  return body;
}

export async function pollRunSession(sessionId: string): Promise<RunSessionPollResult> {
  const params = new URLSearchParams({ sessionId });
  const res = await fetch(`${API_BASE}/api/run/poll?${params.toString()}`);

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to poll run session';
    throw new Error(`Run session poll failed: ${message}`);
  }

  return body;
}

export async function sendRunInput(req: RunSessionInputRequest): Promise<RunSessionInputResult> {
  const res = await fetch(`${API_BASE}/api/run/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to send run input';
    throw new Error(`Run session input failed: ${message}`);
  }

  return body;
}

export async function stopRunSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/run/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error || res.statusText || 'Failed to stop run session';
    throw new Error(`Run session stop failed: ${message}`);
  }
}

export async function closeRunInput(sessionId: string): Promise<RunSessionEofResult> {
  const res = await fetch(`${API_BASE}/api/run/eof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.error || res.statusText || 'Failed to close run input';
    throw new Error(`Run session eof failed: ${message}`);
  }

  return body;
}
