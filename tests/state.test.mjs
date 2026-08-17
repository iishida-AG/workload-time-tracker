import assert from 'node:assert/strict';
import {
  addTask,
  createAppState,
  deleteProject,
  deleteTask,
  getTimelineSetting,
  hideProject,
  hideTask,
  normalizeState,
  moveProjectOrder,
  moveTaskOrder,
  updateTask,
  upsertMonthlyProjectGoal,
  upsertReview,
  upsertTimelineSetting,
  toggleWeeklyTodoItem,
  upsertWeeklyTodo,
  upsertWeeklyProjectGoal,
  upsertWeeklyGoal
} from '../src/state/store.js';
import { incrementDailyCount } from '../src/domain/metrics.js';

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

  assert.equal(state.projects.length, 7);
  assert.equal(state.tasks.length, 25);
  assert.ok(state.tasks.some((task) => task.name === 'エンジニア提案' && task.countable));
  assert.ok(state.tasks.some((task) => task.name === 'メール/チャット' && !task.countable));
  assert.ok(state.tasks.some((task) => task.name === '休憩' && task.nature === 'break' && !task.countable));
});

test('addTask creates an active task under a selected project', () => {
  const state = createAppState('2026-08-03');
  const next = addTask(state, {
    projectId: 'routine-admin',
    name: '請求チェック',
    nature: 'admin',
    countable: false
  });

  assert.equal(next.tasks.length, 26);
  assert.ok(
    next.tasks.some(
      (task) =>
        task.projectId === 'routine-admin' &&
        task.name === '請求チェック' &&
        task.status === 'active'
    )
  );
});

test('addTask stores shortcut visibility for selected users', () => {
  const state = createAppState('2026-08-03');
  const next = addTask(state, {
    projectId: 'routine-admin',
    name: 'Tanoue only task',
    nature: 'admin',
    countable: false,
    shortcutVisibility: 'tanoue'
  });

  assert.equal(next.tasks.at(-1).shortcutVisibility, 'tanoue');
});

