import assert from 'node:assert/strict';
import { renderReviewPage } from '../src/ui/review-view.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const emptyProgress = {
  rows: [],
  totalActualCount: 0,
  totalTargetCount: 0,
  totalProgressRate: 0
};

const fixture = {
  userId: 'ishida',
  quarters: [
    { label: '20期1Q', start: '2026-06-01', end: '2026-08-31' },
    { label: '20期2Q', start: '2026-09-01', end: '2026-11-30' },
    { label: '20期3Q', start: '2026-12-01', end: '2027-02-28' },
    { label: '20期4Q', start: '2027-03-01', end: '2027-05-31' }
  ],
  selectedQuarter: { label: '20期2Q', start: '2026-09-01', end: '2026-11-30' },
  monthKey: '2026-09',
  weeks: [{ index: 1, label: '1週目', start: '2026-09-07', end: '2026-09-13' }],
  selectedWeek: { index: 1, label: '1週目', start: '2026-09-07', end: '2026-09-13' },
  countableTasks: [{ id: 't1', name: '提案', projectName: 'SES営業' }],
  quarter: { qualitativeItems: [], goalProgress: emptyProgress },
  week: {
    qualitativeItems: [],
    goalProgress: emptyProgress,
    metrics: {
      totalActualHours: 2,
      natureRatios: {},
      projectRows: [{ projectId: 'p1', projectName: 'SES営業', minutes: 120, hours: 2, ratio: 100 }],
      planActualRows: [{
        projectId: 'p1',
        projectName: 'SES営業',
        plannedMinutes: 60,
        actualMinutes: 120,
        plannedHours: 1,
        actualHours: 2,
        diffMinutes: 60,
        diffHours: 1,
        tasks: [{
          taskId: 't1',
          taskName: '提案',
          plannedMinutes: 60,
          actualMinutes: 120,
          plannedHours: 1,
          actualHours: 2,
          diffMinutes: 60,
          diffHours: 1
        }]
      }],
      topGaps: []
    }
  },
  review: {
    goodPoints: '',
    reflections: ['', '', ''],
    improvements: ['', '', ''],
    discussionItems: ''
  },
  nextActionRows: []
};

test('renderReviewPage keeps the required seven-card order', () => {
  const html = renderReviewPage(fixture, { icon: (name) => `<i>${name}</i>` });
  const markers = [
    'data-review-card="quarter"',
    'data-review-card="week"',
    'data-review-card="analysis"',
    'data-review-card="good-points"',
    'data-review-card="reflection"',
    'data-review-card="next-actions"',
    'data-review-card="discussion"'
  ];

  for (let index = 1; index < markers.length; index += 1) {
    assert.ok(html.indexOf(markers[index - 1]) < html.indexOf(markers[index]));
  }
});

test('renderReviewPage marks selected periods and exposes goal controls', () => {
  const html = renderReviewPage(fixture, { icon: (name) => `<i>${name}</i>` });

  assert.match(html, /data-quarter-start="2026-09-01"[^>]*aria-selected="true"/);
  assert.match(html, /data-week-start="2026-09-07"[^>]*aria-selected="true"/);
  assert.match(html, /data-field="review-month"/);
  assert.match(html, /data-action="add-quarter-note"/);
  assert.match(html, /data-action="add-week-note"/);
  assert.match(html, /data-action="add-quarter-goal"/);
  assert.match(html, /data-action="add-weekly-goal"/);
  assert.doesNotMatch(html, /田上目標/);
});

test('renderReviewPage exposes structured reflection and analysis controls', () => {
  const html = renderReviewPage(fixture, { icon: (name) => `<i>${name}</i>` });

  assert.match(html, /data-review-field="goodPoints"/);
  assert.equal((html.match(/data-review-field="reflections"/g) ?? []).length, 3);
  assert.equal((html.match(/data-review-field="improvements"/g) ?? []).length, 3);
  assert.match(html, /aria-label="反省点1"/);
  assert.match(html, /aria-label="改善点1"/);
  assert.match(html, /data-field="next-action-row"/);
  assert.match(html, /data-action="add-next-action"/);
  assert.match(html, /data-review-field="discussionItems"/);
  assert.match(html, /予定 1h \/ 実績 2h/);
  assert.match(html, /\+1h/);
});
