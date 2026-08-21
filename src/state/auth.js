import { hasFirebaseConfig } from './firebase-sync.js';
import { getFirebaseApp } from './firebase-app.js';
import { importFirebaseAuthModule } from './firebase-modules.js';

export function authIsRequired(firebaseConfig) {
  return hasFirebaseConfig(firebaseConfig);
}

function createLocalAuthController() {
  return {
    mode: 'local',
    subscribe(callback) {
      callback({ status: 'signed-in', user: { email: 'local' }, error: '' });
      return () => {};
    },
    async login() {
      return { status: 'signed-in', user: { email: 'local' }, error: '' };
    },
    async logout() {
      return { status: 'signed-in', user: { email: 'local' }, error: '' };
    }
  };
}

function mapAuthError(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  if (message.includes('timed out')) {
    return 'ログインに失敗しました。通信状況を確認して再読み込みしてください';
  }
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return '\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\u307e\u305f\u306f\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u9055\u3044\u307e\u3059';
  }
  if (code.includes('too-many-requests')) {
    return '\u30ed\u30b0\u30a4\u30f3\u8a66\u884c\u304c\u591a\u3059\u304e\u307e\u3059\u3002\u5c11\u3057\u6642\u9593\u3092\u304a\u3044\u3066\u304f\u3060\u3055\u3044';
  }
  return '\u30ed\u30b0\u30a4\u30f3\u306b\u5931\u6557\u3057\u307e\u3057\u305f';
}

function createFirebaseAuthController(firebaseConfig, options = {}) {
  let authPromise;
  const authApiFactory = options.authApiFactory;
  const authLoadTimeoutMs = options.authLoadTimeoutMs ?? 8000;
  const authStateTimeoutMs = options.authStateTimeoutMs ?? 3500;
  const loginTimeoutMs = options.loginTimeoutMs ?? 10000;
  const tokenRefreshTimeoutMs = options.tokenRefreshTimeoutMs ?? 8000;

  async function getAuthApi() {
    if (!authPromise) {
      authPromise = authApiFactory
        ? authApiFactory()
        : Promise.all([getFirebaseApp(firebaseConfig), importFirebaseAuthModule()]).then(
            ([app, auth]) => ({ auth, instance: auth.getAuth(app) })
          );
    }
    return authPromise;
  }

  function withTimeout(promise, milliseconds, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), milliseconds);
      })
    ]);
  }

  async function refreshUserToken(user) {
    if (typeof user?.getIdToken !== 'function') return user;
    await withTimeout(user.getIdToken(true), tokenRefreshTimeoutMs, 'Firebase Auth token refresh timed out');
    return user;
  }

  return {
    mode: 'firebase-auth',
    async subscribe(callback) {
      callback({ status: 'loading', user: null, error: '' });
      let authApi;
      try {
        authApi = await withTimeout(getAuthApi(), authLoadTimeoutMs, 'Firebase Auth loading timed out');
      } catch (error) {
        callback({
          status: 'signed-out',
          user: null,
          error: '\u8a8d\u8a3c\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u3057\u3070\u3089\u304f\u5f85\u3063\u3066\u518d\u8aad\u307f\u8fbc\u307f\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
        });
        throw error;
      }
      const { auth, instance } = authApi;
      let receivedInitialState = false;
      let unsubscribeAuthState = () => {};
      const fallbackTimer = setTimeout(() => {
        if (receivedInitialState) return;
        receivedInitialState = true;
        callback({ status: 'signed-out', user: null, error: '' });
      }, authStateTimeoutMs);
      unsubscribeAuthState = auth.onAuthStateChanged(
        instance,
        async (user) => {
          receivedInitialState = true;
          clearTimeout(fallbackTimer);
          if (!user) {
            callback({ status: 'signed-out', user: null, error: '' });
            return;
          }
          try {
            await refreshUserToken(user);
            callback({ status: 'signed-in', user, error: '' });
          } catch {
            callback({ status: 'signed-out', user: null, error: '\u8a8d\u8a3c\u60c5\u5831\u306e\u66f4\u65b0\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u30ed\u30b0\u30a2\u30a6\u30c8\u3057\u3066\u5165\u308a\u76f4\u3057\u3066\u304f\u3060\u3055\u3044' });
          }
        },
        () => {
          receivedInitialState = true;
          clearTimeout(fallbackTimer);
          callback({ status: 'signed-out', user: null, error: '\u8a8d\u8a3c\u72b6\u614b\u3092\u78ba\u8a8d\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f' });
        }
      );
      return () => {
        clearTimeout(fallbackTimer);
        unsubscribeAuthState();
      };
    },
    async login(email, password) {
      try {
        const { auth, instance } = await withTimeout(getAuthApi(), authLoadTimeoutMs, 'Firebase Auth loading timed out');
        const credential = await withTimeout(
          auth.signInWithEmailAndPassword(instance, email, password),
          loginTimeoutMs,
          'Firebase Auth login timed out'
        );
        await refreshUserToken(credential.user);
        return { status: 'signed-in', user: credential.user, error: '' };
      } catch (error) {
        return { status: 'signed-out', user: null, error: mapAuthError(error) };
      }
    },
    async logout() {
      const { auth, instance } = await getAuthApi();
      await auth.signOut(instance);
      return { status: 'signed-out', user: null, error: '' };
    }
  };
}

export function createAuthController({ firebaseConfig, authApiFactory, authLoadTimeoutMs, authStateTimeoutMs, loginTimeoutMs, tokenRefreshTimeoutMs }) {
  return authIsRequired(firebaseConfig)
    ? createFirebaseAuthController(firebaseConfig, { authApiFactory, authLoadTimeoutMs, authStateTimeoutMs, loginTimeoutMs, tokenRefreshTimeoutMs })
    : createLocalAuthController();
}
