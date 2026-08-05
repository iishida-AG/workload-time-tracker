import assert from 'node:assert/strict';
import { createMemoryStorage } from './test-utils.mjs';
import { createLocalStateAdapter, createStateAdapter, hasFirebaseConfig } from '../src/state/firebase-sync.js';
import { firebaseModuleSpecifiers } from '../src/state/firebase-modules.js';
import { loadState, STORAGE_KEY } from '../src/state/storage.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('hasFirebaseConfig rejects placeholder config', () => {
  assert.equal(hasFirebaseConfig({ apiKey: '', projectId: 'REPLACE_WITH_FIREBASE_PROJECT_ID' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'REPLACE_WITH_FIREBASE_API_KEY', projectId: 'real-project', appId: 'app' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: '   ', projectId: 'real-project', appId: 'app' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'api-key', projectId: 'YOUR_PROJECT_ID', appId: 'app' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'abc', projectId: 'real-project', appId: 'app' }), true);
});

test('loadState falls back to v1 when the v2 value is empty', () => {
  const storage = createMemoryStorage();
  const legacyState = { projects: [], tasks: [], weeklyReviews: [{ weekStart: '2026-08-03' }] };
  storage.setItem(STORAGE_KEY, '');
  storage.setItem('workload-time-tracker:v1', JSON.stringify(legacyState));

  assert.equal(loadState(storage, '2026-08-05').weeklyReviews[0].weekStart, '2026-08-03');
});

test('createLocalStateAdapter immediately emits and saves state', () => {
  const storage = createMemoryStorage();
  const adapter = createLocalStateAdapter(storage, '2026-08-05');
  const snapshots = [];
  const unsubscribe = adapter.subscribe((nextState) => snapshots.push(nextState));
  adapter.save({ ...snapshots[0], weeklyReviews: [{ weekStart: '2026-08-03', discussionItems: '- A' }] });
  unsubscribe();

  assert.equal(snapshots.length, 2);
  assert.equal(JSON.parse(storage.getItem('workload-time-tracker:v2')).weeklyReviews[0].discussionItems, '- A');
});

test('createStateAdapter uses local adapter when firebase config is incomplete', () => {
  const adapter = createStateAdapter({
    storage: createMemoryStorage(),
    today: '2026-08-05',
    firebaseConfig: { apiKey: '', projectId: '' }
  });

  assert.equal(adapter.mode, 'local');
});

test('Firebase modules use browser-resolvable CDN specifiers for GitHub Pages', () => {
  assert.match(firebaseModuleSpecifiers.app, /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-app\.js$/);
  assert.match(firebaseModuleSpecifiers.auth, /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-auth\.js$/);
  assert.match(
    firebaseModuleSpecifiers.firestore,
    /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js$/
  );
});
