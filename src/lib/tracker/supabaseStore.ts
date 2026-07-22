import type { ApplicationStore } from "./store";

/**
 * Supabase Postgres backend — placeholder. Same interface as the local store;
 * wire up @supabase/supabase-js here when moving off local storage
 * (see Tracker.MD §3, §9).
 */
export function createSupabaseStore(): ApplicationStore {
  const notConfigured = (): never => {
    throw new Error(
      "TRACKER_STORE=supabase is not implemented yet. Use TRACKER_STORE=local (default).",
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
