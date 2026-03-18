import { writable, derived } from 'svelte/store';
import type { TraceStep, CompileResult, ExecutionResult } from './types';

// Editor state
export const editorCode = writable<string>(`#include <stdio.h>

int main() {
    printf("Hello World\\n");
    return 0;
}
`);

export const cursorLine = writable<number>(1);
export const cursorColumn = writable<number>(0);

// Visualizer state
export const traceSteps = writable<TraceStep[]>([]);
export const currentStepIndex = writable<number>(0);
export const isPlaying = writable<boolean>(false);
export const playbackSpeed = writable<'slow' | 'normal' | 'fast'>('normal');

// Execution state
export const isCompiling = writable<boolean>(false);
export const isRunning = writable<boolean>(false);
export const lastBinaryPath = writable<string | null>(null);
export const lastCompileResult = writable<CompileResult | null>(null);
export const lastExecutionResult = writable<ExecutionResult | null>(null);
export const errorMessage = writable<string | null>(null);
export const runtimeInput = writable<string>('');
export const scannedInput = writable<string>('');
export const hasScannedInput = writable<boolean>(false);

// Derived: current trace step
export const currentTraceStep = derived(
  [traceSteps, currentStepIndex],
  ([$steps, $index]) => $steps[$index] || null
);
