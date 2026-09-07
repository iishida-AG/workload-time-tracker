import { createAppState, normalizeState } from './store.js';
import { loadState, saveState } from './storage.js';
import { getFirebaseApp } from './firebase-app.js';
import { importFirebaseFirestoreModule } from './firebase-modules.js';

export function hasFirebaseConfig(config) {
  const requiredValues = [config?.apiKey, config?.projectId, config?.appId].map((value) => String(value ?? '').trim());
  return requiredValues.every((value) => value && !/(REPLACE|YOUR|TODO|PLACEHOLDER|EXAMPLE)/i.test(value));
}

const keyedCollections = {
  timelineSettings: (row) => `${row.userId}|${row.date}`,
  quarterGoalNotes: (row) => `${row.userId}|${row.quarterStart}`,
  quarterGoals: (row) => `${row.userId}|${row.quarterStart}|${row.taskId}`,
  weeklyGoalNotes: (row) => `${row.userId}|${row.weekStart}`,
  weeklyProjectGoals: (row) => `${row.userId}|${row.weekStart}|${row.projectId}`,
  weeklyGoals: (row) => `${row.userId}|${row.weekStart}|${row.taskId}`,
  weeklyGoalActions: (row) => `${row.userId}|${row.weekStart}|${row.taskId}`,
  monthlyProjectGoals: (row) => `${row.userId}|${row.month}|${row.projectId}`,
  monthlyTaskTargets: (row) => `${row.userId}|${row.month}|${row.taskId}`,
  projectGoalVisibility: (row) => `${row.userId}|${row.projectId}`,
  dayPlans: (row) => `${row.userId}|${row.date}|${row.hour}`,
  dayActuals: (row) => `${row.userId}|${row.date}|${row.hour}`,
  dailyCounts: (row) => `${row.userId}|${row.date}|${row.taskId}`,
  weeklyReviews: (row) => `${row.userId}|${row.weekStart}`,
  weeklyTodos: (row) => `${row.userId}|${row.weekStart}`
};

const userScopedCollectionNames = Object.keys(keyedCollections);
const workloadUserIds = ['ishida', 'tanoue'];

function mergeRowsByKey(remoteRows = [], localRows = [], keyFor) {
  const rowsByKey = new Map();
  for (const row of remoteRows) rowsByKey.set(keyFor(row), row);
  for (const row of localRows) rowsByKey.set(keyFor(row), row);
  return [...rowsByKey.values()];
}

function mergeMasterRows(remoteRows = [], localRows = []) {
  return mergeRowsByKey(remoteRows, localRows, (row) => row.id);
}

export function mergeSharedStateForSave(remoteState, localNextState) {
  const remote = normalizeState(remoteState ?? {});
  const local = normalizeState(localNextState ?? {});
  const merged = {
    ...remote,
    ...local,
    projects: mergeMasterRows(remote.projects, local.projects),
    tasks: mergeMasterRows(remote.tasks, local.tasks)
  };

  for (const [collectionName, keyFor] of Object.entries(keyedCollections)) {
    merged[collectionName] = mergeRowsByKey(remote[collectionName], local[collectionName], keyFor);
  }

  return normalizeState(merged);
}

function rootStateForSave(state, activeUserId, legacyState = state) {
  const normalized = normalizeState(state ?? {});
  const legacy = normalizeState(legacyState ?? {});
  const rootState = { ...normalized };
  for (const collectionName of userScopedCollectionNames) {
    rootState[collectionName] = activeUserId
      ? legacy[collectionName].filter(
          (row) => (row.userId ?? 'ishida') !== activeUserId
        )
      : [];
  }
  return rootState;
}

function userStateForSave(state, userId) {
  const normalized = normalizeState(state ?? {});
  const userState = {
    projects: [],
    tasks: []
  };
  for (const collectionName of userScopedCollectionNames) {
    userState[collectionName] = (normalized[collectionName] ?? []).filter(
      (row) => (row.userId ?? 'ishida') === userId
    );
  }
  return userState;
}

export function combineSharedStateSnapshots(rootState, userStatesById = {}) {
  const combined = normalizeState(rootState ?? {});
  for (const userId of workloadUserIds) {
    const userState = normalizeState({ ...(userStatesById[userId] ?? {}), projects: [], tasks: [] });
    for (const [collectionName, keyFor] of Object.entries(keyedCollections)) {
      combined[collectionName] = mergeRowsByKey(combined[collectionName], userState[collectionName], keyFor);
    }
  }
  return normalizeState(combined);
}

function workloadRootRef(firestore, db) {
  return firestore.doc(db, 'workloadApps', 'default');
}

function workloadUserRef(firestore, db, userId) {
  return firestore.doc(db, 'workloadApps', 'default', 'users', userId);
}

