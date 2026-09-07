import assert from 'node:assert/strict';
import { createReviewViewModel } from '../src/ui/review-view-model.js';

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
    { id: 'p2', name: '採用', order: 2, status: 'active' },
    { id: 'p1', name: 'SES', order: 1, status: 'active' },
    { id: 'hidden', name: '非表示', order: 0, status: 'hidden' }
  ],
  tasks: [
    { id: 't2', projectId: 'p2', name: '面談', countable: true, nature: 'core', order: 1, status: 'active' },
    { id: 't1', projectId: 'p1', name: '提案', countable: true, nature: 'core', order: 2, status: 'active' },
    { id: 'not-countable', projectId: 'p1', name: '会議', countable: false, nature: 'admin', order: 1, status: 'active' },
    { id: 'hidden-task', projectId: 'hidden', name: '除外', countable: true, nature: 'core', order: 1, status: 'active' }
  ],
  quarterGoalNotes: [
    { userId: 'ishida', quarterStart: '2026-09-01', items: [{ id: 'q1', text: '重点顧客' }] },
    { userId: 'tanoue', quarterStart: '2026-09-01', items: [{ id: 'q2', text: '田上目標' }] }
  ],
  quarterGoals: [
    { userId: 'ishida', quarterStart: '2026-09-01', taskId: 't1', targetCount: 100 },
    { userId: 'tanoue', quarterStart: '2026-09-01', taskId: 't1', targetCount: 200 }
  ],
  weeklyGoalNotes: [
    { userId: 'ishida', weekStart: '2026-09-07', items: [{ id: 'w1', text: '即日追客' }] },
    { userId: 'tanoue', weekStart: '2026-09-07', items: [{ id: 'w2', text: '田上週次' }] }
  ],
  weeklyGoals: [
    { userId: 'ishida', weekStart: '2026-09-07', taskId: 't1', targetCount: 10 },
    { userId: 'tanoue', weekStart: '2026-09-07', taskId: 't1', targetCount: 20 }
  ],
  dailyCounts: [
    { userId: 'ishida', date: '2026-09-07', taskId: 't1', count: 4 },
    { userId: 'ishida', date: '2026-08-31', taskId: 't1', count: 8 },
    { userId: 'tanoue', date: '2026-09-07', taskId: 't1', count: 30 }
  ],
  weeklyReviews: [
    { userId: 'ishida', weekStart: '2026-09-07', goodPoints: '受注', reflections: ['準備', '', ''], improvements: ['朝対応', '', ''], discussionItems: '採用' },
    { userId: 'tanoue', weekStart: '2026-09-07', goodPoints: '田上実績' }
  ],
  weeklyTodos: [
    { userId: 'ishida', weekStart: '2026-09-07', todoText: '- 朝に提案\n・ 夕方に確認' },
    { userId: 'tanoue', weekStart: '2026-09-07', todoText: '- 田上アクション' }
  ],
  dayPlans: [],
  dayActuals: []
};

test('createReviewViewModel selects the current quarter and operational week', () => {
  const view = createReviewViewModel(state, {
    userId: 'ishida',
    currentDate: '2026-09-07',
    quarterStart: '2025-01-01',
    monthKey: 'invalid',
    weekStart: '2025-01-06'
  });

  assert.equal(view.selectedQuarter.label, '20期2Q');
  assert.equal(view.selectedQuarter.start, '2026-09-01');
  assert.equal(view.monthKey, '2026-09');
  assert.equal(view.selectedWeek.label, '1週目');
  assert.equal(view.selectedWeek.start, '2026-09-07');
  assert.equal(view.selectedWeek.end, '2026-09-13');
});

test('createReviewViewModel assembles only the active user review data', () => {
  const view = createReviewViewModel(state, {
    userId: 'ishida',
    currentDate: '2026-09-07'
  });

  assert.deepEqual(view.countableTasks.map((task) => task.id), ['t1', 't2']);
  assert.deepEqual(view.quarter.qualitativeItems.map((item) => item.text), ['重点顧客']);
  assert.deepEqual(view.week.qualitativeItems.map((item) => item.text), ['即日追客']);
  assert.equal(view.quarter.goalProgress.rows[0].actualCount, 4);
  assert.equal(view.week.goalProgress.rows[0].actualCount, 4);
  assert.equal(view.review.goodPoints, '受注');
  assert.deepEqual(view.review.reflections, ['準備', '', '']);
  assert.deepEqual(view.nextActionRows.map((row) => row.text), ['朝に提案', '夕方に確認']);
  assert.deepEqual(view.nextActionRows.map((row) => row.id), [
    '2026-09-07-action-0',
    '2026-09-07-action-1'
  ]);
});

test('createReviewViewModel accepts a valid selected operational week', () => {
  const view = createReviewViewModel(state, {
    userId: 'ishida',
    currentDate: '2026-09-07',
    monthKey: '2026-08',
    weekStart: '2026-08-31'
  });

  assert.equal(view.monthKey, '2026-08');
  assert.equal(view.selectedWeek.label, '5週目');
  assert.equal(view.week.goalProgress.totalActualCount, 0);
});
