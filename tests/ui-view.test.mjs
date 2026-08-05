import assert from 'node:assert/strict';
import { createDashboardViewModel } from '../src/ui/view-model.js';

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
    ]
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
