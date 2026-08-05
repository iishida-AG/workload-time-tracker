import { HOURS, getWeekStart, toDateKey } from './domain/calendar.js';
import { TASK_NATURES } from './domain/presets.js';
import {
  computeReviewMetrics,
  copyPlanToActuals,
  incrementDailyCount,
  setTimelineEntry
} from './domain/metrics.js';
import { createDashboardViewModel } from './ui/view-model.js';
import { loadState, saveState } from './state/storage.js';
import {
  addProject,
  addTask,
  hideTask,
  updateProject,
  updateTask,
  upsertReview,
  upsertWeeklyGoal
} from './state/store.js';

const natureLabels = Object.fromEntries(TASK_NATURES.map((nature) => [nature.id, nature.label]));

let state;
let root;
let currentDate;
let activeTab = 'dashboard';
let selectedTaskId = '';
let reviewMode = 'week';

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
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.target}</svg>`;
}

function todayKey() {
  return toDateKey(new Date());
}

function activeProjects() {
  return state.projects.filter((project) => project.status === 'active').sort((a, b) => a.order - b.order);
}

function sortedTasks(includeHidden = false) {
  return state.tasks
    .filter((task) => includeHidden || task.status === 'active')
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
      nextPromise: ''
    }
  );
}

function commit(nextState) {
  state = nextState;
  saveState(state);
  render();
}

function ensureSelectedTask() {
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

function entryFor(collectionName, hour) {
  return state[collectionName].find((entry) => entry.date === currentDate && entry.hour === hour);
}

function countFor(taskId, date) {
  return state.dailyCounts.find((row) => row.taskId === taskId && row.date === date)?.count ?? 0;
}

function weeklyCountFor(taskId) {
  const start = weekStart();
  const end = new Date(`${start}T00:00:00`);
  end.setDate(end.getDate() + 6);
  return state.dailyCounts
    .filter((row) => {
      const rowDate = new Date(`${row.date}T00:00:00`);
      return row.taskId === taskId && rowDate >= new Date(`${start}T00:00:00`) && rowDate <= end;
    })
    .reduce((sum, row) => sum + row.count, 0);
}

function goalFor(taskId) {
  return state.weeklyGoals.find((goal) => goal.weekStart === weekStart() && goal.taskId === taskId)?.targetCount ?? 0;
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
    </header>
    ${renderReminderStrip(view)}
  `;
}

