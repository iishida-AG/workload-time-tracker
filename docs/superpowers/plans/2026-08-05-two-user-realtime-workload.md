# Two-User Realtime Workload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 石田・田上の2人が別々の入力ページで予定・実績・メモを保存し、FirestoreまたはlocalStorage経由で共有表示できる工数管理アプリへ拡張する。

**Architecture:** 既存の静的SPA構成を維持し、まずユーザー別・日別時間帯・自由記入メモ・大分類目標のドメイン関数を追加する。保存層は `localStorage` と Firestore を同じ `subscribe/save` インターフェースで扱い、Firebase設定が未入力ならローカル保存へフォールバックする。UIは `src/main.js` の既存構成を尊重しつつ、ユーザー切替、相手プレビュー、コピー用テキスト、下部の大分類別週次目標カードを追加する。

**Tech Stack:** React/Vite互換の静的ES Modules、Node.jsテスト、Firebase JS SDK、Cloud Firestore、Firebase Hosting.

## Global Constraints

- 追加npmパッケージは `npm install firebase`。
- Firebase Sparkプランの無料枠運用を前提にする。
- Firebase Authenticationの本格ログイン実装は今回の範囲外。
- Firestore設定が未入力のローカル開発では、既存の `localStorage` 保存にフォールバックする。
- `users` は固定値として `ishida` と `tanoue` を持つ。
- `dayPlans` / `dayActuals` は `{ userId, date, hour, taskId, note }` を持つ。
- 日次スケジュールのコピー用テキスト形式は `9:00-10:00 エンジニア提案：「自由記入欄」`。
- 週次目標は大分類ごとの自由記入欄で、日次画面の一番下に表示する。
- 月次目標は大分類ごとの自由記入欄で、振り返り画面に表示する。
- 振り返りフォームに `話し合いたいこと` の箇条書き欄を追加する。
- このフォルダはGitリポジトリではないため、各タスクのcommit手順は `git init` 後にだけ実行する。

---

## File Structure

- `package.json`: `firebase` dependencyを追加する。
- `src/domain/users.js`: 2人の固定ユーザー定義と相手ユーザー取得。
- `src/domain/calendar.js`: 可変時間帯を扱う `getTimelineHours(startHour, endHour)` を追加。
- `src/domain/metrics.js`: userId対応、メモ対応、コピー用テキスト、大分類別件数集計。
- `src/state/store.js`: userId補完、時間帯設定、週次/月次大分類目標、話し合いたいこと保存。
- `src/state/storage.js`: localStorage adapterを購読型に変更。
- `src/state/firebase-sync.js`: Firestore adapter。設定未入力時はlocalStorage adapterを使う。
- `src/firebase-config.js`: Firebase設定の差し替えファイル。
- `src/ui/view-model.js`: ユーザー別ダッシュボード表示モデルへ拡張。
- `src/main.js`: UI全体のユーザー切替、入力保存、相手プレビュー、コピー用テキスト、Backspace削除、月次/週次自由記入欄を実装。
- `src/styles.css`: レスポンシブ崩れを防ぐ新レイアウト。
- `tests/two-user-domain.test.mjs`: 新しいドメイン挙動のテスト。
- `tests/state.test.mjs`: 保存・更新関数の追加テスト。
- `tests/run-all.mjs`: 新規テストを追加。
- `README.md`: Firebase設定、Firestoreルール、無料枠注意、ローカルフォールバックを追記。

---

### Task 1: Dependency And User-Aware Domain Model

**Files:**
- Modify: `package.json`
- Create: `src/domain/users.js`
- Modify: `src/domain/calendar.js`
- Modify: `src/domain/metrics.js`
- Test: `tests/two-user-domain.test.mjs`
- Modify: `tests/run-all.mjs`

**Interfaces:**
- Produces: `USERS`, `getUserLabel(userId)`, `getPartnerUserId(userId)`.
- Produces: `getTimelineHours(startHour, endHour): number[]`.
- Produces: `setTimelineEntry(state, collectionName, userId, date, hour, taskId, note = '')`.
- Produces: `setTimelineNote(state, collectionName, userId, date, hour, note)`.
- Produces: `clearTimelineEntry(state, collectionName, userId, date, hour)`.
- Produces: `copyPlanToActuals(state, userId, date)`.
- Produces: `formatDailyScheduleText(state, collectionName, userId, date, startHour, endHour): string`.
- Produces: `computeProjectCountSummaries(state, userId, weekStart): Array<{ projectId, projectName, actualCount }>`。

- [ ] **Step 1: Add dependency**

Run:

```bash
npm.cmd install firebase --cache .\.npm-cache --no-audit --no-fund
```

Expected: `package.json` and `package-lock.json` include `firebase`.

- [ ] **Step 2: Write failing user domain tests**

Create `tests/two-user-domain.test.mjs`:

