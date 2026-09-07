import assert from 'node:assert/strict';
import { createMemoryStorage } from './test-utils.mjs';
import {
  combineSharedStateSnapshots,
  createFirestoreStateAdapter,
  createLocalStateAdapter,
  createStateAdapter,
  hasFirebaseConfig,
  mergeSharedStateForSave
} from '../src/state/firebase-sync.js';
import { firebaseModuleSpecifiers } from '../src/state/firebase-modules.js';
import { loadState, STORAGE_KEY } from '../src/state/storage.js';

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await test('hasFirebaseConfig rejects placeholder config', () => {
  assert.equal(hasFirebaseConfig({ apiKey: '', projectId: 'REPLACE_WITH_FIREBASE_PROJECT_ID' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'REPLACE_WITH_FIREBASE_API_KEY', projectId: 'real-project', appId: 'app' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: '   ', projectId: 'real-project', appId: 'app' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'api-key', projectId: 'YOUR_PROJECT_ID', appId: 'app' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'abc', projectId: 'real-project', appId: 'app' }), true);
});

await test('loadState falls back to v1 when the v2 value is empty', () => {
  const storage = createMemoryStorage();
  const legacyState = { projects: [], tasks: [], weeklyReviews: [{ weekStart: '2026-08-03' }] };
  storage.setItem(STORAGE_KEY, '');
  storage.setItem('workload-time-tracker:v1', JSON.stringify(legacyState));

  assert.equal(loadState(storage, '2026-08-05').weeklyReviews[0].weekStart, '2026-08-03');
});

await test('createLocalStateAdapter immediately emits and saves state', () => {
  const storage = createMemoryStorage();
  const adapter = createLocalStateAdapter(storage, '2026-08-05');
  const snapshots = [];
  const unsubscribe = adapter.subscribe((nextState) => snapshots.push(nextState));
  adapter.save({ ...snapshots[0], weeklyReviews: [{ weekStart: '2026-08-03', discussionItems: '- A' }] });
  unsubscribe();

  assert.equal(snapshots.length, 2);
  assert.equal(JSON.parse(storage.getItem('workload-time-tracker:v2')).weeklyReviews[0].discussionItems, '- A');
});

await test('createStateAdapter uses local adapter when firebase config is incomplete', () => {
  const adapter = createStateAdapter({
    storage: createMemoryStorage(),
    today: '2026-08-05',
    firebaseConfig: { apiKey: '', projectId: '' }
  });

  assert.equal(adapter.mode, 'local');
});

await test('Firebase modules use browser-resolvable CDN specifiers for GitHub Pages', () => {
  assert.match(firebaseModuleSpecifiers.app, /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-app\.js$/);
  assert.match(firebaseModuleSpecifiers.auth, /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-auth\.js$/);
  assert.match(
    firebaseModuleSpecifiers.firestore,
    /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js$/
  );
});

await test('createFirestoreStateAdapter rejects when the snapshot listener reports an error', async () => {
  const expectedError = new Error('permission denied');
  let emitted = false;
  const adapter = createFirestoreStateAdapter({ apiKey: 'api', projectId: 'project', appId: 'app' }, '2026-08-05', {
    getFirebaseApp: async () => ({}),
    importFirebaseFirestoreModule: async () => ({
      getFirestore: () => ({}),
      doc: () => ({}),
      onSnapshot: (_ref, _onNext, onError) => {
        if (!emitted) {
          emitted = true;
          onError(expectedError);
        }
        return () => {};
      }
    })
  });

  await assert.rejects(() => adapter.subscribe(() => {}), expectedError);
});

