import { createAppState } from './store.js';

const STORAGE_KEY = 'workload-time-tracker:v1';

export function loadState(storage = globalThis.localStorage, today) {
  if (!storage) {
    return createAppState(today);
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return createAppState(today);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return createAppState(today);
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
