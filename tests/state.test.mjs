import assert from 'node:assert/strict';
import {
  addTask,
  createAppState,
  hideTask,
  updateTask,
  upsertWeeklyGoal
} from '../src/state/store.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('createAppState seeds the required project and task presets', () => {
  const state = createAppState('2026-08-03');

  assert.equal(state.projects.length, 6);
  assert.equal(state.tasks.length, 24);
  assert.ok(state.tasks.some((task) => task.name === 'エンジニア提案' && task.countable));
  assert.ok(state.tasks.some((task) => task.name === 'メール/チャット' && !task.countable));
});

test('addTask creates an active task under a selected project', () => {
  const state = createAppState('2026-08-03');
  const next = addTask(state, {
    projectId: 'routine-admin',
    name: '請求チェック',
    nature: 'admin',
    countable: false
  });

  assert.equal(next.tasks.length, 25);
  assert.ok(
    next.tasks.some(
      (task) =>
        task.projectId === 'routine-admin' &&
        task.name === '請求チェック' &&
        task.status === 'active'
    )
  );
});

test('updateTask edits task metadata without changing unrelated tasks', () => {
  const state = createAppState('2026-08-03');
  const target = state.tasks.find((task) => task.name === 'テレアポ');
  const other = state.tasks.find((task) => task.name === '面接');
  const next = updateTask(state, target.id, {
    name: '架電',
    countable: false,
    nature: 'admin'
  });

  assert.equal(next.tasks.find((task) => task.id === target.id).name, '架電');
  assert.equal(next.tasks.find((task) => task.id === target.id).countable, false);
  assert.deepEqual(next.tasks.find((task) => task.id === other.id), other);
});

test('hideTask marks a task hidden and leaves existing historical entries intact', () => {
  const state = {
    ...createAppState('2026-08-03'),
    dayActuals: [{ date: '2026-08-03', hour: 9, taskId: 'ses-sales-1' }]
  };
  const next = hideTask(state, 'ses-sales-1');

  assert.equal(next.tasks.find((task) => task.id === 'ses-sales-1').status, 'hidden');
  assert.deepEqual(next.dayActuals, [{ date: '2026-08-03', hour: 9, taskId: 'ses-sales-1' }]);
});

test('upsertWeeklyGoal replaces an existing target for the same task and week', () => {
  const state = createAppState('2026-08-03');
  const withGoal = upsertWeeklyGoal(state, '2026-08-03', 'ses-sales-1', 10);
  const updated = upsertWeeklyGoal(withGoal, '2026-08-03', 'ses-sales-1', 18);

  assert.equal(updated.weeklyGoals.filter((goal) => goal.taskId === 'ses-sales-1').length, 1);
  assert.equal(updated.weeklyGoals.find((goal) => goal.taskId === 'ses-sales-1').targetCount, 18);
});