test('normalizeState defaults older tasks to both shortcut pages', () => {
  const state = createAppState('2026-08-03');
  const legacy = {
    ...state,
    tasks: state.tasks.map(({ shortcutVisibility, ...task }) => task)
  };
  const normalized = normalizeState(legacy);

  assert.ok(normalized.tasks.every((task) => task.shortcutVisibility === 'both'));
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

test('deleteTask marks a task deleted while preserving historical entries', () => {
  const state = {
    ...createAppState('2026-08-03'),
    dayPlans: [{ date: '2026-08-03', hour: 9, taskId: 'ses-sales-1' }]
  };
  const next = deleteTask(state, 'ses-sales-1');

  assert.equal(next.tasks.find((task) => task.id === 'ses-sales-1').status, 'deleted');
  assert.deepEqual(next.dayPlans, [{ date: '2026-08-03', hour: 9, taskId: 'ses-sales-1' }]);
});

test('deleteProject marks a project and its tasks deleted', () => {
  const state = createAppState('2026-08-03');
  const next = deleteProject(state, 'ses-sales');

  assert.equal(next.projects.find((project) => project.id === 'ses-sales').status, 'deleted');
  assert.ok(next.tasks.filter((task) => task.projectId === 'ses-sales').every((task) => task.status === 'deleted'));
});

test('hideProject marks only the project hidden and keeps tasks intact', () => {
  const state = createAppState('2026-08-03');
  const next = hideProject(state, 'ses-sales');

  assert.equal(next.projects.find((project) => project.id === 'ses-sales').status, 'hidden');
  assert.ok(next.tasks.filter((task) => task.projectId === 'ses-sales').every((task) => task.status === 'active'));
});

test('updateTask edits the free text task description', () => {
  const state = createAppState('2026-08-03');
  const next = updateTask(state, 'ses-sales-1', { description: '提案前にスキル要約を確認' });

  assert.equal(next.tasks.find((task) => task.id === 'ses-sales-1').description, '提案前にスキル要約を確認');
});

test('upsertWeeklyGoal replaces an existing target for the same task and week', () => {
  const state = createAppState('2026-08-03');
  const withGoal = upsertWeeklyGoal(state, '2026-08-03', 'ses-sales-1', 10);
  const updated = upsertWeeklyGoal(withGoal, '2026-08-03', 'ses-sales-1', 18);

  assert.equal(updated.weeklyGoals.filter((goal) => goal.taskId === 'ses-sales-1').length, 1);
  assert.equal(updated.weeklyGoals.find((goal) => goal.taskId === 'ses-sales-1').targetCount, 18);
});

test('normalizeState adds user fields and new collections to older local data', () => {
  const oldState = {
    ...createAppState('2026-08-03'),
    projects: createAppState('2026-08-03').projects.filter((project) => project.id !== 'break-control'),
    tasks: createAppState('2026-08-03').tasks.filter((task) => task.id !== 'break-rest'),
    dayPlans: [{ date: '2026-08-03', hour: 9, taskId: 'ses-sales-1', note: 'initial outreach' }],
    dailyCounts: [{ date: '2026-08-03', taskId: 'ses-sales-1', count: 2 }]
  };

  const normalized = normalizeState(oldState, 'tanoue');

  assert.equal(normalized.dayPlans[0].userId, 'tanoue');
  assert.equal(normalized.dailyCounts[0].userId, 'tanoue');
  assert.deepEqual(normalized.timelineSettings, []);
  assert.deepEqual(normalized.weeklyProjectGoals, []);
  assert.deepEqual(normalized.monthlyProjectGoals, []);
  assert.ok(normalized.projects.some((project) => project.id === 'break-control'));
  assert.ok(normalized.tasks.some((task) => task.id === 'break-rest'));
});

test('upsertTimelineSetting stores day-specific hours per user', () => {
  const state = createAppState('2026-08-03');
  const next = upsertTimelineSetting(state, 'ishida', '2026-08-05', 10, 20);

  assert.deepEqual(getTimelineSetting(next, 'ishida', '2026-08-05'), { startHour: 10, endHour: 20 });
  assert.deepEqual(getTimelineSetting(next, 'tanoue', '2026-08-05'), { startHour: 10, endHour: 19 });
});

test('upsertTimelineSetting preserves midnight as a valid start hour', () => {
  const state = createAppState('2026-08-03');
  const next = upsertTimelineSetting(state, 'ishida', '2026-08-05', 0, 2);

  assert.deepEqual(getTimelineSetting(next, 'ishida', '2026-08-05'), { startHour: 0, endHour: 2 });
});

test('weekly and monthly project goals are free text per user and project', () => {
  const state = createAppState('2026-08-03');
  const weekly = upsertWeeklyProjectGoal(
    state,
    'ishida',
    '2026-08-03',
    'ses-sales',
    'Complete initial outreach'
  );
  const monthly = upsertMonthlyProjectGoal(
    weekly,
    'ishida',
    '2026-08',
    'ses-sales',
    'Close ten opportunities this month'
  );

  assert.equal(weekly.weeklyProjectGoals[0].goalText, 'Complete initial outreach');
  assert.equal(monthly.monthlyProjectGoals[0].goalText, 'Close ten opportunities this month');
});

test('incrementDailyCount stores counts per user', () => {
  const state = createAppState('2026-08-03');
  const next = incrementDailyCount(state, '2026-08-05', 'ses-sales-1', 1, 'tanoue');

  assert.deepEqual(next.dailyCounts.find((row) => row.userId === 'tanoue'), {
    userId: 'tanoue',
    date: '2026-08-05',
    taskId: 'ses-sales-1',
    count: 1
  });
});

test('moveTaskOrder swaps task order inside the same project', () => {
  const state = createAppState('2026-08-03');
  const before = state.tasks
    .filter((task) => task.projectId === 'ses-sales')
    .sort((a, b) => a.order - b.order)
    .map((task) => task.id);
  const next = moveTaskOrder(state, before[1], 'up');
  const after = next.tasks
    .filter((task) => task.projectId === 'ses-sales')
    .sort((a, b) => a.order - b.order)
    .map((task) => task.id);

  assert.deepEqual(after.slice(0, 2), [before[1], before[0]]);
});

test('upsertReview stores discussion items as newline bullet text', () => {
  const state = createAppState('2026-08-03');
  const discussionItems = '- Review outreach cadence\n- Identify blockers';
  const next = upsertReview(state, '2026-08-03', { discussionItems });

  assert.equal(next.weeklyReviews[0].discussionItems, discussionItems);
});

test('weekly todos are stored per week and user with checkbox state', () => {
  const state = createAppState('2026-08-10');
  const next = upsertWeeklyTodo(state, '2026-08-10', 'tanoue', '- Confirm invoices\n- Call client');
  const checked = toggleWeeklyTodoItem(next, '2026-08-10', 'tanoue', 1, true);

  assert.equal(checked.weeklyTodos[0].todoText, '- Confirm invoices\n- Call client');
  assert.deepEqual(checked.weeklyTodos[0].checkedItems, { 1: true });
  assert.equal(
    toggleWeeklyTodoItem(checked, '2026-08-10', 'ishida', 0, true).weeklyTodos.find((todo) => todo.userId === 'tanoue').checkedItems[1],
    true
  );
});

test('moveProjectOrder swaps a project with its neighbor', () => {
  const state = createAppState('2026-08-03');
  const movedUp = moveProjectOrder(state, 'telecom-sales', 'up');

  assert.deepEqual(
    movedUp.projects.sort((a, b) => a.order - b.order).map((project) => project.id).slice(0, 3),
    ['ses-sales', 'telecom-sales', 'recruiting-sales']
  );

  const movedDown = moveProjectOrder(movedUp, 'telecom-sales', 'down');

  assert.deepEqual(
    movedDown.projects.sort((a, b) => a.order - b.order).map((project) => project.id).slice(0, 3),
    ['ses-sales', 'recruiting-sales', 'telecom-sales']
  );
});

test('moveProjectOrder leaves boundary projects unchanged', () => {
  const state = createAppState('2026-08-03');
  const unchanged = moveProjectOrder(state, 'ses-sales', 'up');

  assert.deepEqual(unchanged.projects, state.projects);
});
