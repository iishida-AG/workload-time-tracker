import { getTimelineHours, getWeekStart, toDateKey } from './domain/calendar.js';
import { TASK_NATURES } from './domain/presets.js';
import {
  clearTimelineEntry,
  computeProjectCountSummaries,
  computeReviewMetrics,
  copyPlanToActuals,
  copyPlanHourToActual,
  addActualMinutes,
  formatActualItemRanges,
  getActualItems,
  incrementDailyCount,
  removeActualItem,
  setTimelineEntry,
  setTimelineNote,
  updateActualItem
} from './domain/metrics.js';
import { getUserLabel, USERS } from './domain/users.js';
import { createDashboardViewModel } from './ui/view-model.js';
import { createStateAdapter } from './state/firebase-sync.js';
import { firebaseConfig } from './firebase-config.js';
import { createAuthController } from './state/auth.js';
import {
  addProject,
  addTask,
  deleteProject,
  deleteTask,
  getTimelineSetting,
  hideTask,
  moveProjectOrder,
  moveTaskOrder,
  updateProject,
  updateTask,
  upsertMonthlyProjectGoal,
  upsertReview,
  upsertTimelineSetting,
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
let adapter;
let authController;
let authState = { status: 'loading', user: null, error: '' };
let unsubscribeState = null;
let unsubscribeAuth = null;
let suppressedAdapterRenderCount = 0;

const validUserIds = new Set(USERS.map((user) => user.id));

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
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.target}</svg>`;
}

function todayKey() {
  return toDateKey(new Date());
}

function activeProjects() {
  return state.projects.filter((project) => project.status === 'active').sort((a, b) => a.order - b.order);
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

function currentReview() {
  return (
    state.weeklyReviews.find((review) => review.weekStart === weekStart()) ?? {
      weekStart: weekStart(),
      goalReflection: '',
      overtimeCause: '',
      nextPromise: '',
      discussionItems: ''
    }
  );
}

function commit(nextState, options = {}) {
  const shouldRender = options.render !== false;
  state = nextState;
  if (adapter) {
    if (adapter.mode === 'local' || !shouldRender) {
      suppressedAdapterRenderCount += 1;
    }
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
  return state.weeklyGoals.find((goal) => goal.weekStart === weekStart() && goal.taskId === taskId)?.targetCount ?? null;
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
  return `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`;
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
        ${renderShareLinks()}
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
      <div class="timeline-grid">
        ${renderTimelineColumn('予定', 'dayPlans', view)}
        ${renderTimelineColumn('実績', 'dayActuals', view)}
      </div>
      ${renderCopyTextBlocks(view)}
    </section>
  `;
}

