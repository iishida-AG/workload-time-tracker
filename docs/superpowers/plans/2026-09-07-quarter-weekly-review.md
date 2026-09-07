# Quarter And Weekly Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current review page with user-specific quarterly and operational-week goal tracking, time analysis, structured reflection, and same-week synchronization to the daily page.

**Architecture:** Add pure fiscal/operational-period helpers to the calendar domain, explicit date-range aggregation to metrics, and additive state collections for qualitative and quarterly goals. Build a review-specific view model and pure HTML renderer, leaving DOM events and persistence orchestration in `main.js`; reuse the existing per-user Firestore documents and transaction merge.

**Tech Stack:** Vanilla JavaScript ES modules, Vite, Node assertion tests, Firebase Authentication/Firestore, CSS Grid, existing Lucide icon helper.

**Spec:** `docs/superpowers/specs/2026-09-07-quarter-weekly-review-design.md`

## Global Constraints

- The fiscal anchor is `2026-06-01 = 20期1Q`; the term number increases every June 1.
- Weeks run Monday through Sunday, and a month's week 1 begins on its first Monday.
- `2026-09-01..2026-09-06` belongs to August week 5; September 2026 week 1 starts `2026-09-07`.
- All reads and writes must be scoped to the active `userId`; no cross-user fallback is allowed.
- Existing `weeklyGoals`, `dailyCounts`, `weeklyTodos`, timeline records, and legacy review fields remain readable.
- New persistence is additive inside `workloadApps/default/users/{userId}`; no authentication, security-rule, or destructive migration change is included.
- The daily page uses same-week targets and next actions, with the legacy previous-week promise only as an empty-state fallback.
- Desktop and mobile layouts must not overlap or create horizontal page overflow.

---

## File Map

- Modify `src/domain/calendar.js`: fiscal-quarter and operational-month/week date helpers.
- Modify `src/domain/metrics.js`: inclusive date-range goal and time aggregation plus same-week improvement text lookup.
- Modify `src/domain/presets.js`: initialize additive review collections.
- Modify `src/state/store.js`: normalize and update qualitative goals, quarter targets, structured reviews, weekly targets, and next-action rows.
- Modify `src/state/firebase-sync.js`: merge and persist the three new keyed collections in each user document.
- Create `src/ui/review-view-model.js`: construct one selected user's quarter/week review data without DOM access.
- Create `src/ui/review-view.js`: render the seven review cards as pure HTML with stable `data-*` event contracts.
- Modify `src/ui/view-model.js`: prefer same-week `weeklyTodos` for the daily improvement banner.
- Modify `src/main.js`: own period selection, invoke the review renderer, and route review input/click/change events to store functions.
- Modify `src/styles.css`: three-column review layout, progress charts, paired bars, reflection rows, and mobile stacking.
- Create `tests/calendar.test.mjs`: date boundary coverage.
- Modify `tests/domain.test.mjs`: explicit-range metrics and improvement fallback coverage.
- Modify `tests/state.test.mjs`: additive schema, CRUD, legacy normalization, and user isolation.
- Modify `tests/firebase-sync.test.mjs`: per-user merge/persistence coverage for new collections.
- Create `tests/review-view-model.test.mjs`: selected-period aggregation and user isolation.
- Create `tests/review-view.test.mjs`: card order and event contract markup.
- Modify `tests/ui-view.test.mjs`: daily same-week synchronization.
- Modify `tests/mobile-css.test.mjs`: responsive review layout assertions.
- Modify `tests/run-all.mjs`: register the three new test modules.

---

### Task 1: Fiscal Quarter And Operational Week Calendar

**Files:**
- Modify: `src/domain/calendar.js`
- Create: `tests/calendar.test.mjs`
- Modify: `tests/run-all.mjs`

**Interfaces:**
- Consumes: existing `parseDateKey(dateKey)`, `toDateKey(date)`, `addDays(dateKey, amount)`, and `getWeekStart(dateKey)`.
- Produces: `getFiscalQuarter(dateKey)`, `getFiscalTermQuarters(dateKey)`, `getOperationalMonth(dateKey)`, `getOperationalMonthWeeks(monthKey)`, and `getDateRange(startDate, endDate)`.
- Quarter descriptor: `{ term: number, quarter: 1|2|3|4, label: string, start: string, end: string }`.
- Week descriptor: `{ index: number, label: string, start: string, end: string }`.

- [ ] **Step 1: Register the new calendar test module**

Add this import to `tests/run-all.mjs` before domain tests:

```js
import './calendar.test.mjs';
```

- [ ] **Step 2: Write failing boundary tests**

Create `tests/calendar.test.mjs` with assertions covering the accepted examples and leap-year boundaries:

```js
import assert from 'node:assert/strict';
import {
  getDateRange,
  getFiscalQuarter,
  getFiscalTermQuarters,
  getOperationalMonth,
  getOperationalMonthWeeks
} from '../src/domain/calendar.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('fiscal quarters follow the June anchor across years', () => {
  assert.deepEqual(getFiscalQuarter('2026-09-07'), {
    term: 20,
    quarter: 2,
    label: '20期2Q',
    start: '2026-09-01',
    end: '2026-11-30'
  });
  assert.equal(getFiscalQuarter('2026-12-01').end, '2027-02-28');
  assert.equal(getFiscalQuarter('2028-02-29').end, '2028-02-29');
  assert.equal(getFiscalQuarter('2027-06-01').label, '21期1Q');
  assert.deepEqual(getFiscalTermQuarters('2026-09-07').map((row) => row.label), [
    '20期1Q', '20期2Q', '20期3Q', '20期4Q'
  ]);
});

test('operational months number weeks from the first Monday', () => {
  assert.equal(getOperationalMonth('2026-09-01'), '2026-08');
  assert.equal(getOperationalMonth('2026-09-07'), '2026-09');
  assert.deepEqual(getOperationalMonthWeeks('2026-09'), [
    { index: 1, label: '1週目', start: '2026-09-07', end: '2026-09-13' },
    { index: 2, label: '2週目', start: '2026-09-14', end: '2026-09-20' },
    { index: 3, label: '3週目', start: '2026-09-21', end: '2026-09-27' },
    { index: 4, label: '4週目', start: '2026-09-28', end: '2026-10-04' }
  ]);
  assert.equal(getOperationalMonthWeeks('2026-08').length, 5);
});

test('inclusive date ranges include both endpoints', () => {
  assert.deepEqual(getDateRange('2026-09-30', '2026-10-02'), [
    '2026-09-30', '2026-10-01', '2026-10-02'
  ]);
});
```

