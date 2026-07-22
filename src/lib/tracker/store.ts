import { createLocalStore } from "./localStore";
import { createRedisStore } from "./redisStore";
import { createSupabaseStore } from "./supabaseStore";
import type {
  ApplicationPatch,
  ApplicationRecord,
  NewApplicationInput,
} from "./types";

/**
 * Persistence contract for saved applications. Swappable backend so we can move
 * from the local JSON store to Redis/Supabase later without touching API/UI.
 */
export interface ApplicationStore {
  /** Newest first. */
  list(): Promise<ApplicationRecord[]>;
  get(id: string): Promise<ApplicationRecord | null>;
  create(input: NewApplicationInput): Promise<ApplicationRecord>;
  update(id: string, patch: ApplicationPatch): Promise<ApplicationRecord>;
  remove(id: string): Promise<void>;
}

let cached: ApplicationStore | null = null;

/** Select backend via TRACKER_STORE = local (default) | redis | supabase. */
export function getStore(): ApplicationStore {
  if (cached) return cached;
  const backend = (process.env.TRACKER_STORE ?? "local").toLowerCase();
  switch (backend) {
    case "redis":
      cached = createRedisStore();
      break;
    case "supabase":
      cached = createSupabaseStore();
      break;
    case "local":
    default:
      cached = createLocalStore();
      break;
  }
  return cached;
}
