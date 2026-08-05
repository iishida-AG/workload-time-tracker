import { createAppState, normalizeState } from './store.js';

export const STORAGE_KEY = 'workload-time-tracker:v2';
const LEGACY_STORAGE_KEY = 'workload-time-tracker:v1';

export function loadState(storage = globalThis.localStorage, today) {
  if (!storage) {
    return normalizeState(createAppState(today), 'ishida');
  }
  const raw = storage.getItem(STORAGE_KEY) || storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return normalizeState(createAppState(today), 'ishida');
  }
  try {
    return normalizeState(JSON.parse(raw), 'ishida');
  } catch {
    return normalizeState(createAppState(today), 'ishida');
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