```js
import assert from 'node:assert/strict';
import { getTimelineHours } from '../src/domain/calendar.js';
import {
  clearTimelineEntry,
  computeProjectCountSummaries,
  copyPlanToActuals,
  formatDailyScheduleText,
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
    { id: 'ses-sales', name: 'SES営業', order: 1, status: 'active' },
    { id: 'routine-admin', name: '共通ルーティン・雑務', order: 2, status: 'active' }
  ],
  tasks: [
    { id: 'proposal', projectId: 'ses-sales', name: 'エンジニア提案', nature: 'core', countable: true, status: 'active', order: 1 },
    { id: 'mail', projectId: 'routine-admin', name: 'メール/チャット', nature: 'admin', countable: false, status: 'active', order: 2 }
  ],
  dayPlans: [
    { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'A社向け' },
    { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 'mail', note: '返信処理' }
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

test('setTimelineEntry and note updates only the selected user date hour', () => {
  const withEntry = setTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 11, 'mail', '社内確認');
  const withNote = setTimelineNote(withEntry, 'dayPlans', 'ishida', '2026-08-05', 11, '議事録確認');

  assert.ok(withNote.dayPlans.some((entry) => entry.userId === 'ishida' && entry.hour === 11 && entry.taskId === 'mail' && entry.note === '議事録確認'));
  assert.ok(withNote.dayPlans.some((entry) => entry.userId === 'tanoue' && entry.hour === 10 && entry.taskId === 'mail'));
});

test('clearTimelineEntry removes only the selected user date hour', () => {
  const next = clearTimelineEntry(state, 'dayPlans', 'ishida', '2026-08-05', 10);

  assert.equal(next.dayPlans.some((entry) => entry.userId === 'ishida' && entry.hour === 10), false);
  assert.equal(next.dayPlans.some((entry) => entry.userId === 'tanoue' && entry.hour === 10), true);
});

test('copyPlanToActuals copies only one user day plans with notes', () => {
  const next = copyPlanToActuals(state, 'ishida', '2026-08-05');

  assert.deepEqual(next.dayActuals, [
    { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 'proposal', note: 'A社向け' }
  ]);
});

test('formatDailyScheduleText uses the requested copy format', () => {
  const text = formatDailyScheduleText(state, 'dayPlans', 'ishida', '2026-08-05', 10, 12);

  assert.equal(text, '10:00-11:00 エンジニア提案：「A社向け」\n11:00-12:00 未入力：「」');
});

test('computeProjectCountSummaries groups countable actuals by project and user', () => {
  const rows = computeProjectCountSummaries(state, 'ishida', '2026-08-03');

  assert.deepEqual(rows, [
    { projectId: 'ses-sales', projectName: 'SES営業', actualCount: 3 },
    { projectId: 'routine-admin', projectName: '共通ルーティン・雑務', actualCount: 0 }
  ]);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
node tests/two-user-domain.test.mjs
```

Expected: FAIL with missing exports such as `Cannot find module '../src/domain/users.js'` or `does not provide an export named`.

- [ ] **Step 4: Implement minimal domain code**

Create `src/domain/users.js`:

```js
export const USERS = [
  { id: 'ishida', label: '石田' },
  { id: 'tanoue', label: '田上' }
];

export function getUserLabel(userId) {
  return USERS.find((user) => user.id === userId)?.label ?? userId;
}

export function getPartnerUserId(userId) {
  return userId === 'ishida' ? 'tanoue' : 'ishida';
}
```

Modify `src/domain/calendar.js`:

```js
export function getTimelineHours(startHour = 9, endHour = 20) {
  const start = Math.max(0, Math.min(23, Number(startHour) || 9));
  const end = Math.max(start + 1, Math.min(24, Number(endHour) || 20));
  return Array.from({ length: end - start }, (_, index) => start + index);
}
```

Modify `src/domain/metrics.js` by replacing user-agnostic timeline functions with:

```js
function sameTimelineSlot(entry, userId, date, hour) {
  return (entry.userId ?? 'ishida') === userId && entry.date === date && entry.hour === hour;
}

export function setTimelineEntry(state, collectionName, userId, date, hour, taskId, note = '') {
  const entries = state[collectionName].filter((entry) => !sameTimelineSlot(entry, userId, date, hour));
  if (taskId) {
    entries.push({ userId, date, hour, taskId, note });
  }
  return { ...state, [collectionName]: entries };
}

export function setTimelineNote(state, collectionName, userId, date, hour, note) {
  const entries = state[collectionName].map((entry) =>
    sameTimelineSlot(entry, userId, date, hour) ? { ...entry, note } : entry
  );
  return { ...state, [collectionName]: entries };
}

export function clearTimelineEntry(state, collectionName, userId, date, hour) {
  return {
    ...state,
    [collectionName]: state[collectionName].filter((entry) => !sameTimelineSlot(entry, userId, date, hour))
  };
}

export function copyPlanToActuals(state, userId, date) {
  const copiedPlans = state.dayPlans
    .filter((entry) => (entry.userId ?? 'ishida') === userId && entry.date === date)
    .map((entry) => ({
      userId,
      date: entry.date,
      hour: entry.hour,
      taskId: entry.taskId,
      note: entry.note ?? ''
    }));

  return {
    ...state,
    dayActuals: [
      ...state.dayActuals.filter((entry) => !((entry.userId ?? 'ishida') === userId && entry.date === date)),
      ...copiedPlans
    ]
  };
}
```

Add below existing helpers:

```js
function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatDailyScheduleText(state, collectionName, userId, date, startHour, endHour) {
  const tasks = taskById(state.tasks);
  return Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
    .map((hour) => {
      const entry = state[collectionName].find((row) => sameTimelineSlot(row, userId, date, hour));
      const taskName = entry ? tasks.get(entry.taskId)?.name ?? '未入力' : '未入力';
      return `${formatHour(hour)}-${formatHour(hour + 1)} ${taskName}：「${entry?.note ?? ''}」`;
    })
    .join('\n');
}

export function computeProjectCountSummaries(state, userId, weekStart) {
  const dates = new Set(getWeekDates(weekStart));
  const tasks = taskById(state.tasks);
  return state.projects
    .filter((project) => project.status === 'active')
    .sort((a, b) => a.order - b.order)
    .map((project) => {
      const projectTaskIds = state.tasks
        .filter((task) => task.projectId === project.id && task.countable)
        .map((task) => task.id);
      const actualCount = state.dailyCounts
        .filter((row) => (row.userId ?? 'ishida') === userId && dates.has(row.date) && projectTaskIds.includes(row.taskId))
        .reduce((sum, row) => sum + row.count, 0);
      return { projectId: project.id, projectName: project.name, actualCount };
    });
}
```

