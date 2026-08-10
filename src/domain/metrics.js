import { addDays, getMonthDates, getWeekDates, WEEK_CAPACITY_HOURS } from './calendar.js';

const zeroNatureHours = () => ({ core: 0, admin: 0, investment: 0 });

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function taskById(tasks) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function projectById(projects) {
  return new Map(projects.map((project) => [project.id, project]));
}

function entryKey(entry) {
  return `${entry.date}-${entry.hour}`;
}

function withinDates(entry, dates) {
  return dates.has(entry.date);
}

function matchesUser(row, userId) {
  return userId === undefined || userId === 'all' || (row.userId ?? 'ishida') === userId;
}

function sameTimelineSlot(entry, userId, date, hour) {
  return (entry.userId ?? 'ishida') === userId && entry.date === date && entry.hour === hour;
}

function cleanMinutes(value, fallback = 60) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : fallback;
}

export function getActualItems(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.items) && entry.items.length > 0) {
    return entry.items
      .filter((item) => item?.taskId)
      .map((item) => ({
        taskId: item.taskId,
        note: item.note ?? '',
        minutes: cleanMinutes(item.minutes)
      }));
  }
  if (!entry.taskId) return [];
  return [{ taskId: entry.taskId, note: entry.note ?? '', minutes: cleanMinutes(entry.minutes) }];
}

export function makeActualEntry(base, items) {
  const cleanItems = items
    .filter((item) => item?.taskId)
    .map((item) => ({
      taskId: item.taskId,
      note: item.note ?? '',
      minutes: cleanMinutes(item.minutes, 0)
    }))
    .filter((item) => item.minutes > 0);
  const first = cleanItems[0];
  return {
    ...base,
    taskId: first?.taskId ?? '',
    note: first?.note ?? '',
    minutes: cleanItems.reduce((sum, item) => sum + item.minutes, 0),
    items: cleanItems
  };
}

function actualMinutesForTask(entry, taskId) {
  return getActualItems(entry)
    .filter((item) => item.taskId === taskId)
    .reduce((sum, item) => sum + item.minutes, 0);
}

function isReviewTask(task) {
  return task?.nature !== 'break';
}

function reviewMinutesForActual(entry, tasks) {
  return getActualItems(entry)
    .filter((item) => isReviewTask(tasks.get(item.taskId)))
    .reduce((sum, item) => sum + item.minutes, 0);
}

function firstReviewTaskId(entry, tasks) {
  return getActualItems(entry).find((item) => isReviewTask(tasks.get(item.taskId)))?.taskId;
}

function breakMinutesForDay(entries, tasks, userId, date) {
  return entries
    .filter((entry) => (entry.userId ?? 'ishida') === userId && entry.date === date)
    .flatMap((entry) => getActualItems(entry))
    .filter((item) => tasks.get(item.taskId)?.nature === 'break')
    .reduce((sum, item) => sum + item.minutes, 0);
}

function formatHour(hour) {
  return `${hour}:00`;
}

