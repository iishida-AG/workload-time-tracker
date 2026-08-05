# Workload Time Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予定 vs 実績、件数目標、週次・月次振り返りを運用できるReact + Viteアプリを構築する。

**Architecture:** 永続化は `localStorage` アダプタに集約し、UIはドメイン集計関数から計算済みデータを受け取る。タイムライン、マスタ、レビュー画面はタブで切り替え、同じアプリ状態を共有する。

**Tech Stack:** React 18, Vite, TypeScript, Vitest, lucide-react, date-fns, Firebase Hosting.

## Global Constraints

- 既存構成は空のため、React + Vite + Firebase Hosting構成を新規作成する。
- 9:00〜19:00を1時間単位で予定・実績入力する。
- 大分類と小分類は2階層で、小分類は性質、件数管理、ステータスを持つ。
- UI上から小分類を追加・編集・非表示にできる。
- 週次レビューの来週の改善約束は翌週ダッシュボードに表示する。

---

### Task 1: Domain Model And Calculations

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/presets.ts`
- Create: `src/domain/calendar.ts`
- Create: `src/domain/metrics.ts`
- Test: `src/domain/metrics.test.ts`

**Interfaces:**
- Produces: `computeReviewMetrics(state, weekStart)`, `copyPlanToActuals(state, date)`, `incrementDailyCount(state, date, taskId, delta)`, `getImprovementPromiseForWeek(state, weekStart)`.

- [x] Write failing tests for copy, productivity, ratios, gap Top3, and next-week promise lookup.
- [x] Run tests and confirm they fail because production files are missing.
- [ ] Implement minimal model and metrics functions.
- [ ] Run tests and confirm they pass.

### Task 2: Storage And App State

**Files:**
- Create: `src/state/storage.ts`
- Create: `src/state/useWorkloadStore.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AppState` from `src/domain/types.ts`.
- Produces: `useWorkloadStore()` with mutation handlers for project/task/timeline/goals/counts/reviews.

- [ ] Write state tests or component smoke tests for persistence and mutations.
- [ ] Implement storage adapter and hook.
- [ ] Run tests.

### Task 3: Dashboard UI

**Files:**
- Create: `src/components/ReminderStrip.tsx`
- Create: `src/components/TimelineBoard.tsx`
- Create: `src/components/ShortcutPalette.tsx`
- Create: `src/components/KpiCounterPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: store handlers and metrics output.
- Produces: daily schedule and one-tap input workflow.

- [ ] Implement responsive dashboard with shortcut cards and copy button.
- [ ] Ensure text does not overflow at mobile widths.
- [ ] Run build.

### Task 4: Master Data UI

**Files:**
- Create: `src/components/MasterDataScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: project/task store handlers.
- Produces: no-code task add/edit/hide workflow.

- [ ] Implement project and task forms.
- [ ] Implement quick task add path.
- [ ] Run build.

### Task 5: Review UI And Final Verification

**Files:**
- Create: `src/components/ReviewDashboard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `computeReviewMetrics`.
- Produces: weekly/monthly feedback dashboard and review form.

- [ ] Implement KPI tables, charts, gap cards, and reflection form.
- [ ] Run unit tests.
- [ ] Run production build.
- [ ] Run Playwright screenshots for desktop and mobile.
