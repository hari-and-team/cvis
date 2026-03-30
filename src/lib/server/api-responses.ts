import { json, type RequestEvent } from '@sveltejs/kit';

export const NATIVE_EXECUTION_UNAVAILABLE_MESSAGE =
  'Compile and live run are disabled in this deployment. Use Trace Execution and Analysis, or connect an external backend for GCC-based execution.';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0'
};

export function apiJson(data: unknown, init?: ResponseInit) {
  return json(data, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {})
    }
  });
}

export async function readJsonObject(
  request: Request
): Promise<{ value: Record<string, unknown> } | { error: string }> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'Request body must be a JSON object' };
    }

    return { value: body as Record<string, unknown> };
  } catch {
    return { error: 'Request body must be valid JSON.' };
  }
}

export function unsupportedCompileResponse() {
  return apiJson(
    {
      success: false,
      error: 'Native execution unavailable',
      errors: [NATIVE_EXECUTION_UNAVAILABLE_MESSAGE],
      warnings: [],
      compilationTime: 0
    },
    { status: 501 }
  );
}

export function unsupportedRunResponse() {
  return apiJson(
    {
      error: 'Native execution unavailable',
      stdout: '',
      stderr: NATIVE_EXECUTION_UNAVAILABLE_MESSAGE,
      exitCode: 1,
      executionTime: 0,
      peakMemoryBytes: null
    },
    { status: 501 }
  );
}

export function unsupportedRunSessionResponse(status = 501) {
  return apiJson(
    {
      success: false,
      error: NATIVE_EXECUTION_UNAVAILABLE_MESSAGE
    },
    { status }
  );
}

export function healthPayload(event: RequestEvent) {
  return {
    status: 'ok',
    executionMode: 'trace-only',
    supportsCompileRun: false,
    supportsTrace: true,
    supportsAnalysis: true,
    requestProtocol: event.url.protocol.replace(/:$/, ''),
    environment: process.env.VERCEL ? 'vercel' : process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString()
  };
}
