import assert from 'node:assert/strict';
import { getTimelineHours } from '../src/domain/calendar.js';
import {
  addActualMinutes,
  addPlanMinutes,
  clearTimelineEntry,
  computeProjectCountSummaries,
  computeReviewMetrics,
  copyPlanHourToActual,
  copyPlanToActuals,
  formatDailyCategorySummaryText,
  formatActualItemRanges,
  formatDailyScheduleText,
  applyPlanNotificationResponse,
  setTimelineEntry,
  setTimelineNote
} from '../src/domain/metrics.js';
import { getPartnerUserId, USERS } from '../src/domain/users.js';

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
    { id: 'sales', name: 'Sales', order: 1, status: 'active' },
    { id: 'admin-project', name: 'Admin', order: 2, status: 'active' }
  ],
  tasks: [
    {
      id: 'proposal',
      projectId: 'sales',
      name: 'Proposal',
      nature: 'core',
      countable: true,
      status: 'active',
      order: 1
    },
    {
      id: 'mail',
      projectId: 'admin-project',
      name: 'Mail',
      nature: 'admin',
      countable: false,
      status: 'active',
      order: 2
    },
    {
      id: 'break',
      projectId: 'break-project',
      name: 'Break',
      nature: 'break',
      countable: false,
      status: 'active',
      order: 3
    }
  ],
  dayPlans: [
    { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'for A' },
    { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'mail', note: 'reply' }
  ],
  dayActuals: [],
  weeklyGoals: [],
  weeklyProjectGoals: [],
  monthlyProjectGoals: [],
  dailyCounts: [
    { userId: 'ishida', date: '2026-08-05', taskId: 'proposal', count: 3 },
    { userId: 'tanoue', date: '2026-08-05', taskId: 'proposal', count: 8 }
  ],
  weeklyReviews: []
};

test('USERS contains Ishida and Tanoue only', () => {
  assert.deepEqual(USERS.map((user) => user.id), ['ishida', 'tanoue']);
  assert.equal(getPartnerUserId('ishida'), 'tanoue');
});

test('getTimelineHours returns start inclusive and end exclusive hours', () => {
  assert.deepEqual(getTimelineHours(10, 20), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test('getTimelineHours accepts zero as a valid start hour', () => {
  assert.deepEqual(getTimelineHours(0, 2), [0, 1]);
});

test('getTimelineHours treats null start as the default hour', () => {
  assert.deepEqual(getTimelineHours(null, 11), [9, 10]);
});

test('setTimelineEntry and note updates only the selected user date hour', () => {
  const withEntry = setTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 11, 'mail', 'internal');
  const withNote = setTimelineNote(withEntry, 'dayPlans', 'ishida', '2026-08-05', 11, 'memo');

  assert.ok(
    withNote.dayPlans.some(
      (entry) => entry.userId === 'ishida' && entry.hour === 11 && entry.taskId === 'mail' && entry.note === 'memo'
    )
  );
  assert.ok(withNote.dayPlans.some((entry) => entry.userId === 'tanoue' && entry.hour === 10 && entry.taskId === 'mail'));
});

test('clearTimelineEntry removes only the selected user date hour', () => {
  const next = clearTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 10);

  assert.equal(next.dayPlans.some((entry) => entry.userId === 'ishida' && entry.hour === 10), false);
  assert.equal(next.dayPlans.some((entry) => entry.userId === 'tanoue' && entry.hour === 10), true);
});

test('copyPlanToActuals copies one user day plans as 60 minute actual items', () => {
  const next = copyPlanToActuals(state, 'ishida', '2026-08-05');

  assert.equal(next.dayActuals.length, 1);
  assert.equal(next.dayActuals[0].userId, 'ishida');
  assert.deepEqual(next.dayActuals[0].items, [{ taskId: 'proposal', note: 'for A', minutes: 60 }]);
});

test('legacy copy preserves unrelated user-aware actuals', () => {
  const partnerActual = { userId: 'tanoue', date: '2026-08-05', hour: 9, taskId: 'mail', note: 'reply' };
  const next = copyPlanToActuals({ ...state, dayActuals: [partnerActual] }, '2026-08-05');

  assert.deepEqual(next.dayActuals, [
    partnerActual,
    { date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'for A' }
  ]);
});

test('copyPlanHourToActual copies a planned hour as a 60 minute actual item', () => {
  const next = copyPlanHourToActual(state, 'ishida', '2026-08-05', 10);
  const actual = next.dayActuals.find((entry) => entry.userId === 'ishida' && entry.hour === 10);

  assert.equal(actual.taskId, 'proposal');
  assert.deepEqual(actual.items, [{ taskId: 'proposal', note: 'for A', minutes: 60 }]);
});

test('addPlanMinutes allows multiple planned tasks inside one hour', () => {
  const emptyPlanState = clearTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 10);
  const next = addPlanMinutes(
    addPlanMinutes(emptyPlanState, 'ishida', '2026-08-05', 10, 'proposal', 30, 'first'),
    'ishida',
    '2026-08-05',
    10,
    'mail',
    15,
    'second'
  );
  const text = formatDailyScheduleText(next, 'dayPlans', 'ishida', '2026-08-05', 10, 11);

  assert.equal(text, '10\u664200\u5206-10\u664230\u5206 first\n10\u664230\u5206-10\u664245\u5206 second');
});

