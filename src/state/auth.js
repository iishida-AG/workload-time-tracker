import { hasFirebaseConfig } from './firebase-sync.js?v=20260807-whitefix-v1';
import { getFirebaseApp } from './firebase-app.js?v=20260807-whitefix-v1';
import { importFirebaseAuthModule } from './firebase-modules.js?v=20260807-whitefix-v1';

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
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'メールアドレスまたはパスワードが違います';
  }
  if (code.includes('too-many-requests')) {
    return 'ログイン試行が多すぎます。少し時間をおいてください';
  }
  return 'ログインに失敗しました';
}

function createFirebaseAuthController(firebaseConfig) {
  let authPromise;

  async function getAuthApi() {
    if (!authPromise) {
      authPromise = Promise.all([getFirebaseApp(firebaseConfig), importFirebaseAuthModule()]).then(
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

  return {
    mode: 'firebase-auth',
    async subscribe(callback) {
      callback({ status: 'loading', user: null, error: '' });
      let authApi;
      try {
        authApi = await withTimeout(getAuthApi(), 8000, 'Firebase Authの読み込みがタイムアウトしました');
      } catch (error) {
        callback({ status: 'signed-out', user: null, error: '認証を開始できませんでした。しばらく待って再読み込みしてください。' });
        throw error;
      }
      const { auth, instance } = authApi;
      return auth.onAuthStateChanged(
        instance,
        (user) => callback({ status: user ? 'signed-in' : 'signed-out', user, error: '' }),
        () => callback({ status: 'signed-out', user: null, error: '認証状態を確認できませんでした' })
      );
    },
    async login(email, password) {
      const { auth, instance } = await getAuthApi();
      try {
        const credential = await auth.signInWithEmailAndPassword(instance, email, password);
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

export function createAuthController({ firebaseConfig }) {
  return authIsRequired(firebaseConfig) ? createFirebaseAuthController(firebaseConfig) : createLocalAuthController();
}
