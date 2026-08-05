import assert from 'node:assert/strict';
import { authIsRequired, createAuthController } from '../src/state/auth.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('authIsRequired follows complete Firebase config', () => {
  assert.equal(authIsRequired({ apiKey: '', projectId: '', appId: '' }), false);
  assert.equal(authIsRequired({ apiKey: 'api', projectId: 'project', appId: 'app' }), true);
});

test('local auth controller immediately emits a local signed-in state', () => {
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
