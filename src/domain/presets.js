export const TASK_NATURES = [
  { id: 'core', label: 'コア業務' },
  { id: 'admin', label: '雑務' },
  { id: 'investment', label: '投資' }
];

export const DEFAULT_PROJECTS = [
  { id: 'ses-sales', name: 'SES営業', order: 1, status: 'active' },
  { id: 'recruiting-sales', name: '人材紹介営業', order: 2, status: 'active' },
  { id: 'telecom-sales', name: '電気通信営業', order: 3, status: 'active' },
  { id: 'internal-hiring', name: '自社採用', order: 4, status: 'active' },
  { id: 'routine-admin', name: '共通ルーティン・雑務', order: 5, status: 'active' },
  { id: 'improvement-learning', name: '改善・自己研鑽', order: 6, status: 'active' }
];

const taskGroups = [
  ['ses-sales', 'core', true, ['エンジニア提案', '開拓/面談', 'パートナー連絡', '契約調整', 'エンジニア管理/定期面談']],
  ['recruiting-sales', 'core', true, ['求職者面談', '求人/スカウト作成', '選考調整', '推薦文作成']],
  ['telecom-sales', 'core', true, ['テレアポ', '商談/訪問', '提案書作成', '開通フォロー']],
  ['internal-hiring', 'core', true, ['スカウト作成/送信', '求人/媒体管理', '面接', '日程調整']],
  ['routine-admin', 'admin', false, ['予定作成/日報', 'メール/チャット', '社内会議', '事務処理']],
  ['improvement-learning', 'investment', true, ['テンプレ作成', 'フロー改善/自動化', 'リサーチ/勉強']]
];

export const DEFAULT_TASKS = taskGroups.flatMap(([projectId, nature, countable, names], groupIndex) =>
  names.map((name, taskIndex) => ({
    id: `${projectId}-${taskIndex + 1}`,
    projectId,
    name,
    nature,
    countable,
    status: 'active',
    order: groupIndex * 100 + taskIndex + 1
  }))
);

export function createInitialState(today) {
  const weekStart = today;
  const firstCountableTask = DEFAULT_TASKS.find((task) => task.countable);
  return {
    projects: DEFAULT_PROJECTS,
    tasks: DEFAULT_TASKS,
    dayPlans: [],
    dayActuals: [],
    weeklyGoals: firstCountableTask
      ? [{ weekStart, taskId: firstCountableTask.id, targetCount: 20 }]
      : [],
    dailyCounts: [],
    weeklyReviews: []
  };
}
