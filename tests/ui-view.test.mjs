import assert from 'node:assert/strict';
import { createDashboardViewModel } from '../src/ui/view-model.js';
import { buildUserUrl, countGoalTone, getUserIdFromUrl } from '../src/main.js';

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
    projects: [{ id: 'p1', name: 'SES営業', order: 1, status: 'active' }],
    tasks: [
      {
        id: 't1',
        projectId: 'p1',
        name: 'エンジニア提案',
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
        nextPromise: '朝一で提案候補を3件出す',
        updatedAt: '2026-08-01T10:00:00.000Z'
      }
    ],
    timelineSettings: [],
    weeklyProjectGoals: [],
    monthlyProjectGoals: []
  };

  const view = createDashboardViewModel(state, '2026-08-03');

  assert.equal(view.weekStart, '2026-08-03');
  assert.equal(view.improvementPromise, '朝一で提案候補を3件出す');
  assert.deepEqual(view.kpis, [
    { label: '今週の実働', value: '1h' },
    { label: 'キャパ達成率', value: '2.5%' },
    { label: '件数進捗', value: '40%' }
  ]);
  assert.equal(view.activeTasks.length, 1);
  assert.equal(view.countableTasks.length, 1);
});

test('createDashboardViewModel separates selected user and partner copy text', () => {
  const state = {
    projects: [{ id: 'p1', name: 'SES営業', order: 1, status: 'active' }],
    tasks: [
      {
        id: 't1',
        projectId: 'p1',
        name: 'エンジニア提案',
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
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', note: 'A社向け' },
      { userId: 'tanoue', date: '2026-08-05', hour: 11, taskId: 't1', note: '共有確認' }
    ],
    dayActuals: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', note: '送付済み' },
      { userId: 'tanoue', date: '2026-08-05', hour: 11, taskId: 't1', note: 'レビュー済み' }
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
  assert.equal(
    view.planCopyText,
    '10:00-11:00 エンジニア提案：「A社向け」\n11:00-12:00 未入力：「」'
  );
  assert.equal(
    view.actualCopyText,
    '10:00-11:00 エンジニア提案：「送付済み」\n11:00-12:00 未入力：「」'
  );
  assert.equal(
    view.partnerPlanCopyText,
    '11:00-12:00 エンジニア提案：「共有確認」\n12:00-13:00 未入力：「」'
  );
  assert.equal(
    view.partnerActualCopyText,
    '11:00-12:00 エンジニア提案：「レビュー済み」\n12:00-13:00 未入力：「」'
  );
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
