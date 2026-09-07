function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderIconButton(action, label, icon, attributes = '') {
  return `<button type="button" class="icon-button" data-action="${action}" ${attributes} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon('plus')}</button>`;
}

function renderTabs(rows, selectedStart, action, startAttribute) {
  return `<div class="review-tabs" role="tablist">
    ${rows.map((row) => {
      const selected = row.start === selectedStart;
      return `<button type="button" role="tab" data-action="${action}" ${startAttribute}="${escapeHtml(row.start)}" aria-selected="${selected}" class="review-tab${selected ? ' active' : ''}">${escapeHtml(row.label)}</button>`;
    }).join('')}
  </div>`;
}

function renderQualitativeItems(items, field, deleteAction, icon) {
  if (items.length === 0) {
    return '<p class="empty-state compact">定性目標はまだありません</p>';
  }
  return `<div class="review-note-list">
    ${items.map((item) => `<div class="review-note-row">
      <span class="review-bullet" aria-hidden="true">・</span>
      <input type="text" value="${escapeHtml(item.text)}" data-field="${field}" data-item-id="${escapeHtml(item.id)}" aria-label="定性目標" />
      <button type="button" class="icon-button danger-icon" data-action="${deleteAction}" data-item-id="${escapeHtml(item.id)}" aria-label="定性目標を削除" title="定性目標を削除">${icon('trash')}</button>
    </div>`).join('')}
  </div>`;
}

