import type { ApplicationStore } from "./store";

/**
 * Upstash Redis backend — placeholder. Same interface as the local store; wire
 * up @upstash/redis here when moving off local storage (see Tracker.MD §3, §9).
 */
export function createRedisStore(): ApplicationStore {
  const notConfigured = (): never => {
    throw new Error(
      "TRACKER_STORE=redis is not implemented yet. Use TRACKER_STORE=local (default).",
    );
  };
  return {
    list: notConfigured,
    get: notConfigured,
    create: notConfigured,
    update: notConfigured,
    remove: notConfigured,
  };
}