function renderTimelineColumn(title, collectionName) {
  return `
    <div class="timeline-column">
      <div class="timeline-title">${escapeHtml(title)}</div>
      ${HOURS.map((hour) => {
        const entry = entryFor(collectionName, hour);
        const task = entry ? taskById(entry.taskId) : null;
        const project = task ? projectById(task.projectId) : null;
        return `
          <button class="timeline-cell nature-${task?.nature ?? 'empty'}" data-action="set-timeline" data-collection="${collectionName}" data-hour="${hour}">
            <span class="timeline-hour">${String(hour).padStart(2, '0')}:00</span>
            <span class="timeline-task">${task ? escapeHtml(task.name) : '未入力'}</span>
            <span class="timeline-project">${project ? escapeHtml(project.name) : 'タスクを選択'}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderTimelineBoard() {
  return `
    <section class="panel timeline-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">日次スケジュール</span>
          <h2>${escapeHtml(currentDate)}</h2>
        </div>
        <div class="toolbar">
          <label class="date-field">
            ${icon('calendar')}
            <input type="date" value="${escapeHtml(currentDate)}" data-field="current-date" />
          </label>
          <button class="primary-button" data-action="copy-plan">${icon('copy')}<span>予定通りコピー</span></button>
        </div>
      </div>
      <div class="timeline-grid">
        ${renderTimelineColumn('予定', 'dayPlans')}
        ${renderTimelineColumn('実績', 'dayActuals')}
      </div>
    </section>
  `;
}

function renderShortcutPalette(view) {
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
          <span class="shortcut-project">枠を空にする</span>
        </button>
        ${view.activeTasks
          .map((task) => {
            const project = projectById(task.projectId);
            return `
              <button class="shortcut-card nature-${task.nature} ${selectedTaskId === task.id ? 'selected' : ''}" data-action="select-task" data-task-id="${escapeHtml(task.id)}">
                <span class="shortcut-name">${escapeHtml(task.name)}</span>
                <span class="shortcut-project">${escapeHtml(project?.name ?? '')}</span>
              </button>
            `;
          })
          .join('')}
      </div>
      ${renderTaskForm('quick-task-form', 'ワンタップ追加', true)}
    </aside>
  `;
}

function renderKpiCounterPanel(view) {
  return `
    <section class="panel counter-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">週次目標と実績件数</span>
          <h2>${escapeHtml(weekStart())} 週</h2>
        </div>
      </div>
      <div class="counter-grid">
        ${view.countableTasks
          .map((task) => {
            const weekly = weeklyCountFor(task.id);
            const target = goalFor(task.id);
            const progress = target === 0 ? 0 : Math.min(100, Math.round((weekly / target) * 100));
            return `
              <article class="counter-card">
                <div>
                  <span class="task-chip nature-${task.nature}">${escapeHtml(natureLabels[task.nature])}</span>
                  <h3>${escapeHtml(task.name)}</h3>
                </div>
                <label class="goal-input">
                  <span>目標</span>
                  <input type="number" min="0" value="${target}" data-field="weekly-goal" data-task-id="${escapeHtml(task.id)}" />
                </label>
                <div class="progress-track"><span style="width:${progress}%"></span></div>
                <div class="counter-actions">
                  <div>
                    <span>週 ${weekly}</span>
                    <strong>今日 ${countFor(task.id, currentDate)}</strong>
                  </div>
                  <div class="stepper">
                    <button data-action="increment-count" data-task-id="${escapeHtml(task.id)}" data-delta="-1" aria-label="${escapeHtml(task.name)}を1件減らす">${icon('minus')}</button>
                    <button data-action="increment-count" data-task-id="${escapeHtml(task.id)}" data-delta="1" aria-label="${escapeHtml(task.name)}を1件増やす">${icon('plus')}</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderDashboard(view) {
  return `
    <div class="dashboard-layout">
      <div class="main-stack">
        ${renderTimelineBoard()}
        ${renderKpiCounterPanel(view)}
      </div>
      ${renderShortcutPalette(view)}
    </div>
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
          .sort((a, b) => a.order - b.order)
          .map((project) => {
            const tasks = state.tasks.filter((task) => task.projectId === project.id).sort((a, b) => a.order - b.order);
            return `
              <div class="project-block">
                <div class="project-title-row">
                  <input class="project-name-input" value="${escapeHtml(project.name)}" data-project-field="name" data-project-id="${escapeHtml(project.id)}" />
                  <span>${tasks.length}件</span>
                </div>
                <div class="task-table">
                  ${tasks
                    .map(
                      (task) => `
                        <article class="task-row ${task.status === 'hidden' ? 'muted' : ''}">
                          <input value="${escapeHtml(task.name)}" data-task-field="name" data-task-id="${escapeHtml(task.id)}" />
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
  const metrics = computeReviewMetrics(state, periodStart, { periodMode: reviewMode });
  const review = currentReview();
  return `
    <div class="review-layout">
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
        </div>
      </section>
    </div>
  `;
}

function render() {
  ensureSelectedTask();
  const view = createDashboardViewModel(state, currentDate);
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
  if (action === 'select-task') {
    selectedTaskId = button.dataset.taskId;
    render();
  }
  if (action === 'set-timeline') {
    commit(
      setTimelineEntry(
        state,
        button.dataset.collection,
        currentDate,
        Number(button.dataset.hour),
        selectedTaskId
      )
    );
  }
  if (action === 'copy-plan') {
    commit(copyPlanToActuals(state, currentDate));
  }
  if (action === 'increment-count') {
    commit(incrementDailyCount(state, currentDate, button.dataset.taskId, Number(button.dataset.delta)));
  }
  if (action === 'hide-task') {
    commit(hideTask(state, button.dataset.taskId));
  }
  if (action === 'show-task') {
    commit(updateTask(state, button.dataset.taskId, { status: 'active' }));
  }
  if (action === 'review-mode') {
    reviewMode = button.dataset.mode;
    render();
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.dataset.field === 'current-date') {
    currentDate = target.value;
    render();
  }
  if (target.dataset.field === 'weekly-goal') {
    commit(upsertWeeklyGoal(state, weekStart(), target.dataset.taskId, Number(target.value)));
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
  if (!target.dataset.reviewField) return;
  state = upsertReview(state, weekStart(), { [target.dataset.reviewField]: target.value });
  saveState(state);
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
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

function boot() {
  root = document.getElementById('root');
  currentDate = todayKey();
  state = loadState(localStorage, currentDate);
  selectedTaskId = sortedTasks()[0]?.id ?? '';
  root.addEventListener('click', handleClick);
  root.addEventListener('change', handleChange);
  root.addEventListener('input', handleInput);
  root.addEventListener('submit', handleSubmit);
  render();
}

if (typeof document !== 'undefined') {
  boot();
}