function formatMinuteClock(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

function formatJapaneseClock(rangePart) {
  const [hour, minute] = rangePart.split(':');
  return `${Number(hour)}\u6642${String(minute).padStart(2, '0')}\u5206`;
}

function formatJapaneseScheduleRange(start, end) {
  return `${formatJapaneseClock(start)}-${formatJapaneseClock(end)}`;
}

export function formatActualItemRanges(hour, items) {
  let cursor = hour * 60;
  return items.map((item) => {
    const start = cursor;
    cursor += cleanMinutes(item.minutes, 0);
    return `${formatMinuteClock(start)}-${formatMinuteClock(cursor)}`;
  });
}

function formatHours(minutes) {
  return `${round(minutes / 60, 1)}h`;
}

function dailyTaskCount(state, taskId, userId, date) {
  return (state.dailyCounts ?? [])
    .filter((row) => row.taskId === taskId && row.date === date && matchesUser(row, userId))
    .reduce((sum, row) => sum + row.count, 0);
}

export function copyPlanToActuals(state, userId, date) {
  if (date === undefined) {
    const next = copyPlanToActuals(state, 'ishida', userId);
    return {
      ...next,
      dayActuals: next.dayActuals.map((entry) => {
        if ((entry.userId ?? 'ishida') !== 'ishida' || entry.date !== userId) return entry;
        const { userId: ignoredUserId, items, minutes, note, ...legacyEntry } = entry;
        return note ? { ...legacyEntry, note } : legacyEntry;
      })
    };
  }

  const copiedPlans = (state.dayPlans ?? [])
    .filter((entry) => (entry.userId ?? 'ishida') === userId && entry.date === date)
    .map((entry) => makeActualEntry({ userId, date: entry.date, hour: entry.hour }, getActualItems(entry)));

  return {
    ...state,
    dayActuals: [
      ...(state.dayActuals ?? []).filter((entry) => !((entry.userId ?? 'ishida') === userId && entry.date === date)),
      ...copiedPlans
    ]
  };
}

export function copyPlanHourToActual(state, userId, date, hour) {
  const plan = (state.dayPlans ?? []).find((entry) => sameTimelineSlot(entry, userId, date, hour));
  const dayActuals = (state.dayActuals ?? []).filter((entry) => !sameTimelineSlot(entry, userId, date, hour));
  const items = getActualItems(plan);
  if (items.length === 0) return { ...state, dayActuals };
  return {
    ...state,
    dayActuals: [...dayActuals, makeActualEntry({ userId, date, hour }, items)]
  };
}

function addMinutesToCollection(state, collectionName, userId, date, hour, taskId, minutes, note = '') {
  if (!taskId) return state;
  const tasks = taskById(state.tasks ?? []);
  const isBreak = collectionName === 'dayActuals' && tasks.get(taskId)?.nature === 'break';
  const remainingBreakMinutes = isBreak
    ? Math.max(0, 60 - breakMinutesForDay(state.dayActuals ?? [], tasks, userId, date))
    : Infinity;
  const cleanMinuteValue = Math.min(cleanMinutes(minutes, 0), remainingBreakMinutes);
  if (cleanMinuteValue <= 0) return state;

  let found = false;
  const entries = (state[collectionName] ?? []).map((entry) => {
    if (!sameTimelineSlot(entry, userId, date, hour)) return entry;
    found = true;
    const items = getActualItems(entry);
    const existingIndex = items.findIndex((item) => item.taskId === taskId && (note === '' || item.note === note));
    const nextItems =
      existingIndex >= 0
        ? items.map((item, index) =>
            index === existingIndex
              ? { ...item, note: note || item.note, minutes: item.minutes + cleanMinuteValue }
              : item
          )
        : [...items, { taskId, note, minutes: cleanMinuteValue }];
    return makeActualEntry({ userId, date, hour }, nextItems);
  });

  if (!found) {
    entries.push(makeActualEntry({ userId, date, hour }, [{ taskId, note, minutes: cleanMinuteValue }]));
  }

  return { ...state, [collectionName]: entries };
}

export function addActualMinutes(state, userId, date, hour, taskId, minutes, note = '') {
  return addMinutesToCollection(state, 'dayActuals', userId, date, hour, taskId, minutes, note);
}

export function addPlanMinutes(state, userId, date, hour, taskId, minutes, note = '') {
  return addMinutesToCollection(state, 'dayPlans', userId, date, hour, taskId, minutes, note);
}

function updateTimelineItem(state, collectionName, userId, date, hour, index, patch) {
  const entries = (state[collectionName] ?? []).map((entry) => {
    if (!sameTimelineSlot(entry, userId, date, hour)) return entry;
    const items = getActualItems(entry).map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            ...patch,
            minutes: patch.minutes === undefined ? item.minutes : cleanMinutes(patch.minutes, 0)
          }
        : item
    );
    return makeActualEntry({ userId, date, hour }, items);
  });
  return { ...state, [collectionName]: entries };
}

export function updateActualItem(state, userId, date, hour, index, patch) {
  return updateTimelineItem(state, 'dayActuals', userId, date, hour, index, patch);
}

export function updatePlanItem(state, userId, date, hour, index, patch) {
  return updateTimelineItem(state, 'dayPlans', userId, date, hour, index, patch);
}

function removeTimelineItem(state, collectionName, userId, date, hour, index) {
  const entries = (state[collectionName] ?? [])
    .map((entry) => {
      if (!sameTimelineSlot(entry, userId, date, hour)) return entry;
      const items = getActualItems(entry).filter((_, itemIndex) => itemIndex !== index);
      return makeActualEntry({ userId, date, hour }, items);
    })
    .filter((entry) => !sameTimelineSlot(entry, userId, date, hour) || getActualItems(entry).length > 0);
  return { ...state, [collectionName]: entries };
}

export function removeActualItem(state, userId, date, hour, index) {
  return removeTimelineItem(state, 'dayActuals', userId, date, hour, index);
}

export function removePlanItem(state, userId, date, hour, index) {
  return removeTimelineItem(state, 'dayPlans', userId, date, hour, index);
}

