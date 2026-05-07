const WINDOW_MS = 60_000;
const MAX_FAILURES = 20;

const failureMap = new Map<string, number[]>();

const prune = (ip: string, now: number): void => {
  const timestamps = failureMap.get(ip);
  if (!timestamps) return;
  const cutoff = now - WINDOW_MS;
  const filtered = timestamps.filter((t) => t > cutoff);
  if (filtered.length === 0) {
    failureMap.delete(ip);
  } else {
    failureMap.set(ip, filtered);
  }
};

export const recordFailure = (ip: string): number => {
  const now = Date.now();
  prune(ip, now);
  const timestamps = failureMap.get(ip) ?? [];
  timestamps.push(now);
  failureMap.set(ip, timestamps);
  return timestamps.length;
};

export const getFailureCount = (ip: string): number => {
  const now = Date.now();
  prune(ip, now);
  return failureMap.get(ip)?.length ?? 0;
};

export const isRateLimited = (ip: string): boolean => {
  return getFailureCount(ip) >= MAX_FAILURES;
};

export const getRetryAfter = (): number => {
  return Math.ceil(WINDOW_MS / 1000);
};

export const clearFailures = (ip?: string): void => {
  if (ip) {
    failureMap.delete(ip);
  } else {
    failureMap.clear();
  }
};