- [ ] **Step 3: Run the test and confirm the exports are missing**

Run: `node tests/calendar.test.mjs`

Expected: FAIL because the five new helpers are not exported.

- [ ] **Step 4: Implement the calendar helpers**

Add constants and pure functions to `src/domain/calendar.js`. Derive the term start year from June, derive quarter starts from `[6, 9, 12, 3]`, and compute each end as the day before the next quarter:

```js
const FISCAL_ANCHOR_YEAR = 2026;
const FISCAL_ANCHOR_TERM = 20;

function firstMondayOfMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const offset = (8 - first.getDay()) % 7;
  first.setDate(first.getDate() + offset);
  return toDateKey(first);
}

export function getDateRange(startDate, endDate) {
  const dates = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function getFiscalQuarter(dateKey) {
  const date = parseDateKey(dateKey);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fiscalStartYear = month >= 6 ? year : year - 1;
  const quarter = Math.floor(((month - 6 + 12) % 12) / 3) + 1;
  const starts = [
    `${fiscalStartYear}-06-01`,
    `${fiscalStartYear}-09-01`,
    `${fiscalStartYear}-12-01`,
    `${fiscalStartYear + 1}-03-01`,
    `${fiscalStartYear + 1}-06-01`
  ];
  const term = FISCAL_ANCHOR_TERM + fiscalStartYear - FISCAL_ANCHOR_YEAR;
  return {
    term,
    quarter,
    label: `${term}期${quarter}Q`,
    start: starts[quarter - 1],
    end: addDays(starts[quarter], -1)
  };
}

export function getFiscalTermQuarters(dateKey) {
  const current = getFiscalQuarter(dateKey);
  return [0, 3, 6, 9].map((monthOffset) => {
    const start = parseDateKey(`${current.term - FISCAL_ANCHOR_TERM + FISCAL_ANCHOR_YEAR}-06-01`);
    start.setMonth(start.getMonth() + monthOffset);
    return getFiscalQuarter(toDateKey(start));
  });
}

export function getOperationalMonth(dateKey) {
  return getWeekStart(dateKey).slice(0, 7);
}

export function getOperationalMonthWeeks(monthKey) {
  const first = firstMondayOfMonth(monthKey);
  const [year, month] = monthKey.split('-').map(Number);
  const nextMonthKey = toDateKey(new Date(year, month, 1)).slice(0, 7);
  const boundary = firstMondayOfMonth(nextMonthKey);
  const rows = [];
  for (let start = first; start < boundary; start = addDays(start, 7)) {
    rows.push({ index: rows.length + 1, label: `${rows.length + 1}週目`, start, end: addDays(start, 6) });
  }
  return rows;
}
```

- [ ] **Step 5: Run calendar tests and the regression suite**

Run: `node tests/calendar.test.mjs`

Expected: all three calendar tests print `ok`.

Run: `npm.cmd test`

Expected: all existing and new tests pass.

- [ ] **Step 6: Commit the calendar domain**

```bash
git add src/domain/calendar.js tests/calendar.test.mjs tests/run-all.mjs
git commit -m "feat: add fiscal and operational review periods"
```

---

### Task 2: Additive Review State And CRUD

**Files:**
- Modify: `src/domain/presets.js`
- Modify: `src/state/store.js`
- Modify: `tests/state.test.mjs`

**Interfaces:**
- Consumes: existing immutable state update style and `userId|period|taskId` identity rules.
- Produces: `upsertQuarterGoalNote`, `deleteQuarterGoalNote`, `upsertWeeklyGoalNote`, `deleteWeeklyGoalNote`, `upsertQuarterGoal`, `deleteQuarterGoal`, `deleteWeeklyGoal`, and `replaceWeeklyTodoLines`.
- `replaceWeeklyTodoLines(state, weekStart, userId, lines)` receives `{ id: string, text: string }[]`, stores canonical `- text` in `todoText`, and preserves checkbox state only for unique unchanged text.

- [ ] **Step 1: Write failing state tests**

Append tests that initialize all new arrays, isolate periods/users, remove target rows without touching counts, and preserve legacy review fields:

Extend the existing `../src/state/store.js` import with:

```js
deleteQuarterGoal,
deleteQuarterGoalNote,
deleteWeeklyGoal,
deleteWeeklyGoalNote,
replaceWeeklyTodoLines,
upsertQuarterGoal,
upsertQuarterGoalNote,
upsertWeeklyGoalNote,
```

