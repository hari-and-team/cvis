// @ts-nocheck
export const MAX_TRACE_ARRAY_ALLOCATION_LENGTH = 50_000;
export const MAX_TRACE_ARRAY_SNAPSHOT_LENGTH = 32;
const TRACE_SNAPSHOT_DEPTH = 4;

export function snapshotValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= TRACE_SNAPSHOT_DEPTH) {
    return Array.isArray(value) ? '[array]' : '[object]';
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_TRACE_ARRAY_SNAPSHOT_LENGTH)
      .map((entry) => snapshotValue(entry, seen, depth + 1));
  }

  const snapshot = {};
  for (const [key, entry] of Object.entries(value)) {
    snapshot[key] = snapshotValue(entry, seen, depth + 1);
  }
  return snapshot;
}
