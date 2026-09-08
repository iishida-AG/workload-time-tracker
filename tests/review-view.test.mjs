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
      natureHours: { core: 1.5, admin: 0.5, investment: 0 },
      natureRatios: { core: 75, admin: 25, investment: 0 },
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

test('renderReviewPage uses free text and gross profit fields only for quarter goals', () => {
  const view = {
    ...fixture,
    quarter: {
      ...fixture.quarter,
      goalProgress: {
        rows: [{
          id: 'gross-1',
          goalText: 'SES粗利',
          targetGrossProfit: 300,
          actualGrossProfit: 360,
          progressRate: 120
        }],
        totalTargetGrossProfit: 300,
        totalActualGrossProfit: 360,
        totalProgressRate: 120
      }
    },
    week: {
      ...fixture.week,
      goalProgress: {
        rows: [{ taskId: 't1', taskName: '提案', targetCount: 10, actualCount: 4, progressRate: 40 }],
        totalActualCount: 4,
        totalTargetCount: 10,
        totalProgressRate: 40
      }
    }
  };
  const html = renderReviewPage(view, { icon: (name) => `<i>${name}</i>` });
  const quarterHtml = html.slice(
    html.indexOf('data-review-card="quarter"'),
    html.indexOf('data-review-card="week"')
  );
  const weekHtml = html.slice(html.indexOf('data-review-card="week"'));

  assert.match(quarterHtml, /data-field="quarter-goal-text"/);
  assert.match(quarterHtml, /data-field="quarter-target-gross-profit"/);
  assert.match(quarterHtml, /data-field="quarter-actual-gross-profit"/);
  assert.doesNotMatch(quarterHtml, /data-field="quarter-goal-task"/);
  assert.doesNotMatch(quarterHtml, /<select/);
  assert.match(quarterHtml, /360\/300万円 \(120%\)/);
  assert.match(quarterHtml, /aria-valuenow="100"/);
  assert.match(quarterHtml, /合計/);
  assert.match(weekHtml, /data-field="weekly-goal-task"/);
  assert.match(weekHtml, /4\/10件 \(40%\)/);
});

test('renderReviewPage shows an actual-time pie grouped by work nature', () => {
  const html = renderReviewPage(fixture, { icon: (name) => `<i>${name}</i>` });

  assert.match(html, /aria-label="実績工数の業務区分別割合"/);
  assert.match(html, /コア業務/);
  assert.match(html, /1\.5h/);
  assert.match(html, /75%/);
  assert.match(html, /雑務/);
  assert.match(html, /0\.5h/);
  assert.match(html, /25%/);
  assert.doesNotMatch(html, />投資</);
});

test('renderReviewPage expands plan comparison when there is no actual-time pie', () => {
  const view = {
    ...fixture,
    week: {
      ...fixture.week,
      metrics: {
        ...fixture.week.metrics,
        totalActualHours: 0,
        natureHours: { core: 0, admin: 0, investment: 0 },
        natureRatios: { core: 0, admin: 0, investment: 0 },
        projectRows: []
      }
    }
  };
  const html = renderReviewPage(view, { icon: (name) => `<i>${name}</i>` });

  assert.match(html, /class="review-time-grid no-pie"/);
  assert.match(html, /予定 1h \/ 実績 2h/);
});