```js
test('review state normalizes additive goal collections and structured review fields', () => {
  const normalized = normalizeState({
    projects: [],
    tasks: [],
    weeklyReviews: [{ userId: 'ishida', weekStart: '2026-09-07', goalReflection: '成果', overtimeCause: '準備不足' }]
  });
  assert.deepEqual(normalized.quarterGoalNotes, []);
  assert.deepEqual(normalized.quarterGoals, []);
  assert.deepEqual(normalized.weeklyGoalNotes, []);
  assert.equal(normalized.weeklyReviews[0].goodPoints, '成果');
  assert.deepEqual(normalized.weeklyReviews[0].reflections, ['準備不足', '', '']);
  assert.deepEqual(normalized.weeklyReviews[0].improvements, ['', '', '']);
});

test('quarter and weekly goal rows update only their exact user and period', () => {
  let next = createAppState('2026-09-07');
  next = upsertQuarterGoalNote(next, 'ishida', '2026-09-01', 'q-note-1', '重点顧客');
  next = upsertWeeklyGoalNote(next, 'tanoue', '2026-09-07', 'w-note-1', '当日追客');
  next = upsertQuarterGoal(next, 'ishida', '2026-09-01', 'ses-sales-1', 120);
  assert.equal(next.quarterGoalNotes[0].items[0].text, '重点顧客');
  assert.equal(next.weeklyGoalNotes[0].userId, 'tanoue');
  assert.equal(next.quarterGoals[0].targetCount, 120);
});

test('structured review patches preserve untouched old and new fields', () => {
  const initial = upsertReview(createAppState('2026-09-07'), '2026-09-07', {
    userId: 'ishida',
    goodPoints: '即レスできた',
    reflections: ['準備不足', '', ''],
    improvements: ['朝に準備', '', ''],
    discussionItems: '提案配分',
    nextPromise: '旧欄'
  });
  const next = upsertReview(initial, '2026-09-07', { userId: 'ishida', goodPoints: '面談化した' });
  assert.deepEqual(next.weeklyReviews[0].reflections, ['準備不足', '', '']);
  assert.equal(next.weeklyReviews[0].discussionItems, '提案配分');
  assert.equal(next.weeklyReviews[0].nextPromise, '旧欄');
});

test('next action replacement preserves only unambiguous checkbox matches', () => {
  const initial = {
    ...createAppState('2026-09-07'),
    weeklyTodos: [{ userId: 'ishida', weekStart: '2026-09-07', todoText: '- 追客\n- 資料作成', checkedItems: { 0: true, 1: false } }]
  };
  const next = replaceWeeklyTodoLines(initial, '2026-09-07', 'ishida', [
    { id: 'b', text: '資料作成' },
    { id: 'a', text: '追客' },
    { id: 'c', text: '日程調整' }
  ]);
  assert.equal(next.weeklyTodos[0].todoText, '- 資料作成\n- 追客\n- 日程調整');
  assert.deepEqual(next.weeklyTodos[0].checkedItems, { 0: false, 1: true, 2: false });
});
```

- [ ] **Step 2: Run state tests and confirm missing exports/fields**

Run: `node tests/state.test.mjs`

Expected: FAIL on the first missing new collection or mutator.

- [ ] **Step 3: Initialize and normalize additive collections**

Add `quarterGoalNotes`, `quarterGoals`, and `weeklyGoalNotes` as empty arrays in `createInitialState()`. In `normalizeState()`, preserve empty item rows and normalize review arrays to exactly three strings:

```js
function normalizeThreeRows(rows, fallback = '') {
  const values = Array.isArray(rows) ? rows : [fallback];
  return Array.from({ length: 3 }, (_, index) => String(values[index] ?? ''));
}

function normalizeGoalNoteRows(rows, defaultUserId, periodField) {
  return (rows ?? []).map((row) => ({
    ...row,
    userId: row.userId ?? defaultUserId,
    [periodField]: row[periodField],
    items: (row.items ?? []).map((item, index) => ({
      id: String(item.id ?? `legacy-${index + 1}`),
      text: String(item.text ?? '')
    }))
  }));
}
```

Normalize each review with this precedence:

```js
{
  discussionItems: '',
  userId: defaultUserId,
  ...review,
  goodPoints: String(review.goodPoints ?? review.goalReflection ?? ''),
  reflections: normalizeThreeRows(review.reflections, review.overtimeCause ?? ''),
  improvements: normalizeThreeRows(review.improvements)
}
```

Normalize `quarterGoals` and existing `weeklyGoals` with `userId: row.userId ?? defaultUserId` and `targetCount: Math.max(0, Number(row.targetCount) || 0)`. This prevents malformed historical values from producing invalid progress percentages.

- [ ] **Step 4: Implement exact-key goal CRUD and safe review patching**

Use immutable wrappers around one internal item-row helper. Quarter target deletion must filter by all three key fields; weekly target deletion must filter by `userId`, `weekStart`, and `taskId`. Change `upsertReview` to merge instead of reconstructing:

```js
const nextReview = {
  goalReflection: '',
  overtimeCause: '',
  nextPromise: '',
  discussionItems: '',
  goodPoints: '',
  reflections: ['', '', ''],
  improvements: ['', '', ''],
  ...existing,
  ...patch,
  weekStart,
  userId,
  updatedAt: new Date().toISOString()
};
```

For next actions, parse the old text before replacing it, count duplicate text values, and transfer a checked value only when both old and new text occur once:

```js
export function replaceWeeklyTodoLines(state, weekStart, userId, lines) {
  const existing = (state.weeklyTodos ?? []).find(
    (row) => row.weekStart === weekStart && row.userId === userId
  );
  const oldLines = String(existing?.todoText ?? '').split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-・]\s*/, '').trim()).filter(Boolean);
  const cleanLines = lines.map((line) => String(line.text ?? '').trim()).filter(Boolean);
  const count = (items, value) => items.filter((item) => item === value).length;
  const checkedItems = Object.fromEntries(cleanLines.map((text, index) => {
    const oldIndex = oldLines.indexOf(text);
    const keep = count(oldLines, text) === 1 && count(cleanLines, text) === 1 && Boolean(existing?.checkedItems?.[oldIndex]);
    return [index, keep];
  }));
  return upsertWeeklyTodo(state, weekStart, userId, cleanLines.map((text) => `- ${text}`).join('\n'), checkedItems);
}
```

Extend `upsertWeeklyTodo` with an optional fourth `checkedItems` argument; existing callers continue to preserve the prior map when it is omitted.

- [ ] **Step 5: Run state tests and full tests**

Run: `node tests/state.test.mjs`

Expected: all state tests pass.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 6: Commit state support**

```bash
git add src/domain/presets.js src/state/store.js tests/state.test.mjs
git commit -m "feat: add quarter and structured review state"
```

