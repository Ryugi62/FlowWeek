const STORAGE_KEY = 'flowweek:clientId';

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const getOrCreateClientId = (): string => {
  if (typeof window === 'undefined') {
    return 'server';
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const next = generateId();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return generateId();
  }
};

export const clearClientId = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
