export type ExecutionMode = 'full' | 'trace-only';

export function normalizeExecutionMode(value: string | null | undefined): ExecutionMode | null {
  if (value === 'full' || value === 'trace-only') {
    return value;
  }

  return null;
}

export function normalizeApiBase(value: string | null | undefined): string {
  return (value || '').trim().replace(/\/$/, '');
}

export function resolveExecutionMode(options: {
  explicitMode?: string | null | undefined;
  apiBase?: string | null | undefined;
  dev?: boolean;
}): ExecutionMode {
  const explicitMode = normalizeExecutionMode(options.explicitMode?.trim());
  if (explicitMode) {
    return explicitMode;
  }

  if (options.dev || normalizeApiBase(options.apiBase).length > 0) {
    return 'full';
  }

  return 'trace-only';
}