---

### Task 3: Persist New Collections Per User

**Files:**
- Modify: `src/state/firebase-sync.js`
- Modify: `tests/firebase-sync.test.mjs`

**Interfaces:**
- Consumes: Task 2 collections with normalized `userId`, `quarterStart`, `weekStart`, and `taskId`.
- Produces keyed merge entries for `quarterGoalNotes`, `quarterGoals`, and `weeklyGoalNotes` in existing user documents.

- [ ] **Step 1: Write failing merge and persistence tests**

Add rows for both users to the existing merge tests and assert exact identity behavior:

```js
test('new review collections merge by user and period keys', () => {
  const remote = {
    quarterGoals: [{ userId: 'tanoue', quarterStart: '2026-09-01', taskId: 't1', targetCount: 80 }],
    quarterGoalNotes: [{ userId: 'tanoue', quarterStart: '2026-09-01', items: [{ id: 'n1', text: '田上目標' }] }],
    weeklyGoalNotes: []
  };
  const local = {
    quarterGoals: [{ userId: 'ishida', quarterStart: '2026-09-01', taskId: 't1', targetCount: 120 }],
    quarterGoalNotes: [],
    weeklyGoalNotes: [{ userId: 'ishida', weekStart: '2026-09-07', items: [{ id: 'n2', text: '石田目標' }] }]
  };
  const merged = mergeSharedStateForSave(remote, local);
  assert.equal(merged.quarterGoals.length, 2);
  assert.equal(merged.quarterGoalNotes[0].userId, 'tanoue');
  assert.equal(merged.weeklyGoalNotes[0].userId, 'ishida');
});
```

Extend the adapter save test so the Ishida document contains only Ishida's new rows and no Tanoue row.

- [ ] **Step 2: Run Firebase sync tests and confirm rows are dropped**

Run: `node tests/firebase-sync.test.mjs`

Expected: FAIL because the new collections are not included in `keyedCollections` and user save projections.

- [ ] **Step 3: Add keyed collection identities**

Add these entries to `keyedCollections`:

```js
quarterGoalNotes: (row) => `${row.userId}|${row.quarterStart}`,
quarterGoals: (row) => `${row.userId}|${row.quarterStart}|${row.taskId}`,
weeklyGoalNotes: (row) => `${row.userId}|${row.weekStart}`,
```

Because `userScopedCollectionNames` derives from `Object.keys(keyedCollections)`, the existing root clearing, per-user filtering, snapshot combining, and transaction merge paths then include all three collections.

- [ ] **Step 4: Run sync tests and full tests**

Run: `node tests/firebase-sync.test.mjs`

Expected: all Firebase sync tests pass, including strict user filtering.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit persistence support**

```bash
git add src/state/firebase-sync.js tests/firebase-sync.test.mjs
git commit -m "feat: persist review goals per user"
```

---

### Task 4: Explicit-Range Goal And Time Metrics

**Files:**
- Modify: `src/domain/metrics.js`
- Modify: `tests/domain.test.mjs`

**Interfaces:**
- Consumes: `getDateRange(startDate, endDate)`, `dailyCounts`, `dayPlans`, `dayActuals`, `projects`, `tasks`, and goal rows containing `taskId`/`targetCount`.
- Produces: `computeGoalProgress(state, { userId, startDate, endDate, goals })` and `computeReviewPeriodMetrics(state, { userId, startDate, endDate })`.
- Goal result: `{ rows, totalActualCount, totalTargetCount, totalProgressRate }`.
- Period result: `{ startDate, endDate, totalActualHours, natureHours, natureRatios, projectRows, planActualRows, topGaps }`.

- [ ] **Step 1: Write failing explicit-range tests**

Add one quarter-boundary and one cross-month weekly test:

Extend the `../src/domain/metrics.js` import with `computeGoalProgress` and `computeReviewPeriodMetrics`, and add `getDateRange` to the metrics module's calendar import.

```js
test('computeGoalProgress aggregates the inclusive range for one user', () => {
  const state = {
    ...baseState,
    dailyCounts: [
      { userId: 'ishida', date: '2026-09-01', taskId: 'proposal', count: 3 },
      { userId: 'ishida', date: '2026-11-30', taskId: 'proposal', count: 7 },
      { userId: 'ishida', date: '2026-12-01', taskId: 'proposal', count: 99 },
      { userId: 'tanoue', date: '2026-09-10', taskId: 'proposal', count: 40 }
    ]
  };
  const result = computeGoalProgress(state, {
    userId: 'ishida', startDate: '2026-09-01', endDate: '2026-11-30',
    goals: [{ userId: 'ishida', quarterStart: '2026-09-01', taskId: 'proposal', targetCount: 20 }]
  });
  assert.equal(result.rows[0].actualCount, 10);
  assert.equal(result.rows[0].progressRate, 50);
  assert.equal(result.totalProgressRate, 50);
});

test('computeReviewPeriodMetrics includes Sunday across a month boundary', () => {
  const state = {
    ...baseState,
    dayPlans: [{ userId: 'ishida', date: '2026-09-28', hour: 10, taskId: 'proposal' }],
    dayActuals: [{ userId: 'ishida', date: '2026-10-04', hour: 10, taskId: 'proposal' }]
  };
  const result = computeReviewPeriodMetrics(state, {
    userId: 'ishida', startDate: '2026-09-28', endDate: '2026-10-04'
  });
  assert.equal(result.totalActualHours, 1);
  assert.equal(result.planActualRows[0].plannedHours, 1);
  assert.equal(result.planActualRows[0].actualHours, 1);
});
```

- [ ] **Step 2: Run domain tests and confirm missing exports**

Run: `node tests/domain.test.mjs`

Expected: FAIL because the explicit-range functions do not exist.

- [ ] **Step 3: Implement goal aggregation**

Use an inclusive date set and preserve percentages above 100 for the label while the renderer caps bar width:

```js
export function computeGoalProgress(state, { userId, startDate, endDate, goals = [] }) {
  const dates = new Set(getDateRange(startDate, endDate));
  const tasks = taskById(state.tasks ?? []);
  const rows = goals.filter((goal) => matchesUser(goal, userId)).map((goal) => {
    const targetCount = Math.max(0, Number(goal.targetCount) || 0);
    const actualCount = (state.dailyCounts ?? []).filter((row) =>
      matchesUser(row, userId) && row.taskId === goal.taskId && dates.has(row.date)
    ).reduce((sum, row) => sum + row.count, 0);
    return {
      ...goal,
      taskName: tasks.get(goal.taskId)?.name ?? '未設定タスク',
      targetCount,
      actualCount,
      progressRate: targetCount === 0 ? 0 : round((actualCount / targetCount) * 100, 1)
    };
  });
  const totalActualCount = rows.reduce((sum, row) => sum + row.actualCount, 0);
  const totalTargetCount = rows.reduce((sum, row) => sum + row.targetCount, 0);
  return {
    rows,
    totalActualCount,
    totalTargetCount,
    totalProgressRate: totalTargetCount === 0 ? 0 : round((totalActualCount / totalTargetCount) * 100, 1)
  };
}
```

- [ ] **Step 4: Implement period metrics by extracting existing logic**

Refactor the date-set portions of `computeReviewMetrics` and `computePlanActualTimeBreakdown` into internal helpers that accept a `Set<string>`. Move the aggregation behavior of the current `main.js` `projectTimeRows` function into a new private `computeProjectTimeRowsForDates` metrics helper; Task 6 then removes the UI-local duplicate. Implement `computeReviewPeriodMetrics` from those helpers so project rows include actual minutes and ratio, while plan/actual rows preserve project and task differences. Keep old exports as wrappers so existing daily/dashboard tests remain unchanged.

Use this exact entry point:

```js
export function computeReviewPeriodMetrics(state, { userId, startDate, endDate }) {
  const dates = new Set(getDateRange(startDate, endDate));
  const summary = computeReviewSummaryForDates(state, dates, userId);
  return {
    startDate,
    endDate,
    ...summary,
    projectRows: computeProjectTimeRowsForDates(state, dates, userId),
    planActualRows: computePlanActualTimeBreakdownForDates(state, dates, userId)
  };
}
```

- [ ] **Step 5: Run domain tests and full tests**

Run: `node tests/domain.test.mjs`

Expected: all domain tests pass.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 6: Commit range metrics**

```bash
git add src/domain/metrics.js tests/domain.test.mjs
git commit -m "feat: aggregate review metrics by date range"
```

---

### Task 5: Review Page View Model

**Files:**
- Create: `src/ui/review-view-model.js`
- Create: `tests/review-view-model.test.mjs`
- Modify: `tests/run-all.mjs`

**Interfaces:**
- Consumes: Task 1 period descriptors, Task 4 metrics, active `userId`, `currentDate`, and optional selection keys.
- Produces: `createReviewViewModel(state, { userId, currentDate, quarterStart, monthKey, weekStart })`.
- Returned top-level keys: `userId`, `quarters`, `selectedQuarter`, `monthKey`, `weeks`, `selectedWeek`, `countableTasks`, `quarter`, `week`, `review`, and `nextActionRows`.
- `quarter`: `{ qualitativeItems, goalProgress }`.
- `week`: `{ qualitativeItems, goalProgress, metrics }`; `week.metrics` supplies the time-analysis card.

- [ ] **Step 1: Register and write failing view-model tests**

Add `import './review-view-model.test.mjs';` to `tests/run-all.mjs`. Create a state containing Ishida and Tanoue rows for the same task and assert selected dates and isolation:

```js
import assert from 'node:assert/strict';
import { createReviewViewModel } from '../src/ui/review-view-model.js';

const state = {
  projects: [{ id: 'p1', name: 'SES', order: 1, status: 'active' }],
  tasks: [{ id: 't1', projectId: 'p1', name: '提案', countable: true, nature: 'core', order: 1, status: 'active' }],
  quarterGoalNotes: [{ userId: 'ishida', quarterStart: '2026-09-01', items: [{ id: 'q1', text: '重点顧客' }] }],
  quarterGoals: [{ userId: 'ishida', quarterStart: '2026-09-01', taskId: 't1', targetCount: 100 }],
  weeklyGoalNotes: [{ userId: 'ishida', weekStart: '2026-09-07', items: [{ id: 'w1', text: '即日追客' }] }],
  weeklyGoals: [{ userId: 'ishida', weekStart: '2026-09-07', taskId: 't1', targetCount: 10 }],
  dailyCounts: [
    { userId: 'ishida', date: '2026-09-07', taskId: 't1', count: 4 },
    { userId: 'tanoue', date: '2026-09-07', taskId: 't1', count: 30 }
  ],
  weeklyReviews: [], weeklyTodos: [], dayPlans: [], dayActuals: []
};

const view = createReviewViewModel(state, { userId: 'ishida', currentDate: '2026-09-07' });
assert.equal(view.selectedQuarter.label, '20期2Q');
assert.equal(view.selectedWeek.start, '2026-09-07');
assert.equal(view.quarter.goalProgress.rows[0].actualCount, 4);
assert.equal(view.week.goalProgress.rows[0].actualCount, 4);
assert.deepEqual(view.quarter.qualitativeItems.map((item) => item.text), ['重点顧客']);
```

- [ ] **Step 2: Run the view-model test and confirm the module is missing**

Run: `node tests/review-view-model.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement selection normalization and data assembly**

Selection rules must reject stale keys and fall back to `currentDate`:

```js
function selectedByStart(rows, requestedStart, fallbackStart) {
  return rows.find((row) => row.start === requestedStart)
    ?? rows.find((row) => row.start === fallbackStart)
    ?? rows[0];
}

