import { addDays, getMonthDates, getWeekDates, WEEK_CAPACITY_HOURS } from './calendar.js';

const zeroNatureHours = () => ({ core: 0, admin: 0, investment: 0 });

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function taskById(tasks) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function entryKey(entry) {
  return `${entry.date}-${entry.hour}`;
}

function withinDates(entry, dates) {
  return dates.has(entry.date);
}

export function copyPlanToActuals(state, date) {
  const copiedPlans = state.dayPlans
    .filter((entry) => entry.date === date)
    .map((entry) => ({ date: entry.date, hour: entry.hour, taskId: entry.taskId, note: entry.note }))
    .map((entry) => {
      const clean = { date: entry.date, hour: entry.hour, taskId: entry.taskId };
      if (entry.note) clean.note = entry.note;
      return clean;
    });

  return {
    ...state,
    dayActuals: [...state.dayActuals.filter((entry) => entry.date !== date), ...copiedPlans]
  };
}

export function incrementDailyCount(state, date, taskId, delta) {
  let found = false;
  const dailyCounts = state.dailyCounts.map((row) => {
    if (row.date !== date || row.taskId !== taskId) {
      return row;
    }
    found = true;
    return { ...row, count: Math.max(0, row.count + delta) };
  });

  if (!found) {
    dailyCounts.push({ date, taskId, count: Math.max(0, delta) });
  }

  return { ...state, dailyCounts };
}

export function setTimelineEntry(state, collectionName, date, hour, taskId) {
  const entries = state[collectionName].filter((entry) => !(entry.date === date && entry.hour === hour));
  if (taskId) {
    entries.push({ date, hour, taskId });
  }
  return { ...state, [collectionName]: entries };
}

export function computeReviewMetrics(state, periodStart, options = {}) {
  const periodMode = options.periodMode ?? 'week';
  const dates = new Set(periodMode === 'month' ? getMonthDates(periodStart.slice(0, 7)) : getWeekDates(periodStart));
  const tasks = taskById(state.tasks);
  const actuals = state.dayActuals.filter((entry) => withinDates(entry, dates));
  const plans = state.dayPlans.filter((entry) => withinDates(entry, dates));
  const totalActualHours = actuals.length;
  const capacityHours =
    periodMode === 'month' ? (dates.size / 7) * WEEK_CAPACITY_HOURS : WEEK_CAPACITY_HOURS;
  const natureHours = zeroNatureHours();

  for (const entry of actuals) {
    const task = tasks.get(entry.taskId);
    if (task && natureHours[task.nature] !== undefined) {
      natureHours[task.nature] += 1;
    }
  }

  const natureRatios = Object.fromEntries(
    Object.entries(natureHours).map(([nature, hours]) => [
      nature,
      totalActualHours === 0 ? 0 : round((hours / totalActualHours) * 100, 1)
    ])
  );

  const goals = state.weeklyGoals.filter((goal) =>
    periodMode === 'month' ? dates.has(goal.weekStart) : goal.weekStart === periodStart
  );
  const goalTotals = new Map();
  for (const goal of goals) {
    goalTotals.set(goal.taskId, (goalTotals.get(goal.taskId) ?? 0) + goal.targetCount);
  }
  const goalRows = [...goalTotals.entries()].map(([taskId, targetCount]) => {
    const task = tasks.get(taskId);
    const actualCount = state.dailyCounts
      .filter((row) => row.taskId === taskId && dates.has(row.date))
      .reduce((sum, row) => sum + row.count, 0);
    const actualHours = actuals.filter((entry) => entry.taskId === taskId).length;
    return {
      taskId,
      taskName: task?.name ?? '未設定タスク',
      targetCount,
      actualCount,
      actualHours,
      productivity: actualHours === 0 ? 0 : round(actualCount / actualHours, 2),
      progressRate: targetCount === 0 ? 0 : round((actualCount / targetCount) * 100, 1)
    };
  });

  const planMap = new Map(plans.map((entry) => [entryKey(entry), entry]));
  const actualMap = new Map(actuals.map((entry) => [entryKey(entry), entry]));
  const topGaps = [...planMap.entries()]
    .filter(([key, plan]) => actualMap.has(key) && actualMap.get(key).taskId !== plan.taskId)
    .slice(0, 3)
    .map(([, plan]) => {
      const actual = actualMap.get(entryKey(plan));
      return {
        hour: plan.hour,
        plannedTaskName: tasks.get(plan.taskId)?.name ?? '未設定',
        actualTaskName: tasks.get(actual.taskId)?.name ?? '未設定'
      };
    });

  return {
    periodStart,
    periodMode,
    totalActualHours,
    capacityRate: round((totalActualHours / capacityHours) * 100, 1),
    natureHours,
    natureRatios,
    goalRows,
    topGaps
  };
}

export function getImprovementPromiseForWeek(state, weekStart) {
  const previousWeek = addDays(weekStart, -7);
  const review = state.weeklyReviews.find((row) => row.weekStart === previousWeek);
  return review?.nextPromise?.trim() || '今週の改善約束は未設定です';
}
