import { getWeekStart } from '../domain/calendar.js';
import {
  computeReviewMetrics,
  formatDailyCategorySummaryText,
  formatDailyScheduleText,
  getImprovementPromiseForWeek
} from '../domain/metrics.js?v=20260817-business-tool-plan-prompt-v1';
import { getPartnerUserId } from '../domain/users.js';
import { getTimelineSetting } from '../state/store.js';

const labels = {
  unentered: '\u672a\u5165\u529b',
  unset: '\u672a\u8a2d\u5b9a',
  hour: '\u6642',
  minute: '\u5206',
  range: '\uff5e',
  space: '\u3000',
  ishidaGreeting: '\u304a\u75b2\u308c\u69d8\u3067\u3059\u3002\n\u672c\u65e5\u306e\u65e5\u5831\u306b\u306a\u308a\u307e\u3059\u3002\n\u3054\u78ba\u8a8d\u304a\u9858\u3044\u81f4\u3057\u307e\u3059\u3002',
  todayGoal: '\u4eca\u65e5\u306e\u76ee\u6a19(\u9054\u6210\u6570\u5024)',
  good: '\u826f\u304b\u3063\u305f\u3053\u3068',
  issue: '\u8ab2\u984c/\u89e3\u6c7a\u7b56',
  tomorrowGoal: '\u660e\u65e5\u306e\u76ee\u6a19',
  tanoueGreeting: '\u304a\u75b2\u308c\u69d8\u3067\u3059\u3002\n\u4e0b\u8a18\u3001\u672c\u65e5\u306e\u65e5\u5831\u3067\u3054\u3056\u3044\u307e\u3059\u3002\n\n\u3054\u78ba\u8a8d\u306e\u7a0b\u3001\u3088\u308d\u3057\u304f\u304a\u9858\u3044\u3044\u305f\u3057\u307e\u3059\u3002',
  divider: '\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015',
  tanoueTodayGoal: '\u25a0\u4eca\u65e5\u306e\u76ee\u6a19',
  status: '\u9054\u6210\u72b6\u6cc1',
  business: '\u25a0\u4eca\u65e5\u306e\u696d\u52d9\u5185\u5bb9',
  tanoueGood: '\u25a0\u3088\u304b\u3063\u305f\u3053\u3068',
  tanoueIssue: '\u25a0\u8ab2\u984c/\u89e3\u6c7a\u7b56',
  awareness: '\u25a0\u6c17\u4ed8\u304d',
  tanoueTomorrowGoal: '\u25a0\u660e\u65e5\u306e\u76ee\u6a19',
  todayQuant: '\u25a0\u4eca\u65e5\u306e\u5b9a\u91cf\u76ee\u6a19\u9054\u6210\u7387',
  tomorrowQuant: '\u25a0\u660e\u65e5\u306e\u5b9a\u91cf\u76ee\u6a19',
  closing: '\u304a\u5fd9\u3057\u3044\u3068\u3053\u308d\u6050\u7e2e\u3067\u3059\u304c\u3001\u304a\u9858\u3044\u3044\u305f\u3057\u307e\u3059\u3002',
  weeklyHours: '\u4eca\u9031\u306e\u5b9f\u50cd',
  capacityRate: '\u30ad\u30e3\u30d1\u9054\u6210\u7387',
  countProgress: '\u4ef6\u6570\u9032\u6357'
};

function formatPercent(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatDailyReportSchedule(state, userId, date, timelineSetting) {
  return formatDailyScheduleText(
    state,
    'dayActuals',
    userId,
    date,
    timelineSetting.startHour,
    timelineSetting.endHour
  );
}

function buildIshidaDailyReport(scheduleText) {
  return `${labels.ishidaGreeting}\n\n${labels.todayGoal}\n\n${scheduleText}\n\n${labels.good}\n\n${labels.issue}\n\n${labels.tomorrowGoal}`;
}

function buildTanoueDailyReport(scheduleText) {
  return `${labels.tanoueGreeting}\n${labels.divider}\n${labels.tanoueTodayGoal}\n\n${labels.status}\n\n${labels.business}\n${scheduleText}\n\n${labels.tanoueGood}\n\n${labels.tanoueIssue}\n\n${labels.awareness}\n\n${labels.tanoueTomorrowGoal}\n\n${labels.todayQuant}\n\n${labels.tomorrowQuant}\n\n${labels.divider}\n\n${labels.closing}`;
}

function buildDailyReportText(state, userId, date, timelineSetting) {
  const scheduleText = formatDailyReportSchedule(state, userId, date, timelineSetting);
  return userId === 'tanoue' ? buildTanoueDailyReport(scheduleText) : buildIshidaDailyReport(scheduleText);
}

function isShortcutVisibleForUser(task, userId) {
  const visibility = task.shortcutVisibility ?? 'both';
  return visibility === 'both' || visibility === userId;
}

export function createDashboardViewModel(state, date, userId = 'ishida') {
  const weekStart = getWeekStart(date);
  const partnerUserId = getPartnerUserId(userId);
  const timelineSetting = getTimelineSetting(state, userId, date);
  const partnerTimelineSetting = getTimelineSetting(state, partnerUserId, date);
  const metrics = computeReviewMetrics(state, weekStart, { userId });
  const dailyReportText = buildDailyReportText(state, userId, date, timelineSetting);
  const partnerDailyReportText = buildDailyReportText(state, partnerUserId, date, partnerTimelineSetting);
  const activeProjectIds = new Set((state.projects ?? []).filter((project) => project.status === 'active').map((project) => project.id));
  const activeTasks = state.tasks
    .filter((task) => task.status === 'active' && activeProjectIds.has(task.projectId) && isShortcutVisibleForUser(task, userId))
    .sort((a, b) => a.order - b.order);
  const countableTasks = activeTasks.filter((task) => task.countable);
  const goalProgress = metrics.goalRows.length === 0 ? 0 : Math.round(metrics.goalRows.reduce((sum, row) => sum + row.progressRate, 0) / metrics.goalRows.length);

  return {
    userId,
    partnerUserId,
    weekStart,
    metrics,
    timelineSetting,
    partnerTimelineSetting,
    planCopyText: formatDailyScheduleText(state, 'dayPlans', userId, date, timelineSetting.startHour, timelineSetting.endHour),
    actualCopyText: dailyReportText,
    dailyReportText,
    planCategoryCopyText: formatDailyCategorySummaryText(state, 'dayPlans', userId, date),
    actualCategoryCopyText: formatDailyCategorySummaryText(state, 'dayActuals', userId, date),
    partnerPlanCopyText: formatDailyScheduleText(state, 'dayPlans', partnerUserId, date, partnerTimelineSetting.startHour, partnerTimelineSetting.endHour),
    partnerPlanCategoryCopyText: formatDailyCategorySummaryText(state, 'dayPlans', partnerUserId, date),
    partnerActualCategoryCopyText: formatDailyCategorySummaryText(state, 'dayActuals', partnerUserId, date),
    partnerActualCopyText: partnerDailyReportText,
    partnerDailyReportText,
    activeTasks,
    countableTasks,
    improvementPromise: getImprovementPromiseForWeek(state, weekStart),
    kpis: [
      { label: labels.weeklyHours, value: `${metrics.totalActualHours}h` },
      { label: labels.capacityRate, value: formatPercent(metrics.capacityRate) },
      { label: labels.countProgress, value: formatPercent(goalProgress) }
    ]
  };
}