function renderActualItemRows(entry, hour) {
  const items = getActualItems(entry);
  if (items.length === 0) {
    return '<div class="actual-item-empty">未入力</div>';
  }
  const ranges = formatActualItemRanges(hour, items);
  return `
    <div class="actual-item-list">
      ${items
        .map((item, index) => {
          const task = taskById(item.taskId);
          return `
            <div class="actual-item-row">
              <span class="actual-item-range">${escapeHtml(ranges[index])}</span>
              <span class="actual-item-task">${escapeHtml(task?.name ?? '未設定')}</span>
              <input class="actual-minutes-input" type="number" min="0" step="5" value="${escapeHtml(item.minutes)}" data-field="actual-item-minutes" data-hour="${hour}" data-item-index="${index}" />
              <span class="actual-minute-label">分</span>
              <input class="actual-note-input" type="text" value="${escapeHtml(item.note ?? '')}" data-field="actual-item-note" data-hour="${hour}" data-item-index="${index}" aria-label="実績メモ" />
              <button class="icon-button mini-icon-button" data-action="remove-actual-item" data-hour="${hour}" data-item-index="${index}" aria-label="実績項目を削除">${icon('trash')}</button>
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
          const items = collectionName === 'dayActuals' ? getActualItems(entry) : [];
          const firstTaskId = collectionName === 'dayActuals' ? items[0]?.taskId : entry?.taskId;
          const task = firstTaskId ? taskById(firstTaskId) : null;
          const isFocused =
            focusedCell?.collectionName === collectionName &&
            focusedCell?.userId === view.userId &&
            focusedCell?.date === currentDate &&
            focusedCell?.hour === hour;
          if (collectionName === 'dayPlans') {
            return `
              <div class="timeline-entry plan-entry">
                <button class="ghost-button planned-done-button" data-action="copy-plan-hour" data-hour="${hour}" ${entry ? '' : 'disabled'} title="予定通り完了" aria-label="予定通り完了">
                  ${icon('check')}
                </button>
                <button
                  class="plan-inline-select ${isFocused ? 'focused' : ''} nature-${task?.nature ?? 'empty'}"
                  data-action="set-timeline"
                  data-timeline-cell="true"
                  data-collection="${collectionName}"
                  data-hour="${hour}"
                >
                  <span class="plan-inline-time">${hourRangeLabel(hour)}</span>
                  <span class="plan-inline-task">${task ? escapeHtml(task.name) : '未入力'}</span>
                </button>
                <input
                  class="timeline-note plan-inline-note"
                  type="text"
                  value="${escapeHtml(entry?.note ?? '')}"
                  data-field="timeline-note"
                  data-collection="${collectionName}"
                  data-hour="${hour}"
                  aria-label="自由記入"
                  ${entry ? '' : 'disabled'}
                />
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
              ${renderActualItemRows(entry, hour)}
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
  const rows = computeProjectCountSummaries(state, activeUserId, weekStart());
  return `
    <section class="project-goal-panel">
      <div class="panel-heading project-goal-heading">
        <div>
          <span class="section-kicker">週次目標と実績件数</span>
          <h2>${escapeHtml(weekStart())} 週 / ${escapeHtml(displayUserLabel(activeUserId))}</h2>
        </div>
      </div>
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
                ${renderProjectTaskCounts(row.projectId, view.countableTasks)}
              </article>
            `
          )
          .join('')}
      </div>
    </section>
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
        ${activeProjects()
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
        ${renderTimelineBoard(view)}
        ${renderPartnerPreview(view)}
      </div>
      ${renderShortcutPalette(view)}
    </div>
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
              <div class="project-block">
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

function renderReviewDashboard() {
  const periodStart = reviewMode === 'week' ? weekStart() : `${currentDate.slice(0, 7)}-01`;
  const metrics = computeReviewMetrics(state, periodStart, { periodMode: reviewMode, userId: activeUserId });
  const review = currentReview();
  return `
    <div class="review-layout">
      ${renderMonthlyProjectGoals()}
      <section class="panel">
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
    commit(nextState);
  }
  if (action === 'copy-plan') {
    commit(copyPlanToActuals(state, activeUserId, currentDate));
  }
  if (action === 'copy-plan-hour') {
    focusedCell = { collectionName: 'dayActuals', userId: activeUserId, date: currentDate, hour: Number(button.dataset.hour) };
    commit(copyPlanHourToActual(state, activeUserId, currentDate, Number(button.dataset.hour)));
  }
  if (action === 'add-actual-minutes') {
    const view = createDashboardViewModel(state, currentDate, activeUserId);
    const hour = activeActualHour(view);
    focusedCell = { collectionName: 'dayActuals', userId: activeUserId, date: currentDate, hour };
    commit(addActualMinutes(state, activeUserId, currentDate, hour, button.dataset.taskId, Number(button.dataset.minutes)));
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
  if (target.dataset.field === 'actual-item-minutes') {
    commit(
      updateActualItem(
        state,
        activeUserId,
        currentDate,
        Number(target.dataset.hour),
        Number(target.dataset.itemIndex),
        { minutes: Number(target.value) }
      )
    );
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
  if (target.dataset.field === 'actual-item-note') {
    if (event.isComposing) {
      return;
    }
    commit(
      updateActualItem(
        state,
        activeUserId,
        currentDate,
        Number(target.dataset.hour),
        Number(target.dataset.itemIndex),
        { note: target.value }
      ),
      { render: false }
    );
    return;
  }
  if (target.dataset.field === 'weekly-project-goal') {
    commit(upsertWeeklyProjectGoal(state, activeUserId, weekStart(), target.dataset.projectId, target.value), {
      render: false
    });
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
  if (!target.dataset.reviewField) return;
  commit(upsertReview(state, weekStart(), { [target.dataset.reviewField]: target.value }), {
    render: false
  });
}

function handleCompositionEnd(event) {
  const target = event.target;
  if (target.dataset.field === 'actual-item-note') {
    commit(
      updateActualItem(
        state,
        activeUserId,
        currentDate,
        Number(target.dataset.hour),
        Number(target.dataset.itemIndex),
        { note: target.value }
      ),
      { render: false }
    );
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
        if (nextAuthState.error) {
          authState = nextAuthState;
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
      countable: formData.get('countable') === 'on'
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
  authController = createAuthController({ firebaseConfig });
  root.addEventListener('click', handleClick);
  root.addEventListener('focusin', handleFocusIn);
  document.addEventListener('keydown', handleKeyDown);
  root.addEventListener('change', handleChange);
  root.addEventListener('input', handleInput);
  root.addEventListener('compositionend', handleCompositionEnd);
  root.addEventListener('submit', handleSubmit);
  root.innerHTML = '<div class="app-shell"><section class="panel">読み込み中...</section></div>';
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
