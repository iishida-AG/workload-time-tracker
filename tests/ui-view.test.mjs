import assert from 'node:assert/strict';
import { createDashboardViewModel } from '../src/ui/view-model.js';
import { buildUserUrl, countGoalTone, getCopyTextKey, getUserIdFromUrl } from '../src/main.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('createDashboardViewModel exposes the weekly reminder and KPI cards', () => {
  const state = {
    projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
    tasks: [
      {
        id: 't1',
        projectId: 'p1',
        name: 'Proposal',
        nature: 'core',
        countable: true,
        status: 'active',
        order: 1
      }
    ],
    dayPlans: [{ date: '2026-08-03', hour: 9, taskId: 't1' }],
    dayActuals: [{ date: '2026-08-03', hour: 9, taskId: 't1' }],
    weeklyGoals: [{ weekStart: '2026-08-03', taskId: 't1', targetCount: 10 }],
    dailyCounts: [{ date: '2026-08-03', taskId: 't1', count: 4 }],
    weeklyReviews: [
      {
        weekStart: '2026-07-27',
        goalReflection: '',
        overtimeCause: '',
        nextPromise: 'Do three proposals by morning',
        updatedAt: '2026-08-01T10:00:00.000Z'
      }
    ],
    timelineSettings: [],
    weeklyProjectGoals: [],
    monthlyProjectGoals: []
  };

  const view = createDashboardViewModel(state, '2026-08-03');

  assert.equal(view.weekStart, '2026-08-03');
  assert.equal(view.improvementPromise, 'Do three proposals by morning');
  assert.deepEqual(
    view.kpis.map((kpi) => kpi.value),
    ['1h', '2.5%', '40%']
  );
  assert.equal(view.activeTasks.length, 1);
  assert.equal(view.countableTasks.length, 1);
});

test('createDashboardViewModel separates selected user and partner copy text', () => {
  const state = {
    projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
    tasks: [
      {
        id: 't1',
        projectId: 'p1',
        name: 'Proposal',
        nature: 'core',
        countable: true,
        status: 'active',
        order: 1
      }
    ],
    timelineSettings: [
      { userId: 'ishida', date: '2026-08-05', startHour: 10, endHour: 12 },
      { userId: 'tanoue', date: '2026-08-05', startHour: 11, endHour: 13 }
    ],
    dayPlans: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', note: 'for A' },
      { userId: 'tanoue', date: '2026-08-05', hour: 11, taskId: 't1', note: 'shared' }
    ],
    dayActuals: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', note: 'sent' },
      { userId: 'tanoue', date: '2026-08-05', hour: 11, taskId: 't1', note: 'reviewed' }
    ],
    weeklyGoals: [],
    weeklyProjectGoals: [],
    monthlyProjectGoals: [],
    dailyCounts: [],
    weeklyReviews: []
  };

  const view = createDashboardViewModel(state, '2026-08-05', 'ishida');

  assert.equal(view.userId, 'ishida');
  assert.equal(view.partnerUserId, 'tanoue');
  assert.deepEqual(view.timelineSetting, { startHour: 10, endHour: 12 });
  assert.deepEqual(view.partnerTimelineSetting, { startHour: 11, endHour: 13 });
  assert.ok(view.planCopyText.includes('10:00-11:00 Proposal'));
  assert.ok(view.actualCopyText.includes('Proposal (60分)'));
  assert.ok(view.actualCopyText.includes('sent'));
  assert.ok(view.partnerPlanCopyText.includes('11:00-12:00 Proposal'));
  assert.ok(view.partnerActualCopyText.includes('Proposal (60分)'));
  assert.ok(view.partnerActualCopyText.includes('reviewed'));
});

test('user URLs select Ishida or Tanoue and ignore invalid values', () => {
  assert.equal(getUserIdFromUrl('https://example.github.io/workload/?user=tanoue'), 'tanoue');
  assert.equal(getUserIdFromUrl('https://example.github.io/workload/?user=ishida'), 'ishida');
  assert.equal(getUserIdFromUrl('https://example.github.io/workload/?user=unknown'), 'ishida');
  assert.equal(getUserIdFromUrl('not a url?user=tanoue', 'ishida'), 'ishida');
});

test('buildUserUrl replaces the user query parameter', () => {
  assert.equal(
    buildUserUrl('https://example.github.io/workload/?user=ishida&week=2026-08-03', 'tanoue'),
    'https://example.github.io/workload/?user=tanoue&week=2026-08-03'
  );
});

test('countGoalTone marks achieved counts blue and missed counts red', () => {
  assert.equal(countGoalTone(10, 12), 'achieved');
  assert.equal(countGoalTone(10, 9), 'missed');
  assert.equal(countGoalTone(null, 9), '');
});

test('getCopyTextKey creates stable keys for one-touch daily text copy buttons', () => {
  assert.equal(getCopyTextKey('予定'), 'daily-copy-予定');
});
