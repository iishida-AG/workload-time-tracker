import assert from 'node:assert/strict';
import {
  computePlanActualTimeBreakdown,
  computeReviewTimeBreakdown,
  computeReviewMetrics,
  copyPlanToActuals,
  getImprovementPromiseForWeek,
  incrementDailyCount
} from '../src/domain/metrics.js';

const baseState = {
  projects: [
    { id: 'p-sales', name: '営業', order: 1, status: 'active' },
    { id: 'p-admin', name: '雑務', order: 2, status: 'active' }
  ],
  tasks: [
    {
      id: 'proposal',
      projectId: 'p-sales',
      name: '提案',
      nature: 'core',
      countable: true,
      status: 'active',
      order: 1
    },
    {
      id: 'admin',
      projectId: 'p-admin',
      name: '事務処理',
      nature: 'admin',
      countable: false,
      status: 'active',
      order: 2
    },
    {
      id: 'improve',
      projectId: 'p-admin',
      name: '改善',
      nature: 'investment',
      countable: true,
      status: 'active',
      order: 3
    }
  ],
  dayPlans: [
    { date: '2026-08-03', hour: 9, taskId: 'proposal' },
    { date: '2026-08-03', hour: 10, taskId: 'admin' },
    { date: '2026-08-03', hour: 11, taskId: 'proposal' },
    { date: '2026-08-04', hour: 9, taskId: 'improve' }
  ],
  dayActuals: [
    { date: '2026-08-03', hour: 9, taskId: 'proposal' },
    { date: '2026-08-03', hour: 10, taskId: 'proposal' },
    { date: '2026-08-03', hour: 11, taskId: 'admin' },
    { date: '2026-08-04', hour: 9, taskId: 'improve' },
    { date: '2026-08-05', hour: 9, taskId: 'proposal' }
  ],
  weeklyGoals: [
    { weekStart: '2026-08-03', taskId: 'proposal', targetCount: 12 },
    { weekStart: '2026-08-03', taskId: 'improve', targetCount: 2 }
  ],
  dailyCounts: [
    { date: '2026-08-03', taskId: 'proposal', count: 5 },
    { date: '2026-08-04', taskId: 'proposal', count: 3 },
    { date: '2026-08-04', taskId: 'improve', count: 2 }
  ],
  weeklyReviews: [
    {
      weekStart: '2026-07-27',
      goalReflection: '前週の振り返り',
      overtimeCause: '調整多め',
      nextPromise: '午前中に提案を固める',
      updatedAt: '2026-08-01T10:00:00.000Z'
    }
  ]
};

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('copyPlanToActuals replaces only the selected date actuals with that date plans', () => {
  const next = copyPlanToActuals(baseState, '2026-08-03');

  assert.deepEqual(next.dayActuals, [
    { date: '2026-08-04', hour: 9, taskId: 'improve' },
    { date: '2026-08-05', hour: 9, taskId: 'proposal' },
    { date: '2026-08-03', hour: 9, taskId: 'proposal' },
    { date: '2026-08-03', hour: 10, taskId: 'admin' },
    { date: '2026-08-03', hour: 11, taskId: 'proposal' }
  ]);
});

test('incrementDailyCount creates and clamps daily count records', () => {
  const increased = incrementDailyCount(baseState, '2026-08-03', 'improve', 1);
  const decreased = incrementDailyCount(increased, '2026-08-03', 'improve', -5);

  assert.ok(
    increased.dailyCounts.some(
      (row) => row.date === '2026-08-03' && row.taskId === 'improve' && row.count === 1
    )
  );
  assert.ok(
    decreased.dailyCounts.some(
      (row) => row.date === '2026-08-03' && row.taskId === 'improve' && row.count === 0
    )
  );
});

test('computeReviewMetrics summarizes goals, time, productivity, ratios, and plan gaps', () => {
  const metrics = computeReviewMetrics(baseState, '2026-08-03');

  assert.equal(metrics.totalActualHours, 5);
  assert.equal(metrics.capacityRate, 12.5);
  assert.deepEqual(metrics.natureHours, { core: 3, admin: 1, investment: 1 });
  assert.deepEqual(metrics.natureRatios, { core: 60, admin: 20, investment: 20 });
  assert.deepEqual(metrics.goalRows, [
    {
      taskId: 'proposal',
      taskName: '提案',
      targetCount: 12,
      actualCount: 8,
      actualHours: 3,
      productivity: 2.67,
      progressRate: 66.7
    },
    {
      taskId: 'improve',
      taskName: '改善',
      targetCount: 2,
      actualCount: 2,
      actualHours: 1,
      productivity: 2,
      progressRate: 100
    }
  ]);
  assert.deepEqual(metrics.topGaps, [
    { hour: 10, plannedTaskName: '事務処理', actualTaskName: '提案' },
    { hour: 11, plannedTaskName: '提案', actualTaskName: '事務処理' }
  ]);
});