test('addActualMinutes allows multiple actual tasks inside one hour', () => {
  const next = addActualMinutes(state, 'ishida', '2026-08-05', 10, 'proposal', 40, 'first');
  const updated = addActualMinutes(next, 'ishida', '2026-08-05', 10, 'mail', 20, 'second');
  const actual = updated.dayActuals.find((entry) => entry.userId === 'ishida' && entry.hour === 10);

  assert.deepEqual(
    actual.items.map((item) => ({ taskId: item.taskId, minutes: item.minutes, note: item.note })),
    [
      { taskId: 'proposal', minutes: 40, note: 'first' },
      { taskId: 'mail', minutes: 20, note: 'second' }
    ]
  );
});

test('formatDailyScheduleText uses the requested plan copy format', () => {
  const text = formatDailyScheduleText(state, 'dayPlans', 'ishida', '2026-08-05', 10, 12);

  assert.equal(text, '10\u664200\u5206-11\u664200\u5206 for A');
});

test('formatDailyScheduleText lists multiple actual items chronologically', () => {
  const multiState = addActualMinutes(
    addActualMinutes(state, 'ishida', '2026-08-05', 10, 'proposal', 40, ''),
    'ishida',
    '2026-08-05',
    10,
    'mail',
    20,
    ''
  );
  const text = formatDailyScheduleText(multiState, 'dayActuals', 'ishida', '2026-08-05', 10, 11);

  assert.equal(text, '10\u664200\u5206-10\u664240\u5206 Proposal\n10\u664240\u5206-11\u664200\u5206 Mail');
});

test('formatActualItemRanges accumulates actual items within and beyond one hour', () => {
  const ranges = formatActualItemRanges(10, [
    { taskId: 'mail', minutes: 15 },
    { taskId: 'proposal', minutes: 45 },
    { taskId: 'proposal', minutes: 15 }
  ]);

  assert.deepEqual(ranges, ['10:00-10:15', '10:15-11:00', '11:00-11:15']);
});

test('formatActualItemRanges respects explicit quarter-hour starts', () => {
  const ranges = formatActualItemRanges(10, [
    { taskId: 'mail', minutes: 30, startMinute: 45 }
  ]);

  assert.deepEqual(ranges, ['10:45-11:15']);
});

test('formatDailyScheduleText outputs explicit start-minute rows and merges adjacent same text', () => {
  const timedState = {
    ...state,
    dayPlans: [
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 10,
        items: [
          { taskId: 'proposal', note: 'Rubicon', minutes: 30, startMinute: 0 },
          { taskId: 'mail', note: 'system share', minutes: 30, startMinute: 30 }
        ]
      },
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 11,
        items: [{ taskId: 'mail', note: 'AI agent', minutes: 60, startMinute: 0 }]
      },
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 12,
        items: [{ taskId: 'mail', note: 'AI agent', minutes: 60, startMinute: 0 }]
      }
    ]
  };

  assert.equal(
    formatDailyScheduleText(timedState, 'dayPlans', 'ishida', '2026-08-05', 10, 13),
    '10\u664200\u5206-10\u664230\u5206 Rubicon\n10\u664230\u5206-11\u664200\u5206 system share\n11\u664200\u5206-13\u664200\u5206 AI agent'
  );
});