Keep compatibility by adding this branch at the top of `copyPlanToActuals` if existing tests still call the old signature:

```js
if (date === undefined) {
  return copyPlanToActuals(state, 'ishida', userId);
}
```

- [ ] **Step 5: Register test and verify GREEN**

Modify `tests/run-all.mjs`:

```js
import './domain.test.mjs';
import './state.test.mjs';
import './ui-view.test.mjs';
import './two-user-domain.test.mjs';
```

Run:

```bash
npm.cmd test --cache .\.npm-cache
```

Expected: all existing tests plus the seven new tests pass.

- [ ] **Step 6: Commit if git is initialized**

Run only if `git status --short` works:

```bash
git add package.json package-lock.json src/domain/users.js src/domain/calendar.js src/domain/metrics.js tests/two-user-domain.test.mjs tests/run-all.mjs
git commit -m "feat: add two-user timeline domain model"
```

---

### Task 2: State Migration, Goals, Reviews, And Timeline Settings

**Files:**
- Modify: `src/domain/presets.js`
- Modify: `src/state/store.js`
- Modify: `src/state/storage.js`
- Test: `tests/state.test.mjs`

**Interfaces:**
- Produces: `normalizeState(state, defaultUserId = 'ishida')`.
- Produces: `getTimelineSetting(state, userId, date): { startHour, endHour }`.
- Produces: `upsertTimelineSetting(state, userId, date, startHour, endHour)`.
- Produces: `upsertWeeklyProjectGoal(state, userId, weekStart, projectId, goalText)`.
- Produces: `upsertMonthlyProjectGoal(state, userId, month, projectId, goalText)`.
- Extends: `incrementDailyCount(state, date, taskId, delta, userId = 'ishida')`.
- Extends: `upsertReview(state, weekStart, patch)` to persist `discussionItems`.

- [ ] **Step 1: Add failing state tests**

Append to `tests/state.test.mjs`:

```js
import {
  getTimelineSetting,
  normalizeState,
  upsertMonthlyProjectGoal,
  upsertTimelineSetting,
  upsertWeeklyProjectGoal
} from '../src/state/store.js';
import { incrementDailyCount } from '../src/domain/metrics.js';

test('normalizeState adds user fields and new collections to older local data', () => {
  const oldState = {
    ...createAppState('2026-08-03'),
    dayPlans: [{ date: '2026-08-03', hour: 9, taskId: 'ses-sales-1', note: '提案準備' }],
    dailyCounts: [{ date: '2026-08-03', taskId: 'ses-sales-1', count: 2 }]
  };

  const normalized = normalizeState(oldState, 'tanoue');

  assert.equal(normalized.dayPlans[0].userId, 'tanoue');
  assert.equal(normalized.dailyCounts[0].userId, 'tanoue');
  assert.deepEqual(normalized.timelineSettings, []);
  assert.deepEqual(normalized.weeklyProjectGoals, []);
  assert.deepEqual(normalized.monthlyProjectGoals, []);
});

test('upsertTimelineSetting stores day-specific hours per user', () => {
  const state = createAppState('2026-08-03');
  const next = upsertTimelineSetting(state, 'ishida', '2026-08-05', 10, 20);

  assert.deepEqual(getTimelineSetting(next, 'ishida', '2026-08-05'), { startHour: 10, endHour: 20 });
  assert.deepEqual(getTimelineSetting(next, 'tanoue', '2026-08-05'), { startHour: 9, endHour: 20 });
});

test('weekly and monthly project goals are free text per user and project', () => {
  const state = createAppState('2026-08-03');
  const weekly = upsertWeeklyProjectGoal(state, 'ishida', '2026-08-03', 'ses-sales', '提案品質を上げる');
  const monthly = upsertMonthlyProjectGoal(weekly, 'ishida', '2026-08', 'ses-sales', '8月は提案30件の土台作り');

  assert.equal(weekly.weeklyProjectGoals[0].goalText, '提案品質を上げる');
  assert.equal(monthly.monthlyProjectGoals[0].goalText, '8月は提案30件の土台作り');
});

test('incrementDailyCount stores counts per user', () => {
  const state = createAppState('2026-08-03');
  const next = incrementDailyCount(state, '2026-08-05', 'ses-sales-1', 1, 'tanoue');

  assert.deepEqual(next.dailyCounts.find((row) => row.userId === 'tanoue'), {
    userId: 'tanoue',
    date: '2026-08-05',
    taskId: 'ses-sales-1',
    count: 1
  });
});

test('upsertReview stores discussion items as newline bullet text', () => {
  const state = createAppState('2026-08-03');
  const next = upsertReview(state, '2026-08-03', {
    discussionItems: '- 提案の優先順位\n- 残業の原因'
  });

  assert.equal(next.weeklyReviews[0].discussionItems, '- 提案の優先順位\n- 残業の原因');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/state.test.mjs
```

Expected: FAIL with missing exports such as `normalizeState`.

- [ ] **Step 3: Implement state migration and goal functions**

Modify `src/domain/presets.js` so `createInitialState` includes:

```js
timelineSettings: [],
weeklyProjectGoals: [],
monthlyProjectGoals: [],
```

