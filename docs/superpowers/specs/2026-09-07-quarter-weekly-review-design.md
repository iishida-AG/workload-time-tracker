# Quarter And Weekly Review Design

## Purpose

Redesign the review page so each user can set and monitor quarterly and weekly qualitative and quantitative goals, analyze planned-versus-actual time, record structured weekly reflections, and carry the selected week's next actions into the daily page.

The design preserves existing daily counts, weekly targets, timeline entries, and per-user Firestore documents. New records are additive so historical data remains available without a destructive migration.

## User Scope

- The page always edits the active URL user only: `ishida` or `tanoue`.
- Ishida and Tanoue records never share a writable key.
- Shared preview behavior elsewhere remains read-only.
- All new records live in the existing per-user Firestore document under `workloadApps/default/users/{userId}`.

## Period Rules

### Fiscal Term And Quarter

The fiscal calendar uses `2026-06-01 = 20期1Q` as its anchor.

| Quarter | Months |
| --- | --- |
| 1Q | June 1 through August 31 |
| 2Q | September 1 through November 30 |
| 3Q | December 1 through the following February 28 or 29 |
| 4Q | March 1 through May 31 |

- The fiscal term number increases every June 1.
- `2026-09-07` resolves to `20期2Q`, from `2026-09-01` through `2026-11-30`.
- The review page initially selects the quarter containing `currentDate`.
- The selector shows all four quarters for the fiscal term containing `currentDate`.
- Switching a quarter changes only the quarter card. Weekly review cards continue to use the selected week.
- Date calculations use local calendar dates and the existing `YYYY-MM-DD` keys. UTC conversion is not introduced.

### Operational Month Weeks

- A week runs Monday through Sunday.
- A month's first week begins on the first Monday whose date is inside that month.
- Each following Monday starts the next numbered week.
- A week can continue into the following calendar month and is not truncated.
- Dates before the first Monday belong to the previous operational month's final week.
- For September 2026, September week 1 is `2026-09-07` through `2026-09-13`.
- `2026-09-01` through `2026-09-06` belong to August week 5, which starts `2026-08-31`.
- A month exposes four or five week tabs according to the number of Monday starts before the next month's first Monday. A nonexistent fifth week is not displayed.
- The review page initially selects the operational week containing `currentDate`.

## Data Model

Existing collections remain authoritative for daily activity and weekly quantitative goals:

- `dailyCounts`: daily quantitative actuals keyed by `userId|date|taskId`.
- `weeklyGoals`: weekly quantitative targets keyed by `userId|weekStart|taskId`.
- `dayPlans` and `dayActuals`: planned and actual time entries.
- `weeklyTodos`: next actions keyed by `userId|weekStart`.

New user-scoped collections are added:

### `quarterGoalNotes`

One row per user and quarter.

```js
{
  userId: 'ishida',
  quarterStart: '2026-09-01',
  items: [
    { id: 'qualitative-1', text: '重点顧客との関係を深める' }
  ]
}
```

Key: `userId|quarterStart`.

### `quarterGoals`

One row per user, quarter, and countable task.

```js
{
  userId: 'ishida',
  quarterStart: '2026-09-01',
  taskId: 'ses-sales-1',
  targetCount: 120
}
```

Key: `userId|quarterStart|taskId`.

### `weeklyGoalNotes`

One row per user and week.

```js
{
  userId: 'ishida',
  weekStart: '2026-09-07',
  items: [
    { id: 'qualitative-1', text: '提案後の追客を当日中に行う' }
  ]
}
```

Key: `userId|weekStart`.

### Extended `weeklyReviews`

One row per user and week.

```js
{
  userId: 'ishida',
  weekStart: '2026-09-07',
  goodPoints: '',
  reflections: ['', '', ''],
  improvements: ['', '', ''],
  discussionItems: '',
  updatedAt: '2026-09-07T00:00:00.000Z'
}
```

Next actions remain in `weeklyTodos.todoText` so the existing checkbox behavior on the daily page can be reused.

