import assert from 'node:assert/strict';
import { getTimelineHours } from '../src/domain/calendar.js';
import {
  clearTimelineEntry,
  computeReviewMetrics,
  computeProjectCountSummaries,
  copyPlanToActuals,
  formatDailyScheduleText,
  setTimelineEntry,
  setTimelineNote
} from '../src/domain/metrics.js';
import { getPartnerUserId, USERS } from '../src/domain/users.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const state = {
  projects: [
    { id: 'ses-sales', name: 'SES営業', order: 1, status: 'active' },
    { id: 'routine-admin', name: '共通ルーティン・雑務', order: 2, status: 'active' }
  ],
  tasks: [
    {
      id: 'proposal',
      projectId: 'ses-sales',
      name: 'エンジニア提案',
      nature: 'core',
      countable: true,
      status: 'active',
      order: 1
    },
    {
      id: 'mail',
      projectId: 'routine-admin',
      name: 'メール/チャット',
      nature: 'admin',
      countable: false,
      status: 'active',
      order: 2
    }
  ],
  dayPlans: [
    { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'A社向け' },
    { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'mail', note: '返信処理' }
  ],
  dayActuals: [],
  weeklyGoals: [],
  weeklyProjectGoals: [],
  monthlyProjectGoals: [],
  dailyCounts: [
    { userId: 'ishida', date: '2026-08-05', taskId: 'proposal', count: 3 },
    { userId: 'tanoue', date: '2026-08-05', taskId: 'proposal', count: 8 }
  ],
  weeklyReviews: []
};

test('USERS contains Ishida and Tanoue only', () => {
  assert.deepEqual(USERS.map((user) => user.id), ['ishida', 'tanoue']);
  assert.equal(getPartnerUserId('ishida'), 'tanoue');
});