export function createReviewViewModel(state, options) {
  const { userId, currentDate } = options;
  const quarters = getFiscalTermQuarters(currentDate);
  const currentQuarter = getFiscalQuarter(currentDate);
  const selectedQuarter = selectedByStart(quarters, options.quarterStart, currentQuarter.start);
  const monthKey = /^\d{4}-\d{2}$/.test(options.monthKey ?? '')
    ? options.monthKey
    : getOperationalMonth(currentDate);
  const weeks = getOperationalMonthWeeks(monthKey);
  const selectedWeek = selectedByStart(weeks, options.weekStart, getWeekStart(currentDate));
```

Filter every row by `(row.userId ?? 'ishida') === userId` and the selected period. Sort countable tasks by project order then task order. Build `nextActionRows` by parsing `weeklyTodos.todoText`, assigning DOM-stable IDs such as `${selectedWeek.start}-action-${index}` for the current render.

- [ ] **Step 4: Run view-model and full tests**

Run: `node tests/review-view-model.test.mjs`

Expected: selected periods, counts, and user isolation pass.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit the review view model**

```bash
git add src/ui/review-view-model.js tests/review-view-model.test.mjs tests/run-all.mjs
git commit -m "feat: build quarter and weekly review view model"
```

---

### Task 6: Pure Review Renderer And Goal Card Navigation

**Files:**
- Create: `src/ui/review-view.js`
- Create: `tests/review-view.test.mjs`
- Modify: `tests/run-all.mjs`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `createReviewViewModel()` output and `{ icon(name): string }`.
- Produces: `renderReviewPage(view, { icon })` and these event contracts:
  - `data-action="select-quarter" data-quarter-start`
  - `data-field="review-month"`
  - `data-action="select-review-week" data-week-start`
  - `data-field="quarter-note" data-item-id`
  - `data-field="week-note" data-item-id`
  - `data-field="quarter-target" data-task-id`
  - `data-field="weekly-task-target" data-task-id`
  - add/delete action names for qualitative and quantitative rows.

- [ ] **Step 1: Register and write failing renderer tests**

Create `tests/review-view.test.mjs`, pass a fixed view fixture, and assert card order and selected tabs:

```js
import assert from 'node:assert/strict';
import { renderReviewPage } from '../src/ui/review-view.js';

const emptyProgress = { rows: [], totalActualCount: 0, totalTargetCount: 0, totalProgressRate: 0 };
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
  countableTasks: [{ id: 't1', name: '提案' }],
  quarter: { qualitativeItems: [], goalProgress: emptyProgress },
  week: {
    qualitativeItems: [],
    goalProgress: emptyProgress,
    metrics: { totalActualHours: 0, natureRatios: {}, projectRows: [], planActualRows: [], topGaps: [] }
  },
  review: { goodPoints: '', reflections: ['', '', ''], improvements: ['', '', ''], discussionItems: '' },
  nextActionRows: []
};

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
assert.match(html, /data-quarter-start="2026-09-01"[^>]*aria-selected="true"/);
assert.match(html, /data-week-start="2026-09-07"[^>]*aria-selected="true"/);
assert.doesNotMatch(html, /田上目標/);
```

Add `import './review-view.test.mjs';` to `tests/run-all.mjs`.

- [ ] **Step 2: Run the renderer test and confirm the module is missing**

Run: `node tests/review-view.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement renderer primitives and the first two cards**

Create local `escapeHtml`, `renderTabs`, `renderGoalRows`, and `renderProgressRows` helpers. Quantitative progress labels show `${actualCount}/${targetCount}件 (${progressRate}%)`; bar width uses `Math.min(100, Math.max(0, progressRate))`. The target task selector disables task IDs already used in another row, and each card provides an icon-only add button with `aria-label` and `title`. At this task boundary, render the remaining five cards as valid labeled `<section data-review-card>` shells so the complete card-order test and production build pass; Task 7 fills their controls and analysis content.

Use this top-level order, with each named function returning a complete `<section>`:

```js
export function renderReviewPage(view, { icon }) {
  return `<div class="review-layout review-v2">
    ${renderQuarterGoalCard(view, icon)}
    ${renderWeeklyGoalCard(view, icon)}
    ${renderTimeAnalysisCard(view)}
    ${renderGoodPointsCard(view)}
    ${renderReflectionCard(view)}
    ${renderNextActionsCard(view, icon)}
    ${renderDiscussionCard(view)}
  </div>`;
}
```

- [ ] **Step 4: Connect selection state in `main.js`**

Replace `reviewMode` with nullable selection variables:

```js
let selectedReviewQuarterStart = '';
let selectedReviewMonthKey = '';
let selectedReviewWeekStart = '';
```

Import `createReviewViewModel` from `./ui/review-view-model.js` and `renderReviewPage` from `./ui/review-view.js`. Import every Task 2 store mutator used by review events in the existing grouped store import.

Add `currentReviewView()` that calls `createReviewViewModel`, then stores the normalized selected keys returned by the model. Replace the old `renderReviewDashboard()` body with `renderReviewPage(currentReviewView(), { icon })`. On current-date changes, clear all three keys so the next render returns to date-derived defaults.

Remove the superseded `renderMonthlyProjectGoals`, `renderReviewWeeklyTargets`, `renderGoalRows`, `renderPie`, `projectTimeRows`, `renderProjectTimePie`, `renderReviewTimeBreakdown`, `renderReviewForm`, and `renderWeeklyReviewForm` functions, the `review-mode` event branch, and review-only label rewriting in `applyReviewLabels`. Keep monthly records in state; only their old review-page rendering is removed.

Handle quarter/week tab clicks and month changes without saving application data:

```js
if (action === 'select-quarter') selectedReviewQuarterStart = button.dataset.quarterStart;
if (action === 'select-review-week') selectedReviewWeekStart = button.dataset.weekStart;
```

For `review-month`, set `selectedReviewMonthKey = target.value`, clear `selectedReviewWeekStart`, and rerender. Add `quarter-goal-task` and `weekly-goal-task` change contracts: remove the row's old task key, then upsert the selected new task with the unchanged target value from the same row. Disable choices already used by sibling rows so the period cannot contain duplicate task goals.