The legacy `goalReflection`, `overtimeCause`, and `nextPromise` fields remain readable. During normalization:

- `goodPoints` falls back to `goalReflection`.
- `reflections[0]` falls back to `overtimeCause`.
- `weeklyTodos.todoText` can fall back to `nextPromise` when no current-week todo exists.
- Legacy fields are not removed from stored records.

## Domain Interfaces

`src/domain/calendar.js` gains pure helpers:

```js
getFiscalQuarter(dateKey)
// => { term: 20, quarter: 2, label: '20期2Q', start: '2026-09-01', end: '2026-11-30' }

getFiscalTermQuarters(dateKey)
// => four quarter descriptors for the fiscal term containing dateKey

getOperationalMonth(dateKey)
// => '2026-08' for 2026-09-01, '2026-09' for 2026-09-07

getOperationalMonthWeeks(monthKey)
// => [{ index: 1, label: '1週目', start: '2026-09-07', end: '2026-09-13' }, ...]
```

`src/domain/metrics.js` gains explicit-date-range aggregation so quarter and week cards use the same counting rules:

```js
computeGoalProgress(state, { userId, startDate, endDate, goals })
computeReviewPeriodMetrics(state, { userId, startDate, endDate })
```

Quantitative actuals always sum `dailyCounts` for the same `userId`, `taskId`, and inclusive period. Time analysis always sums `dayPlans` and `dayActuals` for the same user and inclusive period.

## Review Page Layout

The page uses one vertical flow without the current week/month mode toggle.

### 1. Quarter Goal Card

- Header: fiscal term and four quarter tabs.
- Body uses three responsive columns:
  - Qualitative goals: editable bullet rows with add and delete controls.
  - Quantitative goals: addable rows containing a countable task selector, editable target, `actual/target` display, and delete control. The same task cannot be selected twice in one period.
  - Progress: one horizontal progress bar per quantitative goal and a total completion summary.
- On narrow screens, the three columns stack in the same order.

### 2. Weekly Goal Card

- Header: operational month selector and available week tabs.
- Body uses the same three-column reading order as the quarter card.
- Qualitative items come from `weeklyGoalNotes`.
- Quantitative targets reuse `weeklyGoals`.
- Actuals aggregate `dailyCounts` from the selected Monday through Sunday.
- Editing a weekly target immediately updates the daily page goal card for dates in that week.

### 3. Time Analysis Card

- Covers only the selected week.
- Shows a large-category actual-time pie chart.
- Shows project and task rows with planned hours, actual hours, and signed difference.
- Uses paired bars for planned and actual time.
- Empty periods show a compact empty state instead of an empty chart.

### 4. Good Points Card

- One multiline field for the selected week.

### 5. Reflection And Improvement Card

- Three fixed rows.
- Each row pairs one reflection field on the left with one improvement field on the right.
- Mobile layout stacks each reflection immediately above its matching improvement.

### 6. Next Actions Card

- Editable bullet rows with explicit add and delete controls.
- The UI parses existing `weeklyTodos.todoText` lines into rows and serializes edited rows back to canonical `- text` lines. No new persisted collection is introduced.
- Deleting or reordering a row remaps `checkedItems` so checkbox state continues to refer to the same visible text where possible; edited or ambiguous duplicate rows are reset to unchecked.
- Stored in `weeklyTodos` for the selected week and active user.
- Appears on daily pages for dates in the same week as both the highlighted improvement promise and the existing checkbox list.
- Current-week next actions take precedence over legacy previous-week `nextPromise` text.

### 7. Discussion Card

- A large multiline field for discussion topics.
- Stored in `weeklyReviews.discussionItems` for the selected week and active user.

## Daily Page Synchronization

For a daily page date:

