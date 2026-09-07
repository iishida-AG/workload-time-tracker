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
  const usedTaskIds = new Set(period.goalProgress.rows.map((row) => row.taskId));
  const addDisabled = view.countableTasks.every((task) => usedTaskIds.has(task.id));
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
        ${renderIconButton(config.addGoalAction, '定量目標を追加', icon, addDisabled ? 'disabled' : '')}
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

function signedHours(value) {
  const hours = Number(value) || 0;
  return `${hours > 0 ? '+' : ''}${hours}h`;
}

function differenceClass(minutes) {
  if (minutes > 0) return 'over';
  if (minutes < 0) return 'under';
  return 'same';
}

function renderActualTimePie(rows, totalHours) {
  if (rows.length === 0) return '';
  const colors = ['#2364d2', '#1f9d6a', '#f59e0b', '#7c3aed', '#dc5265', '#0e91a8'];
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += row.ratio;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `<div class="review-time-pie-block">
    <div class="review-time-pie" style="background:conic-gradient(${stops.join(', ')})" role="img" aria-label="実績工数の大分類別割合">
      <span><strong>${totalHours}h</strong><small>実績</small></span>
    </div>
    <div class="review-time-legend">
      ${rows.map((row, index) => `<div>
        <i style="background:${colors[index % colors.length]}"></i>
        <span>${escapeHtml(row.projectName)}</span>
        <strong>${row.hours}h</strong>
        <em>${row.ratio}%</em>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderTimeBars(rows) {
  if (rows.length === 0) return '';
  const maxMinutes = Math.max(
    ...rows.flatMap((row) => [row.plannedMinutes, row.actualMinutes]),
    1
  );
  return `<div class="review-time-breakdown">
    ${rows.map((project) => `<div class="review-time-project">
      <div class="review-time-line">
        <strong>${escapeHtml(project.projectName)}</strong>
        <span>予定 ${project.plannedHours}h / 実績 ${project.actualHours}h / <b class="${differenceClass(project.diffMinutes)}">${signedHours(project.diffHours)}</b></span>
      </div>
      <div class="review-paired-bars" aria-hidden="true">
        <div><em>予定</em><i><span class="planned" style="width:${Math.min(100, (project.plannedMinutes / maxMinutes) * 100)}%"></span></i></div>
        <div><em>実績</em><i><span class="actual" style="width:${Math.min(100, (project.actualMinutes / maxMinutes) * 100)}%"></span></i></div>
      </div>
      <div class="review-time-task-list">
        ${(project.tasks ?? []).map((task) => {
          const taskMax = Math.max(project.plannedMinutes, project.actualMinutes, 1);
          return `<div class="review-time-task">
            <div class="review-time-line">
              <span>${escapeHtml(task.taskName)}</span>
              <span>予定 ${task.plannedHours}h / 実績 ${task.actualHours}h / <b class="${differenceClass(task.diffMinutes)}">${signedHours(task.diffHours)}</b></span>
            </div>
            <div class="review-paired-bars compact" aria-hidden="true">
              <div><em>予定</em><i><span class="planned" style="width:${Math.min(100, (task.plannedMinutes / taskMax) * 100)}%"></span></i></div>
              <div><em>実績</em><i><span class="actual" style="width:${Math.min(100, (task.actualMinutes / taskMax) * 100)}%"></span></i></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('')}
  </div>`;
}

function renderTimeAnalysisCard(view) {
  const metrics = view.week.metrics;
  const empty = metrics.projectRows.length === 0 && metrics.planActualRows.length === 0;
  return `<section class="panel review-card" data-review-card="analysis">
    <div class="panel-heading compact"><div><span class="section-kicker">工数分析</span><h2>予定と実績</h2></div></div>
    ${empty
      ? '<p class="empty-state compact">選択した週の予定・実績工数はまだありません</p>'
      : `<div class="review-time-grid${metrics.projectRows.length === 0 ? ' no-pie' : ''}">
          ${renderActualTimePie(metrics.projectRows, metrics.totalActualHours)}
          ${renderTimeBars(metrics.planActualRows)}
        </div>`}
  </section>`;
}

function renderGoodPointsCard(view) {
  return `<section class="panel review-card" data-review-card="good-points">
    <div class="panel-heading compact"><div><span class="section-kicker">今週の振り返り</span><h2>良かった点</h2></div></div>
    <label class="review-wide-field">
      <span>良かった点</span>
      <textarea data-review-field="goodPoints" placeholder="成果につながった行動や続けたいこと">${escapeHtml(view.review.goodPoints)}</textarea>
    </label>
  </section>`;
}

function renderReflectionCard(view) {
  return `<section class="panel review-card" data-review-card="reflection">
    <div class="panel-heading compact"><div><span class="section-kicker">振り返り</span><h2>反省点と改善点</h2></div></div>
    <div class="review-reflection-grid">
      ${Array.from({ length: 3 }, (_, index) => `<div class="review-reflection-row">
        <label>
          <span>反省点 ${index + 1}</span>
          <textarea data-review-field="reflections" data-review-index="${index}" aria-label="反省点${index + 1}" placeholder="うまくいかなかったこと">${escapeHtml(view.review.reflections[index])}</textarea>
        </label>
        <label>
          <span>改善点 ${index + 1}</span>
          <textarea data-review-field="improvements" data-review-index="${index}" aria-label="改善点${index + 1}" placeholder="次に変える行動">${escapeHtml(view.review.improvements[index])}</textarea>
        </label>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderNextActionsCard(view, icon) {
  const rows = view.nextActionRows.length > 0
    ? view.nextActionRows
    : [{ id: `${view.selectedWeek.start}-action-draft`, text: '' }];
  return `<section class="panel review-card" data-review-card="next-actions">
    <div class="panel-heading compact review-column-heading">
      <div><span class="section-kicker">次のアクション</span><h2>今週やるべきこと</h2></div>
      ${renderIconButton('add-next-action', '次のアクションを追加', icon)}
    </div>
    <div class="next-action-list">
      ${rows.map((row) => `<div class="next-action-row" data-action-row-id="${escapeHtml(row.id)}">
        <span class="review-bullet" aria-hidden="true">・</span>
        <input type="text" value="${escapeHtml(row.text)}" data-field="next-action-row" aria-label="次のアクション" placeholder="今週やるべきこと" />
        <button type="button" class="icon-button danger-icon" data-action="delete-next-action" aria-label="次のアクションを削除" title="次のアクションを削除">${icon('trash')}</button>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderDiscussionCard(view) {
  return `<section class="panel review-card" data-review-card="discussion">
    <div class="panel-heading compact"><div><span class="section-kicker">共有事項</span><h2>話し合いたいこと</h2></div></div>
    <label class="review-wide-field">
      <span>話し合いたいこと</span>
      <textarea class="review-discussion-field" data-review-field="discussionItems" placeholder="相談したいことや意思決定が必要なこと">${escapeHtml(view.review.discussionItems)}</textarea>
    </label>
  </section>`;
}

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
