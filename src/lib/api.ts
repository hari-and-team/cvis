import { env } from '$env/dynamic/public';
import type {
  AnalyzeIntentRequest,
  AnalyzeIntentResult,
  CompileRequest,
  CompileResult,
  ExecutionRequest,
  ExecutionResult,
  SourceExecutionRequest,
  SourceExecutionResult,
  RunSessionEofResult,
  RunSessionInputRequest,
  RunSessionInputResult,
  RunSessionPollResult,
  RunSessionStartRequest,
  RunSessionStartResult,
  TraceReadinessRequest,
  TraceReadinessResult,
  TraceRequest,
  TraceResult
} from './types';

const API_BASE = (env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || '')
  .trim()
  .replace(/\/$/, '');
const EXECUTION_MODE_RAW = (env.PUBLIC_EXECUTION_MODE || import.meta.env.VITE_EXECUTION_MODE || '')
  .trim()
  .toLowerCase();
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const REQUEST_TIMEOUTS_MS: Record<string, number> = {
  default: 15_000,
  compile: 20_000,
  run: 20_000,
  trace: 20_000,
  traceReadiness: 8_000,
  analyze: 12_000,
  runStart: 10_000,
  runPoll: 6_000,
  runInput: 8_000,
  runStop: 6_000,
  runEof: 6_000
} as const;

export const EXECUTION_MODE =
  EXECUTION_MODE_RAW === 'serverless' || EXECUTION_MODE_RAW === 'stateless'
    ? 'serverless'
    : 'interactive';

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

function assertSecureApiBase(action: string): void {
  if (!API_BASE || typeof window === 'undefined') {
    return;
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(API_BASE, window.location.origin);
  } catch {
    return;
  }

  if (apiUrl.protocol !== 'http:' || isLocalHostname(apiUrl.hostname)) {
    return;
  }

  if (window.location.protocol === 'https:' || import.meta.env.PROD) {
    throw new Error(
      `${action} failed: insecure API base "${apiUrl.origin}" is not allowed here. Configure the backend over HTTPS.`
    );
  }
}

function backendUnavailableMessage(action: string, error: unknown): Error {
  const offlineHint =
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Your browser is offline right now.'
      : 'Start the app with `npm run dev:all`.';
  const base =
    `${action} failed because the backend is unavailable. ${offlineHint} ` +
    'If this machine does not have the repo-local compiler yet, run `npm run setup:toolchain` first.';

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`${action} failed because the backend did not respond in time.`);
  }

  if (error instanceof Error && error.message) {
    return new Error(`${base} (${error.message})`);
  }

  return new Error(base);
}

async function fetchWithTimeout(
  endpoint: string,
  init: RequestInit,
  action: string,
  timeoutMs: number
): Promise<Response> {
  assertSecureApiBase(action);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${API_BASE}${endpoint}`, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    throw backendUnavailableMessage(action, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

function deriveErrorMessageFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const candidate = body as {
    error?: unknown;
    message?: unknown;
    stderr?: unknown;
    errors?: unknown;
  };

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return `${candidate.error}: ${candidate.message}`;
    }
    return candidate.error;
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  if (typeof candidate.stderr === 'string' && candidate.stderr.trim()) {
    return candidate.stderr;
  }

  if (Array.isArray(candidate.errors)) {
    const errors = candidate.errors.filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    );
    if (errors.length > 0) {
      return errors.join('\n');
    }
  }

  return null;
}

async function parseErrorResponse(res: Response, action: string): Promise<never> {
  const text = await res.text().catch(() => '');
  let parsedBody: unknown = null;

  if (text.trim()) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = null;
    }
  }

  const detail = deriveErrorMessageFromBody(parsedBody) || text.trim() || res.statusText || 'Request failed';
  throw new Error(`${action} failed (${res.status}): ${detail}`);
}

async function requestJson<T>(
  endpoint: string,
  init: RequestInit,
  action: string,
  timeoutMs = REQUEST_TIMEOUTS_MS.default
): Promise<T> {
  let res: Response;

  try {
    res = await fetchWithTimeout(endpoint, init, action, timeoutMs);
  } catch (error) {
    throw error;
  }

  if (!res.ok) {
    return parseErrorResponse(res, action);
  }

  return parseJsonResponse<T>(res, action);
}

async function parseJsonResponse<T>(res: Response, action: string): Promise<T> {
  const text = await res.text().catch(() => '');

  if (!text.trim()) {
    throw new Error(`${action} failed: backend returned an empty response`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${action} failed: backend returned invalid JSON`);
  }
}

