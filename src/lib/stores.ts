import { writable, derived } from 'svelte/store';
import type { TraceStep, CompileResult, ExecutionResult, UserProfile } from './types';

// Editor state
export const editorCode = writable<string>('');

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
export const runSessionId = writable<string | null>(null);
export const runConsoleTranscript = writable<string>('');
export const lastRunInputTranscript = writable<string>('');
export const pendingRunInputEcho = writable<string>('');
export type WorkspaceRightPaneTab = 'console' | 'visualizer' | 'analysis' | 'mentor';
export const rightPaneTab = writable<WorkspaceRightPaneTab>('visualizer');

// Learning flow state
export type LearningRightPaneTab = 'output' | 'visualizer' | 'analysis' | 'mentor';
export const activeRightPaneTab = writable<LearningRightPaneTab>('output');
export type MentorSelectionMode = 'guided' | 'manual';
export const mentorSelectionMode = writable<MentorSelectionMode>('guided');
export const selectedPracticeProblemId = writable<string | null>(null);
export const activeMilestoneIndex = writable<number>(0);
export const milestoneProgress = writable<Record<string, boolean>>({});

// Data-safety and sync state
export type SyncStatus = 'local-only' | 'saved' | 'conflict';
export interface SyncConflictState {
  incomingCode: string;
  incomingUpdatedAt: number;
  incomingClientId: string;
}
export const syncStatus = writable<SyncStatus>('local-only');
export const syncConflict = writable<SyncConflictState | null>(null);
export const lastAutosaveAt = writable<number | null>(null);
export const backupSnapshotCount = writable<number>(0);

// User onboarding and local profile state
export const userProfile = writable<UserProfile | null>(null);
export const profileEditorOpen = writable<boolean>(false);

// Derived state
export const currentTraceStep = derived(
  [traceSteps, currentStepIndex],
  ([$steps, $index]) => $steps[$index] || null
);
