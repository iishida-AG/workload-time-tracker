import { getWeekStart } from '../domain/calendar.js';
import {
  computeReviewMetrics,
  formatDailyScheduleText,
  getImprovementPromiseForWeek
} from '../domain/metrics.js';
import { getPartnerUserId } from '../domain/users.js';
import { getTimelineSetting } from '../state/store.js';

function formatPercent(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function createDashboardViewModel(state, date, userId = 'ishida') {
  const weekStart = getWeekStart(date);
  const partnerUserId = getPartnerUserId(userId);
  const timelineSetting = getTimelineSetting(state, userId, date);
  const partnerTimelineSetting = getTimelineSetting(state, partnerUserId, date);
  const metrics = computeReviewMetrics(state, weekStart, { userId });
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
    userId,
    partnerUserId,
    weekStart,
    metrics,
    timelineSetting,
    partnerTimelineSetting,
    planCopyText: formatDailyScheduleText(
      state,
      'dayPlans',
      userId,
      date,
      timelineSetting.startHour,
      timelineSetting.endHour
    ),
    actualCopyText: formatDailyScheduleText(
      state,
      'dayActuals',
      userId,
      date,
      timelineSetting.startHour,
      timelineSetting.endHour
    ),
    partnerPlanCopyText: formatDailyScheduleText(
      state,
      'dayPlans',
      partnerUserId,
      date,
      partnerTimelineSetting.startHour,
      partnerTimelineSetting.endHour
    ),
    partnerActualCopyText: formatDailyScheduleText(
      state,
      'dayActuals',
      partnerUserId,
      date,
      partnerTimelineSetting.startHour,
      partnerTimelineSetting.endHour
    ),
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