export async function analyzeProgramIntent(req: AnalyzeIntentRequest): Promise<AnalyzeIntentResult> {
  return requestJson<AnalyzeIntentResult>('/api/analyze/intent', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(req)
  }, 'Intent analysis', REQUEST_TIMEOUTS_MS.analyze);
}

export async function compileCode(req: CompileRequest): Promise<CompileResult> {
  return requestJson<CompileResult>('/api/compile', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(req)
  }, 'Compile', REQUEST_TIMEOUTS_MS.compile);
}

export async function runBinary(req: ExecutionRequest): Promise<ExecutionResult> {
  return requestJson<ExecutionResult>('/api/run', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(req)
  }, 'Run', REQUEST_TIMEOUTS_MS.run);
}

export async function executeCode(req: SourceExecutionRequest): Promise<SourceExecutionResult> {
  return requestJson<SourceExecutionResult>('/api/execute', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(req)
  }, 'Execute', REQUEST_TIMEOUTS_MS.run);
}

export async function traceCode(req: TraceRequest): Promise<TraceResult> {
  return requestJson<TraceResult>('/api/trace', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(req)
  }, 'Trace', REQUEST_TIMEOUTS_MS.trace);
}

export async function getTraceReadiness(req: TraceReadinessRequest): Promise<TraceReadinessResult> {
  return requestJson<TraceReadinessResult>('/api/trace/readiness', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(req)
  }, 'Trace readiness', REQUEST_TIMEOUTS_MS.traceReadiness);
}

export async function startRunSession(req: RunSessionStartRequest): Promise<RunSessionStartResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout('/api/run/start', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(req)
    }, 'Run session start', REQUEST_TIMEOUTS_MS.runStart);
  } catch (error) {
    throw error;
  }

  if (!res.ok) {
    return parseErrorResponse(res, 'Run session start');
  }

  const body = await parseJsonResponse<RunSessionStartResult | null>(res, 'Run session start').catch(() => null);
  if (!body?.success) {
    const message = body?.error || res.statusText || 'Failed to start run session';
    throw new Error(`Run session start failed: ${message}`);
  }

  return body;
}

export async function pollRunSession(sessionId: string): Promise<RunSessionPollResult> {
  const params = new URLSearchParams({ sessionId });
  let res: Response;
  try {
    res = await fetchWithTimeout(`/api/run/poll?${params.toString()}`, {}, 'Run session poll', REQUEST_TIMEOUTS_MS.runPoll);
  } catch (error) {
    throw error;
  }

  if (!res.ok) {
    return parseErrorResponse(res, 'Run session poll');
  }

  const body = await parseJsonResponse<RunSessionPollResult | null>(res, 'Run session poll').catch(() => null);
  if (!body?.success) {
    const message = body?.error || res.statusText || 'Failed to poll run session';
    throw new Error(`Run session poll failed: ${message}`);
  }

  return body;
}

export async function sendRunInput(req: RunSessionInputRequest): Promise<RunSessionInputResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout('/api/run/input', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(req)
    }, 'Run session input', REQUEST_TIMEOUTS_MS.runInput);
  } catch (error) {
    throw error;
  }

  if (!res.ok) {
    return parseErrorResponse(res, 'Run session input');
  }

  const body = await parseJsonResponse<RunSessionInputResult | null>(res, 'Run session input').catch(() => null);
  if (!body?.success) {
    const message = body?.error || res.statusText || 'Failed to send run input';
    throw new Error(`Run session input failed: ${message}`);
  }

  return body;
}

export async function stopRunSession(sessionId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout('/api/run/stop', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ sessionId })
    }, 'Run session stop', REQUEST_TIMEOUTS_MS.runStop);
  } catch (error) {
    throw error;
  }

  if (!res.ok) {
    return parseErrorResponse(res, 'Run session stop');
  }
}

export async function closeRunInput(sessionId: string): Promise<RunSessionEofResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout('/api/run/eof', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ sessionId })
    }, 'Run session eof', REQUEST_TIMEOUTS_MS.runEof);
  } catch (error) {
    throw error;
  }

  if (!res.ok) {
    return parseErrorResponse(res, 'Run session eof');
  }

  const body = await parseJsonResponse<RunSessionEofResult | null>(res, 'Run session eof').catch(() => null);
  if (!body?.success) {
    const message = body?.error || res.statusText || 'Failed to close run input';
    throw new Error(`Run session eof failed: ${message}`);
  }

  return body;
}