function renderTaskOptions(tasks, selectedTaskId, usedTaskIds) {
  const hasSelectedTask = tasks.some((task) => task.id === selectedTaskId);
  const unavailableOption = hasSelectedTask || !selectedTaskId
    ? ''
    : `<option value="${escapeHtml(selectedTaskId)}" selected>未設定タスク</option>`;
  return `${unavailableOption}${tasks.map((task) => {
    const selected = task.id === selectedTaskId;
    const disabled = usedTaskIds.has(task.id) && !selected;
    const label = task.projectName ? `${task.projectName} / ${task.name}` : task.name;
    return `<option value="${escapeHtml(task.id)}" ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
  }).join('')}`;
}

function renderGoalRows(view, progress, config, icon) {
  const usedTaskIds = new Set(progress.rows.map((row) => row.taskId));
  if (progress.rows.length === 0) {
    return '<p class="empty-state compact">定量目標はまだありません</p>';
  }
  return `<div class="review-target-list">
    ${progress.rows.map((row) => `<div class="review-target-row" data-goal-row data-task-id="${escapeHtml(row.taskId)}">
      <select data-field="${config.taskField}" data-task-id="${escapeHtml(row.taskId)}" aria-label="定量目標の小分類">
        ${renderTaskOptions(view.countableTasks, row.taskId, usedTaskIds)}
      </select>
      <label class="review-target-input">
        <span>目標</span>
        <input type="number" min="0" step="1" value="${row.targetCount}" data-field="${config.targetField}" data-task-id="${escapeHtml(row.taskId)}" />
      </label>
      <span class="review-target-actual">${row.actualCount}/${row.targetCount}件</span>
      <button type="button" class="icon-button danger-icon" data-action="${config.deleteAction}" data-task-id="${escapeHtml(row.taskId)}" aria-label="定量目標を削除" title="定量目標を削除">${icon('trash')}</button>
    </div>`).join('')}
  </div>`;
}

function renderProgressRows(progress) {
  if (progress.rows.length === 0) {
    return '<p class="empty-state compact">達成率はまだありません</p>';
  }
  return `<div class="review-progress-list">
    ${progress.rows.map((row) => {
      const width = Math.min(100, Math.max(0, row.progressRate));
      return `<div class="review-progress-row">
        <div><span>${escapeHtml(row.taskName)}</span><strong>${row.actualCount}/${row.targetCount}件 (${row.progressRate}%)</strong></div>
        <div class="review-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><span style="width:${width}%"></span></div>
      </div>`;
    }).join('')}
    <div class="review-progress-total">
      <span>合計</span>
      <strong>${progress.totalActualCount}/${progress.totalTargetCount}件 (${progress.totalProgressRate}%)</strong>
    </div>
  </div>`;
}

function renderGoalColumns(view, period, config, icon) {
  return `<div class="review-goal-grid">
    <div class="review-goal-column">
      <div class="review-column-heading">
        <h3>定性目標</h3>
        ${renderIconButton(config.addNoteAction, '定性目標を追加', icon)}
      </div>
      ${renderQualitativeItems(period.qualitativeItems, config.noteField, config.deleteNoteAction, icon)}
    </div>
    <div class="review-goal-column">
      <div class="review-column-heading">
        <h3>定量目標</h3>
        ${renderIconButton(config.addGoalAction, '定量目標を追加', icon)}
      </div>
      ${renderGoalRows(view, period.goalProgress, config, icon)}
    </div>
    <div class="review-goal-column review-progress-column">
      <div class="review-column-heading"><h3>達成率</h3></div>
      ${renderProgressRows(period.goalProgress)}
    </div>
  </div>`;
}

function renderQuarterGoalCard(view, icon) {
  const config = {
    noteField: 'quarter-note',
    taskField: 'quarter-goal-task',
    targetField: 'quarter-target',
    addNoteAction: 'add-quarter-note',
    deleteNoteAction: 'delete-quarter-note',
    addGoalAction: 'add-quarter-goal',
    deleteAction: 'delete-quarter-goal'
  };
  return `<section class="panel review-card review-goal-card" data-review-card="quarter">
    <div class="panel-heading review-card-heading">
      <div>
        <span class="section-kicker">クウォーター目標</span>
        <h2>${escapeHtml(view.selectedQuarter.label)}</h2>
        <p>${escapeHtml(view.selectedQuarter.start)} から ${escapeHtml(view.selectedQuarter.end)}</p>
      </div>
      ${renderTabs(view.quarters, view.selectedQuarter.start, 'select-quarter', 'data-quarter-start')}
    </div>
    ${renderGoalColumns(view, view.quarter, config, icon)}
  </section>`;
}

function renderWeeklyGoalCard(view, icon) {
  const config = {
    noteField: 'week-note',
    taskField: 'weekly-goal-task',
    targetField: 'weekly-task-target',
    addNoteAction: 'add-week-note',
    deleteNoteAction: 'delete-week-note',
    addGoalAction: 'add-weekly-goal',
    deleteAction: 'delete-weekly-goal'
  };
  return `<section class="panel review-card review-goal-card" data-review-card="week">
    <div class="panel-heading review-card-heading">
      <div>
        <span class="section-kicker">週次目標</span>
        <h2>${escapeHtml(view.selectedWeek.label)}</h2>
        <p>${escapeHtml(view.selectedWeek.start)} から ${escapeHtml(view.selectedWeek.end)}</p>
      </div>
      <label class="review-month-picker"><span>対象月</span><input type="month" value="${escapeHtml(view.monthKey)}" data-field="review-month" /></label>
    </div>
    ${renderTabs(view.weeks, view.selectedWeek.start, 'select-review-week', 'data-week-start')}
    ${renderGoalColumns(view, view.week, config, icon)}
  </section>`;
}

function renderCardShell(key, kicker, title) {
  return `<section class="panel review-card" data-review-card="${key}">
    <div class="panel-heading compact"><div><span class="section-kicker">${kicker}</span><h2>${title}</h2></div></div>
  </section>`;
}

function renderTimeAnalysisCard() {
  return renderCardShell('analysis', '工数分析', '予定と実績');
}

function renderGoodPointsCard() {
  return renderCardShell('good-points', '今週の振り返り', '良かった点');
}

function renderReflectionCard() {
  return renderCardShell('reflection', '振り返り', '反省点と改善点');
}

function renderNextActionsCard() {
  return renderCardShell('next-actions', '次のアクション', '今週やるべきこと');
}

function renderDiscussionCard() {
  return renderCardShell('discussion', '共有事項', '話し合いたいこと');
}

export function renderReviewPage(view, { icon }) {
  return `<div class="review-layout review-v2">
    ${renderQuarterGoalCard(view, icon)}
    ${renderWeeklyGoalCard(view, icon)}
    ${renderTimeAnalysisCard(view)}
    ${renderGoodPointsCard(view)}
    ${renderReflectionCard(view)}
    ${renderNextActionsCard(view)}
    ${renderDiscussionCard(view)}
  </div>`;
}