export function incrementDailyCount(state, date, taskId, delta, userId = 'ishida') {
  let found = false;
  const dailyCounts = (state.dailyCounts ?? []).map((row) => {
    if ((row.userId ?? 'ishida') !== userId || row.date !== date || row.taskId !== taskId) return row;
    found = true;
    return { ...row, userId: row.userId ?? userId, count: Math.max(0, row.count + delta) };
  });

  if (!found) {
    dailyCounts.push({ userId, date, taskId, count: Math.max(0, delta) });
  }

  return { ...state, dailyCounts };
}

export function setTimelineEntry(state, collectionName, userId, date, hour, taskId, note = '') {
  const entries = (state[collectionName] ?? []).filter((entry) => !sameTimelineSlot(entry, userId, date, hour));
  if (taskId) {
    entries.push(
      collectionName === 'dayActuals' || collectionName === 'dayPlans'
        ? makeActualEntry({ userId, date, hour }, [{ taskId, note, minutes: 60 }])
        : { userId, date, hour, taskId, note }
    );
  }
  return { ...state, [collectionName]: entries };
}

export function setTimelineNote(state, collectionName, userId, date, hour, note) {
  if (collectionName === 'dayActuals' || collectionName === 'dayPlans') {
    const entries = (state[collectionName] ?? []).map((entry) => {
      if (!sameTimelineSlot(entry, userId, date, hour)) return entry;
      return makeActualEntry(
        { userId, date, hour },
        getActualItems(entry).map((item, index) => (index === 0 ? { ...item, note } : item))
      );
    });
    return { ...state, [collectionName]: entries };
  }
  const entries = (state[collectionName] ?? []).map((entry) => {
    if (!sameTimelineSlot(entry, userId, date, hour)) return entry;
    return { ...entry, note };
  });
  return { ...state, [collectionName]: entries };
}

export function clearTimelineEntry(state, collectionName, userId, date, hour) {
  return {
    ...state,
    [collectionName]: (state[collectionName] ?? []).filter((entry) => !sameTimelineSlot(entry, userId, date, hour))
  };
}

export function formatDailyScheduleText(state, collectionName, userId, date, startHour, endHour) {
  const labels = { unset: '\u672a\u8a2d\u5b9a' };
  const tasks = taskById(state.tasks ?? []);
  const segments = [];

  for (let hour = startHour; hour < endHour; hour += 1) {
    const entry = (state[collectionName] ?? []).find((row) => sameTimelineSlot(row, userId, date, hour));
    const items = getActualItems(entry);
    const ranges = formatActualItemRanges(hour, items);

    items.forEach((item, index) => {
      const [start, end] = ranges[index].split('-');
      const text = item.note?.trim() || tasks.get(item.taskId)?.name || labels.unset;
      const previous = segments.at(-1);
      if (previous && previous.text === text && previous.end === start) {
        previous.end = end;
      } else {
        segments.push({ start, end, text });
      }
    });
  }

  return segments
    .map((segment) => `${formatJapaneseScheduleRange(segment.start, segment.end)} ${segment.text}`)
    .join('\n');
}

export function formatDailyCategorySummaryText(state, collectionName, userId, date) {
  const tasks = taskById(state.tasks ?? []);
  const projects = projectById(state.projects ?? []);
  const grouped = new Map();

  for (const entry of (state[collectionName] ?? []).filter((row) => (row.userId ?? 'ishida') === userId && row.date === date)) {
    const items =
      collectionName === 'dayActuals' || collectionName === 'dayPlans'
        ? getActualItems(entry)
        : entry.taskId
          ? [{ taskId: entry.taskId, note: entry.note ?? '', minutes: 60 }]
          : [];
    for (const item of items) {
      const task = tasks.get(item.taskId);
      if (!isReviewTask(task)) continue;
      const project = projects.get(task?.projectId);
      const projectId = project?.id ?? 'unknown';
      if (!grouped.has(projectId)) {
        grouped.set(projectId, { projectName: project?.name ?? '未設定', tasks: new Map() });
      }
      const group = grouped.get(projectId);
      const current = group.tasks.get(item.taskId) ?? {
        taskName: task?.name ?? '未設定',
        minutes: 0,
        count: dailyTaskCount(state, item.taskId, userId, date)
      };
      group.tasks.set(item.taskId, { ...current, minutes: current.minutes + item.minutes });
    }
  }

  if (grouped.size === 0) return '本日の入力はありません';

  return [...grouped.values()]
    .map((group) => {
      const taskText = [...group.tasks.values()]
        .map((row) => `${row.taskName}: ${formatHours(row.minutes)} (${row.count}件)`)
        .join(' / ');
      return `【${group.projectName}】${taskText}`;
    })
    .join('\n');
}

