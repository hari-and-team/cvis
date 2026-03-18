import type { CompileRequest, CompileResult, ExecutionRequest, ExecutionResult, TraceRequest, TraceResult } from './types';

const API_BASE = '';

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
