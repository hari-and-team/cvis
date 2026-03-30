import { json, type RequestEvent } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { normalizeApiBase, normalizeExecutionMode, resolveExecutionMode } from '$lib/execution-mode';

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

async function resolveExternalBackendCapabilities(apiBase: string): Promise<{
  executionMode: 'full' | 'trace-only' | null;
  supportsCompileRun: boolean | null;
}> {
  try {
    const response = await fetch(`${apiBase}/health`, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return {
        executionMode: null,
        supportsCompileRun: false
      };
    }

    const payload = (await response.json()) as {
      executionMode?: unknown;
      supportsCompileRun?: unknown;
    };

    return {
      executionMode:
        typeof payload.executionMode === 'string'
          ? normalizeExecutionMode(payload.executionMode.trim())
          : null,
      supportsCompileRun:
        typeof payload.supportsCompileRun === 'boolean' ? payload.supportsCompileRun : null
    };
  } catch {
    return {
      executionMode: null,
      supportsCompileRun: false
    };
  }
}

export async function healthPayload(event: RequestEvent) {
  const apiBase = normalizeApiBase(publicEnv.PUBLIC_API_BASE);
  let executionMode = resolveExecutionMode({
    explicitMode: publicEnv.PUBLIC_EXECUTION_MODE,
    apiBase,
    dev: !process.env.VERCEL && process.env.NODE_ENV !== 'production'
  });
  let supportsCompileRun = executionMode === 'full';

  if (apiBase) {
    const backendCapabilities = await resolveExternalBackendCapabilities(apiBase);

    if (backendCapabilities.supportsCompileRun === false) {
      executionMode = 'trace-only';
      supportsCompileRun = false;
    } else if (backendCapabilities.supportsCompileRun === true) {
      executionMode = 'full';
      supportsCompileRun = true;
    } else if (backendCapabilities.executionMode) {
      executionMode = backendCapabilities.executionMode;
      supportsCompileRun = backendCapabilities.executionMode === 'full';
    } else {
      executionMode = 'trace-only';
      supportsCompileRun = false;
    }
  }

  return {
    status: 'ok',
    executionMode,
    supportsCompileRun,
    supportsTrace: true,
    supportsAnalysis: true,
    apiBase: apiBase || null,
    requestProtocol: event.url.protocol.replace(/:$/, ''),
    environment: process.env.VERCEL ? 'vercel' : process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString()
  };
}