test('getTimelineHours returns start inclusive and end exclusive hours', () => {
  assert.deepEqual(getTimelineHours(10, 20), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test('getTimelineHours accepts zero as a valid start hour', () => {
  assert.deepEqual(getTimelineHours(0, 2), [0, 1]);
});

test('getTimelineHours treats null start as the default hour', () => {
  assert.deepEqual(getTimelineHours(null, 11), [9, 10]);
});

test('setTimelineEntry and note updates only the selected user date hour', () => {
  const withEntry = setTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 11, 'mail', '社内確認');
  const withNote = setTimelineNote(withEntry, 'dayPlans', 'ishida', '2026-08-05', 11, '議事録確認');

  assert.ok(
    withNote.dayPlans.some(
      (entry) =>
        entry.userId === 'ishida' &&
        entry.hour === 11 &&
        entry.taskId === 'mail' &&
        entry.note === '議事録確認'
    )
  );
  assert.ok(withNote.dayPlans.some((entry) => entry.userId === 'tanoue' && entry.hour === 10 && entry.taskId === 'mail'));
});

test('clearTimelineEntry removes only the selected user date hour', () => {
  const next = clearTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 10);

  assert.equal(next.dayPlans.some((entry) => entry.userId === 'ishida' && entry.hour === 10), false);
  assert.equal(next.dayPlans.some((entry) => entry.userId === 'tanoue' && entry.hour === 10), true);
});

test('copyPlanToActuals copies only one user day plans with notes', () => {
  const next = copyPlanToActuals(state, 'ishida', '2026-08-05');

  assert.deepEqual(next.dayActuals, [
    { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'A社向け' }
  ]);
});

test('legacy copy preserves unrelated user-aware actuals', () => {
  const partnerActual = {
    userId: 'tanoue',
    date: '2026-08-05',
    hour: 9,
    taskId: 'mail',
    note: '返信処理'
  };
  const next = copyPlanToActuals({ ...state, dayActuals: [partnerActual] }, '2026-08-05');

  assert.deepEqual(next.dayActuals, [
    partnerActual,
    { date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'A社向け' }
  ]);
});

test('formatDailyScheduleText uses the requested copy format', () => {
  const text = formatDailyScheduleText(state, 'dayPlans', 'ishida', '2026-08-05', 10, 12);

  assert.equal(text, '10:00-11:00 エンジニア提案：「A社向け」\n11:00-12:00 未入力：「」');
});

test('formatDailyScheduleText keeps single-digit hours unpadded', () => {
  const nineState = {
    ...state,
    dayPlans: [
      ...state.dayPlans,
      { userId: 'ishida', date: '2026-08-05', hour: 9, taskId: 'proposal', note: '自由記入欄' }
    ]
  };
  const text = formatDailyScheduleText(nineState, 'dayPlans', 'ishida', '2026-08-05', 9, 10);

  assert.equal(text, '9:00-10:00 エンジニア提案：「自由記入欄」');
});

test('computeProjectCountSummaries groups countable actuals by project and user', () => {
  const rows = computeProjectCountSummaries(state, 'ishida', '2026-08-03');

  assert.deepEqual(rows, [
    { projectId: 'ses-sales', projectName: 'SES営業', actualCount: 3 },
    { projectId: 'routine-admin', projectName: '共通ルーティン・雑務', actualCount: 0 }
  ]);
});

test('computeProjectCountSummaries aggregates both users when user id is all', () => {
  const rows = computeProjectCountSummaries(state, 'all', '2026-08-03');

  assert.deepEqual(
    rows.map((row) => ({ projectId: row.projectId, actualCount: row.actualCount })),
    [
      { projectId: 'ses-sales', actualCount: 11 },
      { projectId: 'routine-admin', actualCount: 0 }
    ]
  );
});

test('computeReviewMetrics scopes hours counts and gaps to the selected user', () => {
  const metricsState = {
    ...state,
    dayPlans: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'mail' },
      { userId: 'ishida', date: '2026-08-05', hour: 11, taskId: 'proposal' },
      { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'proposal' },
      { userId: 'tanoue', date: '2026-08-05', hour: 12, taskId: 'proposal' }
    ],
    dayActuals: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal' },
      { userId: 'ishida', date: '2026-08-05', hour: 11, taskId: 'mail' },
      { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'mail' },
      { userId: 'tanoue', date: '2026-08-05', hour: 12, taskId: 'mail' }
    ],
    weeklyGoals: [{ weekStart: '2026-08-03', taskId: 'proposal', targetCount: 10 }],
    dailyCounts: [
      { userId: 'ishida', date: '2026-08-05', taskId: 'proposal', count: 3 },
      { userId: 'tanoue', date: '2026-08-05', taskId: 'proposal', count: 8 }
    ]
  };

  const ishidaMetrics = computeReviewMetrics(metricsState, '2026-08-03', { userId: 'ishida' });
  const aggregateMetrics = computeReviewMetrics(metricsState, '2026-08-03');

  assert.equal(ishidaMetrics.totalActualHours, 2);
  assert.deepEqual(ishidaMetrics.natureHours, { core: 1, admin: 1, investment: 0 });
  assert.deepEqual(ishidaMetrics.natureRatios, { core: 50, admin: 50, investment: 0 });
  assert.deepEqual(ishidaMetrics.goalRows, [
    {
      taskId: 'proposal',
      taskName: 'エンジニア提案',
      targetCount: 10,
      actualCount: 3,
      actualHours: 1,
      productivity: 3,
      progressRate: 30
    }
  ]);
  assert.deepEqual(ishidaMetrics.topGaps, [
    { hour: 10, plannedTaskName: 'メール/チャット', actualTaskName: 'エンジニア提案' },
    { hour: 11, plannedTaskName: 'エンジニア提案', actualTaskName: 'メール/チャット' }
  ]);

  assert.equal(aggregateMetrics.totalActualHours, 4);
  assert.deepEqual(aggregateMetrics.natureHours, { core: 1, admin: 3, investment: 0 });
  assert.equal(aggregateMetrics.goalRows[0].actualCount, 11);
});