- [ ] **Step 5: Run renderer tests, syntax checks, and build**

Run: `node tests/review-view.test.mjs`

Expected: all card-order and tab assertions pass.

Run: `npm.cmd run lint`

Expected: syntax checks pass.

Run: `npm.cmd run build`

Expected: Vite build completes.

- [ ] **Step 6: Commit renderer and period navigation**

```bash
git add src/ui/review-view.js src/main.js tests/review-view.test.mjs tests/run-all.mjs
git commit -m "feat: render quarter and weekly goal cards"
```

---

### Task 7: Goal Editing, Analysis, And Structured Reflection Events

**Files:**
- Modify: `src/ui/review-view.js`
- Modify: `src/main.js`
- Modify: `tests/review-view.test.mjs`
- Modify: `tests/state.test.mjs`

**Interfaces:**
- Consumes: Task 2 mutators, Task 5 selected period keys, Task 6 renderer contracts.
- Produces working add/edit/delete actions for all goal rows, three paired reflection/improvement rows, good points, next actions, and discussion topics.

- [ ] **Step 1: Add failing markup contract assertions**

Extend the renderer test with exact structured-field contracts:

```js
assert.match(html, /data-review-field="goodPoints"/);
assert.equal((html.match(/data-review-field="reflections"/g) ?? []).length, 3);
assert.equal((html.match(/data-review-field="improvements"/g) ?? []).length, 3);
assert.match(html, /data-field="next-action-row"/);
assert.match(html, /data-action="add-next-action"/);
assert.match(html, /data-review-field="discussionItems"/);
assert.match(html, /予定 .*h \/ 実績 .*h/);
```

- [ ] **Step 2: Run the renderer test and confirm missing fields**

Run: `node tests/review-view.test.mjs`

Expected: FAIL on the first unrendered structured card contract.

- [ ] **Step 3: Complete all seven card renderers**

Render time analysis from `view.week.metrics.projectRows` and `planActualRows`; render an empty-state sentence when both arrays are empty. Use `projectRows` to create a conic-gradient actual-time pie and legend, and use `planActualRows` to render paired planned/actual bars plus signed differences for every project and task. Render `reflections[index]` beside `improvements[index]` using `data-review-index="0|1|2"`. Render next actions as individual text inputs plus delete buttons and one blank draft row when there are no actions.

Use descriptive accessible labels, including `aria-label="反省点1"`, `aria-label="改善点1"`, and `aria-label="次のアクションを削除"`. Do not render another user's selector or data.

- [ ] **Step 4: Wire text and numeric editing without cursor jumps**

In `handleInput`, route note/review/action text fields through `commit(nextState, { render: false })`. Patch array-valued review fields by copying the current three-item array before replacing one index:

```js
const review = currentReviewView().review;
const values = [...review[target.dataset.reviewField]];
values[Number(target.dataset.reviewIndex)] = target.value;
commit(upsertReview(state, selectedReviewWeekStart, {
  userId: activeUserId,
  [target.dataset.reviewField]: values
}), { render: false });
```

In `handleChange`, route quarter/weekly targets and task-selector replacements to exact selected periods. In `handleClick`, create qualitative item IDs with `crypto.randomUUID()` when available and a timestamp/counter fallback. For quantitative add actions, choose the first active countable task not already used in that period and upsert it with target `0`; disable the add control when no unused task remains. Delete actions remove exact item IDs or exact period/task targets. Each click that changes the row count uses normal `commit()` so the page rerenders.

- [ ] **Step 5: Implement next-action DOM row collection**

Add `nextActionLinesFromCard(buttonOrInput)` in `main.js`, reading `.next-action-row input` values from the nearest next-action card. The add button inserts and focuses one empty row without saving. Input persists the current nonempty rows with this exact call:

```js
commit(
  replaceWeeklyTodoLines(
    state,
    selectedReviewWeekStart,
    activeUserId,
    nextActionLinesFromCard(target)
  ),
  { render: false }
);
```

Delete removes the row element, then persists the remaining lines and rerenders.

- [ ] **Step 6: Run focused tests and build**

Run: `node tests/review-view.test.mjs`

Expected: all seven-card contracts pass.

Run: `node tests/state.test.mjs`

Expected: row editing and checkbox preservation tests pass.

Run: `npm.cmd run lint`

Expected: syntax checks pass.

Run: `npm.cmd run build`

Expected: Vite build completes.

- [ ] **Step 7: Commit editing and reflection workflow**

```bash
git add src/ui/review-view.js src/main.js tests/review-view.test.mjs tests/state.test.mjs
git commit -m "feat: add structured weekly review workflow"
```

---

### Task 8: Synchronize Same-Week Goals And Actions To Daily Page

**Files:**
- Modify: `src/domain/metrics.js`
- Modify: `src/ui/view-model.js`
- Modify: `tests/domain.test.mjs`
- Modify: `tests/ui-view.test.mjs`

**Interfaces:**
- Consumes: same-week `weeklyGoals`, same-week `weeklyTodos`, legacy previous-week `weeklyReviews.nextPromise`.
- Produces: `getImprovementPromiseForWeek(state, weekStart, userId)` preferring current `weeklyTodos.todoText`, and daily view fields `weeklyGoalRows`, `weeklyTodoLines`, and `improvementPromise` for one user/week.

- [ ] **Step 1: Change tests to the accepted same-week precedence**

Add a current-week todo to the existing improvement test and assert it wins over previous-week `nextPromise`:

```js
test('getImprovementPromiseForWeek prefers same-week next actions', () => {
  const state = {
    weeklyTodos: [{ userId: 'ishida', weekStart: '2026-09-07', todoText: '- 当日追客\n- 朝に候補抽出', checkedItems: {} }],
    weeklyReviews: [{ userId: 'ishida', weekStart: '2026-08-31', nextPromise: '旧約束' }]
  };
  assert.equal(getImprovementPromiseForWeek(state, '2026-09-07', 'ishida'), '当日追客\n朝に候補抽出');
});
```