Modify `src/state/store.js`:

```js
export function normalizeState(state, defaultUserId = 'ishida') {
  return {
    ...state,
    timelineSettings: state.timelineSettings ?? [],
    weeklyProjectGoals: state.weeklyProjectGoals ?? [],
    monthlyProjectGoals: state.monthlyProjectGoals ?? [],
    dayPlans: (state.dayPlans ?? []).map((entry) => ({ userId: entry.userId ?? defaultUserId, note: entry.note ?? '', ...entry })),
    dayActuals: (state.dayActuals ?? []).map((entry) => ({ userId: entry.userId ?? defaultUserId, note: entry.note ?? '', ...entry })),
    dailyCounts: (state.dailyCounts ?? []).map((row) => ({ userId: row.userId ?? defaultUserId, ...row })),
    weeklyReviews: (state.weeklyReviews ?? []).map((review) => ({
      discussionItems: '',
      ...review
    }))
  };
}

export function getTimelineSetting(state, userId, date) {
  const setting = (state.timelineSettings ?? []).find((row) => row.userId === userId && row.date === date);
  return { startHour: setting?.startHour ?? 9, endHour: setting?.endHour ?? 20 };
}

export function upsertTimelineSetting(state, userId, date, startHour, endHour) {
  const cleanStart = Math.max(0, Math.min(23, Number(startHour) || 9));
  const cleanEnd = Math.max(cleanStart + 1, Math.min(24, Number(endHour) || 20));
  const exists = (state.timelineSettings ?? []).some((row) => row.userId === userId && row.date === date);
  const row = { userId, date, startHour: cleanStart, endHour: cleanEnd };
  return {
    ...state,
    timelineSettings: exists
      ? state.timelineSettings.map((item) => (item.userId === userId && item.date === date ? row : item))
      : [...(state.timelineSettings ?? []), row]
  };
}

export function upsertWeeklyProjectGoal(state, userId, weekStart, projectId, goalText) {
  const exists = (state.weeklyProjectGoals ?? []).some((row) => row.userId === userId && row.weekStart === weekStart && row.projectId === projectId);
  const row = { userId, weekStart, projectId, goalText };
  return {
    ...state,
    weeklyProjectGoals: exists
      ? state.weeklyProjectGoals.map((item) => (item.userId === userId && item.weekStart === weekStart && item.projectId === projectId ? row : item))
      : [...(state.weeklyProjectGoals ?? []), row]
  };
}

export function upsertMonthlyProjectGoal(state, userId, month, projectId, goalText) {
  const exists = (state.monthlyProjectGoals ?? []).some((row) => row.userId === userId && row.month === month && row.projectId === projectId);
  const row = { userId, month, projectId, goalText };
  return {
    ...state,
    monthlyProjectGoals: exists
      ? state.monthlyProjectGoals.map((item) => (item.userId === userId && item.month === month && item.projectId === projectId ? row : item))
      : [...(state.monthlyProjectGoals ?? []), row]
  };
}
```

Extend `upsertReview`:

```js
discussionItems: patch.discussionItems ?? existing?.discussionItems ?? '',
```

Modify `src/state/storage.js` so `loadState` returns `normalizeState(parsed, 'ishida')` and fresh state is normalized.

Modify `src/domain/metrics.js` `incrementDailyCount` signature:

```js
export function incrementDailyCount(state, date, taskId, delta, userId = 'ishida') {
```

and match rows by `row.userId ?? 'ishida'`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npm.cmd test --cache .\.npm-cache
```

Expected: all tests pass.

- [ ] **Step 5: Commit if git is initialized**

Run only if `git status --short` works:

```bash
git add src/domain/presets.js src/domain/metrics.js src/state/store.js src/state/storage.js tests/state.test.mjs
git commit -m "feat: add user goals and timeline settings"
```

---

### Task 3: Firebase Sync Adapter With Local Fallback

**Files:**
- Create: `src/firebase-config.js`
- Create: `src/state/firebase-sync.js`
- Modify: `src/state/storage.js`
- Test: `tests/firebase-sync.test.mjs`
- Modify: `tests/run-all.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: `hasFirebaseConfig(config): boolean`.
- Produces: `createLocalStateAdapter(storage, today): { subscribe(callback), save(nextState) }`.
- Produces: `createFirestoreStateAdapter(firebaseConfig, today): { subscribe(callback), save(nextState) }`.
- Produces: `createStateAdapter({ storage, today, firebaseConfig }): adapter`.

- [ ] **Step 1: Write failing adapter tests**

Create `tests/firebase-sync.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createMemoryStorage } from './test-utils.mjs';
import { createLocalStateAdapter, createStateAdapter, hasFirebaseConfig } from '../src/state/firebase-sync.js';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('hasFirebaseConfig rejects placeholder config', () => {
  assert.equal(hasFirebaseConfig({ apiKey: '', projectId: 'REPLACE_WITH_FIREBASE_PROJECT_ID' }), false);
  assert.equal(hasFirebaseConfig({ apiKey: 'abc', projectId: 'real-project', appId: 'app' }), true);
});

test('createLocalStateAdapter immediately emits and saves state', () => {
  const storage = createMemoryStorage();
  const adapter = createLocalStateAdapter(storage, '2026-08-05');
  const snapshots = [];
  const unsubscribe = adapter.subscribe((nextState) => snapshots.push(nextState));
  adapter.save({ ...snapshots[0], weeklyReviews: [{ weekStart: '2026-08-03', discussionItems: '- A' }] });
  unsubscribe();

  assert.equal(snapshots.length, 2);
  assert.equal(JSON.parse(storage.getItem('workload-time-tracker:v2')).weeklyReviews[0].discussionItems, '- A');
});

test('createStateAdapter uses local adapter when firebase config is incomplete', () => {
  const adapter = createStateAdapter({
    storage: createMemoryStorage(),
    today: '2026-08-05',
    firebaseConfig: { apiKey: '', projectId: '' }
  });

  assert.equal(adapter.mode, 'local');
});
```

