/**
 * Counts attempts in a sliding window, in memory. One server process holds
 * all the counts; a restart clears them. The account lockout, which is kept
 * in the database, doesn't depend on them.
 */
export interface RateLimiter {
  /** Records an attempt; returns seconds to wait if over the limit, else 0. */
  hit(key: string, now: number): number;
  /** Seconds to wait before trying, without recording an attempt. */
  check(key: string, now: number): number;
  forget(key: string): void;
}

export function rateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  let calls = 0;

  const recent = (key: string, now: number): number[] => {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  };
  const wait = (list: number[], now: number): number => {
    if (list.length < limit) return 0;
    const oldest = list[list.length - limit] ?? now;
    return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  };
  // Drops expired keys now and then, so memory stays bounded.
  const tidy = (now: number): void => {
    calls += 1;
    if (calls % 1000 !== 0) return;
    for (const key of [...hits.keys()]) recent(key, now);
  };

  return {
    hit(key, now) {
      tidy(now);
      const list = recent(key, now);
      const seconds = wait(list, now);
      if (seconds > 0) return seconds;
      hits.set(key, [...list, now]);
      return 0;
    },
    check(key, now) {
      return wait(recent(key, now), now);
    },
    forget(key) {
      hits.delete(key);
    },
  };
}