export function computeProjectCountSummaries(state, userId, weekStart) {
  const dates = new Set(getWeekDates(weekStart));
  const actuals = (state.dayActuals ?? []).filter((entry) => withinDates(entry, dates) && matchesUser(entry, userId));
  return (state.projects ?? [])
    .filter((project) => project.status === 'active')
    .sort((a, b) => a.order - b.order)
    .map((project) => {
      const projectTaskIds = (state.tasks ?? [])
        .filter((task) => task.projectId === project.id && task.countable)
        .map((task) => task.id);
      const actualCount = (state.dailyCounts ?? [])
        .filter(
          (row) =>
            (userId === 'all' || (row.userId ?? 'ishida') === userId) &&
            dates.has(row.date) &&
            projectTaskIds.includes(row.taskId)
        )
        .reduce((sum, row) => sum + row.count, 0);
      const totalMinutes = actuals.reduce(
        (sum, entry) =>
          sum +
          getActualItems(entry)
            .filter((item) => projectTaskIds.includes(item.taskId))
            .reduce((itemSum, item) => itemSum + item.minutes, 0),
        0
      );
      return {
        projectId: project.id,
        projectName: project.name,
        actualCount,
        totalMinutes,
        standardMinutesPerCount: actualCount === 0 ? null : round(totalMinutes / actualCount, 0)
      };
    });
}

export function computeReviewMetrics(state, periodStart, options = {}) {
  const periodMode = options.periodMode ?? 'week';
  const userId = options.userId;
  const dates = new Set(periodMode === 'month' ? getMonthDates(periodStart.slice(0, 7)) : getWeekDates(periodStart));
  const tasks = taskById(state.tasks ?? []);
  const actuals = (state.dayActuals ?? []).filter((entry) => withinDates(entry, dates) && matchesUser(entry, userId));
  const plans = (state.dayPlans ?? []).filter((entry) => withinDates(entry, dates) && matchesUser(entry, userId));
  const actualMinutes = actuals.reduce((sum, entry) => sum + reviewMinutesForActual(entry, tasks), 0);
  const totalActualHours = round(actualMinutes / 60, 2);
  const capacityHours = periodMode === 'month' ? (dates.size / 7) * WEEK_CAPACITY_HOURS : WEEK_CAPACITY_HOURS;
  const natureHours = zeroNatureHours();

  for (const entry of actuals) {
    for (const item of getActualItems(entry)) {
      const task = tasks.get(item.taskId);
      if (task && natureHours[task.nature] !== undefined) {
        natureHours[task.nature] += item.minutes / 60;
      }
    }
  }

  const natureRatios = Object.fromEntries(
    Object.entries(natureHours).map(([nature, hours]) => [
      nature,
      totalActualHours === 0 ? 0 : round((hours / totalActualHours) * 100, 1)
    ])
  );

  const goals = (state.weeklyGoals ?? []).filter((goal) =>
    periodMode === 'month' ? dates.has(goal.weekStart) : goal.weekStart === periodStart
  );
  const goalTotals = new Map();
  for (const goal of goals) {
    goalTotals.set(goal.taskId, (goalTotals.get(goal.taskId) ?? 0) + goal.targetCount);
  }
  const goalRows = [...goalTotals.entries()].map(([taskId, targetCount]) => {
    const task = tasks.get(taskId);
    const actualCount = (state.dailyCounts ?? [])
      .filter((row) => row.taskId === taskId && dates.has(row.date) && matchesUser(row, userId))
      .reduce((sum, row) => sum + row.count, 0);
    const actualHours = round(actuals.reduce((sum, entry) => sum + actualMinutesForTask(entry, taskId), 0) / 60, 2);
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
  const actualMap = new Map(
    actuals
      .filter((entry) => firstReviewTaskId(entry, tasks))
      .map((entry) => [entryKey(entry), entry])
  );
  const topGaps = [...planMap.entries()]
    .filter(([key, plan]) => actualMap.has(key) && firstReviewTaskId(actualMap.get(key), tasks) !== plan.taskId)
    .slice(0, 3)
    .map(([, plan]) => {
      const actual = actualMap.get(entryKey(plan));
      return {
        hour: plan.hour,
        plannedTaskName: tasks.get(plan.taskId)?.name ?? '未設定',
        actualTaskName: tasks.get(firstReviewTaskId(actual, tasks))?.name ?? '未設定'
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
  const review = (state.weeklyReviews ?? []).find((row) => row.weekStart === previousWeek);
  return review?.nextPromise?.trim() || '今週の改善約束は未設定です';
}
