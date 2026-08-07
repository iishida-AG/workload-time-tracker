const FIREBASE_VERSION = '10.12.5';
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export const firebaseModuleSpecifiers = {
  app: `${FIREBASE_CDN_BASE}/firebase-app.js`,
  auth: `${FIREBASE_CDN_BASE}/firebase-auth.js`,
  firestore: `${FIREBASE_CDN_BASE}/firebase-firestore.js`
};

export function importFirebaseAppModule() {
  return import(firebaseModuleSpecifiers.app);
}

export function importFirebaseAuthModule() {
  return import(firebaseModuleSpecifiers.auth);
}

export function importFirebaseFirestoreModule() {
  return import(firebaseModuleSpecifiers.firestore);
}