Create `tests/test-utils.mjs`:

```js
export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/firebase-sync.test.mjs
```

Expected: FAIL because `src/state/firebase-sync.js` does not exist.

- [ ] **Step 3: Implement Firebase config and adapter**

Create `src/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
```

Create `src/state/firebase-sync.js`:

```js
import { createAppState, normalizeState } from './store.js';
import { loadState, saveState, STORAGE_KEY } from './storage.js';

export function hasFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.projectId && config?.appId && !String(config.projectId).includes('REPLACE'));
}

export function createLocalStateAdapter(storage = globalThis.localStorage, today) {
  let state = loadState(storage, today);
  const listeners = new Set();
  return {
    mode: 'local',
    subscribe(callback) {
      listeners.add(callback);
      callback(state);
      return () => listeners.delete(callback);
    },
    save(nextState) {
      state = normalizeState(nextState);
      saveState(state, storage);
      for (const listener of listeners) listener(state);
    }
  };
}

export function createFirestoreStateAdapter(firebaseConfig, today) {
  return {
    mode: 'firestore',
    async subscribe(callback) {
      const [{ initializeApp }, firestore] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore')
      ]);
      const app = initializeApp(firebaseConfig);
      const db = firestore.getFirestore(app);
      const ref = firestore.doc(db, 'workloadApps', 'default');
      return firestore.onSnapshot(ref, async (snapshot) => {
        if (!snapshot.exists()) {
          const initial = createAppState(today);
          await firestore.setDoc(ref, initial);
          callback(initial);
          return;
        }
        callback(normalizeState(snapshot.data()));
      });
    },
    async save(nextState) {
      const [{ initializeApp }, firestore] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore')
      ]);
      const app = initializeApp(firebaseConfig);
      const db = firestore.getFirestore(app);
      await firestore.setDoc(firestore.doc(db, 'workloadApps', 'default'), normalizeState(nextState), { merge: true });
    }
  };
}

export function createStateAdapter({ storage = globalThis.localStorage, today, firebaseConfig }) {
  if (!hasFirebaseConfig(firebaseConfig)) {
    return createLocalStateAdapter(storage, today);
  }
  return createFirestoreStateAdapter(firebaseConfig, today);
}
```

Modify `src/state/storage.js`:

```js
export const STORAGE_KEY = 'workload-time-tracker:v2';
```

and keep a fallback read from `workload-time-tracker:v1` if v2 is empty.

- [ ] **Step 4: Register tests and verify GREEN**

Modify `tests/run-all.mjs`:

```js
import './domain.test.mjs';
import './state.test.mjs';
import './ui-view.test.mjs';
import './two-user-domain.test.mjs';
import './firebase-sync.test.mjs';
```

Run:

```bash
npm.cmd test --cache .\.npm-cache
```

Expected: all tests pass without requiring real Firebase credentials.

- [ ] **Step 5: Update README**

Add:

```md
## Firebase realtime setup

1. Firebase ConsoleでSparkプランのプロジェクトを作成します。
2. Webアプリを追加し、表示された設定値を `src/firebase-config.js` に貼り付けます。
3. Cloud Firestoreを作成します。無料枠対象のデフォルトデータベースを使います。
4. Firestore Rulesは本番前に石田・田上の運用範囲に限定してください。Authentication未導入の公開ルールは第三者書き込みのリスクがあります。
5. 設定値が空の場合、このアプリはlocalStorageで動作します。
```

- [ ] **Step 6: Commit if git is initialized**

Run only if `git status --short` works:

```bash
git add package.json package-lock.json src/firebase-config.js src/state/firebase-sync.js src/state/storage.js tests/firebase-sync.test.mjs tests/test-utils.mjs tests/run-all.mjs README.md
git commit -m "feat: add firebase realtime state adapter"
```

---

### Task 4: Two-User Daily Input UI

