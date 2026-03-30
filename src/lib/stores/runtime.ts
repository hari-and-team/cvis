import { writable } from 'svelte/store';
import type { CompileResult, ExecutionResult } from '$lib/types';

export const isCompiling = writable<boolean>(false);
export const isRunning = writable<boolean>(false);
export const lastBinaryPath = writable<string | null>(null);
export const lastCompileResult = writable<CompileResult | null>(null);
export const lastExecutionResult = writable<ExecutionResult | null>(null);
export const errorMessage = writable<string | null>(null);
export const runSessionId = writable<string | null>(null);
export const runConsoleTranscript = writable<string>('');
export const lastRunInputTranscript = writable<string>('');
export const pendingRunInputEcho = writable<string>('');
export const traceInputDraft = writable<string>('');