await test('mergeSharedStateForSave preserves other users rows during same-day saves', () => {
  const remoteState = {
    projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
    tasks: [{ id: 't1', projectId: 'p1', name: 'Proposal', nature: 'core', countable: true, status: 'active', order: 1 }],
    dayPlans: [{ userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 't1', items: [{ taskId: 't1', minutes: 60, note: 'Tanoue plan' }] }],
    dayActuals: [{ userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 't1', items: [{ taskId: 't1', minutes: 30, note: 'Tanoue actual' }] }],
    dailyCounts: [{ userId: 'tanoue', date: '2026-08-05', taskId: 't1', count: 7 }],
    weeklyGoals: [{ userId: 'tanoue', weekStart: '2026-08-03', taskId: 't1', targetCount: 12 }],
    weeklyTodos: [{ userId: 'tanoue', weekStart: '2026-08-03', todoText: '- Tanoue task', checkedItems: {} }]
  };
  const localNextState = {
    ...remoteState,
    dayPlans: [{ userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', items: [{ taskId: 't1', minutes: 60, note: 'Ishida plan' }] }],
    dayActuals: [{ userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', items: [{ taskId: 't1', minutes: 60, note: 'Ishida actual' }] }],
    dailyCounts: [{ userId: 'ishida', date: '2026-08-05', taskId: 't1', count: 2 }],
    weeklyGoals: [{ userId: 'ishida', weekStart: '2026-08-03', taskId: 't1', targetCount: 10 }],
    weeklyTodos: [{ userId: 'ishida', weekStart: '2026-08-03', todoText: '- Ishida task', checkedItems: { 0: true } }]
  };

  const merged = mergeSharedStateForSave(remoteState, localNextState);

  assert.equal(merged.dayPlans.length, 2);
  assert.equal(merged.dayActuals.length, 2);
  assert.equal(merged.dailyCounts.length, 2);
  assert.equal(merged.weeklyGoals.length, 2);
  assert.equal(merged.weeklyTodos.length, 2);
  assert.equal(merged.dailyCounts.find((row) => row.userId === 'tanoue').count, 7);
  assert.equal(merged.dailyCounts.find((row) => row.userId === 'ishida').count, 2);
});

await test('combineSharedStateSnapshots reads legacy root data and user-specific documents together', () => {
  const combined = combineSharedStateSnapshots(
    {
      projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
      tasks: [{ id: 't1', projectId: 'p1', name: 'Proposal', nature: 'core', countable: true, status: 'active', order: 1 }],
      dailyCounts: [{ userId: 'ishida', date: '2026-08-04', taskId: 't1', count: 1 }]
    },
    {
      ishida: { dailyCounts: [{ userId: 'ishida', date: '2026-08-05', taskId: 't1', count: 2 }] },
      tanoue: { dailyCounts: [{ userId: 'tanoue', date: '2026-08-05', taskId: 't1', count: 7 }] }
    }
  );

  assert.equal(combined.dailyCounts.length, 3);
  assert.equal(combined.dailyCounts.find((row) => row.userId === 'tanoue').count, 7);
});

await test('createFirestoreStateAdapter saves user-scoped rows to the active users document', async () => {
  const writes = [];
  const adapter = createFirestoreStateAdapter({ apiKey: 'api', projectId: 'project', appId: 'app' }, '2026-08-05', {
    getFirebaseApp: async () => ({}),
    importFirebaseFirestoreModule: async () => ({
      getFirestore: () => ({}),
      doc: (_db, ...segments) => ({ path: segments.join('/') }),
      runTransaction: async (_db, callback) =>
        callback({
          get: async (ref) => ({
            exists: () => ref.path === 'workloadApps/default',
            data: () => ({
              projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
              tasks: [{ id: 't1', projectId: 'p1', name: 'Proposal', nature: 'core', countable: true, status: 'active', order: 1 }]
            })
          }),
          set: (ref, data) => writes.push({ path: ref.path, data })
        })
    })
  });

  await adapter.save(
    {
      projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
      tasks: [{ id: 't1', projectId: 'p1', name: 'Proposal', nature: 'core', countable: true, status: 'active', order: 1 }],
      dailyCounts: [
        { userId: 'ishida', date: '2026-08-05', taskId: 't1', count: 2 },
        { userId: 'tanoue', date: '2026-08-05', taskId: 't1', count: 7 }
      ]
    },
    { userId: 'ishida' }
  );

  const userWrite = writes.find((write) => write.path === 'workloadApps/default/users/ishida');
  assert.ok(userWrite);
  assert.deepEqual(userWrite.data.dailyCounts, [{ userId: 'ishida', date: '2026-08-05', taskId: 't1', count: 2 }]);
  assert.equal(writes.some((write) => write.path === 'workloadApps/default/users/tanoue'), false);
});
