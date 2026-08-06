import { getWeekStart } from '../domain/calendar.js';
import {
  computeReviewMetrics,
  formatDailyCategorySummaryText,
  formatDailyScheduleText,
  formatActualItemRanges,
  getActualItems,
  getImprovementPromiseForWeek
} from '../domain/metrics.js';
import { getPartnerUserId } from '../domain/users.js';
import { getTimelineSetting } from '../state/store.js';

function formatPercent(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function reportHourLabel(hour) {
  return `${hour}時～${hour + 1}時`;
}

function formatReportItem(task, item, range) {
  const taskName = task?.name ?? '未入力';
  const note = item.note?.trim();
  const body = note ? `${taskName}、${note}` : taskName;
  return range ? `${range} ${body}` : body;
}

function formatReportBusinessLines(state, userId, date, startHour, endHour) {
  const tasks = new Map((state.tasks ?? []).map((task) => [task.id, task]));
  return Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
    .map((hour) => {
      const entry = (state.dayActuals ?? []).find(
        (row) => (row.userId ?? 'ishida') === userId && row.date === date && row.hour === hour
      );
      const items = getActualItems(entry);
      if (items.length === 0) return `${reportHourLabel(hour)}　未入力`;
      const ranges = items.length > 1 ? formatActualItemRanges(hour, items) : [];
      const text = items
        .map((item, itemIndex) => formatReportItem(tasks.get(item.taskId), item, ranges[itemIndex]))
        .join('、');
      return `${reportHourLabel(hour)}　${text}`;
    })
    .join('\n');
}

function buildIshidaDailyReport(businessLines) {
  return `お疲れ様です。
本日の日報になります。
ご確認お願い致します。


今日の目標(達成数値)


${businessLines}


良かったこと


課題/解決策


明日の目標
`;
}

function buildTanoueDailyReport(businessLines) {
  return `お疲れ様です。
下記、本日の日報でございます。


ご確認の程、よろしくお願いいたします。
―――――――――――――――――
■今日の目標


達成状況


■今日の業務内容
${businessLines}


■よかったこと


■課題/解決策


■気付き


■明日の目標


■今日の定量目標達成率


■明日の定量目標


―――――――――――――――――


お忙しいところ恐縮ですが、お願いいたします。`;
}

function buildDailyReportText(state, userId, date, timelineSetting) {
  const businessLines = formatReportBusinessLines(
    state,
    userId,
    date,
    timelineSetting.startHour,
    timelineSetting.endHour
  );
  return userId === 'tanoue' ? buildTanoueDailyReport(businessLines) : buildIshidaDailyReport(businessLines);
}

export function createDashboardViewModel(state, date, userId = 'ishida') {
  const weekStart = getWeekStart(date);
  const partnerUserId = getPartnerUserId(userId);
  const timelineSetting = getTimelineSetting(state, userId, date);
  const partnerTimelineSetting = getTimelineSetting(state, partnerUserId, date);
  const metrics = computeReviewMetrics(state, weekStart, { userId });
  const dailyReportText = buildDailyReportText(state, userId, date, timelineSetting);
  const partnerDailyReportText = buildDailyReportText(state, partnerUserId, date, partnerTimelineSetting);
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
    actualCopyText: dailyReportText,
    dailyReportText,
    planCategoryCopyText: formatDailyCategorySummaryText(state, 'dayPlans', userId, date),
    actualCategoryCopyText: formatDailyCategorySummaryText(state, 'dayActuals', userId, date),
    partnerPlanCopyText: formatDailyScheduleText(
      state,
      'dayPlans',
      partnerUserId,
      date,
      partnerTimelineSetting.startHour,
      partnerTimelineSetting.endHour
    ),
    partnerPlanCategoryCopyText: formatDailyCategorySummaryText(state, 'dayPlans', partnerUserId, date),
    partnerActualCategoryCopyText: formatDailyCategorySummaryText(state, 'dayActuals', partnerUserId, date),
    partnerActualCopyText: partnerDailyReportText,
    partnerDailyReportText,
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
