import { addDays, getMonthDates, getTimelineHours, getWeekDates, getWeekStart, toDateKey } from './domain/calendar.js';
import { TASK_NATURES } from './domain/presets.js';
import {
  clearTimelineEntry,
  computeProjectCountSummaries,
  computeReviewMetrics,
  copyPlanToActuals,
  copyPlanHourToActual,
  addActualMinutes,
  addPlanMinutes,
  applyPlanNotificationResponse,
  getActualItems,
  formatActualItemRanges,
  incrementDailyCount,
  removeActualItem,
  removePlanItem,
  setTimelineEntry,
  setTimelineNote,
  updateActualItem,
  updatePlanItem
} from './domain/metrics.js?v=20260817-home-link-v1';
import { getUserLabel, USERS } from './domain/users.js';
import { createDashboardViewModel } from './ui/view-model.js?v=20260817-home-link-v1';
import { createStateAdapter } from './state/firebase-sync.js';
import { firebaseConfig } from './firebase-config.js';
import { createAuthController } from './state/auth.js?v=20260821-logout-v6';
import {
  addProject,
  addTask,
  deleteProject,
  deleteTask,
  getTimelineSetting,
  hideProject,
  hideTask,
  moveProjectOrder,
  moveTaskOrder,
  setDailyCount,
  updateProject,
  updateTask,
  toggleWeeklyTodoItem,
  upsertMonthlyProjectGoal,
  upsertMonthlyTaskTarget,
  upsertProjectGoalVisibility,
  upsertReview,
  upsertTimelineSetting,
  upsertWeeklyGoal,
  upsertWeeklyTodo,
  upsertWeeklyProjectGoal
} from './state/store.js';

const natureLabels = Object.fromEntries(TASK_NATURES.map((nature) => [nature.id, nature.label]));
const displayUserLabels = {
  ishida: '石田',
  tanoue: '田上',
  all: '全員'
};

let state;
let root;
let currentDate;
let activeTab = 'dashboard';
let selectedTaskId = '';
let reviewMode = 'week';
let copyFormat = 'timeline';
let activeUserId = 'ishida';
let focusedCell = null;
let todoEditorUserId = 'ishida';
let adapter;
let authController;
let authState = { status: 'loading', user: null, error: '' };
let unsubscribeState = null;
let unsubscribeAuth = null;
let suppressedAdapterRenderCount = 0;
let undoStack = [];
let dismissedPlanPromptKeys = new Set();
let planPromptTimer = null;

const WORKSPACE_HOME_URL = 'https://ishida-ai-tool-dev.web.app/';
const EXPENSES_URL = 'https://ishida-ai-tool-dev.web.app/expenses';
const APP_NAME = '業務管理ツール';
const UNDO_LIMIT = 30;
const validUserIds = new Set(USERS.map((user) => user.id));
const shortcutVisibilityLabels = {
  both: '両方',
  ishida: '石田',
  tanoue: '田上'
};

const fixedMonthlyProjectIds = ['ses-sales', 'telecom-sales', 'internal-hiring', 'recruiting-sales'];

export function getUserIdFromUrl(url, fallbackUserId = 'ishida') {
  try {
    const parsed = new URL(url);
    const userId = parsed.searchParams.get('user');
    return validUserIds.has(userId) ? userId : fallbackUserId;
  } catch {
    return fallbackUserId;
  }
}

export function buildUserUrl(url, userId) {
  const parsed = new URL(url);
  parsed.searchParams.set('user', validUserIds.has(userId) ? userId : 'ishida');
  return parsed.toString();
}

export function logoutIsRequested(url) {
  try {
    return new URL(url).searchParams.get('logout') === '1';
  } catch {
    return false;
  }
}

export function buildUrlWithoutLogout(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('logout');
  return parsed.toString();
}

export function firebaseAuthStorageKeyMatches(key) {
  const normalized = String(key || '').toLowerCase();
  return normalized.startsWith('firebase:authuser:') || normalized.includes('firebaseauth');
}

