import { createAppState, normalizeState } from './store.js';
import { loadState, saveState } from './storage.js';
import { getFirebaseApp } from './firebase-app.js';
import { importFirebaseFirestoreModule } from './firebase-modules.js';

export function hasFirebaseConfig(config) {
  const requiredValues = [config?.apiKey, config?.projectId, config?.appId].map((value) => String(value ?? '').trim());
  return requiredValues.every((value) => value && !/(REPLACE|YOUR|TODO|PLACEHOLDER|EXAMPLE)/i.test(value));
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
  return {
    mode: 'firestore',
    async subscribe(callback) {
      const [app, firestore] = await Promise.all([
        deps.getFirebaseApp(firebaseConfig),
        deps.importFirebaseFirestoreModule()
      ]);
      const db = firestore.getFirestore(app);
      const ref = firestore.doc(db, 'workloadApps', 'default');
      return new Promise((resolve, reject) => {
        let settled = false;
        let unsubscribe = () => {};
        const rejectSubscription = (error) => {
          if (!settled) {
            settled = true;
            reject(error);
            return;
          }
          console.error('Firestore subscription failed', error);
        };
        unsubscribe = firestore.onSnapshot(ref, async (snapshot) => {
          try {
            if (!snapshot.exists()) {
              const initial = createAppState(today);
              await firestore.setDoc(ref, initial);
              callback(initial);
            } else {
              callback(normalizeState(snapshot.data()));
            }
            if (!settled) {
              settled = true;
              resolve(unsubscribe);
            }
          } catch (error) {
            rejectSubscription(error);
          }
        }, rejectSubscription);
      });
    },
    async save(nextState) {
      const [app, firestore] = await Promise.all([getFirebaseApp(firebaseConfig), importFirebaseFirestoreModule()]);
      const db = firestore.getFirestore(app);
      await firestore.setDoc(firestore.doc(db, 'workloadApps', 'default'), normalizeState(nextState), { merge: true });
    }
  };
}

export function createStateAdapter({ storage = globalThis.localStorage, today, firebaseConfig }) {
  if (!hasFirebaseConfig(firebaseConfig)) {
    return createLocalStateAdapter(storage, today);
  }
  return createFirestoreStateAdapter(firebaseConfig, today);
}
