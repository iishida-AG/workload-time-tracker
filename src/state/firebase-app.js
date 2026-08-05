export async function getFirebaseApp(firebaseConfig) {
  const { getApp, getApps, initializeApp } = await import('firebase/app');
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}
