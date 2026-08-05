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

function matchesUser(row, userId) {
  return userId === undefined || (row.userId ?? 'ishida') === userId;
}

function sameTimelineSlot(entry, userId, date, hour) {
  return (entry.userId ?? 'ishida') === userId && entry.date === date && entry.hour === hour;
}

export function copyPlanToActuals(state, userId, date) {
  if (date === undefined) {
    const next = copyPlanToActuals(state, 'ishida', userId);
    return {
      ...next,
      dayActuals: next.dayActuals.map((entry) => {
        if ((entry.userId ?? 'ishida') !== 'ishida' || entry.date !== userId) {
          return entry;
        }
        const { userId: ignoredUserId, note, ...legacyEntry } = entry;
        return note ? { ...legacyEntry, note } : legacyEntry;
      })
    };
  }

  const copiedPlans = state.dayPlans
    .filter((entry) => (entry.userId ?? 'ishida') === userId && entry.date === date)
    .map((entry) => ({
      userId,
      date: entry.date,
      hour: entry.hour,
      taskId: entry.taskId,
      note: entry.note ?? ''
    }));

  return {
    ...state,
    dayActuals: [
      ...state.dayActuals.filter((entry) => !((entry.userId ?? 'ishida') === userId && entry.date === date)),
      ...copiedPlans
    ]
  };
}

export function incrementDailyCount(state, date, taskId, delta, userId = 'ishida') {
  let found = false;
  const dailyCounts = state.dailyCounts.map((row) => {
    if ((row.userId ?? 'ishida') !== userId || row.date !== date || row.taskId !== taskId) {
      return row;
    }
    found = true;
    return { ...row, userId: row.userId ?? userId, count: Math.max(0, row.count + delta) };
  });

  if (!found) {
    dailyCounts.push({ userId, date, taskId, count: Math.max(0, delta) });
  }

  return { ...state, dailyCounts };
}

export function setTimelineEntry(state, collectionName, userId, date, hour, taskId, note = '') {
  const entries = state[collectionName].filter((entry) => !sameTimelineSlot(entry, userId, date, hour));
  if (taskId) {
    entries.push({ userId, date, hour, taskId, note });
  }
  return { ...state, [collectionName]: entries };
}

export function setTimelineNote(state, collectionName, userId, date, hour, note) {
  const entries = state[collectionName].map((entry) =>
    sameTimelineSlot(entry, userId, date, hour) ? { ...entry, note } : entry
  );
  return { ...state, [collectionName]: entries };
}

export function clearTimelineEntry(state, collectionName, userId, date, hour) {
  return {
    ...state,
    [collectionName]: state[collectionName].filter((entry) => !sameTimelineSlot(entry, userId, date, hour))
  };
}

function formatHour(hour) {
  return `${hour}:00`;
}

export function formatDailyScheduleText(state, collectionName, userId, date, startHour, endHour) {
  const tasks = taskById(state.tasks);
  return Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
    .map((hour) => {
      const entry = state[collectionName].find((row) => sameTimelineSlot(row, userId, date, hour));
      const taskName = entry ? tasks.get(entry.taskId)?.name ?? '未入力' : '未入力';
      return `${formatHour(hour)}-${formatHour(hour + 1)} ${taskName}：「${entry?.note ?? ''}」`;
    })
    .join('\n');
}

export function computeProjectCountSummaries(state, userId, weekStart) {
  const dates = new Set(getWeekDates(weekStart));
  return state.projects
    .filter((project) => project.status === 'active')
    .sort((a, b) => a.order - b.order)
    .map((project) => {
      const projectTaskIds = state.tasks
        .filter((task) => task.projectId === project.id && task.countable)
        .map((task) => task.id);
      const actualCount = state.dailyCounts
        .filter(
          (row) =>
            (userId === 'all' || (row.userId ?? 'ishida') === userId) &&
            dates.has(row.date) &&
            projectTaskIds.includes(row.taskId)
        )
        .reduce((sum, row) => sum + row.count, 0);
      return { projectId: project.id, projectName: project.name, actualCount };
    });
}

export function computeReviewMetrics(state, periodStart, options = {}) {
  const periodMode = options.periodMode ?? 'week';
  const userId = options.userId;
  const dates = new Set(periodMode === 'month' ? getMonthDates(periodStart.slice(0, 7)) : getWeekDates(periodStart));
  const tasks = taskById(state.tasks);
  const actuals = state.dayActuals.filter((entry) => withinDates(entry, dates) && matchesUser(entry, userId));
  const plans = state.dayPlans.filter((entry) => withinDates(entry, dates) && matchesUser(entry, userId));
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
      .filter((row) => row.taskId === taskId && dates.has(row.date) && matchesUser(row, userId))
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