In `tests/ui-view.test.mjs`, change the current weekly goals/todos assertion so `view.improvementPromise` equals the two same-week todo lines. Keep a second test proving an empty current todo still falls back to the previous-week review promise.

- [ ] **Step 2: Run focused tests and confirm old precedence fails**

Run: `node tests/domain.test.mjs`

Expected: FAIL because the old helper reads only the prior review.

Run: `node tests/ui-view.test.mjs`

Expected: FAIL because the daily view still exposes the prior promise.

- [ ] **Step 3: Implement same-week lookup with legacy fallback**

Update `getImprovementPromiseForWeek`:

```js
export function getImprovementPromiseForWeek(state, weekStart, userId) {
  const todo = (state.weeklyTodos ?? []).find(
    (row) => row.weekStart === weekStart && matchesUser(row, userId)
  );
  const currentLines = String(todo?.todoText ?? '').split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-・]\s*/, '').trim()).filter(Boolean);
  if (currentLines.length > 0) return currentLines.join('\n');
  const previousWeek = addDays(weekStart, -7);
  const review = (state.weeklyReviews ?? []).find(
    (row) => row.weekStart === previousWeek && matchesUser(row, userId)
  );
  return review?.nextPromise?.trim() || '今週の改善約束は未設定です';
}
```

No cross-user search is allowed. Keep `createDashboardViewModel` using `getWeekStart(date)` so weekly target/count aggregation follows the daily page's selected date.

- [ ] **Step 4: Run focused and full tests**

Run: `node tests/domain.test.mjs`

Expected: current-week and legacy fallback tests pass.

Run: `node tests/ui-view.test.mjs`

Expected: daily banner data is same-week and user-specific.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit daily synchronization**

```bash
git add src/domain/metrics.js src/ui/view-model.js tests/domain.test.mjs tests/ui-view.test.mjs
git commit -m "feat: sync weekly review actions to daily page"
```

---

### Task 9: Responsive Review Styling And End-To-End Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/mobile-css.test.mjs`

**Interfaces:**
- Consumes: `.review-v2`, `.review-goal-grid`, `.review-reflection-grid`, `.review-progress-list`, `.review-time-grid`, and `.next-action-row` markup from Task 6/7.
- Produces desktop three-column goal cards, paired reflection rows, readable charts, and mobile one-column stacking without horizontal overflow.

- [ ] **Step 1: Write failing responsive CSS assertions**

Append exact layout checks:

```js
test('review v2 CSS uses three desktop columns and one mobile column', () => {
  assert.match(css, /\.review-goal-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.review-reflection-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
  const mobileSection = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(mobileSection, /\.review-goal-grid\s*{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileSection, /\.review-reflection-grid\s*{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(mobileSection, /\.review-v2\s*{[^}]*overflow-x:\s*hidden;/s);
});
```

- [ ] **Step 2: Run CSS tests and confirm new selectors are absent**

Run: `node tests/mobile-css.test.mjs`

Expected: FAIL on `.review-goal-grid`.

- [ ] **Step 3: Add restrained desktop and mobile styles**

Use a neutral white/gray surface with existing blue, green, amber, and red semantic colors. Keep cards at the existing radius, use fixed progress-track heights, and set all grid children to `min-width: 0`. Required core rules:

```css
.review-goal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.review-reflection-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.review-progress-track {
  display: block;
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 5px;
  background: #e5e7eb;
}

@media (max-width: 760px) {
  .review-v2 { overflow-x: hidden; }
  .review-goal-grid,
  .review-reflection-grid,
  .review-time-grid { grid-template-columns: 1fr; }
}
```

Set text inputs/selects to `max-width: 100%`, let tabs scroll horizontally inside their own strip, and keep all icon buttons at a stable square touch size.

- [ ] **Step 4: Run automated verification**

Run: `npm.cmd test`

Expected: all tests pass.

Run: `npm.cmd run lint`

Expected: syntax checks pass.

Run: `npm.cmd run build`

Expected: production build completes; an existing bundle-size warning is acceptable only if the build exits successfully.

- [ ] **Step 5: Start the local app for visual verification**

Run: `npm.cmd run dev -- --port 4173`

Expected: Vite reports `http://127.0.0.1:4173/`. Keep the process running until screenshots and interactions are complete.

- [ ] **Step 6: Verify desktop and mobile behavior with Playwright**

At `1440x1000` and `390x844`, open `http://127.0.0.1:4173/?user=ishida`, authenticate only through the normal app flow when required, and verify:

1. Card order exactly matches the seven-card spec.
2. `20期2Q` and September `1週目` are initially selected on `2026-09-07`.
3. Quarter/week tabs change displayed rows without changing the daily date.
4. Add, edit, and delete operations persist after reload.
5. Entered counts update both weekly and quarterly progress.
6. Same-week next actions appear at the top of the daily page.
7. `?user=ishida` never shows Tanoue's review text; `?user=tanoue` never shows Ishida's.
8. Mobile cards stack without page-level horizontal scrolling, clipped text, or overlapping controls.

Capture one desktop and one mobile screenshot and inspect them before completion.

Stop the Vite process after screenshot and interaction verification so no background terminal session remains running.

- [ ] **Step 7: Commit responsive styles**

```bash
git add src/styles.css tests/mobile-css.test.mjs
git commit -m "style: make review workflow responsive"
```

- [ ] **Step 8: Review the complete branch diff**

Run: `git status --short`

Expected: no uncommitted files.

Run: `git diff HEAD~9..HEAD --check`

Expected: no whitespace errors.

Run: `git log --oneline -9`

Expected: one focused commit per task, with no authentication, rule, generated `dist`, or unrelated changes.

Do not push or deploy until the user explicitly authorizes the production operation after reviewing the local result.