export function clearFirebaseAuthPersistence(globalObject = globalThis) {
  const clearStorage = (storage) => {
    if (!storage) return;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (firebaseAuthStorageKeyMatches(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  };

  try {
    clearStorage(globalObject.localStorage);
    clearStorage(globalObject.sessionStorage);
  } catch (error) {
    console.error('Failed to clear Firebase auth storage', error);
  }

  if (!globalObject.indexedDB?.deleteDatabase) return Promise.resolve();
  return new Promise((resolve) => {
    const request = globalObject.indexedDB.deleteDatabase('firebaseLocalStorageDb');
    request.onsuccess = resolve;
    request.onerror = resolve;
    request.onblocked = resolve;
  });
}

export function countGoalTone(targetCount, actualCount) {
  if (targetCount == null) return '';
  return actualCount >= targetCount ? 'achieved' : 'missed';
}

export function getCopyTextKey(label) {
  return `daily-copy-${label}`;
}

export function nextSelectedTaskId(currentTaskId, clickedTaskId) {
  return currentTaskId === clickedTaskId ? '' : clickedTaskId;
}

export function selectedTaskAfterTimelineUse() {
  return '';
}

export function nextMobileFocusedCell(currentCell, direction, userId, date, startHour, endHour) {
  const hours = getTimelineHours(startHour, endHour);
  const fallbackHour = hours[0] ?? startHour ?? 9;
  if (!currentCell || currentCell.userId !== userId || currentCell.date !== date || !hours.includes(currentCell.hour)) {
    return {
      collectionName: currentCell?.collectionName === 'dayActuals' ? 'dayActuals' : 'dayPlans',
      userId,
      date,
      hour: fallbackHour
    };
  }
  const currentHour = currentCell.hour;
  const currentIndex = Math.max(0, hours.indexOf(currentHour));
  const nextIndex = Math.min(hours.length - 1, Math.max(0, currentIndex + direction));
  return {
    collectionName: currentCell?.collectionName === 'dayActuals' ? 'dayActuals' : 'dayPlans',
    userId,
    date,
    hour: hours[nextIndex] ?? fallbackHour
  };
}

export function mobileFocusedHourLabel(cell) {
  if (!cell) return '時間未選択';
  const label = cell.collectionName === 'dayActuals' ? '実績' : '予定';
  return `${label} ${String(cell.hour).padStart(2, '0')}:00-`;
}

export function reviewTargetWeekStart(dateKey) {
  return addDays(getWeekStart(dateKey), -7);
}

export function isAppUndoShortcut(event) {
  const key = String(event.key ?? '').toLowerCase();
  const targetIsTextInput = Boolean(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'));
  return key === 'z' && !event.shiftKey && (event.ctrlKey || event.metaKey) && !targetIsTextInput;
}

function currentPageUrl() {
  return typeof window === 'undefined' ? 'https://example.github.io/workload/' : window.location.href;
}

function replaceCurrentUserUrl(userId) {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, '', buildUserUrl(window.location.href, userId));
}

function renderAuthGate() {
  const loading = authState.status === 'loading';
  return `
    <div class="auth-shell">
      <section class="auth-panel">
        <span class="section-kicker">ログイン</span>
        <h1>石田・田上だけが使えるようにしています</h1>
        <p>URLを知っていても、Firebaseに登録されたメールアドレスとパスワードでログインしないと共有データは開けません。</p>
        <form class="auth-form" data-form="login">
          <label>
            <span>メールアドレス</span>
            <input name="email" type="email" autocomplete="email" required />
          </label>
          <label>
            <span>パスワード</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button class="primary-button" type="submit" ${loading ? 'disabled' : ''}>${icon('save')}<span>${loading ? '確認中...' : 'ログイン'}</span></button>
        </form>
        ${authState.error ? `<p class="auth-error">${escapeHtml(authState.error)}</p>` : ''}
        <p class="auth-note">Firebase Consoleで石田さん・田上さんの2アカウントだけを作成してください。アプリ側には新規登録ボタンを置いていません。</p>
      </section>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[char];
  });
}

function icon(name) {
  const paths = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-3"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.2 3.4"/><path d="M6.6 6.6C3.5 8.7 2 12 2 12s3 8 10 8a10.8 10.8 0 0 0 5.4-1.4"/>',
    eye: '<path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    arrowUp: '<path d="m18 15-6-6-6 6"/>',
    arrowDown: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M3 7h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-5a3 3 0 0 1 0-6h7"/><path d="M16 14h.01"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.target}</svg>`;
}

function todayKey() {
  return toDateKey(new Date());
}

function activeProjects() {
  return state.projects.filter((project) => project.status === 'active').sort((a, b) => a.order - b.order);
}

function monthlyGoalProjects() {
  const byId = new Map(state.projects.map((project) => [project.id, project]));
  return fixedMonthlyProjectIds
    .map((projectId) => byId.get(projectId))
    .filter(Boolean)
    .filter((project) => project.status !== 'deleted');
}

function projectGoalVisible(projectId, userId = activeUserId) {
  return (
    (state.projectGoalVisibility ?? []).find(
      (row) => (row.userId ?? 'ishida') === userId && row.projectId === projectId
    )?.visible ?? true
  );
}

function renderProjectGoalVisibilityControls() {
  return `
    <div class="project-visibility-controls">
      <span>表示する大分類</span>
      <div>
        ${state.projects
          .filter((project) => project.status !== 'deleted')
          .sort((a, b) => a.order - b.order)
          .map(
            (project) => `
              <label>
                <input type="checkbox" data-field="project-goal-visible" data-project-id="${escapeHtml(project.id)}" ${projectGoalVisible(project.id) ? 'checked' : ''} />
                <span>${escapeHtml(project.name)}</span>
              </label>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function displayUserLabel(userId) {
  return displayUserLabels[userId] ?? getUserLabel(userId);
}

function sortedTasks(includeHidden = false) {
  return state.tasks
    .filter((task) => task.status !== 'deleted' && (includeHidden || task.status === 'active'))
    .sort((a, b) => a.order - b.order);
}

function taskById(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function projectById(projectId) {
  return state.projects.find((project) => project.id === projectId);
}

function weekStart() {
  return getWeekStart(currentDate);
}

function reviewWeekStart() {
  return reviewTargetWeekStart(currentDate);
}

function currentReview() {
  return currentReviewFor(activeUserId);
}

function currentReviewFor(userId = activeUserId) {
  const targetWeek = reviewWeekStart();
  return (
    state.weeklyReviews.find((review) => review.weekStart === targetWeek && (review.userId ?? 'ishida') === userId) ?? {
      weekStart: targetWeek,
      userId,
      goalReflection: '',
      overtimeCause: '',
      nextPromise: '',
      discussionItems: ''
    }
  );
}

function commit(nextState, options = {}) {
  const shouldRender = options.render !== false;
  const shouldRecordHistory = options.history !== false && shouldRender && state && nextState !== state;
  if (shouldRecordHistory) {
    undoStack = [...undoStack.slice(-UNDO_LIMIT + 1), state];
  }
  state = nextState;
  if (adapter) {
    suppressedAdapterRenderCount += 1;
    const result = adapter.save(nextState);
    if (result && typeof result.catch === 'function') {
      result.catch((error) => console.error('Failed to save state', error));
    }
  }
  if (shouldRender) {
    render();
  }
}

function unsubscribeSharedState() {
  if (typeof unsubscribeState === 'function') {
    unsubscribeState();
  }
  unsubscribeState = null;
}

function subscribeSharedState() {
  unsubscribeSharedState();
  adapter = createStateAdapter({ storage: localStorage, today: currentDate, firebaseConfig });
  const subscription = adapter.subscribe((nextState) => {
    state = nextState;
    ensureSelectedTask();
    if (suppressedAdapterRenderCount > 0) {
      suppressedAdapterRenderCount -= 1;
      return;
    }
    undoStack = [];
    render();
  });
  if (subscription && typeof subscription.then === 'function') {
    subscription
      .then((unsubscribe) => {
        unsubscribeState = unsubscribe;
      })
      .catch((error) => {
        console.error('Failed to subscribe to state', error);
        root.innerHTML = '<div class="app-shell"><section class="panel">共有データを読み込めませんでした。Firebaseのログイン権限とFirestoreルールを確認してください。</section></div>';
      });
  } else {
    unsubscribeState = subscription;
  }
}

function ensureSelectedTask() {
  if (selectedTaskId === '') return;
  if (selectedTaskId && taskById(selectedTaskId)?.status === 'active') return;
  selectedTaskId = sortedTasks()[0]?.id ?? '';
}

function renderProjectOptions(selectedId) {
  return activeProjects()
    .map(
      (project) =>
        `<option value="${escapeHtml(project.id)}" ${project.id === selectedId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`
    )
    .join('');
}

function renderNatureOptions(selectedNature) {
  return TASK_NATURES.map(
    (nature) =>
      `<option value="${escapeHtml(nature.id)}" ${nature.id === selectedNature ? 'selected' : ''}>${escapeHtml(nature.label)}</option>`
  ).join('');
}

function renderShortcutVisibilityOptions(selectedVisibility = 'both') {
  return Object.entries(shortcutVisibilityLabels)
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}" ${value === selectedVisibility ? 'selected' : ''}>${escapeHtml(label)}</option>`
    )
    .join('');
}

function entryFor(collectionName, hour, userId = activeUserId) {
  return state[collectionName].find(
    (entry) => (entry.userId ?? 'ishida') === userId && entry.date === currentDate && entry.hour === hour
  );
}

function activeActualHour(view) {
  if (focusedCell?.collectionName === 'dayActuals' && focusedCell.userId === activeUserId && focusedCell.date === currentDate) {
    return focusedCell.hour;
  }
  const hours = getTimelineHours(view.timelineSetting.startHour, view.timelineSetting.endHour);
  const now = new Date();
  const currentHour = toDateKey(now) === currentDate ? now.getHours() : view.timelineSetting.startHour;
  return hours.reduce((closest, hour) => (Math.abs(hour - currentHour) < Math.abs(closest - currentHour) ? hour : closest), hours[0]);
}

function countFor(taskId, date, userId = activeUserId) {
  return (
    state.dailyCounts.find(
      (row) => (row.userId ?? 'ishida') === userId && row.taskId === taskId && row.date === date
    )?.count ?? 0
  );
}

function weeklyCountFor(taskId, userId = activeUserId) {
  const start = weekStart();
  const end = new Date(`${start}T00:00:00`);
  end.setDate(end.getDate() + 6);
  return state.dailyCounts
    .filter((row) => {
      const rowDate = new Date(`${row.date}T00:00:00`);
      return (
        (row.userId ?? 'ishida') === userId &&
        row.taskId === taskId &&
        rowDate >= new Date(`${start}T00:00:00`) &&
        rowDate <= end
      );
    })
    .reduce((sum, row) => sum + row.count, 0);
}

function weeklyTargetFor(taskId) {
  return (
    state.weeklyGoals.find(
      (goal) => (goal.userId ?? 'ishida') === activeUserId && goal.weekStart === weekStart() && goal.taskId === taskId
    )?.targetCount ?? null
  );
}

function renderReminderStrip(view) {
  return `
    <section class="reminder-strip">
      <div class="promise-box">
        <span class="section-kicker">今週の改善約束</span>
        <strong>${escapeHtml(view.improvementPromise)}</strong>
      </div>
      <div class="kpi-strip">
        ${view.kpis
          .map(
            (kpi) => `
              <div class="mini-kpi">
                <span>${escapeHtml(kpi.label)}</span>
                <strong>${escapeHtml(kpi.value)}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function hasActualAtStart(userId, date, hour, startMinute) {
  const entry = entryFor('dayActuals', hour, userId);
  return getActualItems(entry).some((item, index, items) => startMinuteForTimelineItem(hour, items, index) === startMinute);
}

function currentPlanPrompt(view) {
  if (currentDate !== todayKey()) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const candidates = [];
  for (const entry of (state.dayPlans ?? []).filter((row) => (row.userId ?? 'ishida') === view.userId && row.date === currentDate)) {
    const items = getActualItems(entry);
    const ranges = formatActualItemRanges(entry.hour, items);
    items.forEach((item, index) => {
      const [start, end] = ranges[index].split('-');
      const startTotal = minutesFromClock(start);
      const startMinute = startTotal % 60;
      const key = `${view.userId}-${currentDate}-${entry.hour}-${index}-${start}`;
      if (startTotal <= nowMinutes && !dismissedPlanPromptKeys.has(key) && !hasActualAtStart(view.userId, currentDate, entry.hour, startMinute)) {
        candidates.push({ entry, item, index, start, end, startTotal, startMinute, key });
      }
    });
  }
  candidates.sort((a, b) => b.startTotal - a.startTotal);
  return candidates[0] ?? null;
}

function renderPlanPrompt(view) {
  const prompt = currentPlanPrompt(view);
  if (!prompt) return '';
  const task = taskById(prompt.item.taskId);
  const startHour = Math.floor(prompt.startTotal / 60);
  return `
    <section class="plan-prompt panel">
      <div class="plan-prompt-main">
        <span class="section-kicker">予定時刻です</span>
        <strong>${escapeHtml(prompt.start)}-${escapeHtml(prompt.end)} ${escapeHtml(task?.name ?? '未設定')}</strong>
        ${prompt.item.note ? `<span>${escapeHtml(prompt.item.note)}</span>` : ''}
      </div>
      <div class="plan-prompt-controls">
        <label>
          <span>開始</span>
          <select data-field="plan-prompt-hour">${renderHourOptions(startHour, 0, 23)}</select>
          <select data-field="plan-prompt-minute">${renderStartMinuteOptions(prompt.startMinute)}</select>
        </label>
        <label>
          <span>分</span>
          <input type="number" min="0" step="5" value="${escapeHtml(prompt.item.minutes)}" data-field="plan-prompt-minutes" />
        </label>
        <input type="text" data-field="plan-prompt-note" placeholder="予定と違う場合の内容" />
        <label class="plan-prompt-task-field">
          <span>小分類</span>
          <select data-field="plan-prompt-task">${renderPlanPromptTaskOptions(view.activeTasks, prompt.item.taskId)}</select>
        </label>
        <button class="primary-button" data-action="plan-prompt-ok" data-prompt-key="${escapeHtml(prompt.key)}" data-hour="${prompt.entry.hour}" data-item-index="${prompt.index}">OK</button>
        <button class="ghost-button" data-action="plan-prompt-continue" data-prompt-key="${escapeHtml(prompt.key)}" data-hour="${prompt.entry.hour}" data-item-index="${prompt.index}">継続</button>
        <button class="ghost-button" data-action="plan-prompt-custom" data-prompt-key="${escapeHtml(prompt.key)}" data-hour="${prompt.entry.hour}" data-item-index="${prompt.index}">自由入力</button>
        <button class="icon-button" data-action="plan-prompt-dismiss" data-prompt-key="${escapeHtml(prompt.key)}" aria-label="閉じる">${icon('minus')}</button>
      </div>
    </section>
  `;
}

function renderUserSwitcher(view) {
  return `
    <div class="user-switcher" role="group" aria-label="入力ユーザー">
      ${USERS.map(
        (user) => `
          <button class="user-button ${view.userId === user.id ? 'active' : ''}" data-action="switch-user" data-user-id="${escapeHtml(user.id)}">
            ${escapeHtml(displayUserLabel(user.id))}
          </button>
        `
      ).join('')}
    </div>
  `;
}

function renderShareLinks() {
  const pageUrl = currentPageUrl();
  return `
    <div class="share-links" aria-label="共有URL">
      <span>共有URL</span>
      ${USERS.map((user) => {
        const url = buildUserUrl(pageUrl, user.id);
        return `
          <a href="${escapeHtml(url)}" data-user-share-link="${escapeHtml(user.id)}">${escapeHtml(displayUserLabel(user.id))}用URL</a>
          <button class="icon-button" data-action="copy-user-url" data-user-id="${escapeHtml(user.id)}" aria-label="${escapeHtml(displayUserLabel(user.id))}用URLをコピー">
            ${icon('copy')}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderAccountMenu() {
  if (authController?.mode !== 'firebase-auth' || !authState.user) return '';
  return `
    <div class="account-menu">
      <span>${escapeHtml(authState.user.email ?? '')}</span>
      <button class="ghost-button" data-action="logout">ログアウト</button>
    </div>
  `;
}

function renderHourOptions(selectedHour, startHour, endHour) {
  return Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
    .map(
      (hour) =>
        `<option value="${hour}" ${hour === selectedHour ? 'selected' : ''}>${String(hour).padStart(2, '0')}:00</option>`
    )
    .join('');
}

function renderTimeRangeControls(view) {
  return `
    <div class="time-range-controls" aria-label="日次時間範囲">
      <label>
        <span>開始</span>
        <select data-field="start-hour">${renderHourOptions(view.timelineSetting.startHour, 0, 23)}</select>
      </label>
      <label>
        <span>終了</span>
        <select data-field="end-hour">${renderHourOptions(view.timelineSetting.endHour, 1, 24)}</select>
      </label>
    </div>
  `;
}

function hourRangeLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00-`;
}

function minutesFromClock(clock) {
  const [hour, minute] = String(clock).split(':').map(Number);
  return hour * 60 + minute;
}

function startMinuteForTimelineItem(hour, items, index) {
  const ranges = formatActualItemRanges(hour, items);
  const start = ranges[index]?.split('-')[0] ?? `${hour}:00`;
  return minutesFromClock(start) % 60;
}

function renderStartMinuteOptions(selectedMinute) {
  return [0, 15, 30, 45]
    .map(
      (minute) =>
        `<option value="${minute}" ${minute === selectedMinute ? 'selected' : ''}>${String(minute).padStart(2, '0')}分</option>`
    )
    .join('');
}

function renderPlanPromptTaskOptions(tasks, selectedTaskId) {
  return tasks
    .map(
      (task) =>
        `<option value="${escapeHtml(task.id)}" ${task.id === selectedTaskId ? 'selected' : ''}>${escapeHtml(task.name)}</option>`
    )
    .join('');
}

function renderCopyTextarea(label, text) {
  const copyKey = getCopyTextKey(label);
  return `
    <label class="copy-block">
      <span class="copy-block-header">
        <span>${escapeHtml(label)}</span>
        <button class="ghost-button compact-copy-button" type="button" data-action="copy-daily-text" data-copy-key="${escapeHtml(copyKey)}">
          ${icon('copy')}
          <span>コピー</span>
        </button>
      </span>
      <textarea class="copy-text" readonly>${escapeHtml(text)}</textarea>
    </label>
  `;
}

function renderCopyTextBlocks(view) {
  return `
    <div class="copy-section">
      <div class="copy-heading">
        <span class="section-kicker">コピー用テキスト</span>
      </div>
      <div class="copy-grid">
        ${renderCopyTextarea('予定', view.planCopyText)}
        ${renderCopyTextarea('実績', view.actualCopyText)}
      </div>
    </div>
  `;
}

function renderPartnerPreview(view) {
  return `
    <section class="panel partner-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">共有プレビュー</span>
          <h2>${escapeHtml(displayUserLabel(view.partnerUserId))}の入力</h2>
        </div>
        <span class="time-range-badge">
          ${String(view.partnerTimelineSetting.startHour).padStart(2, '0')}:00-${String(view.partnerTimelineSetting.endHour).padStart(2, '0')}:00
        </span>
      </div>
      <div class="copy-grid">
        ${renderCopyTextarea('予定', view.partnerPlanCopyText)}
        ${renderCopyTextarea('日報全文', view.partnerActualCopyText)}
      </div>
    </section>
  `;
}

function renderDailyCopyTextBlocks(view) {
  const planText = copyFormat === 'category' ? view.planCategoryCopyText : view.planCopyText;
  const actualText = copyFormat === 'category' ? view.actualCategoryCopyText : view.actualCopyText;
  return `
    <div class="copy-section">
      <div class="copy-heading">
        <span class="section-kicker">コピー用テキスト</span>
        <div class="segmented compact-segmented">
          <button class="${copyFormat === 'timeline' ? 'active' : ''}" data-action="copy-format" data-format="timeline">日報全文</button>
          <button class="${copyFormat === 'category' ? 'active' : ''}" data-action="copy-format" data-format="category">カテゴリ別</button>
        </div>
      </div>
      <div class="copy-grid">
        ${renderCopyTextarea('予定', planText)}
        ${renderCopyTextarea(copyFormat === 'category' ? 'カテゴリ別実績' : '日報全文', actualText)}
      </div>
    </div>
  `;
}

renderCopyTextBlocks = renderDailyCopyTextBlocks;

function renderHeader(view) {
  const tabs = [
    ['dashboard', '日次入力', 'clock'],
    ['master', 'マスタ', 'settings'],
    ['review', '振り返り', 'chart']
  ];
  return `
    <header class="app-header">
      <div>
        <span class="section-kicker">業務・工数管理</span>
        <h1>予実を翌週の改善へつなぐ</h1>
      </div>
      <div class="header-actions">
        ${renderUserSwitcher(view)}
        ${renderAccountMenu()}
        <nav class="tab-nav" aria-label="画面切り替え">
          ${tabs
            .map(
              ([tab, label, iconName]) => `
                <button class="tab-button ${activeTab === tab ? 'active' : ''}" data-action="switch-tab" data-tab="${tab}">
                  ${icon(iconName)}<span>${label}</span>
                </button>
              `
            )
            .join('')}
          <a class="tab-button external-tab-link" href="${EXPENSES_URL}" target="_blank" rel="noopener noreferrer">
            ${icon('wallet')}<span>経費</span>
          </a>
          <a class="tab-button external-tab-link" href="${WORKSPACE_HOME_URL}" target="_blank" rel="noopener noreferrer">
            ${icon('target')}<span>AIツール</span>
          </a>
        </nav>
      </div>
    </header>
    ${renderReminderStrip(view)}
  `;
}

function renderTimelineColumnLegacy(title, collectionName, view) {
  const hours = getTimelineHours(view.timelineSetting.startHour, view.timelineSetting.endHour);
  return `
    <div class="timeline-column">
      <div class="timeline-title">${escapeHtml(title)}</div>
      ${hours.map((hour) => {
        const entry = entryFor(collectionName, hour);
        const task = entry ? taskById(entry.taskId) : null;
        const isFocused =
          focusedCell?.collectionName === collectionName &&
          focusedCell?.userId === view.userId &&
          focusedCell?.date === currentDate &&
          focusedCell?.hour === hour;
        return `
          <div class="timeline-entry">
            <button
              class="timeline-cell ${isFocused ? 'focused' : ''} nature-${task?.nature ?? 'empty'}"
              data-action="set-timeline"
              data-timeline-cell="true"
              data-collection="${collectionName}"
              data-hour="${hour}"
            >
              <span class="timeline-hour">${hourRangeLabel(hour)}</span>
              <span class="timeline-task">${task ? escapeHtml(task.name) : '未入力'}</span>
            </button>
            <label class="timeline-note-wrap">
              <input
                class="timeline-note"
                type="text"
                value="${escapeHtml(entry?.note ?? '')}"
                data-field="timeline-note"
                data-collection="${collectionName}"
                data-hour="${hour}"
                aria-label="自由記入"
                ${entry ? '' : 'disabled'}
              />
            </label>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTimelineBoard(view) {
  return `
    <section class="panel timeline-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">日次スケジュール</span>
          <h2>${escapeHtml(currentDate)} / ${escapeHtml(displayUserLabel(view.userId))}</h2>
        </div>
        <div class="toolbar">
          <label class="date-field">
            ${icon('calendar')}
            <input type="date" value="${escapeHtml(currentDate)}" data-field="current-date" />
          </label>
          ${renderTimeRangeControls(view)}
          <button class="primary-button" data-action="copy-plan">${icon('copy')}<span>予定を実績へコピー</span></button>
        </div>
      </div>
      ${renderMobileTimelineControls(view)}
      <div class="timeline-grid">
        ${renderTimelineColumn('予定', 'dayPlans', view)}
        ${renderTimelineColumn('実績', 'dayActuals', view)}
      </div>
      ${renderCopyTextBlocks(view)}
    </section>
  `;
}

function renderMobileTimelineControls(view) {
  const displayCell =
    focusedCell?.userId === view.userId && focusedCell?.date === currentDate
      ? focusedCell
      : null;
  return `
    <div class="mobile-timeline-controls" aria-label="スマホ用時間移動">
      <button class="ghost-button" data-action="mobile-focus-hour" data-direction="-1">${icon('arrowUp')}<span>前へ</span></button>
      <div class="mobile-focus-status">
        <span>選択中</span>
        <strong>${escapeHtml(mobileFocusedHourLabel(displayCell))}</strong>
      </div>
      <button class="ghost-button" data-action="mobile-focus-hour" data-direction="1"><span>次へ</span>${icon('arrowDown')}</button>
    </div>
  `;
}

function renderTimelineItemRows(entry, hour, collectionName) {
  const items = getActualItems(entry);
  if (items.length === 0) {
    return '<div class="actual-item-empty">\u672a\u5165\u529b</div>';
  }
  return `
    <div class="actual-item-list">
      ${items
        .map((item, index) => {
          const task = taskById(item.taskId);
          const selectedMinute = startMinuteForTimelineItem(hour, items, index);
          return `
            <div class="actual-item-row" data-drop-target="timeline-item">
              <span class="actual-item-task">${escapeHtml(task?.name ?? '\u672a\u8a2d\u5b9a')}</span>
              <label class="actual-start-wrap">
                <select class="actual-start-input" data-field="timeline-item-start-minute" data-collection="${collectionName}" data-hour="${hour}" data-item-index="${index}" aria-label="\u958b\u59cb\u5206">
                  ${renderStartMinuteOptions(selectedMinute)}
                </select>
              </label>
              <input class="actual-minutes-input" type="number" min="0" step="5" value="${escapeHtml(item.minutes)}" data-field="timeline-item-minutes" data-collection="${collectionName}" data-hour="${hour}" data-item-index="${index}" />
              <span class="actual-minute-label">\u5206</span>
              <input class="actual-note-input" type="text" value="${escapeHtml(item.note ?? '')}" data-field="timeline-item-note" data-collection="${collectionName}" data-hour="${hour}" data-item-index="${index}" aria-label="\u30e1\u30e2" />
              <button class="icon-button mini-icon-button" data-action="remove-timeline-item" data-collection="${collectionName}" data-hour="${hour}" data-item-index="${index}" aria-label="\u9805\u76ee\u3092\u524a\u9664">${icon('trash')}</button>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderTimelineColumn(title, collectionName, view) {
  const hours = getTimelineHours(view.timelineSetting.startHour, view.timelineSetting.endHour);
  return `
    <div class="timeline-column">
      <div class="timeline-title">${escapeHtml(title)}</div>
      ${hours
        .map((hour) => {
          const entry = entryFor(collectionName, hour);
          const items = getActualItems(entry);
          const firstTaskId = items[0]?.taskId ?? entry?.taskId;
          const task = firstTaskId ? taskById(firstTaskId) : null;
          const isFocused =
            focusedCell?.collectionName === collectionName &&
            focusedCell?.userId === view.userId &&
            focusedCell?.date === currentDate &&
            focusedCell?.hour === hour;
          if (collectionName === 'dayPlans') {
            return `
              <div class="timeline-entry actual-entry plan-entry">
                <button class="ghost-button planned-done-button" data-action="copy-plan-hour" data-hour="${hour}" ${entry ? '' : 'disabled'} title="\u4e88\u5b9a\u901a\u308a\u5b8c\u4e86" aria-label="\u4e88\u5b9a\u901a\u308a\u5b8c\u4e86">
                  ${icon('check')}
                </button>
                <button
                  class="timeline-cell ${isFocused ? 'focused' : ''} nature-${task?.nature ?? 'empty'}"
                  data-action="set-timeline"
                  data-timeline-cell="true"
                  data-collection="${collectionName}"
                  data-hour="${hour}"
                >
                  <span class="timeline-hour">${hourRangeLabel(hour)}</span>
                </button>
                ${renderTimelineItemRows(entry, hour, collectionName)}
              </div>
            `;
          }
          return `
            <div class="timeline-entry actual-entry">
              <button
                class="timeline-cell ${isFocused ? 'focused' : ''} nature-${task?.nature ?? 'empty'}"
                data-action="set-timeline"
                data-timeline-cell="true"
                data-collection="${collectionName}"
                data-hour="${hour}"
              >
                <span class="timeline-hour">${hourRangeLabel(hour)}</span>
              </button>
              ${renderTimelineItemRows(entry, hour, collectionName)}
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderShortcutPaletteLegacy(view) {
  const groupedTasks = activeProjects()
    .map((project) => ({
      project,
      tasks: view.activeTasks.filter((task) => task.projectId === project.id)
    }))
    .filter((group) => group.tasks.length > 0);

  return `
    <aside class="panel shortcut-panel">
      <div class="panel-heading compact">
        <div>
          <span class="section-kicker">小分類ショートカット</span>
          <h2>選択中: ${escapeHtml(taskById(selectedTaskId)?.name ?? '消去')}</h2>
        </div>
      </div>
      <div class="shortcut-grid">
        <button class="shortcut-card ${selectedTaskId === '' ? 'selected' : ''}" data-action="select-task" data-task-id="">
          <span class="shortcut-name">消去</span>
        </button>
        ${groupedTasks
          .map(
            ({ project, tasks }) => `
              <div class="shortcut-group">
                <h3>${escapeHtml(project.name)}</h3>
                <div class="shortcut-group-grid">
                  ${tasks
                    .map(
                      (task) => `
                        <button class="shortcut-card nature-${task.nature} ${selectedTaskId === task.id ? 'selected' : ''}" data-action="select-task" data-task-id="${escapeHtml(task.id)}" title="${escapeHtml(task.description || '説明は未入力です')}">
                          <span class="shortcut-name">${escapeHtml(task.name)}</span>
                        </button>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
          )
          .join('')}
      </div>
      ${renderTaskForm('quick-task-form', 'ワンタップ追加', true)}
    </aside>
  `;
}

function weeklyProjectGoalFor(projectId, userId = activeUserId) {
  return (
    (state.weeklyProjectGoals ?? []).find(
      (goal) =>
        (goal.userId ?? 'ishida') === userId &&
        goal.weekStart === weekStart() &&
        goal.projectId === projectId
    )?.goalText ?? ''
  );
}

function renderShortcutPalette(view) {
  const targetHour = activeActualHour(view);
  const groupedTasks = activeProjects()
    .map((project) => ({
      project,
      tasks: view.activeTasks.filter((task) => task.projectId === project.id)
    }))
    .filter((group) => group.tasks.length > 0);

  return `
    <aside class="panel shortcut-panel">
      <div class="panel-heading compact">
        <div>
          <span class="section-kicker">小分類ショートカット</span>
          <h2>加算先: ${hourRangeLabel(targetHour)}</h2>
        </div>
      </div>
      <div class="shortcut-grid">
        <button class="shortcut-card ${selectedTaskId === '' ? 'selected' : ''}" data-action="select-task" data-task-id="">
          <span class="shortcut-name">消去</span>
        </button>
        ${groupedTasks
          .map(
            ({ project, tasks }) => `
              <div class="shortcut-group">
                <h3>${escapeHtml(project.name)}</h3>
                <div class="shortcut-group-grid">
                  ${tasks
                    .map(
                      (task) => `
                        <div class="shortcut-task-line">
                          <button class="shortcut-card nature-${task.nature} ${selectedTaskId === task.id ? 'selected' : ''}" data-action="select-task" data-task-id="${escapeHtml(task.id)}" title="${escapeHtml(task.description || '説明は未入力です')}">
                            <span class="shortcut-name">${escapeHtml(task.name)}</span>
                          </button>
                          <div class="shortcut-minute-actions">
                            <button data-action="add-actual-minutes" data-task-id="${escapeHtml(task.id)}" data-minutes="15">+15</button>
                            <button data-action="add-actual-minutes" data-task-id="${escapeHtml(task.id)}" data-minutes="30">+30</button>
                            <button data-action="add-actual-minutes" data-task-id="${escapeHtml(task.id)}" data-minutes="60">+60</button>
                          </div>
                        </div>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
          )
          .join('')}
      </div>
      ${renderTaskForm('quick-task-form', 'ワンタップ追加', true)}
    </aside>
  `;
}

function monthlyProjectGoalFor(userId, month, projectId) {
  return (
    (state.monthlyProjectGoals ?? []).find(
      (goal) =>
        (goal.userId ?? 'ishida') === userId &&
        goal.month === month &&
        goal.projectId === projectId
    )?.goalText ?? ''
  );
}

function monthWeekStarts(month) {
  return [...new Set(getMonthDates(month).map((date) => getWeekStart(date)))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function targetCountFromText(goalText, taskName) {
  const text = String(goalText ?? '');
  if (!text.trim()) return 0;
  const taskPattern = new RegExp(`${escapeRegExp(taskName)}[^\\d\\n]{0,20}(\\d+)\\s*件`, 'i');
  const taskMatch = text.match(taskPattern);
  if (taskMatch) return Number(taskMatch[1]) || 0;
  return 0;
}

function monthlyTaskTargetFor(userId, month, taskId) {
  return (
    (state.monthlyTaskTargets ?? []).find(
      (target) => (target.userId ?? 'ishida') === userId && target.month === month && target.taskId === taskId
    )?.targetCount ?? 0
  );
}

function monthlyTaskProgressRows(userId, month, projectId) {
  const monthDates = new Set(getMonthDates(month));
  const weekStarts = new Set(monthWeekStarts(month));
  const projectTasks = (state.tasks ?? [])
    .filter((task) => task.projectId === projectId && task.countable && task.status !== 'deleted')
    .sort((a, b) => a.order - b.order);

  return projectTasks
    .map((task) => {
      const actualCount = (state.dailyCounts ?? [])
        .filter(
          (row) =>
            (row.userId ?? 'ishida') === userId &&
            row.taskId === task.id &&
            monthDates.has(row.date)
        )
        .reduce((sum, row) => sum + row.count, 0);
      const storedTarget = monthlyTaskTargetFor(userId, month, task.id);
      const fallbackTarget = (state.weeklyProjectGoals ?? [])
        .filter((goal) => (goal.userId ?? 'ishida') === userId && goal.projectId === projectId && weekStarts.has(goal.weekStart))
        .reduce((sum, goal) => sum + targetCountFromText(goal.goalText, task.name), 0);
      const targetCount = storedTarget || fallbackTarget;
      return {
        taskId: task.id,
        taskName: task.name,
        actualCount,
        targetCount,
        progressRate: targetCount > 0 ? Math.min(100, Math.round((actualCount / targetCount) * 100)) : 0
      };
    })
    .filter((row) => row.actualCount > 0 || row.targetCount > 0);
}

function renderMonthlyTaskProgress(userId, month, projectId) {
  const rows = monthlyTaskProgressRows(userId, month, projectId);
  if (rows.length === 0) {
    return '<p class="monthly-progress-empty">今月の件数進捗はまだありません</p>';
  }
  return `
    <div class="monthly-progress-list">
      ${rows
        .map(
          (row) => `
            <div class="monthly-progress-row">
              <div class="monthly-progress-line">
                <strong>${escapeHtml(row.taskName)}</strong>
                <span>${row.actualCount}/${row.targetCount || '-'}件</span>
              </div>
              <div class="monthly-progress-track" aria-hidden="true">
                <span style="width:${row.targetCount > 0 ? row.progressRate : 0}%"></span>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderMonthlyTaskTargetInputs(userId, month, projectId) {
  const tasks = (state.tasks ?? [])
    .filter((task) => task.projectId === projectId && task.countable && task.status !== 'deleted')
    .sort((a, b) => a.order - b.order);
  if (tasks.length === 0) return '';
  return `
    <div class="target-input-list monthly-target-input-list">
      ${tasks
        .map(
          (task) => `
            <label class="target-input-row">
              <span>${escapeHtml(task.name)}</span>
              <input type="number" min="0" step="1" value="${monthlyTaskTargetFor(userId, month, task.id)}" data-field="monthly-task-target" data-user-id="${escapeHtml(userId)}" data-task-id="${escapeHtml(task.id)}" />
              <em>件</em>
            </label>
          `
        )
        .join('')}
    </div>
  `;
}

function weeklyTodoFor(userId = activeUserId) {
  return (
    (state.weeklyTodos ?? []).find(
      (todo) => todo.weekStart === weekStart() && (todo.userId ?? 'ishida') === userId
    ) ?? { weekStart: weekStart(), userId, todoText: '', checkedItems: {} }
  );
}

function parseTodoLines(todoText) {
  return String(todoText ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-・]\s*/, '').trim())
    .filter(Boolean);
}

function renderTodoUserOptions(selectedUserId) {
  return USERS.map(
    (user) =>
      `<option value="${escapeHtml(user.id)}" ${user.id === selectedUserId ? 'selected' : ''}>${escapeHtml(displayUserLabel(user.id))}</option>`
  ).join('');
}

function renderWeeklyTodosPanel() {
  const editorTodo = weeklyTodoFor(todoEditorUserId);
  const activeTodo = weeklyTodoFor(activeUserId);
  const lines = parseTodoLines(activeTodo.todoText);
  return `
    <section class="weekly-todo-panel">
      <div class="panel-heading project-goal-heading">
        <div>
          <span class="section-kicker">今週やるべきこと</span>
          <h2>${escapeHtml(weekStart())} 週 / ${escapeHtml(displayUserLabel(activeUserId))}</h2>
        </div>
      </div>
      <div class="weekly-todo-card">
        <div class="weekly-todo-list">
          ${
            lines.length === 0
              ? '<p class="empty-state compact">今週やるべきことは未設定です</p>'
              : lines
                  .map(
                    (line, index) => `
                      <label class="weekly-todo-item">
                        <input type="checkbox" data-field="weekly-todo-check" data-user-id="${escapeHtml(activeUserId)}" data-item-index="${index}" ${activeTodo.checkedItems?.[index] ? 'checked' : ''} />
                        <span>${escapeHtml(line)}</span>
                      </label>
                    `
                  )
                  .join('')
          }
        </div>
        <div class="weekly-todo-editor">
          <label>
            <span>入力対象</span>
            <select data-field="weekly-todo-user">${renderTodoUserOptions(todoEditorUserId)}</select>
          </label>
          <label>
            <span>箇条書き入力</span>
            <textarea data-field="weekly-todo-text" data-user-id="${escapeHtml(todoEditorUserId)}" placeholder="- 今週やること&#10;- 確認すること">${escapeHtml(editorTodo.todoText)}</textarea>
          </label>
        </div>
      </div>
    </section>
  `;
}

function renderProjectTaskCountsLegacy(projectId, tasks) {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  if (projectTasks.length === 0) {
    return '<p class="empty-state compact">件数管理タスクなし</p>';
  }

  return `
    <div class="project-count-list">
      ${projectTasks
        .map(
          (task) => {
            const actualCount = weeklyCountFor(task.id);
            const targetCount = weeklyTargetFor(task.id);
            const tone = countGoalTone(targetCount, actualCount);
            return `
            <div class="project-count-row">
              <div>
                <span class="project-count-task">${escapeHtml(task.name)}</span>
                <span class="project-count-meta count-tone-${tone}">週合計 ${actualCount}件${targetCount == null ? '' : ` / 目標 ${targetCount}件`} / 今日 ${countFor(task.id, currentDate)}件</span>
              </div>
              <div class="stepper">
                <button data-action="increment-count" data-task-id="${escapeHtml(task.id)}" data-delta="-1" aria-label="${escapeHtml(task.name)}を1件減らす">${icon('minus')}</button>
                <button data-action="increment-count" data-task-id="${escapeHtml(task.id)}" data-delta="1" aria-label="${escapeHtml(task.name)}を1件増やす">${icon('plus')}</button>
              </div>
            </div>
          `;
          }
        )
        .join('')}
    </div>
  `;
}

function renderWeeklyProjectGoals(view) {
  const rows = computeProjectCountSummaries(state, activeUserId, weekStart()).filter((row) => projectGoalVisible(row.projectId));
  return `
    <section class="project-goal-panel">
      <div class="panel-heading project-goal-heading">
        <div>
          <span class="section-kicker">週次目標と実績件数</span>
          <h2>${escapeHtml(weekStart())} 週 / ${escapeHtml(displayUserLabel(activeUserId))}</h2>
        </div>
      </div>
      ${renderProjectGoalVisibilityControls()}
      <div class="project-goal-grid">
        ${rows
          .map(
            (row, index) => `
              <article class="project-goal-card">
                <div class="project-goal-card-header">
                  <h3>${escapeHtml(row.projectName)}</h3>
                  <div class="project-order-controls">
                    <button class="icon-button" data-action="move-project" data-project-id="${escapeHtml(row.projectId)}" data-direction="up" ${index === 0 ? 'disabled' : ''} aria-label="${escapeHtml(row.projectName)}を上へ移動">
                      ${icon('arrowUp')}
                    </button>
                    <button class="icon-button" data-action="move-project" data-project-id="${escapeHtml(row.projectId)}" data-direction="down" ${index === rows.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(row.projectName)}を下へ移動">
                      ${icon('arrowDown')}
                    </button>
                  </div>
                  <div class="project-actual-count">
                    <span>実績件数</span>
                    <strong>${row.actualCount}件</strong>
                  </div>
                </div>
                <label class="project-goal-text">
                  <span>今週の目標</span>
                  <textarea data-field="weekly-project-goal" data-project-id="${escapeHtml(row.projectId)}" placeholder="今週の目標を自由に記入">${escapeHtml(weeklyProjectGoalFor(row.projectId))}</textarea>
                </label>
                ${renderProjectTaskCountsV2(row.projectId, view.countableTasks)}
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderProjectTaskCountsV2(projectId, tasks) {
  const projectTasks = (state.tasks ?? tasks).filter(
    (task) => task.projectId === projectId && task.countable && task.status !== 'deleted'
  );
  if (projectTasks.length === 0) {
    return '<p class="empty-state compact">件数管理タスクなし</p>';
  }
  const summary = computeProjectCountSummaries(state, activeUserId, weekStart()).find((row) => row.projectId === projectId);

  return `
    <div class="project-count-list">
      ${projectTasks
        .map((task) => {
          const actualCount = weeklyCountFor(task.id);
          const targetCount = weeklyTargetFor(task.id) ?? 0;
          const todayCount = countFor(task.id, currentDate);
          const progressRate = targetCount > 0 ? Math.min(100, Math.round((actualCount / targetCount) * 100)) : 0;
          const taskMinutes = (state.dayActuals ?? [])
            .filter((entry) => (entry.userId ?? 'ishida') === activeUserId && getWeekStart(entry.date) === weekStart())
            .flatMap((entry) => getActualItems(entry))
            .filter((item) => item.taskId === task.id)
            .reduce((sum, item) => sum + item.minutes, 0);
          const standard = actualCount === 0 ? '-' : `${Math.round(taskMinutes / actualCount)}分`;
          return `
            <div class="project-count-row">
              <div class="project-count-main">
                <span class="project-count-task">${escapeHtml(task.name)}</span>
                <span class="project-count-meta count-tone-${countGoalTone(targetCount, actualCount)}">
                  週合計: ${actualCount}/${targetCount || '-'}件 / 合計時間 ${(taskMinutes / 60).toFixed(1)}h (1件あたり ${standard})
                </span>
                <div class="monthly-progress-track" aria-hidden="true"><span style="width:${progressRate}%"></span></div>
              </div>
              <div class="weekly-count-inputs">
                <label><span>今週目標</span><input type="number" min="0" step="1" value="${targetCount}" data-field="weekly-task-target" data-task-id="${escapeHtml(task.id)}" /></label>
                <label><span>今日実績</span><input type="number" min="0" step="1" value="${todayCount}" data-field="daily-task-count" data-task-id="${escapeHtml(task.id)}" /></label>
              </div>
            </div>
          `;
        })
        .join('')}
      ${
        summary
          ? `<p class="project-count-total">大分類合計: ${(summary.totalMinutes / 60).toFixed(1)}h / 標準工数 ${
              summary.standardMinutesPerCount == null ? '-' : `${summary.standardMinutesPerCount}分`
            }</p>`
          : ''
      }
    </div>
  `;
}

function renderProjectTaskCounts(projectId, tasks) {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  if (projectTasks.length === 0) {
    return '<p class="empty-state compact">件数管理タスクなし</p>';
  }
  const summary = computeProjectCountSummaries(state, activeUserId, weekStart()).find((row) => row.projectId === projectId);

  return `
    <div class="project-count-list">
      ${projectTasks
        .map((task) => {
          const actualCount = weeklyCountFor(task.id);
          const targetCount = weeklyTargetFor(task.id);
          const tone = countGoalTone(targetCount, actualCount);
          const taskMinutes = (state.dayActuals ?? [])
            .filter((entry) => (entry.userId ?? 'ishida') === activeUserId && getWeekStart(entry.date) === weekStart())
            .flatMap((entry) => getActualItems(entry))
            .filter((item) => item.taskId === task.id)
            .reduce((sum, item) => sum + item.minutes, 0);
          const standard = actualCount === 0 ? '-' : `${Math.round(taskMinutes / actualCount)}分`;
          return `
            <div class="project-count-row">
              <div>
                <span class="project-count-task">${escapeHtml(task.name)}</span>
                <span class="project-count-meta count-tone-${tone}">
                  件数: ${actualCount}件${targetCount == null ? '' : ` / 目標 ${targetCount}件`} / 合計時間: ${(taskMinutes / 60).toFixed(1)}h (1件あたり ${standard})
                </span>
              </div>
              <div class="stepper">
                <button data-action="increment-count" data-task-id="${escapeHtml(task.id)}" data-delta="-1" aria-label="${escapeHtml(task.name)}を1件減らす">${icon('minus')}</button>
                <button data-action="increment-count" data-task-id="${escapeHtml(task.id)}" data-delta="1" aria-label="${escapeHtml(task.name)}を1件増やす">${icon('plus')}</button>
              </div>
            </div>
          `;
        })
        .join('')}
      ${
        summary
          ? `<p class="project-count-total">大分類合計: ${(summary.totalMinutes / 60).toFixed(1)}h / 標準工数 ${
              summary.standardMinutesPerCount == null ? '-' : `${summary.standardMinutesPerCount}分`
            }</p>`
          : ''
      }
    </div>
  `;
}

function renderMonthlyProjectGoals() {
  const month = currentDate.slice(0, 7);
  return `
    <section class="monthly-goal-panel">
      <div class="panel-heading project-goal-heading">
        <div>
          <span class="section-kicker">月次目標設定</span>
          <h2>${escapeHtml(month)}</h2>
        </div>
      </div>
      <div class="project-goal-grid">
        ${monthlyGoalProjects()
          .map(
            (project) => `
              <article class="project-goal-card monthly-goal-card">
                <h3>${escapeHtml(project.name)}</h3>
                <div class="monthly-goal-fields">
                  <label class="project-goal-text">
                    <span>石田</span>
                    <textarea data-field="monthly-project-goal" data-user-id="ishida" data-project-id="${escapeHtml(project.id)}" placeholder="今月の目標を自由に記入">${escapeHtml(monthlyProjectGoalFor('ishida', month, project.id))}</textarea>
                  </label>
                  <label class="project-goal-text">
                    <span>田上</span>
                    <textarea data-field="monthly-project-goal" data-user-id="tanoue" data-project-id="${escapeHtml(project.id)}" placeholder="今月の目標を自由に記入">${escapeHtml(monthlyProjectGoalFor('tanoue', month, project.id))}</textarea>
                  </label>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderDashboard(view) {
  return `
    <div class="dashboard-layout">
      <div class="main-stack">
        ${renderPlanPrompt(view)}
        ${renderTimelineBoard(view)}
        ${renderPartnerPreview(view)}
      </div>
      ${renderShortcutPalette(view)}
    </div>
    ${renderWeeklyTodosPanel()}
    ${renderWeeklyProjectGoals(view)}
  `;
}

function renderTaskForm(formId, title, compact = false) {
  return `
    <form class="task-form ${compact ? 'compact-form' : ''}" data-form="task" id="${formId}">
      <h3>${escapeHtml(title)}</h3>
      <label>
        <span>タスク名</span>
        <input name="name" type="text" required placeholder="例: 請求確認" />
      </label>
      <label>
        <span>大分類</span>
        <select name="projectId">${renderProjectOptions(activeProjects()[0]?.id)}</select>
      </label>
      <label>
        <span>性質</span>
        <select name="nature">${renderNatureOptions('core')}</select>
      </label>
      <label class="checkbox-line">
        <input name="countable" type="checkbox" checked />
        <span>件数管理あり</span>
      </label>
      <label>
        <span>表示先</span>
        <select name="shortcutVisibility">${renderShortcutVisibilityOptions('both')}</select>
      </label>
      <button class="primary-button" type="submit">${icon('plus')}<span>追加</span></button>
    </form>
  `;
}

function renderMasterData() {
  return `
    <div class="master-layout">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <span class="section-kicker">マスタ管理</span>
            <h2>大分類と小分類</h2>
          </div>
        </div>
        <form class="project-form" data-form="project">
          <label>
            <span>大分類名</span>
            <input name="name" type="text" required placeholder="例: 新規事業" />
          </label>
          <button class="primary-button" type="submit">${icon('plus')}<span>大分類追加</span></button>
        </form>
        ${renderTaskForm('master-task-form', '小分類追加')}
      </section>
      <section class="panel task-list-panel">
        ${state.projects
          .filter((project) => project.status !== 'deleted')
          .sort((a, b) => a.order - b.order)
          .map((project, projectIndex, projects) => {
            const tasks = state.tasks
              .filter((task) => task.projectId === project.id && task.status !== 'deleted')
              .sort((a, b) => a.order - b.order);
            return `
              <div class="project-block ${project.status === 'hidden' ? 'muted' : ''}">
                <div class="project-title-row">
                  <input class="project-name-input" value="${escapeHtml(project.name)}" data-project-field="name" data-project-id="${escapeHtml(project.id)}" />
                  <div class="project-title-actions">
                    <span>${tasks.length}件</span>
                    <button class="icon-button" data-action="move-project" data-project-id="${escapeHtml(project.id)}" data-direction="up" ${projectIndex === 0 ? 'disabled' : ''} aria-label="${escapeHtml(project.name)}を上へ移動">
                      ${icon('chevronUp')}
                    </button>
                    <button class="icon-button" data-action="move-project" data-project-id="${escapeHtml(project.id)}" data-direction="down" ${projectIndex === projects.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(project.name)}を下へ移動">
                      ${icon('chevronDown')}
                    </button>
                    <button class="ghost-button" data-action="${project.status === 'hidden' ? 'show-project' : 'hide-project'}" data-project-id="${escapeHtml(project.id)}">
                      ${icon(project.status === 'hidden' ? 'eye' : 'eyeOff')}
                      <span>${project.status === 'hidden' ? '再表示' : '非表示'}</span>
                    </button>
                    <button class="danger-button" data-action="delete-project" data-project-id="${escapeHtml(project.id)}" data-project-name="${escapeHtml(project.name)}">
                      ${icon('trash')}
                      <span>削除</span>
                    </button>
                  </div>
                </div>
                <div class="task-table">
                  ${tasks
                    .map(
                      (task, taskIndex) => `
                        <article class="task-row ${task.status === 'hidden' ? 'muted' : ''}">
                          <div class="task-order-actions">
                            <button class="icon-button" data-action="move-task" data-task-id="${escapeHtml(task.id)}" data-direction="up" ${taskIndex === 0 ? 'disabled' : ''} aria-label="${escapeHtml(task.name)}を上へ移動">
                              ${icon('chevronUp')}
                            </button>
                            <button class="icon-button" data-action="move-task" data-task-id="${escapeHtml(task.id)}" data-direction="down" ${taskIndex === tasks.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(task.name)}を下へ移動">
                              ${icon('chevronDown')}
                            </button>
                          </div>
                          <div class="task-name-cell" title="${escapeHtml(task.description || '説明は未入力です')}">
                            <input value="${escapeHtml(task.name)}" data-task-field="name" data-task-id="${escapeHtml(task.id)}" />
                            <span class="comment-indicator">${icon('message')}</span>
                          </div>
                          <textarea class="task-description-input" data-task-field="description" data-task-id="${escapeHtml(task.id)}" placeholder="説明コメントを自由に記入">${escapeHtml(task.description ?? '')}</textarea>
                          <select data-task-field="projectId" data-task-id="${escapeHtml(task.id)}">${renderProjectOptions(task.projectId)}</select>
                          <select data-task-field="nature" data-task-id="${escapeHtml(task.id)}">${renderNatureOptions(task.nature)}</select>
                          <select data-task-field="shortcutVisibility" data-task-id="${escapeHtml(task.id)}" aria-label="表示先">${renderShortcutVisibilityOptions(task.shortcutVisibility ?? 'both')}</select>
                          <label class="checkbox-line small">
                            <input type="checkbox" ${task.countable ? 'checked' : ''} data-task-field="countable" data-task-id="${escapeHtml(task.id)}" />
                            <span>件数</span>
                          </label>
                          <button class="ghost-button" data-action="${task.status === 'hidden' ? 'show-task' : 'hide-task'}" data-task-id="${escapeHtml(task.id)}">
                            ${icon(task.status === 'hidden' ? 'eye' : 'eyeOff')}
                            <span>${task.status === 'hidden' ? '再表示' : '非表示'}</span>
                          </button>
                          <button class="danger-button" data-action="delete-task" data-task-id="${escapeHtml(task.id)}" data-task-name="${escapeHtml(task.name)}">
                            ${icon('trash')}
                            <span>削除</span>
                          </button>
                        </article>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `;
          })
          .join('')}
      </section>
    </div>
  `;
}

function renderGoalRows(metrics) {
  if (metrics.goalRows.length === 0) {
    return '<p class="empty-state">件数目標が未設定です</p>';
  }
  return `
    <div class="metric-table" role="table">
      <div class="metric-row header" role="row">
        <span>小分類</span><span>目標</span><span>実績</span><span>投下時間</span><span>件/h</span>
      </div>
      ${metrics.goalRows
        .map(
          (row) => `
            <div class="metric-row" role="row">
              <span>${escapeHtml(row.taskName)}</span>
              <span>${row.targetCount}</span>
              <span>${row.actualCount} (${row.progressRate}%)</span>
              <span>${row.actualHours}h</span>
              <span>${row.productivity}</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderPie(metrics) {
  const core = metrics.natureRatios.core;
  const admin = metrics.natureRatios.admin;
  const investment = metrics.natureRatios.investment;
  const adminStart = core;
  const investmentStart = core + admin;
  const background =
    metrics.totalActualHours === 0
      ? '#e5e7eb'
      : `conic-gradient(#1f9d6a 0 ${core}%, #f59e0b ${adminStart}% ${investmentStart}%, #7c3aed ${investmentStart}% 100%)`;
  return `
    <div class="ratio-card">
      <div class="pie" style="background:${background}"></div>
      <div class="legend">
        <span><i class="dot core"></i>コア ${core}%</span>
        <span><i class="dot admin"></i>雑務 ${admin}%</span>
        <span><i class="dot investment"></i>投資 ${investment}%</span>
      </div>
    </div>
  `;
}

function projectTimeRows(periodStart, periodMode, userId = activeUserId) {
  const dates = new Set(periodMode === 'month' ? getMonthDates(periodStart.slice(0, 7)) : getWeekDates(periodStart));
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const projects = new Map(state.projects.map((project) => [project.id, project]));
  const totals = new Map();
  for (const entry of state.dayActuals ?? []) {
    if ((entry.userId ?? 'ishida') !== userId || !dates.has(entry.date)) continue;
    for (const item of getActualItems(entry)) {
      const task = tasks.get(item.taskId);
      if (!task || task.nature === 'break') continue;
      const project = projects.get(task.projectId);
      if (!project) continue;
      totals.set(task.projectId, {
        projectId: task.projectId,
        projectName: project.name,
        minutes: (totals.get(task.projectId)?.minutes ?? 0) + item.minutes
      });
    }
  }
  const totalMinutes = [...totals.values()].reduce((sum, row) => sum + row.minutes, 0);
  return [...totals.values()]
    .sort((a, b) => b.minutes - a.minutes)
    .map((row) => ({ ...row, ratio: totalMinutes === 0 ? 0 : Math.round((row.minutes / totalMinutes) * 100) }));
}

function renderProjectTimePie(periodStart, periodMode) {
  const rows = projectTimeRows(periodStart, periodMode);
  if (rows.length === 0) {
    return '<p class="empty-state compact">大分類別の時間配分はまだありません</p>';
  }
  const colors = ['#2364d2', '#1f9d6a', '#f59e0b', '#7c3aed', '#ef4444', '#0ea5e9'];
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += row.ratio;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `
    <div class="ratio-card project-ratio-card">
      <div class="pie" style="background:conic-gradient(${stops.join(', ')})"></div>
      <div class="legend">
        ${rows
          .map(
            (row, index) => `
              <span><i class="dot" style="background:${colors[index % colors.length]}"></i>${escapeHtml(row.projectName)} ${row.ratio}%</span>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderReviewForm(review) {
  return `
      <section class="panel review-form-panel">
        <div class="panel-heading compact">
          <div>
            <span class="section-kicker">振り返りフォーム</span>
            <h2>${reviewWeekStart()} 週（前週）</h2>
          </div>
        </div>
        <div class="review-form">
          <label>
            <span>目標振り返り</span>
            <textarea data-review-field="goalReflection">${escapeHtml(review.goalReflection)}</textarea>
          </label>
          <label>
            <span>課題感</span>
            <textarea data-review-field="overtimeCause">${escapeHtml(review.overtimeCause)}</textarea>
          </label>
          <label>
            <span>どうすべきか</span>
            <textarea data-review-field="nextPromise">${escapeHtml(review.nextPromise)}</textarea>
          </label>
          <label>
            <span>話し合いたいこと</span>
            <textarea data-review-field="discussionItems" placeholder="- 話し合いたい議題&#10;- 確認したいこと">${escapeHtml(review.discussionItems ?? '')}</textarea>
          </label>
        </div>
      </section>
  `;
}

function renderWeeklyReviewForm() {
  return `
      <section class="panel review-form-panel weekly-review-panel">
        <div class="panel-heading compact">
          <div>
            <span class="section-kicker">週次振り返り</span>
            <h2>${reviewWeekStart()} 週（前週）</h2>
          </div>
        </div>
        <div class="weekly-review-users">
          ${USERS.map((user) => {
            const review = currentReviewFor(user.id);
            const todo = weeklyTodoFor(user.id);
            return `
              <article class="weekly-review-user">
                <h3>${escapeHtml(displayUserLabel(user.id))}</h3>
                <div class="review-form">
                  <label>
                    <span>目標振り返り</span>
                    <textarea data-review-field="goalReflection" data-user-id="${escapeHtml(user.id)}">${escapeHtml(review.goalReflection)}</textarea>
                  </label>
                  <label>
                    <span>課題感</span>
                    <textarea data-review-field="overtimeCause" data-user-id="${escapeHtml(user.id)}">${escapeHtml(review.overtimeCause)}</textarea>
                  </label>
                  <label>
                    <span>今週必ずやること</span>
                    <textarea data-review-field="nextPromise" data-user-id="${escapeHtml(user.id)}" placeholder="- 今週必ずやること&#10;- 確認すること">${escapeHtml(todo.todoText || review.nextPromise)}</textarea>
                  </label>
                  <label>
                    <span>話し合いたいこと</span>
                    <textarea data-review-field="discussionItems" data-user-id="${escapeHtml(user.id)}" placeholder="- 話し合いたい議題&#10;- 確認したいこと">${escapeHtml(review.discussionItems ?? '')}</textarea>
                  </label>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
  `;
}

function renderReviewDashboard() {
  const targetWeek = reviewWeekStart();
  const periodStart = reviewMode === 'week' ? targetWeek : `${currentDate.slice(0, 7)}-01`;
  const metrics = computeReviewMetrics(state, periodStart, { periodMode: reviewMode, userId: activeUserId });
  const review = currentReview();
  return `
    <div class="review-layout">
      ${renderWeeklyReviewForm()}
      ${renderMonthlyProjectGoals()}
      <section class="panel review-summary-panel">
        <div class="panel-heading">
          <div>
            <span class="section-kicker">共有ダッシュボード</span>
            <h2>${reviewMode === 'week' ? `${weekStart()} 週` : `${currentDate.slice(0, 7)} 月`}</h2>
          </div>
          <div class="segmented">
            <button class="${reviewMode === 'week' ? 'active' : ''}" data-action="review-mode" data-mode="week">週次</button>
            <button class="${reviewMode === 'month' ? 'active' : ''}" data-action="review-mode" data-mode="month">月次</button>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card">${icon('clock')}<span>総実働</span><strong>${metrics.totalActualHours}h</strong></div>
          <div class="summary-card">${icon('target')}<span>キャパ達成率</span><strong>${metrics.capacityRate}%</strong></div>
          <div class="summary-card">${icon('chart')}<span>目標行数</span><strong>${metrics.goalRows.length}</strong></div>
        </div>
        ${renderGoalRows(metrics)}
      </section>
      <section class="panel">
        <div class="panel-heading compact">
          <div>
            <span class="section-kicker">時間配分</span>
            <h2>コア業務 vs 雑務</h2>
          </div>
        </div>
        ${renderPie(metrics)}
        ${renderProjectTimePie(periodStart, reviewMode)}
      </section>
      <section class="panel">
        <div class="panel-heading compact">
          <div>
            <span class="section-kicker">予実ギャップTop3</span>
            <h2>予定との差分</h2>
          </div>
        </div>
        <div class="gap-list">
          ${
            metrics.topGaps.length === 0
              ? '<p class="empty-state">大きな差分はありません</p>'
              : metrics.topGaps
                  .map(
                    (gap) => `
                      <div class="gap-item">
                        <strong>${String(gap.hour).padStart(2, '0')}:00</strong>
                        <span>${escapeHtml(gap.plannedTaskName)} → ${escapeHtml(gap.actualTaskName)}</span>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>
      </section>
      <section class="panel review-form-panel">
        <div class="panel-heading compact">
          <div>
            <span class="section-kicker">振り返りフォーム</span>
            <h2>${weekStart()} 週</h2>
          </div>
        </div>
        <div class="review-form">
          <label>
            <span>目標振り返り</span>
            <textarea data-review-field="goalReflection">${escapeHtml(review.goalReflection)}</textarea>
          </label>
          <label>
            <span>残業原因</span>
            <textarea data-review-field="overtimeCause">${escapeHtml(review.overtimeCause)}</textarea>
          </label>
          <label>
            <span>来週の改善約束</span>
            <textarea data-review-field="nextPromise">${escapeHtml(review.nextPromise)}</textarea>
          </label>
          <label>
            <span>話し合いたいこと</span>
            <textarea data-review-field="discussionItems" placeholder="- 話し合いたい議題&#10;- 確認したいこと">${escapeHtml(review.discussionItems ?? '')}</textarea>
          </label>
        </div>
      </section>
    </div>
  `;
}

function render() {
  if (!state) return;
  ensureSelectedTask();
  const view = createDashboardViewModel(state, currentDate, activeUserId);
  root.innerHTML = `
    <div class="app-shell">
      ${renderHeader(view)}
      <main>
        ${activeTab === 'dashboard' ? renderDashboard(view) : ''}
        ${activeTab === 'master' ? renderMasterData() : ''}
        ${activeTab === 'review' ? renderReviewDashboard() : ''}
      </main>
    </div>
  `;
  enableShortcutDragging();
  applyAppBranding();
  applyPlanPromptControls();
  applyReviewLabels();
  applyMonthlyProgress();
}

function enableShortcutDragging() {
  root
    .querySelectorAll('.shortcut-card[data-task-id]:not([data-task-id=""])')
    .forEach((button) => {
      button.setAttribute('draggable', 'true');
      button.classList.add('draggable-shortcut');
    });
}

function applyAppBranding() {
  if (typeof document !== 'undefined') document.title = APP_NAME;
  const headerTitle = root.querySelector('.app-header h1');
  const headerKicker = root.querySelector('.app-header .section-kicker');
  if (headerTitle) headerTitle.textContent = APP_NAME;
  if (headerKicker) headerKicker.textContent = '業務管理';
}

function applyPlanPromptControls() {
  const prompt = root.querySelector('.plan-prompt-controls');
  if (!prompt) return;
  const customButton = prompt.querySelector('[data-action="plan-prompt-custom"]');
  const noteInput = prompt.querySelector('[data-field="plan-prompt-note"]');
  const minutesInput = prompt.querySelector('[data-field="plan-prompt-minutes"]');
  if (customButton) customButton.textContent = '変更';
  if (minutesInput) {
    minutesInput.type = 'hidden';
    const minutesLabel = minutesInput.closest('label');
    if (minutesLabel) minutesLabel.style.display = 'none';
  }
  if (noteInput) {
    noteInput.placeholder = '変更内容を記入';
    noteInput.setAttribute('aria-label', '変更内容');
    if (customButton && customButton.nextElementSibling !== noteInput) {
      customButton.insertAdjacentElement('afterend', noteInput);
    }
  }
}

function applyReviewLabels() {
  const labels = [
    ['overtimeCause', '課題感'],
    ['nextPromise', '今週必ずやること']
  ];
  labels.forEach(([field, labelText]) => {
    root.querySelectorAll(`[data-review-field="${field}"]`).forEach((fieldElement) => {
      const label = fieldElement.closest('label')?.querySelector('span');
      if (label) label.textContent = labelText;
    });
  });
  if (activeTab !== 'review') return;
  const weeklyTitle = `${reviewWeekStart()} 週（前週）`;
  const reviewHeadings = root.querySelectorAll('.review-layout .panel-heading h2');
  if (reviewMode === 'week' && reviewHeadings[0]) reviewHeadings[0].textContent = weeklyTitle;
  const summaryHeading = root.querySelector('.review-summary-panel .panel-heading h2');
  if (reviewMode === 'week' && summaryHeading) summaryHeading.textContent = weeklyTitle;
  const formHeading = root.querySelector('.review-form-panel .panel-heading h2');
  if (formHeading) formHeading.textContent = weeklyTitle;
}

function applyMonthlyProgress() {
  root.querySelectorAll('[data-field="monthly-project-goal"]').forEach((textarea) => {
    const label = textarea.closest('label');
    if (!label || label.querySelector('.monthly-progress-list, .monthly-progress-empty, .monthly-target-input-list')) return;
    const labelText = label.querySelector('span');
    if (labelText) labelText.textContent = displayUserLabel(textarea.dataset.userId);
    textarea.insertAdjacentHTML(
      'afterend',
      renderMonthlyTaskTargetInputs(textarea.dataset.userId, currentDate.slice(0, 7), textarea.dataset.projectId) +
      renderMonthlyTaskProgress(textarea.dataset.userId, currentDate.slice(0, 7), textarea.dataset.projectId)
    );
  });
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'switch-tab') {
    activeTab = button.dataset.tab;
    render();
  }
  if (action === 'switch-user') {
    activeUserId = button.dataset.userId;
    todoEditorUserId = activeUserId;
    focusedCell = null;
    replaceCurrentUserUrl(activeUserId);
    render();
  }
  if (action === 'copy-user-url') {
    const url = buildUserUrl(currentPageUrl(), button.dataset.userId);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch((error) => console.error('Failed to copy user URL', error));
    }
  }
  if (action === 'copy-daily-text') {
    const text = button.closest('.copy-block')?.querySelector('.copy-text')?.value ?? '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch((error) => console.error('Failed to copy daily text', error));
    }
  }
  if (action === 'copy-format') {
    copyFormat = button.dataset.format === 'category' ? 'category' : 'timeline';
    render();
  }
  if (action === 'logout') {
    authController.logout().catch((error) => console.error('Failed to logout', error));
  }
  if (action === 'select-task') {
    selectedTaskId = nextSelectedTaskId(selectedTaskId, button.dataset.taskId);
    render();
  }
  if (action === 'set-timeline') {
    const collectionName = button.dataset.collection;
    const hour = Number(button.dataset.hour);
    const entry = entryFor(collectionName, hour, activeUserId);
    focusedCell = { collectionName, userId: activeUserId, date: currentDate, hour };
    const nextState = selectedTaskId
      ? setTimelineEntry(
          state,
          collectionName,
          activeUserId,
          currentDate,
          hour,
          selectedTaskId,
          entry?.note ?? ''
        )
      : clearTimelineEntry(state, collectionName, activeUserId, currentDate, hour);
    selectedTaskId = selectedTaskAfterTimelineUse(selectedTaskId);
    commit(nextState);
  }
  if (action === 'copy-plan') {
    commit(copyPlanToActuals(state, activeUserId, currentDate));
  }
  if (action === 'copy-plan-hour') {
    focusedCell = { collectionName: 'dayActuals', userId: activeUserId, date: currentDate, hour: Number(button.dataset.hour) };
    commit(copyPlanHourToActual(state, activeUserId, currentDate, Number(button.dataset.hour)));
  }
  if (action === 'mobile-focus-hour') {
    const view = createDashboardViewModel(state, currentDate, activeUserId);
    focusedCell = nextMobileFocusedCell(
      focusedCell,
      Number(button.dataset.direction),
      activeUserId,
      currentDate,
      view.timelineSetting.startHour,
      view.timelineSetting.endHour
    );
    render();
  }
  if (action === 'add-actual-minutes') {
    const view = createDashboardViewModel(state, currentDate, activeUserId);
    const collectionName = focusedCell?.collectionName === 'dayPlans' ? 'dayPlans' : 'dayActuals';
    const hour = collectionName === 'dayPlans' && focusedCell ? focusedCell.hour : activeActualHour(view);
    focusedCell = { collectionName, userId: activeUserId, date: currentDate, hour };
    selectedTaskId = selectedTaskAfterTimelineUse(selectedTaskId);
    commit(
      collectionName === 'dayPlans'
        ? addPlanMinutes(state, activeUserId, currentDate, hour, button.dataset.taskId, Number(button.dataset.minutes))
        : addActualMinutes(state, activeUserId, currentDate, hour, button.dataset.taskId, Number(button.dataset.minutes))
    );
  }
  if (action === 'plan-prompt-ok' || action === 'plan-prompt-continue' || action === 'plan-prompt-custom') {
    const panel = button.closest('.plan-prompt');
    const mode = action === 'plan-prompt-ok' ? 'ok' : action === 'plan-prompt-continue' ? 'continue' : 'custom';
    const startHour = Number(panel?.querySelector('[data-field="plan-prompt-hour"]')?.value ?? button.dataset.hour);
    const startMinute = Number(panel?.querySelector('[data-field="plan-prompt-minute"]')?.value ?? 0);
    const minutes = Number(panel?.querySelector('[data-field="plan-prompt-minutes"]')?.value ?? 60);
    const note = panel?.querySelector('[data-field="plan-prompt-note"]')?.value ?? '';
    const taskId = panel?.querySelector('[data-field="plan-prompt-task"]')?.value ?? '';
    const key = button.dataset.promptKey;
    if (key) dismissedPlanPromptKeys.add(key);
    commit(
      applyPlanNotificationResponse(state, {
        userId: activeUserId,
        date: currentDate,
        hour: Number(button.dataset.hour),
        itemIndex: Number(button.dataset.itemIndex),
        mode,
        note,
        taskId: mode === 'custom' ? taskId : undefined,
        startHour,
        startMinute,
        minutes
      })
    );
  }
  if (action === 'plan-prompt-dismiss') {
    if (button.dataset.promptKey) dismissedPlanPromptKeys.add(button.dataset.promptKey);
    render();
  }
  if (action === 'remove-timeline-item') {
    const collectionName = button.dataset.collection;
    commit(
      collectionName === 'dayPlans'
        ? removePlanItem(state, activeUserId, currentDate, Number(button.dataset.hour), Number(button.dataset.itemIndex))
        : removeActualItem(state, activeUserId, currentDate, Number(button.dataset.hour), Number(button.dataset.itemIndex))
    );
  }
  if (action === 'remove-actual-item') {
    commit(
      removeActualItem(
        state,
        activeUserId,
        currentDate,
        Number(button.dataset.hour),
        Number(button.dataset.itemIndex)
      )
    );
  }
  if (action === 'increment-count') {
    commit(incrementDailyCount(state, currentDate, button.dataset.taskId, Number(button.dataset.delta), activeUserId));
  }
  if (action === 'move-project') {
    commit(moveProjectOrder(state, button.dataset.projectId, button.dataset.direction));
  }
  if (action === 'move-task') {
    commit(moveTaskOrder(state, button.dataset.taskId, button.dataset.direction));
  }
  if (action === 'hide-task') {
    commit(hideTask(state, button.dataset.taskId));
  }
  if (action === 'show-task') {
    commit(updateTask(state, button.dataset.taskId, { status: 'active' }));
  }
  if (action === 'delete-task') {
    if (window.confirm(`${button.dataset.taskName}をマスタから削除しますか？`)) {
      commit(deleteTask(state, button.dataset.taskId));
    }
  }
  if (action === 'delete-project') {
    if (window.confirm(`${button.dataset.projectName}と配下の小分類をマスタから削除しますか？`)) {
      commit(deleteProject(state, button.dataset.projectId));
    }
  }
  if (action === 'hide-project') {
    commit(hideProject(state, button.dataset.projectId));
  }
  if (action === 'show-project') {
    commit(updateProject(state, button.dataset.projectId, { status: 'active' }));
  }
  if (action === 'review-mode') {
    reviewMode = button.dataset.mode;
    render();
  }
}

function handleFocusIn(event) {
  const cell = event.target.closest?.('[data-timeline-cell]');
  if (!cell) return;
  focusedCell = {
    collectionName: cell.dataset.collection,
    userId: activeUserId,
    date: currentDate,
    hour: Number(cell.dataset.hour)
  };
}

function handleKeyDown(event) {
  if (isAppUndoShortcut(event)) {
    if (undoStack.length === 0) return;
    event.preventDefault();
    const previousState = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    focusedCell = null;
    commit(previousState, { history: false });
    return;
  }

  if (event.key !== 'Backspace' || !focusedCell) return;
  if (event.target.closest?.('input, textarea, select')) return;
  if (focusedCell.collectionName !== 'dayPlans') return;

  event.preventDefault();
  const cellToClear = focusedCell;
  focusedCell = null;
  commit(
    clearTimelineEntry(
      state,
      cellToClear.collectionName,
      cellToClear.userId,
      cellToClear.date,
      cellToClear.hour
    )
  );
}

function handleChange(event) {
  const target = event.target;
  if (target.dataset.field === 'current-date') {
    currentDate = target.value;
    focusedCell = null;
    render();
  }
  if (target.dataset.field === 'weekly-todo-user') {
    todoEditorUserId = target.value;
    render();
  }
  if (target.dataset.field === 'weekly-todo-check') {
    commit(
      toggleWeeklyTodoItem(
        state,
        weekStart(),
        target.dataset.userId,
        Number(target.dataset.itemIndex),
        target.checked
      )
    );
  }
  if (target.dataset.field === 'project-goal-visible') {
    commit(upsertProjectGoalVisibility(state, activeUserId, target.dataset.projectId, target.checked));
  }
  if (target.dataset.field === 'weekly-task-target') {
    commit(upsertWeeklyGoal(state, weekStart(), target.dataset.taskId, target.value, activeUserId));
  }
  if (target.dataset.field === 'daily-task-count') {
    commit(setDailyCount(state, activeUserId, currentDate, target.dataset.taskId, target.value));
  }
  if (target.dataset.field === 'monthly-task-target') {
    commit(upsertMonthlyTaskTarget(state, target.dataset.userId, currentDate.slice(0, 7), target.dataset.taskId, target.value));
  }
  if (target.dataset.field === 'start-hour' || target.dataset.field === 'end-hour') {
    const current = getTimelineSetting(state, activeUserId, currentDate);
    const nextStart =
      target.dataset.field === 'start-hour' ? Number(target.value) : current.startHour;
    const nextEnd = target.dataset.field === 'end-hour' ? Number(target.value) : current.endHour;
    focusedCell = null;
    commit(upsertTimelineSetting(state, activeUserId, currentDate, nextStart, nextEnd));
  }
  if (target.dataset.field === 'timeline-note') {
    commit(
      setTimelineNote(
        state,
        target.dataset.collection,
        activeUserId,
        currentDate,
        Number(target.dataset.hour),
        target.value
      )
    );
  }
  if (target.dataset.field === 'timeline-item-minutes') {
    const collectionName = target.dataset.collection;
    commit(
      collectionName === 'dayPlans'
        ? updatePlanItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { minutes: Number(target.value) })
        : updateActualItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { minutes: Number(target.value) })
    );
  }
  if (target.dataset.field === 'timeline-item-start-minute') {
    const collectionName = target.dataset.collection;
    commit(
      collectionName === 'dayPlans'
        ? updatePlanItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { startMinute: Number(target.value) })
        : updateActualItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { startMinute: Number(target.value) })
    );
  }
  if (target.dataset.field === 'actual-item-minutes') {
    commit(updateActualItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { minutes: Number(target.value) }));
  }
  if (target.dataset.taskField) {
    const field = target.dataset.taskField;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    commit(updateTask(state, target.dataset.taskId, { [field]: value }));
  }
  if (target.dataset.projectField) {
    commit(updateProject(state, target.dataset.projectId, { [target.dataset.projectField]: target.value }));
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.reviewField) {
    const reviewUserId = target.dataset.userId ?? activeUserId;
    const patch = { userId: reviewUserId, [target.dataset.reviewField]: target.value };
    const reviewedState = upsertReview(state, reviewWeekStart(), patch);
    const nextState =
      target.dataset.reviewField === 'nextPromise'
        ? upsertWeeklyTodo(reviewedState, weekStart(), reviewUserId, target.value)
        : reviewedState;
    commit(nextState, { render: false });
    return;
  }
  if (target.dataset.field === 'weekly-project-goal') {
    commit(
      upsertWeeklyProjectGoal(
        state,
        activeUserId,
        weekStart(),
        target.dataset.projectId,
        target.value
      ),
      { render: false }
    );
    return;
  }
  if (target.dataset.field === 'monthly-project-goal') {
    commit(
      upsertMonthlyProjectGoal(
        state,
        target.dataset.userId,
        currentDate.slice(0, 7),
        target.dataset.projectId,
        target.value
      ),
      { render: false }
    );
    return;
  }
  if (target.dataset.field === 'weekly-todo-text') {
    commit(upsertWeeklyTodo(state, weekStart(), target.dataset.userId, target.value), { render: false });
    return;
  }
  if (target.dataset.field === 'timeline-note') {
    if (event.isComposing) {
      return;
    }
    commit(
      setTimelineNote(
        state,
        target.dataset.collection,
        activeUserId,
        currentDate,
        Number(target.dataset.hour),
        target.value
      ),
      { render: false }
    );
    return;
  }
  if (target.dataset.field === 'timeline-item-note') {
    if (event.isComposing) {
      return;
    }
    const collectionName = target.dataset.collection;
    commit(
      collectionName === 'dayPlans'
        ? updatePlanItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { note: target.value })
        : updateActualItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { note: target.value }),
      { render: false }
    );
    return;
  }
  if (target.dataset.field === 'timeline-item-note') {
    const collectionName = target.dataset.collection;
    commit(
      collectionName === 'dayPlans'
        ? updatePlanItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { note: target.value })
        : updateActualItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { note: target.value }),
      { render: false }
    );
    return;
  }
  if (target.dataset.field === 'actual-item-note') {
    commit(updateActualItem(state, activeUserId, currentDate, Number(target.dataset.hour), Number(target.dataset.itemIndex), { note: target.value }), { render: false });
    return;
  }
  if (target.dataset.field !== 'timeline-note') return;
  commit(
    setTimelineNote(
      state,
      target.dataset.collection,
      activeUserId,
      currentDate,
      Number(target.dataset.hour),
      target.value
    ),
    { render: false }
  );
}

function handleCompositionEnd(event) {
  handleInput({ target: event.target, isComposing: false });
}

function handleDragStart(event) {
  const shortcut = event.target.closest?.('.shortcut-card[data-task-id]:not([data-task-id=""])');
  if (!shortcut || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', shortcut.dataset.taskId);
  event.dataTransfer.effectAllowed = 'copy';
}

function handleDragOver(event) {
  if (!event.target.closest?.('[data-timeline-cell="true"]')) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function handleDrop(event) {
  const cell = event.target.closest?.('[data-timeline-cell="true"]');
  if (!cell || !event.dataTransfer) return;
  const taskId = event.dataTransfer.getData('text/plain');
  if (!taskId) return;
  event.preventDefault();
  const collectionName = cell.dataset.collection;
  const hour = Number(cell.dataset.hour);
  focusedCell = { collectionName, userId: activeUserId, date: currentDate, hour };
  selectedTaskId = selectedTaskAfterTimelineUse(selectedTaskId);
  commit(
    collectionName === 'dayPlans'
      ? addPlanMinutes(state, activeUserId, currentDate, hour, taskId, 60)
      : addActualMinutes(state, activeUserId, currentDate, hour, taskId, 60)
  );
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  if (form.dataset.form === 'login') {
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    authState = { status: 'loading', user: null, error: '' };
    root.innerHTML = renderAuthGate();
    authController
      .login(email, password)
      .then((nextAuthState) => {
        authState = nextAuthState;
        if (nextAuthState.status === 'signed-in') {
          if (!unsubscribeState) {
            subscribeSharedState();
          }
          return;
        }
        if (nextAuthState.error) {
          root.innerHTML = renderAuthGate();
        }
      })
      .catch((error) => {
        console.error('Failed to login', error);
        authState = { status: 'signed-out', user: null, error: 'ログインに失敗しました' };
        root.innerHTML = renderAuthGate();
      });
    return;
  }
  if (form.dataset.form === 'project') {
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    commit(addProject(state, name));
  }
  if (form.dataset.form === 'task') {
    const name = String(formData.get('name') ?? '').trim();
    const projectId = String(formData.get('projectId') ?? '');
    if (!name || !projectId) return;
    const nextState = addTask(state, {
      name,
      projectId,
      nature: String(formData.get('nature') ?? 'core'),
      countable: formData.get('countable') === 'on',
      shortcutVisibility: String(formData.get('shortcutVisibility') ?? 'both')
    });
    selectedTaskId = nextState.tasks[nextState.tasks.length - 1].id;
    commit(nextState);
  }
}

function startAuthFlow() {
  const authSubscription = authController.subscribe((nextAuthState) => {
    authState = nextAuthState;
    if (authState.status === 'signed-in') {
      if (!unsubscribeState) {
        root.innerHTML = '<div class="app-shell"><section class="panel">共有データを読み込み中...</section></div>';
        subscribeSharedState();
      }
      return;
    }
    unsubscribeSharedState();
    root.innerHTML = renderAuthGate();
  });
  if (authSubscription && typeof authSubscription.then === 'function') {
    authSubscription
      .then((unsubscribe) => {
        unsubscribeAuth = unsubscribe;
      })
      .catch((error) => {
        console.error('Failed to subscribe to auth', error);
        authState = { status: 'signed-out', user: null, error: '認証を開始できませんでした' };
        root.innerHTML = renderAuthGate();
      });
  } else {
    unsubscribeAuth = authSubscription;
  }
}

function boot() {
  root = document.getElementById('root');
  currentDate = todayKey();
  activeUserId = getUserIdFromUrl(window.location.href, activeUserId);
  todoEditorUserId = activeUserId;
  authController = createAuthController({ firebaseConfig });
  root.addEventListener('click', handleClick);
  root.addEventListener('focusin', handleFocusIn);
  document.addEventListener('keydown', handleKeyDown);
  root.addEventListener('change', handleChange);
  root.addEventListener('input', handleInput);
  root.addEventListener('compositionend', handleCompositionEnd);
  root.addEventListener('dragstart', handleDragStart);
  root.addEventListener('dragover', handleDragOver);
  root.addEventListener('drop', handleDrop);
  root.addEventListener('submit', handleSubmit);
  root.innerHTML = '<div class="app-shell"><section class="panel">読み込み中...</section></div>';
  if (logoutIsRequested(window.location.href)) {
    root.innerHTML = '<div class="app-shell"><section class="panel">ログアウト中...</section></div>';
    authController
      .logout()
      .catch((error) => console.error('Failed to logout from URL', error))
      .finally(() => clearFirebaseAuthPersistence(window))
      .finally(() => {
        window.location.replace(buildUrlWithoutLogout(window.location.href));
      });
    return;
  }
  if (!planPromptTimer) {
    planPromptTimer = window.setInterval(() => {
      if (state && activeTab === 'dashboard') render();
    }, 60000);
  }
  startAuthFlow();
  return;
  root.innerHTML = '<div class="app-shell"><section class="panel">読み込み中...</section></div>';
  const subscription = adapter.subscribe((nextState) => {
    state = nextState;
    ensureSelectedTask();
    if (suppressedAdapterRenderCount > 0) {
      suppressedAdapterRenderCount -= 1;
      return;
    }
    render();
  });
  if (subscription && typeof subscription.then === 'function') {
    subscription
      .then((unsubscribe) => {
        unsubscribeState = unsubscribe;
      })
      .catch((error) => {
        console.error('Failed to subscribe to state', error);
        root.innerHTML = '<div class="app-shell"><section class="panel">状態の読み込みに失敗しました</section></div>';
      });
  } else {
    unsubscribeState = subscription;
  }
}

if (typeof document !== 'undefined') {
  boot();
}
