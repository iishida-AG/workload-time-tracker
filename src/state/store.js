import { getWeekStart } from '../domain/calendar.js';
import { createInitialState, DEFAULT_PROJECTS, DEFAULT_TASKS } from '../domain/presets.js';
import { getActualItems, makeActualEntry } from '../domain/metrics.js';

function nextOrder(items) {
  return items.reduce((max, item) => Math.max(max, item.order ?? 0), 0) + 1;
}

function makeId(prefix, text, existingIds) {
  const ascii = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const base = ascii ? `${prefix}-${ascii}` : `${prefix}-${Date.now()}`;
  let id = base;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function sanitizeTimelineHour(value, fallback) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureDefaultRows(rows, defaultRows) {
  const ids = new Set(rows.map((row) => row.id));
  return [...rows, ...defaultRows.filter((row) => !ids.has(row.id))];
}

export function createAppState(today = new Date().toISOString().slice(0, 10)) {
  return createInitialState(getWeekStart(today));
}

export function normalizeState(state, defaultUserId = 'ishida') {
  const projects = ensureDefaultRows(state.projects ?? [], DEFAULT_PROJECTS);
  const tasks = ensureDefaultRows(
    (state.tasks ?? []).map((task) => ({
      description: '',
      ...task
    })),
    DEFAULT_TASKS
  );

  return {
    ...state,
    projects,
    tasks,
    timelineSettings: (state.timelineSettings ?? []).map((setting) => ({
      userId: setting.userId ?? defaultUserId,
      ...setting
    })),
    weeklyProjectGoals: (state.weeklyProjectGoals ?? []).map((goal) => ({
      userId: goal.userId ?? defaultUserId,
      ...goal
    })),
    monthlyProjectGoals: (state.monthlyProjectGoals ?? []).map((goal) => ({
      userId: goal.userId ?? defaultUserId,
      ...goal
    })),
    dayPlans: (state.dayPlans ?? []).map((entry) => ({
      userId: entry.userId ?? defaultUserId,
      note: entry.note ?? '',
      ...entry
    })),
    dayActuals: (state.dayActuals ?? []).map((entry) => ({
      ...makeActualEntry(
        {
          ...entry,
          userId: entry.userId ?? defaultUserId,
          note: entry.note ?? ''
        },
        getActualItems(entry)
      )
    })),
    dailyCounts: (state.dailyCounts ?? []).map((row) => ({
      userId: row.userId ?? defaultUserId,
      ...row
    })),
    weeklyReviews: (state.weeklyReviews ?? []).map((review) => ({
      discussionItems: '',
      ...review
    }))
  };
}

export function getTimelineSetting(state, userId, date) {
  const setting = (state.timelineSettings ?? []).find(
    (row) => row.userId === userId && row.date === date
  );
  return { startHour: setting?.startHour ?? 9, endHour: setting?.endHour ?? 20 };
}

export function upsertTimelineSetting(state, userId, date, startHour, endHour) {
  const cleanStart = Math.max(0, Math.min(23, sanitizeTimelineHour(startHour, 9)));
  const cleanEnd = Math.max(cleanStart + 1, Math.min(24, sanitizeTimelineHour(endHour, 20)));
  const exists = (state.timelineSettings ?? []).some(
    (row) => row.userId === userId && row.date === date
  );
  const row = { userId, date, startHour: cleanStart, endHour: cleanEnd };
  return {
    ...state,
    timelineSettings: exists
      ? state.timelineSettings.map((item) =>
          item.userId === userId && item.date === date ? row : item
        )
      : [...(state.timelineSettings ?? []), row]
  };
}

export function upsertWeeklyProjectGoal(state, userId, weekStart, projectId, goalText) {
  const exists = (state.weeklyProjectGoals ?? []).some(
    (row) => row.userId === userId && row.weekStart === weekStart && row.projectId === projectId
  );
  const row = { userId, weekStart, projectId, goalText };
  return {
    ...state,
    weeklyProjectGoals: exists
      ? state.weeklyProjectGoals.map((item) =>
          item.userId === userId && item.weekStart === weekStart && item.projectId === projectId
            ? row
            : item
        )
      : [...(state.weeklyProjectGoals ?? []), row]
  };
}

export function upsertMonthlyProjectGoal(state, userId, month, projectId, goalText) {
  const exists = (state.monthlyProjectGoals ?? []).some(
    (row) => row.userId === userId && row.month === month && row.projectId === projectId
  );
  const row = { userId, month, projectId, goalText };
  return {
    ...state,
    monthlyProjectGoals: exists
      ? state.monthlyProjectGoals.map((item) =>
          item.userId === userId && item.month === month && item.projectId === projectId ? row : item
        )
      : [...(state.monthlyProjectGoals ?? []), row]
  };
}

export function addProject(state, name) {
  const ids = new Set(state.projects.map((project) => project.id));
  return {
    ...state,
    projects: [
      ...state.projects,
      {
        id: makeId('project', name, ids),
        name: name.trim(),
        order: nextOrder(state.projects),
        status: 'active'
      }
    ]
  };
}

export function updateProject(state, projectId, patch) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId ? { ...project, ...patch, name: patch.name?.trim() ?? project.name } : project
    )
  };
}