test('computeReviewMetrics scopes goal targets to the requested user', () => {
  const state = {
    ...baseState,
    weeklyGoals: [
      { userId: 'ishida', weekStart: '2026-08-03', taskId: 'proposal', targetCount: 20 },
      { userId: 'tanoue', weekStart: '2026-08-03', taskId: 'proposal', targetCount: 100 }
    ],
    dailyCounts: [
      { userId: 'ishida', date: '2026-08-03', taskId: 'proposal', count: 10 },
      { userId: 'tanoue', date: '2026-08-03', taskId: 'proposal', count: 50 }
    ]
  };

  const metrics = computeReviewMetrics(state, '2026-08-03', { userId: 'ishida' });

  assert.equal(metrics.goalRows.length, 1);
  assert.equal(metrics.goalRows[0].targetCount, 20);
  assert.equal(metrics.goalRows[0].actualCount, 10);
  assert.equal(metrics.goalRows[0].progressRate, 50);
});

test('computeReviewTimeBreakdown groups actual time by project and task', () => {
  const state = {
    ...baseState,
    dayActuals: [
      { userId: 'ishida', date: '2026-08-03', hour: 9, taskId: 'proposal' },
      { userId: 'ishida', date: '2026-08-03', hour: 10, items: [{ taskId: 'proposal', minutes: 30 }, { taskId: 'admin', minutes: 30 }] },
      { userId: 'tanoue', date: '2026-08-03', hour: 9, taskId: 'improve' }
    ]
  };

  const rows = computeReviewTimeBreakdown(state, '2026-08-03', { userId: 'ishida' });

  assert.deepEqual(rows, [
    {
      projectId: 'p-sales',
      projectName: '営業',
      minutes: 90,
      hours: 1.5,
      ratio: 75,
      tasks: [{ taskId: 'proposal', taskName: '提案', minutes: 90, hours: 1.5, ratio: 100 }]
    },
    {
      projectId: 'p-admin',
      projectName: '雑務',
      minutes: 30,
      hours: 0.5,
      ratio: 25,
      tasks: [{ taskId: 'admin', taskName: '事務処理', minutes: 30, hours: 0.5, ratio: 100 }]
    }
  ]);
});

test('computePlanActualTimeBreakdown compares planned and actual time by project and task', () => {
  const state = {
    ...baseState,
    dayPlans: [
      { userId: 'ishida', date: '2026-08-03', hour: 9, items: [{ taskId: 'proposal', minutes: 60 }] },
      { userId: 'ishida', date: '2026-08-03', hour: 10, items: [{ taskId: 'proposal', minutes: 30 }, { taskId: 'admin', minutes: 30 }] },
      { userId: 'tanoue', date: '2026-08-03', hour: 9, items: [{ taskId: 'improve', minutes: 60 }] }
    ],
    dayActuals: [
      { userId: 'ishida', date: '2026-08-03', hour: 9, items: [{ taskId: 'proposal', minutes: 60 }] },
      { userId: 'ishida', date: '2026-08-03', hour: 10, items: [{ taskId: 'admin', minutes: 60 }] },
      { userId: 'tanoue', date: '2026-08-03', hour: 9, items: [{ taskId: 'improve', minutes: 60 }] }
    ]
  };

  const rows = computePlanActualTimeBreakdown(state, '2026-08-03', { userId: 'ishida' });

  assert.deepEqual(rows, [
    {
      projectId: 'p-sales',
      projectName: '営業',
      plannedMinutes: 90,
      actualMinutes: 60,
      diffMinutes: -30,
      plannedHours: 1.5,
      actualHours: 1,
      diffHours: -0.5,
      tasks: [
        {
          taskId: 'proposal',
          taskName: '提案',
          plannedMinutes: 90,
          actualMinutes: 60,
          diffMinutes: -30,
          plannedHours: 1.5,
          actualHours: 1,
          diffHours: -0.5
        }
      ]
    },
    {
      projectId: 'p-admin',
      projectName: '雑務',
      plannedMinutes: 30,
      actualMinutes: 60,
      diffMinutes: 30,
      plannedHours: 0.5,
      actualHours: 1,
      diffHours: 0.5,
      tasks: [
        {
          taskId: 'admin',
          taskName: '事務処理',
          plannedMinutes: 30,
          actualMinutes: 60,
          diffMinutes: 30,
          plannedHours: 0.5,
          actualHours: 1,
          diffHours: 0.5
        }
      ]
    }
  ]);
});

test('getImprovementPromiseForWeek returns the previous week next promise', () => {
  assert.equal(getImprovementPromiseForWeek(baseState, '2026-08-03'), '午前中に提案を固める');
});
