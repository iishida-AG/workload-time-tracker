import assert from 'node:assert/strict';
import {
  addTask,
  createAppState,
  deleteQuarterGoal,
  deleteQuarterGoalNote,
  deleteProject,
  deleteTask,
  deleteWeeklyGoal,
  deleteWeeklyGoalNote,
  getTimelineSetting,
  hideProject,
  hideTask,
  normalizeState,
  replaceWeeklyTodoLines,
  moveProjectOrder,
  moveTaskOrder,
  setDailyCount,
  updateTask,
  upsertQuarterGoal,
  upsertQuarterGrossProfitGoal,
  upsertQuarterGoalNote,
  upsertMonthlyTaskTarget,
  upsertMonthlyProjectGoal,
  upsertProjectGoalVisibility,
  upsertReview,
  upsertTimelineSetting,
  toggleWeeklyTodoItem,
  upsertWeeklyTodo,
  upsertWeeklyProjectGoal,
  upsertWeeklyGoal,
  upsertWeeklyGoalAction,
  upsertWeeklyGoalNote
} from '../src/state/store.js';
import { computeProjectCountSummaries, incrementDailyCount } from '../src/domain/metrics.js';

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

test('upsertWeeklyGoalAction stores next actions per user week and task', () => {
  const state = createAppState('2026-08-03');
  const withIshidaAction = upsertWeeklyGoalAction(state, '2026-08-03', 'ses-sales-1', '既存BPに再提案', 'ishida');
  const withTanoueAction = upsertWeeklyGoalAction(withIshidaAction, '2026-08-03', 'ses-sales-1', '候補者に確認', 'tanoue');
  const updated = upsertWeeklyGoalAction(withTanoueAction, '2026-08-03', 'ses-sales-1', '午後に再提案', 'ishida');

  assert.equal(updated.weeklyGoalActions.length, 2);
  assert.equal(
    updated.weeklyGoalActions.find((row) => row.userId === 'ishida' && row.taskId === 'ses-sales-1').actionText,
    '午後に再提案'
  );
  assert.equal(
    updated.weeklyGoalActions.find((row) => row.userId === 'tanoue' && row.taskId === 'ses-sales-1').actionText,
    '候補者に確認'
  );
});

test('count targets and weekly project visibility are scoped per user', () => {
  const state = createAppState('2026-08-03');
  const withIshidaTarget = upsertWeeklyGoal(state, '2026-08-03', 'ses-sales-1', 10, 'ishida');
  const withTanoueTarget = upsertWeeklyGoal(withIshidaTarget, '2026-08-03', 'ses-sales-1', 4, 'tanoue');
  const withMonthlyTarget = upsertMonthlyTaskTarget(withTanoueTarget, 'tanoue', '2026-08', 'ses-sales-1', 40);
  const withTanoueCount = setDailyCount(withMonthlyTarget, 'tanoue', '2026-08-05', 'ses-sales-1', 3);
  const withHiddenTanoue = upsertProjectGoalVisibility(withTanoueCount, 'tanoue', 'ses-sales', false);

  assert.equal(
    withHiddenTanoue.weeklyGoals.find((goal) => goal.userId === 'ishida' && goal.taskId === 'ses-sales-1').targetCount,
    10
  );
  assert.equal(
    withHiddenTanoue.weeklyGoals.find((goal) => goal.userId === 'tanoue' && goal.taskId === 'ses-sales-1').targetCount,
    4
  );
  assert.equal(withHiddenTanoue.monthlyTaskTargets.find((target) => target.userId === 'tanoue').targetCount, 40);
  assert.equal(withHiddenTanoue.dailyCounts.find((count) => count.userId === 'tanoue').count, 3);
  assert.equal(withHiddenTanoue.projectGoalVisibility.find((row) => row.userId === 'tanoue').visible, false);
  assert.equal(withHiddenTanoue.projectGoalVisibility.some((row) => row.userId === 'ishida'), false);
});

