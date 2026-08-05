import { getWeekStart } from '../domain/calendar.js';
import { createInitialState } from '../domain/presets.js';

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

export function createAppState(today = new Date().toISOString().slice(0, 10)) {
  return createInitialState(getWeekStart(today));
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
            countable: patch.countable === undefined ? task.countable : Boolean(patch.countable)
          }
        : task
    )
  };
}

export function hideTask(state, taskId) {
  return updateTask(state, taskId, { status: 'hidden' });
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
    updatedAt: new Date().toISOString()
  };
  const weeklyReviews = existing
    ? state.weeklyReviews.map((review) => (review.weekStart === weekStart ? nextReview : review))
    : [...state.weeklyReviews, nextReview];
  return { ...state, weeklyReviews };
}
