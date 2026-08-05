import { getWeekStart } from '../domain/calendar.js';
import { computeReviewMetrics, getImprovementPromiseForWeek } from '../domain/metrics.js';

function formatPercent(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function createDashboardViewModel(state, date) {
  const weekStart = getWeekStart(date);
  const metrics = computeReviewMetrics(state, weekStart);
  const activeTasks = state.tasks
    .filter((task) => task.status === 'active')
    .sort((a, b) => a.order - b.order);
  const countableTasks = activeTasks.filter((task) => task.countable);
  const goalProgress =
    metrics.goalRows.length === 0
      ? 0
      : Math.round(
          metrics.goalRows.reduce((sum, row) => sum + row.progressRate, 0) / metrics.goalRows.length
        );

  return {
    weekStart,
    metrics,
    activeTasks,
    countableTasks,
    improvementPromise: getImprovementPromiseForWeek(state, weekStart),
    kpis: [
      { label: '今週の実働', value: `${metrics.totalActualHours}h` },
      { label: 'キャパ達成率', value: formatPercent(metrics.capacityRate) },
      { label: '件数進捗', value: formatPercent(goalProgress) }
    ]
  };
}
