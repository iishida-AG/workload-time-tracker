import assert from 'node:assert/strict';
import { authIsRequired, createAuthController } from '../src/state/auth.js';

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await test('authIsRequired follows complete Firebase config', () => {
  assert.equal(authIsRequired({ apiKey: '', projectId: '', appId: '' }), false);
  assert.equal(authIsRequired({ apiKey: 'api', projectId: 'project', appId: 'app' }), true);
});

await test('local auth controller immediately emits a local signed-in state', () => {
  const controller = createAuthController({
    firebaseConfig: { apiKey: '', projectId: '', appId: '' }
  });
  const states = [];
  const unsubscribe = controller.subscribe((state) => states.push(state));
  unsubscribe();

  assert.equal(controller.mode, 'local');
  assert.equal(states.length, 1);
  assert.equal(states[0].status, 'signed-in');
  assert.equal(states[0].user.email, 'local');
});

await test('firebase auth login returns an error instead of staying loading when sign-in hangs', async () => {
  const controller = createAuthController({
    firebaseConfig: { apiKey: 'api', projectId: 'project', appId: 'app' },
    loginTimeoutMs: 5,
    authApiFactory: async () => ({
      instance: {},
      auth: {
        signInWithEmailAndPassword: () => new Promise(() => {})
      }
    })
  });

  const result = await controller.login('iishida@agentgate.jp', 'password');

  assert.equal(result.status, 'signed-out');
  assert.equal(result.user, null);
  assert.equal(result.error, 'ログインに失敗しました。通信状況を確認して再読み込みしてください');
});

await test('firebase auth subscribe returns to signed-out if initial auth state never arrives', async () => {
  const controller = createAuthController({
    firebaseConfig: { apiKey: 'api', projectId: 'project', appId: 'app' },
    authStateTimeoutMs: 5,
    authApiFactory: async () => ({
      instance: {},
      auth: {
        onAuthStateChanged: () => () => {}
      }
    })
  });
  const states = [];
  const unsubscribe = await controller.subscribe((state) => states.push(state));
  await new Promise((resolve) => setTimeout(resolve, 15));
  unsubscribe();

  assert.equal(states[0].status, 'loading');
  assert.equal(states[1].status, 'signed-out');
  assert.equal(states[1].error, '');
});
