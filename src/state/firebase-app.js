import { importFirebaseAppModule } from './firebase-modules.js?v=20260807-whitefix-v1';

export async function getFirebaseApp(firebaseConfig) {
  const { getApp, getApps, initializeApp } = await importFirebaseAppModule();
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}
