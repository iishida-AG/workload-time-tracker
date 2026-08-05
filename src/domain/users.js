export const USERS = [
  { id: 'ishida', label: '石田' },
  { id: 'tanoue', label: '田上' }
];

export function getUserLabel(userId) {
  return USERS.find((user) => user.id === userId)?.label ?? userId;
}

export function getPartnerUserId(userId) {
  return userId === 'ishida' ? 'tanoue' : 'ishida';
}