1. Resolve its Monday `weekStart`.
2. Load `weeklyGoals` for `activeUserId|weekStart` and show them in the weekly goal banner.
3. Aggregate `dailyCounts` for that week and show `actual/target` progress.
4. Load `weeklyTodos` for `activeUserId|weekStart`.
5. Show its bullet text under `今週の改善約束` and retain checkbox state.
6. If no current-week todo exists, fall back to the legacy previous-week review promise.

No cross-user fallback is allowed.

## State And Firestore Changes

`createInitialState()` initializes the three new collections as empty arrays.

`normalizeState()`:

- supplies user IDs to legacy rows;
- normalizes qualitative item arrays;
- clamps target counts to zero or greater;
- expands weekly reviews to three reflection and improvement slots while retaining legacy fields.

`firebase-sync.js` adds these keyed collections:

```js
quarterGoalNotes: row => `${row.userId}|${row.quarterStart}`
quarterGoals: row => `${row.userId}|${row.quarterStart}|${row.taskId}`
weeklyGoalNotes: row => `${row.userId}|${row.weekStart}`
```

They participate in the existing user-document merge and simultaneous-edit protection. No Firestore path or security-rule change is required because the entire user state remains inside the already permitted user document.

## Interaction And Saving

- Quarter and week tab changes update local selection only and do not save data.
- Text fields use the existing non-rerendering input save path to preserve cursor position.
- Numeric targets save on change and rerender progress.
- Add/delete qualitative rows update only the active user and selected period.
- Add/delete quantitative rows update only the active user and selected period; deleting a row removes that period target without changing historical daily counts.
- Next-action row edits save through `weeklyTodos.todoText`, preserving compatible checkbox state as defined above.
- Weekly review fields reconstruct records without dropping untouched legacy or new fields.
- Existing undo behavior remains available for rendered state changes.

## Backward Compatibility

- Existing `weeklyGoals`, `dailyCounts`, `weeklyTodos`, and timeline records are reused as-is.
- Existing weekly reviews are normalized into the new fields at read time.
- Existing monthly goal data remains stored but is no longer rendered on the redesigned review page.
- The daily page keeps a fallback to the previous-week review promise until a current-week next-action list is entered.
- No bulk migration or destructive write runs during startup.

## Validation And Tests

### Calendar

- `2026-09-07` resolves to `20期2Q` and `2026-09-01..2026-11-30`.
- `2026-12-01` resolves to 20期3Q with an end date in February 2027.
- Leap-year February is included correctly.
- `2027-06-01` resolves to `21期1Q`.
- September 2026 week 1 starts `2026-09-07`.
- `2026-09-01` belongs to August week 5 starting `2026-08-31`.
- September week 4 includes `2026-10-04`.
- Months with four and five Monday starts expose the correct number of tabs.

### Metrics

- Quarter actuals include only dates within the selected quarter.
- Weekly actuals include Monday through Sunday, including a month boundary.
- Counts and time remain isolated by user.
- Zero targets and empty periods do not produce invalid percentages.
- Planned and actual time differences are correct at project and task level.

### State

- Qualitative rows are added, edited, and deleted per user and period.
- Quarter targets are upserted by user, quarter, and task.
- Quantitative rows reject duplicate tasks and can be removed without removing actual counts.
- Next-action add/delete operations serialize to `todoText` and preserve unambiguous checkbox state.
- Weekly review updates preserve all untouched fields.
- Legacy review fields populate the new display fields without removing old data.
- Firestore snapshot merging retains both users' new collections.

### UI And Synchronization

- Quarter selector defaults to the date-derived current quarter.
- Week selector defaults to the operational week containing the date.
- The review page renders cards in the required order.
- Weekly target changes appear in the daily goal banner for the same week.
- Current-week next actions appear in the daily improvement promise and checklist.
- Ishida pages never render or edit Tanoue's review data, and vice versa.
- Desktop and mobile layouts do not overlap or overflow.

## Out Of Scope

- Changing the fiscal anchor without a code change.
- Team-wide combined goals.
- Migrating or deleting monthly goal records.
- Changing authentication, account permissions, or Firestore security rules.
- Automatic prose generation for reflections.
