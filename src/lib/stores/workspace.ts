import { writable } from 'svelte/store';

export const editorCode = writable<string>('');

export type WorkspaceRightPaneTab = 'console' | 'visualizer' | 'analysis';
export const rightPaneTab = writable<WorkspaceRightPaneTab>('visualizer');

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
