import assert from 'node:assert/strict';
import { createDashboardViewModel } from '../src/ui/view-model.js';
import { buildUserUrl, countGoalTone, getCopyTextKey, getUserIdFromUrl, nextSelectedTaskId } from '../src/main.js';

const jp = {
  planned: '\u4e88\u5b9a',
  otsu: '\u304a\u75b2\u308c\u69d8\u3067\u3059\u3002',
  todayGoal: '\u4eca\u65e5\u306e\u76ee\u6a19(\u9054\u6210\u6570\u5024)',
  goodIssueTomorrow: '\u826f\u304b\u3063\u305f\u3053\u3068\n\n\u8ab2\u984c/\u89e3\u6c7a\u7b56\n\n\u660e\u65e5\u306e\u76ee\u6a19',
  business: '\u25a0\u4eca\u65e5\u306e\u696d\u52d9\u5185\u5bb9',
  quant: '\u25a0\u4eca\u65e5\u306e\u5b9a\u91cf\u76ee\u6a19\u9054\u6210\u7387\n\n\u25a0\u660e\u65e5\u306e\u5b9a\u91cf\u76ee\u6a19',
  tanoueLead: '\u4e0b\u8a18\u3001\u672c\u65e5\u306e\u65e5\u5831\u3067\u3054\u3056\u3044\u307e\u3059\u3002',
  unentered11: '11\u664200\u5206\uff5e12\u664200\u5206\u3000\u672a\u5165\u529b',
  unentered12: '12\u664200\u5206\uff5e13\u664200\u5206\u3000\u672a\u5165\u529b'
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

function baseState() {
  return {
    projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'active' }],
    tasks: [
      { id: 't1', projectId: 'p1', name: 'Proposal', nature: 'core', countable: true, status: 'active', order: 1 }
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
    weeklyReviews: [{ weekStart: '2026-07-27', goalReflection: '', overtimeCause: '', nextPromise: 'Do three proposals by morning', updatedAt: '2026-08-01T10:00:00.000Z' }]
  };
  const view = createDashboardViewModel(state, '2026-08-03');
  assert.equal(view.weekStart, '2026-08-03');
  assert.equal(view.improvementPromise, 'Do three proposals by morning');
  assert.deepEqual(view.kpis.map((kpi) => kpi.value), ['1h', '2.5%', '40%']);
  assert.equal(view.activeTasks.length, 1);
  assert.equal(view.countableTasks.length, 1);
});

test('createDashboardViewModel outputs Ishida daily report with minute range lines', () => {
  const state = {
    ...baseState(),
    tasks: [...baseState().tasks, { id: 't2', projectId: 'p1', name: 'Meeting', nature: 'admin', countable: false, status: 'active', order: 2 }],
    timelineSettings: [{ userId: 'ishida', date: '2026-08-05', startHour: 10, endHour: 13 }],
    dayActuals: [{ userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', items: [{ taskId: 't1', note: '', minutes: 60 }, { taskId: 't2', note: 'memo', minutes: 15 }] }]
  };
  const view = createDashboardViewModel(state, '2026-08-05', 'ishida');
  assert.ok(view.actualCopyText.startsWith(jp.otsu));
  assert.ok(view.actualCopyText.includes(jp.todayGoal + '\n\n'));
  assert.ok(view.actualCopyText.includes('10\u664200\u5206\uff5e11\u664200\u5206\u3000Proposal'));
  assert.ok(view.actualCopyText.includes('11\u664200\u5206\uff5e11\u664215\u5206\u3000memo'));
  assert.ok(view.actualCopyText.includes(jp.unentered11));
  assert.ok(view.actualCopyText.includes(jp.unentered12));
  assert.ok(view.actualCopyText.includes(jp.goodIssueTomorrow));
});

test('createDashboardViewModel outputs Tanoue daily report with business section filled', () => {
  const state = { ...baseState(), timelineSettings: [{ userId: 'tanoue', date: '2026-08-05', startHour: 10, endHour: 12 }], dayActuals: [{ userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 't1', note: 'reviewed' }] };
  const view = createDashboardViewModel(state, '2026-08-05', 'tanoue');
  assert.ok(view.actualCopyText.includes(jp.tanoueLead));
  assert.ok(view.actualCopyText.includes(jp.business + '\n10\u664200\u5206\uff5e11\u664200\u5206\u3000reviewed'));
  assert.ok(view.actualCopyText.includes(jp.unentered11));
  assert.ok(view.actualCopyText.includes(jp.quant));
});

test('createDashboardViewModel excludes tasks from hidden projects from active shortcuts', () => {
  const state = { ...baseState(), projects: [{ id: 'p1', name: 'Sales', order: 1, status: 'hidden' }] };
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
  assert.equal(buildUserUrl('https://example.github.io/workload/?user=ishida&week=2026-08-03', 'tanoue'), 'https://example.github.io/workload/?user=tanoue&week=2026-08-03');
});

test('countGoalTone marks achieved counts blue and missed counts red', () => {
  assert.equal(countGoalTone(10, 12), 'achieved');
  assert.equal(countGoalTone(10, 9), 'missed');
  assert.equal(countGoalTone(null, 9), '');
});

test('getCopyTextKey creates stable keys for one-touch daily text copy buttons', () => {
  assert.equal(getCopyTextKey(jp.planned), 'daily-copy-' + jp.planned);
});

test('nextSelectedTaskId clears the selection when the selected shortcut is pressed again', () => {
  assert.equal(nextSelectedTaskId('proposal', 'proposal'), '');
  assert.equal(nextSelectedTaskId('', 'proposal'), 'proposal');
});
