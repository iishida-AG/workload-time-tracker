import { importFirebaseAppModule } from './firebase-modules.js';

export async function getFirebaseApp(firebaseConfig) {
  const { getApp, getApps, initializeApp } = await importFirebaseAppModule();
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}
