import assert from 'node:assert/strict';
import { createDashboardViewModel } from '../src/ui/view-model.js';
import { buildUserUrl, countGoalTone, getCopyTextKey, getUserIdFromUrl, nextSelectedTaskId } from '../src/main.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function baseState() {
  return {
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
    weeklyGoals: [],
    weeklyProjectGoals: [],
    monthlyProjectGoals: [],
    dailyCounts: [],
    weeklyReviews: [],
    dayPlans: [],
    dayActuals: [],
    timelineSettings: []
  };
}

test('createDashboardViewModel exposes the weekly reminder and KPI cards', () => {
  const state = {
    ...baseState(),
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
    ]
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

test('createDashboardViewModel outputs Ishida daily report with existing actual timeline format', () => {
  const state = {
    ...baseState(),
    tasks: [
      ...baseState().tasks,
      {
        id: 't2',
        projectId: 'p1',
        name: 'Meeting',
        nature: 'admin',
        countable: false,
        status: 'active',
        order: 2
      }
    ],
    timelineSettings: [{ userId: 'ishida', date: '2026-08-05', startHour: 10, endHour: 13 }],
    dayActuals: [
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 10,
        taskId: 't1',
        items: [
          { taskId: 't1', note: '', minutes: 60 },
          { taskId: 't2', note: 'memo', minutes: 15 }
        ]
      }
    ]
  };

  const view = createDashboardViewModel(state, '2026-08-05', 'ishida');

  assert.ok(view.actualCopyText.startsWith('お疲れ様です。'));
  assert.ok(view.actualCopyText.includes('今日の目標(達成数値)\n\n'));
  assert.ok(view.actualCopyText.includes('10:00-11:00 10:00-11:00 Proposal (60分)、11:00-11:15 Meeting (15分)：「memo」'));
  assert.ok(view.actualCopyText.includes('11:00-12:00 未入力'));
  assert.ok(view.actualCopyText.includes('12:00-13:00 未入力'));
  assert.ok(view.actualCopyText.includes('良かったこと\n\n課題/解決策\n\n明日の目標'));
});

test('createDashboardViewModel outputs Tanoue daily report with business section filled', () => {
  const state = {
    ...baseState(),
    timelineSettings: [{ userId: 'tanoue', date: '2026-08-05', startHour: 10, endHour: 12 }],
    dayActuals: [{ userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 't1', note: 'reviewed' }]
  };

  const view = createDashboardViewModel(state, '2026-08-05', 'tanoue');

  assert.ok(view.actualCopyText.includes('下記、本日の日報でございます。'));
  assert.ok(view.actualCopyText.includes('■今日の業務内容\n10:00-11:00 10:00-11:00 Proposal (60分)：「reviewed」'));
  assert.ok(view.actualCopyText.includes('11:00-12:00 未入力'));
  assert.ok(view.actualCopyText.includes('■今日の定量目標達成率\n\n■明日の定量目標'));
});

test('createDashboardViewModel excludes tasks from hidden projects from active shortcuts', () => {
  const state = {
    ...baseState(),
    projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'hidden' }]
  };

  const view = createDashboardViewModel(state, '2026-08-05', 'ishida');

  assert.equal(view.activeTasks.length, 0);
  assert.equal(view.countableTasks.length, 0);
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

test('nextSelectedTaskId clears the selection when the selected shortcut is pressed again', () => {
  assert.equal(nextSelectedTaskId('proposal', 'proposal'), '');
  assert.equal(nextSelectedTaskId('', 'proposal'), 'proposal');
});
