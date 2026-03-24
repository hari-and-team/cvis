import { writable, derived } from 'svelte/store';
import type { TraceStep, CompileResult, ExecutionResult } from './types';

// Editor state
export const editorCode = writable<string>('');

export const cursorLine = writable<number>(1);
export const cursorColumn = writable<number>(0);

// Visualizer state
export const traceSteps = writable<TraceStep[]>([]);
export const currentStepIndex = writable<number>(0);
export const isPlaying = writable<boolean>(false);
export const playbackSpeed = writable<'slow' | 'normal' | 'fast'>('normal');
export const traceInputDraft = writable<string>('');

// Execution state
export const isCompiling = writable<boolean>(false);
export const isRunning = writable<boolean>(false);
export const lastBinaryPath = writable<string | null>(null);
export const lastCompileResult = writable<CompileResult | null>(null);
export const lastExecutionResult = writable<ExecutionResult | null>(null);
export const errorMessage = writable<string | null>(null);
export const runSessionId = writable<string | null>(null);
export const runConsoleTranscript = writable<string>('');
export const rightPaneTab = writable<'console' | 'visualizer' | 'analysis'>('visualizer');

// Derived state
export const currentTraceStep = derived(
  [traceSteps, currentStepIndex],
  ([$steps, $index]) => $steps[$index] || null
);