test('applyPlanNotificationResponse can copy plan, continue previous actual, or use custom note', () => {
  const timedState = {
    ...state,
    dayPlans: [
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 10,
        items: [{ taskId: 'proposal', note: 'planned', minutes: 30, startMinute: 45 }]
      }
    ],
    dayActuals: [
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 10,
        items: [{ taskId: 'mail', note: 'previous', minutes: 45, startMinute: 0 }]
      }
    ]
  };

  const copied = applyPlanNotificationResponse(timedState, {
    userId: 'ishida',
    date: '2026-08-05',
    hour: 10,
    itemIndex: 0,
    mode: 'ok'
  });
  assert.equal(formatDailyScheduleText(copied, 'dayActuals', 'ishida', '2026-08-05', 10, 12), '10\u664200\u5206-10\u664245\u5206 previous\n10\u664245\u5206-11\u664215\u5206 planned');

  const continued = applyPlanNotificationResponse(timedState, {
    userId: 'ishida',
    date: '2026-08-05',
    hour: 10,
    itemIndex: 0,
    mode: 'continue'
  });
  assert.equal(formatDailyScheduleText(continued, 'dayActuals', 'ishida', '2026-08-05', 10, 12), '10\u664200\u5206-11\u664215\u5206 previous');

  const custom = applyPlanNotificationResponse(timedState, {
    userId: 'ishida',
    date: '2026-08-05',
    hour: 10,
    itemIndex: 0,
    mode: 'custom',
    note: 'other work',
    minutes: 15,
    startMinute: 30
  });
  assert.equal(formatDailyScheduleText(custom, 'dayActuals', 'ishida', '2026-08-05', 10, 12), '10\u664200\u5206-10\u664245\u5206 previous\n10\u664230\u5206-10\u664245\u5206 other work');
});

test('formatDailyScheduleText keeps single-digit hours unpadded', () => {
  const nineState = {
    ...state,
    dayPlans: [...state.dayPlans, { userId: 'ishida', date: '2026-08-05', hour: 9, taskId: 'proposal', note: 'memo' }]
  };
  const text = formatDailyScheduleText(nineState, 'dayPlans', 'ishida', '2026-08-05', 9, 10);

  assert.equal(text, '9\u664200\u5206-10\u664200\u5206 memo');
});

test('formatDailyScheduleText merges adjacent rows with the same visible text', () => {
  const mergedState = {
    ...state,
    dayPlans: [
      { userId: 'ishida', date: '2026-08-05', hour: 11, taskId: 'proposal', items: [{ taskId: 'proposal', note: 'AI agent', minutes: 60 }] },
      { userId: 'ishida', date: '2026-08-05', hour: 12, taskId: 'proposal', items: [{ taskId: 'proposal', note: 'AI agent', minutes: 60 }] }
    ]
  };
  const text = formatDailyScheduleText(mergedState, 'dayPlans', 'ishida', '2026-08-05', 11, 13);

  assert.equal(text, '11\u664200\u5206-13\u664200\u5206 AI agent');
});

test('formatDailyCategorySummaryText groups daily actual minutes by project and task with counts', () => {
  const multiState = {
    ...addActualMinutes(state, 'ishida', '2026-08-05', 10, 'proposal', 90, ''),
    dailyCounts: [{ userId: 'ishida', date: '2026-08-05', taskId: 'proposal', count: 3 }]
  };
  const text = formatDailyCategorySummaryText(multiState, 'dayActuals', 'ishida', '2026-08-05');

  assert.equal(text, '【Sales】Proposal: 1.5h (3件)');
});

test('computeProjectCountSummaries groups countable actuals by project and user with standard minutes', () => {
  const multiState = {
    ...addActualMinutes(state, 'ishida', '2026-08-05', 10, 'proposal', 180, ''),
    dailyCounts: [{ userId: 'ishida', date: '2026-08-05', taskId: 'proposal', count: 4 }]
  };
  const rows = computeProjectCountSummaries(multiState, 'ishida', '2026-08-03');

  assert.deepEqual(rows[0], {
    projectId: 'sales',
    projectName: 'Sales',
    actualCount: 4,
    totalMinutes: 180,
    standardMinutesPerCount: 45
  });
});

test('computeProjectCountSummaries aggregates both users when user id is all', () => {
  const rows = computeProjectCountSummaries(state, 'all', '2026-08-03');

  assert.deepEqual(
    rows.map((row) => ({ projectId: row.projectId, actualCount: row.actualCount })),
    [
      { projectId: 'sales', actualCount: 11 },
      { projectId: 'admin-project', actualCount: 0 }
    ]
  );
});