**Files:**
- Modify: `src/ui/view-model.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Test: `tests/ui-view.test.mjs`

**Interfaces:**
- Consumes: `createDashboardViewModel(state, date, userId)`.
- Consumes: `getTimelineSetting`, `upsertTimelineSetting`, `formatDailyScheduleText`, `clearTimelineEntry`, `setTimelineNote`.
- Produces UI: user switcher, partner preview, daily hour controls, note inputs, copy text blocks, Backspace deletion.

- [ ] **Step 1: Write failing view-model test**

Append to `tests/ui-view.test.mjs`:

```js
test('createDashboardViewModel separates selected user and partner entries', () => {
  const state = {
    projects: [{ id: 'p1', name: 'SES営業', order: 1, status: 'active' }],
    tasks: [{ id: 't1', projectId: 'p1', name: 'エンジニア提案', nature: 'core', countable: true, status: 'active', order: 1 }],
    timelineSettings: [{ userId: 'ishida', date: '2026-08-05', startHour: 10, endHour: 20 }],
    dayPlans: [
      { userId: 'ishida', date: '2026-08-05', hour: 10, taskId: 't1', note: '自分' },
      { userId: 'tanoue', date: '2026-08-05', hour: 10, taskId: 't1', note: '相手' }
    ],
    dayActuals: [],
    weeklyGoals: [],
    weeklyProjectGoals: [],
    monthlyProjectGoals: [],
    dailyCounts: [],
    weeklyReviews: []
  };

  const view = createDashboardViewModel(state, '2026-08-05', 'ishida');

  assert.equal(view.userId, 'ishida');
  assert.equal(view.partnerUserId, 'tanoue');
  assert.deepEqual(view.timelineSetting, { startHour: 10, endHour: 20 });
  assert.equal(view.planCopyText.includes('10:00-11:00 エンジニア提案：「自分」'), true);
  assert.equal(view.partnerPlanCopyText.includes('10:00-11:00 エンジニア提案：「相手」'), true);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
node tests/ui-view.test.mjs
```

Expected: FAIL because `createDashboardViewModel` does not accept `userId` or return copy text fields.

- [ ] **Step 3: Extend view model**

Modify `src/ui/view-model.js`:

```js
import { getPartnerUserId } from '../domain/users.js';
import { formatDailyScheduleText } from '../domain/metrics.js';
import { getTimelineSetting } from '../state/store.js';

export function createDashboardViewModel(state, date, userId = 'ishida') {
  const weekStart = getWeekStart(date);
  const partnerUserId = getPartnerUserId(userId);
  const timelineSetting = getTimelineSetting(state, userId, date);
  const partnerTimelineSetting = getTimelineSetting(state, partnerUserId, date);
  const metrics = computeReviewMetrics(state, weekStart, { userId });
  // keep existing activeTasks/countableTasks/kpis logic
  return {
    userId,
    partnerUserId,
    weekStart,
    metrics,
    timelineSetting,
    partnerTimelineSetting,
    planCopyText: formatDailyScheduleText(state, 'dayPlans', userId, date, timelineSetting.startHour, timelineSetting.endHour),
    actualCopyText: formatDailyScheduleText(state, 'dayActuals', userId, date, timelineSetting.startHour, timelineSetting.endHour),
    partnerPlanCopyText: formatDailyScheduleText(state, 'dayPlans', partnerUserId, date, partnerTimelineSetting.startHour, partnerTimelineSetting.endHour),
    partnerActualCopyText: formatDailyScheduleText(state, 'dayActuals', partnerUserId, date, partnerTimelineSetting.startHour, partnerTimelineSetting.endHour),
    activeTasks,
    countableTasks,
    improvementPromise,
    kpis
  };
}
```

Preserve existing return fields so older UI code still works while `main.js` is being updated.

- [ ] **Step 4: Rewrite daily UI**

Modify `src/main.js`:

Use top-level state:

```js
let activeUserId = 'ishida';
let focusedCell = null;
let adapter;
let unsubscribeState = null;
```

Replace direct `loadState/saveState` boot flow with adapter:

```js
adapter = createStateAdapter({ storage: localStorage, today: currentDate, firebaseConfig });
unsubscribeState = adapter.subscribe((nextState) => {
  state = nextState;
  render();
});
```

Change `commit(nextState)` to:

```js
function commit(nextState) {
  state = nextState;
  adapter.save(nextState);
  render();
}
```

Add user switcher in header or dashboard:

```html
<div class="user-switcher">
  <button data-action="switch-user" data-user-id="ishida">石田</button>
  <button data-action="switch-user" data-user-id="tanoue">田上</button>
</div>
```

Change timeline rendering:

```js
const hours = getTimelineHours(view.timelineSetting.startHour, view.timelineSetting.endHour);
```

Each cell should render:

```html
<button class="timeline-cell ..." data-action="focus-cell" data-collection="dayPlans" data-hour="10">
  <span class="timeline-hour">10:00-11:00</span>
  <span class="timeline-task">エンジニア提案</span>
</button>
<input class="timeline-note" value="A社向け" data-field="timeline-note" data-collection="dayPlans" data-hour="10" placeholder="自由記入" />
```

Add hour controls:

```html
<select data-field="start-hour">...</select>
<select data-field="end-hour">...</select>
```

Add copy blocks:

```html
<textarea readonly class="copy-text">${escapeHtml(view.planCopyText)}</textarea>
<textarea readonly class="copy-text">${escapeHtml(view.actualCopyText)}</textarea>
```

Add partner preview:

```html
<section class="panel partner-panel">
  <h2>${getUserLabel(view.partnerUserId)}の入力</h2>
  <textarea readonly>${escapeHtml(view.partnerPlanCopyText)}</textarea>
  <textarea readonly>${escapeHtml(view.partnerActualCopyText)}</textarea>
</section>
```

Add click and key handlers:

```js
if (action === 'switch-user') {
  activeUserId = button.dataset.userId;
  render();
}
if (action === 'focus-cell') {
  focusedCell = {
    collectionName: button.dataset.collection,
    userId: activeUserId,
    date: currentDate,
    hour: Number(button.dataset.hour)
  };
  commit(setTimelineEntry(state, button.dataset.collection, activeUserId, currentDate, Number(button.dataset.hour), selectedTaskId, entry?.note ?? ''));
}
```

Add Backspace handler:

```js
root.addEventListener('keydown', (event) => {
  if (event.key !== 'Backspace' || !focusedCell) return;
  if (event.target.matches('input, textarea, select')) return;
  event.preventDefault();
  commit(clearTimelineEntry(state, focusedCell.collectionName, focusedCell.userId, focusedCell.date, focusedCell.hour));
});
```

Add note handler:

```js
if (target.dataset.field === 'timeline-note') {
  commit(setTimelineNote(state, target.dataset.collection, activeUserId, currentDate, Number(target.dataset.hour), target.value));
}
```

Add time setting handler:

```js
if (target.dataset.field === 'start-hour' || target.dataset.field === 'end-hour') {
  const current = getTimelineSetting(state, activeUserId, currentDate);
  const nextStart = target.dataset.field === 'start-hour' ? Number(target.value) : current.startHour;
  const nextEnd = target.dataset.field === 'end-hour' ? Number(target.value) : current.endHour;
  commit(upsertTimelineSetting(state, activeUserId, currentDate, nextStart, nextEnd));
}
```

- [ ] **Step 5: Update CSS**

Add:

```css
.user-switcher,
.time-range-controls,
.copy-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.timeline-entry {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 8px;
  align-items: stretch;
}

.timeline-note,
.copy-text,
.partner-panel textarea {
  width: 100%;
  min-height: 64px;
  border: 1px solid #d7deea;
  border-radius: 8px;
  padding: 10px;
  resize: vertical;
}

.partner-panel {
  background: #fbfcff;
}
```

In the mobile media query:

```css
.timeline-entry {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 6: Verify tests**

Run:

```bash
npm.cmd test --cache .\.npm-cache
npm.cmd run lint --cache .\.npm-cache
```

Expected: tests pass and source modules import cleanly.

- [ ] **Step 7: Commit if git is initialized**

Run only if `git status --short` works:

```bash
git add src/ui/view-model.js src/main.js src/styles.css tests/ui-view.test.mjs
git commit -m "feat: add two-user daily input UI"
```

---

### Task 5: Project-Based Weekly And Monthly Review UI

**Files:**
- Modify: `src/domain/metrics.js`
- Modify: `src/state/store.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Test: `tests/two-user-domain.test.mjs`

**Interfaces:**
- Consumes: `computeProjectCountSummaries`.
- Consumes: `upsertWeeklyProjectGoal`, `upsertMonthlyProjectGoal`, `upsertReview`.
- Produces UI: weekly project goal cards at dashboard bottom, monthly project goals in review, discussion items textarea.

- [ ] **Step 1: Add failing project goal test**

Append to `tests/two-user-domain.test.mjs`:

```js
test('computeProjectCountSummaries includes both users when requested with all', () => {
  const rows = computeProjectCountSummaries(state, 'all', '2026-08-03');

  assert.deepEqual(rows[0], { projectId: 'ses-sales', projectName: 'SES営業', actualCount: 11 });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/two-user-domain.test.mjs
```

Expected: FAIL because `computeProjectCountSummaries` does not support `userId === 'all'`.

- [ ] **Step 3: Extend project summaries**

Modify `computeProjectCountSummaries`:

```js
const matchesUser = userId === 'all' || (row.userId ?? 'ishida') === userId;
```

Use `matchesUser` in the `dailyCounts` filter.

- [ ] **Step 4: Implement dashboard bottom weekly project goals**

Replace current `renderKpiCounterPanel(view)` placement in `renderDashboard(view)` so it appears after the main dashboard grid:

```js
return `
  <div class="dashboard-layout">
    <div class="main-stack">
      ${renderTimelineBoard(view)}
      ${renderCopyTextPanel(view)}
    </div>
    ${renderShortcutPalette(view)}
  </div>
  ${renderWeeklyProjectGoals(view)}
`;
```

Implement `renderWeeklyProjectGoals(view)`:

```js
function renderWeeklyProjectGoals(view) {
  const rows = computeProjectCountSummaries(state, activeUserId, weekStart());
  return `
    <section class="panel project-goal-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">週次目標と実績件数</span>
          <h2>${getUserLabel(activeUserId)} / ${weekStart()} 週</h2>
        </div>
      </div>
      <div class="project-goal-grid">
        ${rows.map((row) => {
          const goal = (state.weeklyProjectGoals ?? []).find((item) => item.userId === activeUserId && item.weekStart === weekStart() && item.projectId === row.projectId)?.goalText ?? '';
          return `
            <article class="project-goal-card">
              <h3>${escapeHtml(row.projectName)}</h3>
              <strong>${row.actualCount}件</strong>
              <textarea data-field="weekly-project-goal" data-project-id="${escapeHtml(row.projectId)}" placeholder="今週の目標を自由記入">${escapeHtml(goal)}</textarea>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
```

Add handler:

```js
if (target.dataset.field === 'weekly-project-goal') {
  commit(upsertWeeklyProjectGoal(state, activeUserId, weekStart(), target.dataset.projectId, target.value));
}
```

- [ ] **Step 5: Implement monthly project goals in review**

Add `renderMonthlyProjectGoals()`:

```js
function renderMonthlyProjectGoals() {
  const month = currentDate.slice(0, 7);
  return `
    <section class="panel monthly-goal-panel">
      <div class="panel-heading compact">
        <div>
          <span class="section-kicker">月次目標設定</span>
          <h2>${month}</h2>
        </div>
      </div>
      <div class="project-goal-grid">
        ${activeProjects().map((project) => {
          const ishida = (state.monthlyProjectGoals ?? []).find((row) => row.userId === 'ishida' && row.month === month && row.projectId === project.id)?.goalText ?? '';
          const tanoue = (state.monthlyProjectGoals ?? []).find((row) => row.userId === 'tanoue' && row.month === month && row.projectId === project.id)?.goalText ?? '';
          return `
            <article class="project-goal-card">
              <h3>${escapeHtml(project.name)}</h3>
              <label><span>石田</span><textarea data-field="monthly-project-goal" data-user-id="ishida" data-project-id="${escapeHtml(project.id)}">${escapeHtml(ishida)}</textarea></label>
              <label><span>田上</span><textarea data-field="monthly-project-goal" data-user-id="tanoue" data-project-id="${escapeHtml(project.id)}">${escapeHtml(tanoue)}</textarea></label>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
```

Place it before the review summary section in `renderReviewDashboard()`.

Add handler:

```js
if (target.dataset.field === 'monthly-project-goal') {
  commit(upsertMonthlyProjectGoal(state, target.dataset.userId, currentDate.slice(0, 7), target.dataset.projectId, target.value));
}
```

- [ ] **Step 6: Add discussion items textarea**

In review form:

```html
<label>
  <span>話し合いたいこと</span>
  <textarea data-review-field="discussionItems" placeholder="- 議題を箇条書きで入力">${escapeHtml(review.discussionItems ?? '')}</textarea>
</label>
```

Ensure `currentReview()` defaults `discussionItems: ''`.

- [ ] **Step 7: Update CSS**

Add:

```css
.project-goal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.project-goal-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid #dfe6ef;
  border-radius: 8px;
  background: #fff;
}

.project-goal-card textarea {
  width: 100%;
  min-height: 96px;
  border: 1px solid #d7deea;
  border-radius: 8px;
  padding: 10px;
  resize: vertical;
}
```

- [ ] **Step 8: Verify**

Run:

```bash
npm.cmd test --cache .\.npm-cache
npm.cmd run lint --cache .\.npm-cache
```

Expected: all tests pass.

- [ ] **Step 9: Commit if git is initialized**

Run only if `git status --short` works:

```bash
git add src/domain/metrics.js src/state/store.js src/main.js src/styles.css tests/two-user-domain.test.mjs
git commit -m "feat: add project-based goals and review topics"
```

---

### Task 6: Build, Browser Verification, And Output Package

**Files:**
- Modify: `README.md`
- Modify: `outputs/workload-time-tracker-dist.zip`

**Interfaces:**
- Consumes: completed app.
- Produces: verified `dist` and `outputs/workload-time-tracker-dist.zip`.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm.cmd test --cache .\.npm-cache
```

Expected: all tests print `ok - ...` and exit 0.

- [ ] **Step 2: Run lint/import check**

Run:

```bash
npm.cmd run lint --cache .\.npm-cache
```

Expected: `Imported N source modules` and exit 0.

- [ ] **Step 3: Build**

Run:

```bash
npm.cmd run build --cache .\.npm-cache
```

Expected: `Built static app into ...\dist`.

- [ ] **Step 4: Start local static server**

Run if no server is already listening on port 4173:

```powershell
$dist = (Resolve-Path 'dist').Path
Start-Process -FilePath python -ArgumentList @('-m','http.server','4173','-d',"$dist") -WorkingDirectory $dist -PassThru -WindowStyle Hidden
```

Expected: `http://127.0.0.1:4173/` serves the app.

- [ ] **Step 5: Verify desktop and mobile UI**

Use browser automation to check:

```js
{
  desktopDashboard: { width: 1366, tab: '日次入力' },
  mobileDashboard: { width: 390, tab: '日次入力' },
  mobileMaster: { width: 390, tab: 'マスタ' },
  mobileReview: { width: 390, tab: '振り返り' }
}
```

For each viewport, evaluate:

```js
({
  hasHorizontalOverflow: document.body.scrollWidth > innerWidth + 2,
  overflowingCount: [...document.querySelectorAll('button, input, select, textarea, .timeline-task, .shortcut-name, .metric-row span')]
    .filter((el) => el.scrollWidth > el.clientWidth + 2).length
})
```

Expected: `hasHorizontalOverflow: false` and `overflowingCount: 0`.

- [ ] **Step 6: Verify user workflows**

In the browser:

1. Switch to `石田`.
2. Set time range to `10:00-20:00`.
3. Select `エンジニア提案`.
4. Click a 10:00 planned cell.
5. Type note `A社向け`.
6. Confirm copy text includes `10:00-11:00 エンジニア提案：「A社向け」`.
7. Switch to `田上`.
8. Confirm 石田's same-day preview still shows the saved text.
9. Focus a planned cell and press Backspace.
10. Confirm that selected cell becomes empty.
11. Open `振り返り`.
12. Type monthly goals for both users and `話し合いたいこと`.
13. Confirm reload preserves values in local fallback mode.

- [ ] **Step 7: Package outputs**

Run:

```powershell
$outputDir = Join-Path (Resolve-Path 'outputs').Path 'workload-time-tracker-dist'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Copy-Item -Path (Join-Path (Resolve-Path 'dist').Path '*') -Destination $outputDir -Recurse -Force
$zipPath = Join-Path (Resolve-Path 'outputs').Path 'workload-time-tracker-dist.zip'
Compress-Archive -Path (Join-Path $outputDir '*') -DestinationPath $zipPath -Force
```

Expected: `outputs/workload-time-tracker-dist.zip` exists.

- [ ] **Step 8: Commit if git is initialized**

Run only if `git status --short` works:

```bash
git add README.md dist outputs/workload-time-tracker-dist.zip
git commit -m "chore: verify two-user workload app build"
```

---

## Self-Review

- Spec coverage: two-user pages, realtime Firestore, local fallback, day-specific hours, Backspace delete, free notes, copy text, weekly project goals at bottom, monthly project goals in review, discussion items, and responsive verification are covered.
- Placeholder scan: no task contains unspecified implementation blanks.
- Type consistency: `userId`, `weekStart`, `month`, `projectId`, `goalText`, `discussionItems`, `startHour`, `endHour`, and timeline function signatures match across tasks.