export function createLocalStateAdapter(storage = globalThis.localStorage, today) {
  let state = loadState(storage, today);
  const listeners = new Set();
  return {
    mode: 'local',
    subscribe(callback) {
      listeners.add(callback);
      callback(state);
      return () => listeners.delete(callback);
    },
    save(nextState) {
      state = normalizeState(nextState);
      saveState(state, storage);
      for (const listener of listeners) listener(state);
    }
  };
}

export function createFirestoreStateAdapter(
  firebaseConfig,
  today,
  deps = { getFirebaseApp, importFirebaseFirestoreModule }
) {
  let saveQueue = Promise.resolve();
  return {
    mode: 'firestore',
    async subscribe(callback) {
      const [app, firestore] = await Promise.all([
        deps.getFirebaseApp(firebaseConfig),
        deps.importFirebaseFirestoreModule()
      ]);
      const db = firestore.getFirestore(app);
      const rootRef = workloadRootRef(firestore, db);
      const userRefs = Object.fromEntries(workloadUserIds.map((userId) => [userId, workloadUserRef(firestore, db, userId)]));
      return new Promise((resolve, reject) => {
        let settled = false;
        const snapshots = {};
        const unsubscribes = [];
        const unsubscribe = () => {
          for (const cleanup of unsubscribes) cleanup();
        };
        const rejectSubscription = (error) => {
          if (!settled) {
            settled = true;
            reject(error);
            return;
          }
          console.error('Firestore subscription failed', error);
        };
        const emitIfReady = () => {
          if (!snapshots.root || workloadUserIds.some((userId) => !snapshots[userId])) return;
          callback(combineSharedStateSnapshots(snapshots.root, Object.fromEntries(workloadUserIds.map((userId) => [userId, snapshots[userId]]))));
          if (!settled) {
            settled = true;
            resolve(unsubscribe);
          }
        };
        unsubscribes.push(firestore.onSnapshot(rootRef, async (snapshot) => {
          try {
            if (!snapshot.exists()) {
              const initial = createAppState(today);
              await firestore.setDoc(rootRef, rootStateForSave(initial), { merge: true });
              snapshots.root = initial;
            } else {
              snapshots.root = snapshot.data();
            }
            emitIfReady();
          } catch (error) {
            rejectSubscription(error);
          }
        }, rejectSubscription));
        for (const [userId, userRef] of Object.entries(userRefs)) {
          unsubscribes.push(firestore.onSnapshot(userRef, (snapshot) => {
            snapshots[userId] = snapshot.exists() ? snapshot.data() : {};
            emitIfReady();
          }, rejectSubscription));
        }
      });
    },
    save(nextState, options = {}) {
      const saveRequest = saveQueue.then(async () => {
        const [app, firestore] = await Promise.all([
          deps.getFirebaseApp(firebaseConfig),
          deps.importFirebaseFirestoreModule()
        ]);
        const db = firestore.getFirestore(app);
        const userId = workloadUserIds.includes(options.userId) ? options.userId : 'ishida';
        const rootRef = workloadRootRef(firestore, db);
        const userRef = workloadUserRef(firestore, db, userId);
        if (typeof firestore.runTransaction === 'function') {
          await firestore.runTransaction(db, async (transaction) => {
            const rootSnapshot = await transaction.get(rootRef);
            const remoteRoot = rootSnapshot.exists() ? rootSnapshot.data() : createAppState(today);
            transaction.set(
              rootRef,
              rootStateForSave(mergeSharedStateForSave(remoteRoot, nextState), userId, remoteRoot),
              { merge: true }
            );
            transaction.set(userRef, userStateForSave(nextState, userId), { merge: true });
          });
          return;
        }
        if (typeof firestore.getDoc === 'function') {
          const rootSnapshot = await firestore.getDoc(rootRef);
          const remoteRoot = rootSnapshot.exists() ? rootSnapshot.data() : createAppState(today);
          await Promise.all([
            firestore.setDoc(
              rootRef,
              rootStateForSave(mergeSharedStateForSave(remoteRoot, nextState), userId, remoteRoot),
              { merge: true }
            ),
            firestore.setDoc(userRef, userStateForSave(nextState, userId), { merge: true })
          ]);
          return;
        }
        await Promise.all([
          firestore.setDoc(rootRef, rootStateForSave(nextState, userId, {}), { merge: true }),
          firestore.setDoc(userRef, userStateForSave(nextState, userId), { merge: true })
        ]);
      });
      saveQueue = saveRequest.catch(() => {});
      return saveRequest;
    }
  };
}

export function createStateAdapter({ storage = globalThis.localStorage, today, firebaseConfig }) {
  if (!hasFirebaseConfig(firebaseConfig)) {
    return createLocalStateAdapter(storage, today);
  }
  return createFirestoreStateAdapter(firebaseConfig, today);
}