test('computeReviewMetrics scopes hours counts and gaps to the selected user', () => {
  const metricsState = {
    ...state,
    dayPlans: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'mail' },
      { userId: 'ishida', date: '2026-08-05', hour: 11, taskId: 'proposal' },
      { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'proposal' },
      { userId: 'tanoue', date: '2026-08-05', hour: 12, taskId: 'proposal' }
    ],
    dayActuals: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal' },
      { userId: 'ishida', date: '2026-08-05', hour: 11, taskId: 'mail' },
      { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'mail' },
      { userId: 'tanoue', date: '2026-08-05', hour: 12, taskId: 'mail' }
    ],
    weeklyGoals: [{ weekStart: '2026-08-03', taskId: 'proposal', targetCount: 10 }],
    dailyCounts: [
      { userId: 'ishida', date: '2026-08-05', taskId: 'proposal', count: 3 },
      { userId: 'tanoue', date: '2026-08-05', taskId: 'proposal', count: 8 }
    ]
  };

  const ishidaMetrics = computeReviewMetrics(metricsState, '2026-08-03', { userId: 'ishida' });
  const aggregateMetrics = computeReviewMetrics(metricsState, '2026-08-03');

  assert.equal(ishidaMetrics.totalActualHours, 2);
  assert.deepEqual(ishidaMetrics.natureHours, { core: 1, admin: 1, investment: 0 });
  assert.deepEqual(ishidaMetrics.natureRatios, { core: 50, admin: 50, investment: 0 });
  assert.equal(ishidaMetrics.goalRows[0].actualHours, 1);
  assert.equal(ishidaMetrics.goalRows[0].actualCount, 3);
  assert.deepEqual(ishidaMetrics.topGaps, [
    { hour: 10, plannedTaskName: 'Mail', actualTaskName: 'Proposal' },
    { hour: 11, plannedTaskName: 'Proposal', actualTaskName: 'Mail' }
  ]);
  assert.equal(aggregateMetrics.totalActualHours, 4);
  assert.deepEqual(aggregateMetrics.natureHours, { core: 1, admin: 3, investment: 0 });
  assert.equal(aggregateMetrics.goalRows[0].actualCount, 11);
});

test('break actuals appear in timeline text but are excluded from review and category summaries', () => {
  const breakState = {
    ...state,
    projects: [...state.projects, { id: 'break-project', name: 'Breaks', order: 3, status: 'active' }],
    dayActuals: [
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 12,
        taskId: 'break',
        items: [{ taskId: 'break', note: '', minutes: 45 }]
      }
    ]
  };

  const timelineText = formatDailyScheduleText(breakState, 'dayActuals', 'ishida', '2026-08-05', 12, 13);
  const categoryText = formatDailyCategorySummaryText(breakState, 'dayActuals', 'ishida', '2026-08-05');
  const metrics = computeReviewMetrics(breakState, '2026-08-03', { userId: 'ishida' });

  assert.ok(timelineText.includes('Break'));
  assert.equal(categoryText, '\u672c\u65e5\u306e\u5165\u529b\u306f\u3042\u308a\u307e\u305b\u3093');
  assert.equal(metrics.totalActualHours, 0);
  assert.deepEqual(metrics.natureHours, { core: 0, admin: 0, investment: 0 });
});

test('break quick add is capped at sixty minutes per day', () => {
  const breakState = {
    ...state,
    tasks: [
      ...state.tasks,
      {
        id: 'break',
        projectId: 'break-project',
        name: 'Break',
        nature: 'break',
        countable: false,
        status: 'active',
        order: 3
      }
    ],
    dayActuals: [
      {
        userId: 'ishida',
        date: '2026-08-05',
        hour: 12,
        taskId: 'break',
        items: [{ taskId: 'break', note: '', minutes: 45 }]
      }
    ]
  };

  const next = addActualMinutes(breakState, 'ishida', '2026-08-05', 13, 'break', 30);
  const totalBreakMinutes = next.dayActuals
    .flatMap((entry) => entry.items ?? [])
    .filter((item) => item.taskId === 'break')
    .reduce((sum, item) => sum + item.minutes, 0);

  assert.equal(totalBreakMinutes, 60);
});

