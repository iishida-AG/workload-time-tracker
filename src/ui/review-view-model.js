import {
  getFiscalQuarter,
  getFiscalTermQuarters,
  getOperationalMonth,
  getOperationalMonthWeeks,
  getWeekStart
} from '../domain/calendar.js';
import { computeGoalProgress, computeReviewPeriodMetrics } from '../domain/metrics.js';

function belongsToUser(row, userId) {
  return (row.userId ?? 'ishida') === userId;
}

function selectedByStart(rows, requestedStart, fallbackStart) {
  return rows.find((row) => row.start === requestedStart)
    ?? rows.find((row) => row.start === fallbackStart)
    ?? rows[0];
}

function validMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '');
}

function itemsForPeriod(rows, userId, periodField, periodStart) {
  return (rows ?? []).find(
    (row) => belongsToUser(row, userId) && row[periodField] === periodStart
  )?.items ?? [];
}

function goalsForPeriod(rows, userId, periodField, periodStart) {
  return (rows ?? []).filter(
    (row) => belongsToUser(row, userId) && row[periodField] === periodStart
  );
}

function normalizeThreeRows(rows, fallback = '') {
  const values = Array.isArray(rows) ? rows : [fallback];
  return Array.from({ length: 3 }, (_, index) => String(values[index] ?? ''));
}

function reviewForWeek(state, userId, weekStart) {
  const row = (state.weeklyReviews ?? []).find(
    (review) => belongsToUser(review, userId) && review.weekStart === weekStart
  );
  return {
    userId,
    weekStart,
    goodPoints: String(row?.goodPoints ?? row?.goalReflection ?? ''),
    reflections: normalizeThreeRows(row?.reflections, row?.overtimeCause ?? ''),
    improvements: normalizeThreeRows(row?.improvements),
    discussionItems: String(row?.discussionItems ?? ''),
    goalReflection: String(row?.goalReflection ?? ''),
    overtimeCause: String(row?.overtimeCause ?? ''),
    nextPromise: String(row?.nextPromise ?? '')
  };
}

function nextActionsForWeek(state, userId, weekStart) {
  const todo = (state.weeklyTodos ?? []).find(
    (row) => belongsToUser(row, userId) && row.weekStart === weekStart
  );
  return String(todo?.todoText ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-・]\s*/, '').trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${weekStart}-action-${index}`,
      text,
      checked: Boolean(todo?.checkedItems?.[index])
    }));
}

function activeCountableTasks(state) {
  const projects = new Map(
    (state.projects ?? [])
      .filter((project) => project.status === 'active')
      .map((project) => [project.id, project])
  );
  return (state.tasks ?? [])
    .filter((task) => task.status === 'active' && task.countable && projects.has(task.projectId))
    .map((task) => ({ ...task, projectName: projects.get(task.projectId).name }))
    .sort((left, right) => {
      const projectOrder = projects.get(left.projectId).order - projects.get(right.projectId).order;
      return projectOrder || left.order - right.order;
    });
}

export function createReviewViewModel(state, options) {
  const { userId, currentDate } = options;
  const quarters = getFiscalTermQuarters(currentDate);
  const currentQuarter = getFiscalQuarter(currentDate);
  const selectedQuarter = selectedByStart(
    quarters,
    options.quarterStart,
    currentQuarter.start
  );
  const monthKey = validMonthKey(options.monthKey)
    ? options.monthKey
    : getOperationalMonth(currentDate);
  const weeks = getOperationalMonthWeeks(monthKey);
  const selectedWeek = selectedByStart(
    weeks,
    options.weekStart,
    getWeekStart(currentDate)
  );
  const quarterGoals = goalsForPeriod(
    state.quarterGoals,
    userId,
    'quarterStart',
    selectedQuarter.start
  );
  const weeklyGoals = goalsForPeriod(
    state.weeklyGoals,
    userId,
    'weekStart',
    selectedWeek.start
  );

  return {
    userId,
    quarters,
    selectedQuarter,
    monthKey,
    weeks,
    selectedWeek,
    countableTasks: activeCountableTasks(state),
    quarter: {
      qualitativeItems: itemsForPeriod(
        state.quarterGoalNotes,
        userId,
        'quarterStart',
        selectedQuarter.start
      ),
      goalProgress: computeGoalProgress(state, {
        userId,
        startDate: selectedQuarter.start,
        endDate: selectedQuarter.end,
        goals: quarterGoals
      })
    },
    week: {
      qualitativeItems: itemsForPeriod(
        state.weeklyGoalNotes,
        userId,
        'weekStart',
        selectedWeek.start
      ),
      goalProgress: computeGoalProgress(state, {
        userId,
        startDate: selectedWeek.start,
        endDate: selectedWeek.end,
        goals: weeklyGoals
      }),
      metrics: computeReviewPeriodMetrics(state, {
        userId,
        startDate: selectedWeek.start,
        endDate: selectedWeek.end
      })
    },
    review: reviewForWeek(state, userId, selectedWeek.start),
    nextActionRows: nextActionsForWeek(state, userId, selectedWeek.start)
  };
}