test('project count summaries keep hidden master projects until deleted', () => {
  const state = hideProject(createAppState('2026-08-03'), 'ses-sales');
  const rows = computeProjectCountSummaries(state, 'ishida', '2026-08-03');

  assert.ok(rows.some((row) => row.projectId === 'ses-sales'));
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
  assert.deepEqual(normalized.weeklyGoalActions, []);
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

test('upsertReview stores review forms per user', () => {
  const state = createAppState('2026-08-03');
  const ishida = upsertReview(state, '2026-08-03', { userId: 'ishida', goalReflection: 'Ishida review' });
  const tanoue = upsertReview(ishida, '2026-08-03', { userId: 'tanoue', goalReflection: 'Tanoue review' });

  assert.equal(tanoue.weeklyReviews.length, 2);
  assert.equal(tanoue.weeklyReviews.find((review) => review.userId === 'ishida').goalReflection, 'Ishida review');
  assert.equal(tanoue.weeklyReviews.find((review) => review.userId === 'tanoue').goalReflection, 'Tanoue review');
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

test('review state normalizes additive goal collections and structured review fields', () => {
  const normalized = normalizeState({
    projects: [],
    tasks: [],
    weeklyReviews: [
      {
        userId: 'ishida',
        weekStart: '2026-09-07',
        goalReflection: '成果',
        overtimeCause: '準備不足'
      }
    ]
  });

  assert.deepEqual(normalized.quarterGoalNotes, []);
  assert.deepEqual(normalized.quarterGoals, []);
  assert.deepEqual(normalized.weeklyGoalNotes, []);
  assert.equal(normalized.weeklyReviews[0].goodPoints, '成果');
  assert.deepEqual(normalized.weeklyReviews[0].reflections, ['準備不足', '', '']);
  assert.deepEqual(normalized.weeklyReviews[0].improvements, ['', '', '']);
});

test('quarter and weekly goal rows update only their exact user and period', () => {
  let next = createAppState('2026-09-07');
  next = upsertQuarterGoalNote(next, 'ishida', '2026-09-01', 'q-note-1', '重点顧客');
  next = upsertQuarterGoalNote(next, 'ishida', '2026-09-01', 'q-note-2', '採用強化');
  next = upsertWeeklyGoalNote(next, 'tanoue', '2026-09-07', 'w-note-1', '当日追客');
  next = upsertQuarterGoal(next, 'ishida', '2026-09-01', 'ses-sales-1', 120);

  assert.deepEqual(next.quarterGoalNotes[0].items.map((item) => item.text), ['重点顧客', '採用強化']);
  assert.equal(next.weeklyGoalNotes[0].userId, 'tanoue');
  assert.equal(next.quarterGoals[0].targetCount, 120);

  next = deleteQuarterGoalNote(next, 'ishida', '2026-09-01', 'q-note-1');
  next = deleteWeeklyGoalNote(next, 'tanoue', '2026-09-07', 'w-note-1');
  next = deleteQuarterGoal(next, 'ishida', '2026-09-01', 'ses-sales-1');
  assert.deepEqual(next.quarterGoalNotes[0].items.map((item) => item.text), ['採用強化']);
  assert.deepEqual(next.weeklyGoalNotes[0].items, []);
  assert.deepEqual(next.quarterGoals, []);
});

test('quarter gross profit goals update only their exact user, period, and row', () => {
  const state = {
    ...createAppState('2026-09-07'),
    quarterGoals: [
      {
        userId: 'ishida',
        quarterStart: '2026-09-01',
        id: 'gross-1',
        goalText: 'SES粗利',
        targetGrossProfit: 300,
        actualGrossProfit: 120
      },
      {
        userId: 'tanoue',
        quarterStart: '2026-09-01',
        id: 'gross-1',
        goalText: '田上粗利',
        targetGrossProfit: 500,
        actualGrossProfit: 200
      },
      {
        userId: 'ishida',
        quarterStart: '2026-12-01',
        id: 'gross-1',
        goalText: '次Q粗利',
        targetGrossProfit: 600,
        actualGrossProfit: 0
      }
    ]
  };

  let next = upsertQuarterGrossProfitGoal(state, 'ishida', '2026-09-01', 'gross-1', {
    goalText: 'SES粗利を伸ばす',
    targetGrossProfit: 350.5,
    actualGrossProfit: 210.25
  });

  assert.deepEqual(next.quarterGoals[0], {
    userId: 'ishida',
    quarterStart: '2026-09-01',
    id: 'gross-1',
    goalText: 'SES粗利を伸ばす',
    targetGrossProfit: 350.5,
    actualGrossProfit: 210.25
  });
  assert.equal(next.quarterGoals[1].actualGrossProfit, 200);
  assert.equal(next.quarterGoals[2].targetGrossProfit, 600);

  next = upsertQuarterGrossProfitGoal(next, 'ishida', '2026-09-01', 'gross-2', {
    goalText: '新規事業',
    targetGrossProfit: -10,
    actualGrossProfit: 'bad'
  });
  assert.deepEqual(next.quarterGoals.at(-1), {
    userId: 'ishida',
    quarterStart: '2026-09-01',
    id: 'gross-2',
    goalText: '新規事業',
    targetGrossProfit: 0,
    actualGrossProfit: 0
  });

  next = deleteQuarterGoal(next, 'ishida', '2026-09-01', 'gross-1');
  assert.equal(next.quarterGoals.some((goal) => goal.userId === 'ishida' && goal.quarterStart === '2026-09-01' && goal.id === 'gross-1'), false);
  assert.equal(next.quarterGoals.some((goal) => goal.userId === 'tanoue' && goal.id === 'gross-1'), true);
  assert.equal(next.quarterGoals.some((goal) => goal.quarterStart === '2026-12-01' && goal.id === 'gross-1'), true);
});

test('weekly goal deletion keeps other users and daily actual counts', () => {
  const state = {
    ...createAppState('2026-09-07'),
    weeklyGoals: [
      { userId: 'ishida', weekStart: '2026-09-07', taskId: 'ses-sales-1', targetCount: 10 },
      { userId: 'tanoue', weekStart: '2026-09-07', taskId: 'ses-sales-1', targetCount: 20 }
    ],
    dailyCounts: [{ userId: 'ishida', date: '2026-09-07', taskId: 'ses-sales-1', count: 3 }]
  };
  const next = deleteWeeklyGoal(state, 'ishida', '2026-09-07', 'ses-sales-1');

  assert.deepEqual(next.weeklyGoals, [
    { userId: 'tanoue', weekStart: '2026-09-07', taskId: 'ses-sales-1', targetCount: 20 }
  ]);
  assert.equal(next.dailyCounts[0].count, 3);
});

test('structured review patches preserve untouched old and new fields', () => {
  const initial = upsertReview(createAppState('2026-09-07'), '2026-09-07', {
    userId: 'ishida',
    goodPoints: '即レスできた',
    reflections: ['準備不足', '', ''],
    improvements: ['朝に準備', '', ''],
    discussionItems: '提案配分',
    nextPromise: '旧欄'
  });
  const next = upsertReview(initial, '2026-09-07', {
    userId: 'ishida',
    goodPoints: '面談化した'
  });

  assert.deepEqual(next.weeklyReviews[0].reflections, ['準備不足', '', '']);
  assert.deepEqual(next.weeklyReviews[0].improvements, ['朝に準備', '', '']);
  assert.equal(next.weeklyReviews[0].discussionItems, '提案配分');
  assert.equal(next.weeklyReviews[0].nextPromise, '旧欄');
});

test('next action replacement preserves only unambiguous checkbox matches', () => {
  const initial = {
    ...createAppState('2026-09-07'),
    weeklyTodos: [
      {
        userId: 'ishida',
        weekStart: '2026-09-07',
        todoText: '- 追客\n- 資料作成',
        checkedItems: { 0: true, 1: false }
      }
    ]
  };
  const next = replaceWeeklyTodoLines(initial, '2026-09-07', 'ishida', [
    { id: 'b', text: '資料作成' },
    { id: 'a', text: '追客' },
    { id: 'c', text: '日程調整' }
  ]);

  assert.equal(next.weeklyTodos[0].todoText, '- 資料作成\n- 追客\n- 日程調整');
  assert.deepEqual(next.weeklyTodos[0].checkedItems, { 0: false, 1: true, 2: false });
});

test('goal target normalization clamps malformed and negative values', () => {
  const normalized = normalizeState({
    projects: [],
    tasks: [],
    weeklyGoals: [{ userId: 'ishida', weekStart: '2026-09-07', taskId: 't1', targetCount: -3 }],
    quarterGoals: [{ userId: 'ishida', quarterStart: '2026-09-01', taskId: 't1', targetCount: 'bad' }]
  });

  assert.equal(normalized.weeklyGoals[0].targetCount, 0);
  assert.equal(normalized.quarterGoals[0].targetCount, 0);
});

test('quarter gross profit goal normalization preserves the new row shape', () => {
  const normalized = normalizeState({
    projects: [],
    tasks: [],
    quarterGoals: [{
      quarterStart: '2026-09-01',
      id: 'gross-1',
      goalText: 123,
      targetGrossProfit: -1,
      actualGrossProfit: 'bad'
    }]
  }, 'tanoue');

  assert.deepEqual(normalized.quarterGoals[0], {
    userId: 'tanoue',
    quarterStart: '2026-09-01',
    id: 'gross-1',
    goalText: '123',
    targetGrossProfit: 0,
    actualGrossProfit: 0
  });
});
