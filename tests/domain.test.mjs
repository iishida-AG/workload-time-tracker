import assert from 'node:assert/strict';
import {
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

test('getImprovementPromiseForWeek returns the previous week next promise', () => {
  assert.equal(getImprovementPromiseForWeek(baseState, '2026-08-03'), '午前中に提案を固める');
});