export function moveProjectOrder(state, projectId, direction) {
  const activeProjects = state.projects
    .filter((project) => project.status === 'active')
    .sort((a, b) => a.order - b.order);
  const index = activeProjects.findIndex((project) => project.id === projectId);
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;

  if (index < 0 || neighborIndex < 0 || neighborIndex >= activeProjects.length) {
    return state;
  }

  const current = activeProjects[index];
  const neighbor = activeProjects[neighborIndex];

  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id === current.id) {
        return { ...project, order: neighbor.order };
      }
      if (project.id === neighbor.id) {
        return { ...project, order: current.order };
      }
      return project;
    })
  };
}

export function addTask(state, taskInput) {
  const ids = new Set(state.tasks.map((task) => task.id));
  return {
    ...state,
    tasks: [
      ...state.tasks,
      {
        id: makeId('task', taskInput.name, ids),
        projectId: taskInput.projectId,
        name: taskInput.name.trim(),
        description: taskInput.description?.trim() ?? '',
        nature: taskInput.nature,
        countable: Boolean(taskInput.countable),
        status: 'active',
        order: nextOrder(state.tasks)
      }
    ]
  };
}

export function updateTask(state, taskId, patch) {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            ...patch,
            name: patch.name === undefined ? task.name : patch.name.trim(),
            description: patch.description === undefined ? task.description ?? '' : patch.description.trim(),
            countable: patch.countable === undefined ? task.countable : Boolean(patch.countable)
          }
        : task
    )
  };
}

export function moveTaskOrder(state, taskId, direction) {
  const currentTask = state.tasks.find((task) => task.id === taskId);
  if (!currentTask) return state;

  const siblingTasks = state.tasks
    .filter((task) => task.projectId === currentTask.projectId && task.status !== 'deleted')
    .sort((a, b) => a.order - b.order);
  const index = siblingTasks.findIndex((task) => task.id === taskId);
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;

  if (index < 0 || neighborIndex < 0 || neighborIndex >= siblingTasks.length) {
    return state;
  }

  const current = siblingTasks[index];
  const neighbor = siblingTasks[neighborIndex];

  return {
    ...state,
    tasks: state.tasks.map((task) => {
      if (task.id === current.id) {
        return { ...task, order: neighbor.order };
      }
      if (task.id === neighbor.id) {
        return { ...task, order: current.order };
      }
      return task;
    })
  };
}

export function hideTask(state, taskId) {
  return updateTask(state, taskId, { status: 'hidden' });
}

export function deleteTask(state, taskId) {
  return updateTask(state, taskId, { status: 'deleted' });
}

export function hideProject(state, projectId) {
  return updateProject(state, projectId, { status: 'hidden' });
}

export function deleteProject(state, projectId) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId ? { ...project, status: 'deleted' } : project
    ),
    tasks: state.tasks.map((task) =>
      task.projectId === projectId ? { ...task, status: 'deleted' } : task
    )
  };
}

export function upsertWeeklyGoal(state, weekStart, taskId, targetCount) {
  const normalizedTarget = Math.max(0, Number(targetCount) || 0);
  const exists = state.weeklyGoals.some(
    (goal) => goal.weekStart === weekStart && goal.taskId === taskId
  );
  const weeklyGoals = exists
    ? state.weeklyGoals.map((goal) =>
        goal.weekStart === weekStart && goal.taskId === taskId
          ? { ...goal, targetCount: normalizedTarget }
          : goal
      )
    : [...state.weeklyGoals, { weekStart, taskId, targetCount: normalizedTarget }];
  return { ...state, weeklyGoals };
}

export function upsertReview(state, weekStart, patch) {
  const existing = state.weeklyReviews.find((review) => review.weekStart === weekStart);
  const nextReview = {
    weekStart,
    goalReflection: patch.goalReflection ?? existing?.goalReflection ?? '',
    overtimeCause: patch.overtimeCause ?? existing?.overtimeCause ?? '',
    nextPromise: patch.nextPromise ?? existing?.nextPromise ?? '',
    discussionItems: patch.discussionItems ?? existing?.discussionItems ?? '',
    updatedAt: new Date().toISOString()
  };
  const weeklyReviews = existing
    ? state.weeklyReviews.map((review) => (review.weekStart === weekStart ? nextReview : review))
    : [...state.weeklyReviews, nextReview];
  return { ...state, weeklyReviews };
}
