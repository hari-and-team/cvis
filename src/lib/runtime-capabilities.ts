import { env } from '$env/dynamic/public';
import { derived, get, writable } from 'svelte/store';
import {
  normalizeApiBase,
  normalizeExecutionMode,
  resolveExecutionMode,
  type ExecutionMode
} from '$lib/execution-mode';

function getConfiguredApiBase(): string {
  return normalizeApiBase(env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || '');
}

function getConfiguredExecutionMode(): ExecutionMode {
  const configuredApiBase = getConfiguredApiBase();
  return resolveExecutionMode({
    explicitMode: env.PUBLIC_EXECUTION_MODE,
    apiBase: configuredApiBase,
    dev: import.meta.env.DEV
  });
}

export const executionMode = writable<ExecutionMode>(getConfiguredExecutionMode());
export const nativeExecutionEnabledStore = derived(executionMode, (mode) => mode === 'full');

let hydrationPromise: Promise<void> | null = null;

export async function hydrateRuntimeCapabilities(): Promise<void> {
  if (typeof window === 'undefined' || !import.meta.env.PROD) {
    return;
  }

  if (hydrationPromise) {
    return hydrationPromise;
  }

  hydrationPromise = (async () => {
    try {
      const response = await fetch('/health', {
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        executionMode?: unknown;
        supportsCompileRun?: unknown;
      };

      const healthMode =
        typeof payload.executionMode === 'string'
          ? normalizeExecutionMode(payload.executionMode.trim())
          : null;
      const supportsCompileRun =
        typeof payload.supportsCompileRun === 'boolean' ? payload.supportsCompileRun : null;

      if (supportsCompileRun === false) {
        executionMode.set('trace-only');
      } else if (supportsCompileRun === true) {
        executionMode.set('full');
      } else if (healthMode) {
        executionMode.set(healthMode);
      }
    } catch {
      executionMode.set('trace-only');
    }
  })();

  return hydrationPromise;
}

export function getExecutionMode(): ExecutionMode {
  return get(executionMode);
}

export function nativeExecutionEnabled(): boolean {
  return getExecutionMode() === 'full';
}

export function nativeExecutionUnavailableMessage(): string {
  return 'Compile and live run are unavailable because the configured execution backend does not currently support GCC execution.';
}
