import { env } from '$env/dynamic/public';

export type ExecutionMode = 'full' | 'trace-only';

function normalizeExecutionMode(value: string | undefined): ExecutionMode | null {
  if (value === 'full' || value === 'trace-only') {
    return value;
  }

  return null;
}

export function getExecutionMode(): ExecutionMode {
  const explicitMode = normalizeExecutionMode(env.PUBLIC_EXECUTION_MODE?.trim());
  if (explicitMode) {
    return explicitMode;
  }

  const apiBase = (env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || '').trim();
  if (import.meta.env.DEV || apiBase) {
    return 'full';
  }

  return 'trace-only';
}

export function nativeExecutionEnabled(): boolean {
  return getExecutionMode() === 'full';
}

export function nativeExecutionUnavailableMessage(): string {
  return 'Compile and live run are disabled in this deployment. This Vercel setup supports trace and analysis only.';
}
