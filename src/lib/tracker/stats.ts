import { MODE_LABELS, ROLE_LABELS, type RoleFamily, type TailorMode } from "@/lib/types";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationRecord,
  type ApplicationStatus,
} from "@/lib/tracker/types";

/** Goals for pace meters. 0 / null = no goal for that period. */
export type TrackerGoals = {
  daily: number;
  weekly: number;
  monthly: number;
  lifetime: number;
};

export const DEFAULT_TRACKER_GOALS: TrackerGoals = {
  daily: 5,
  weekly: 25,
  monthly: 100,
  lifetime: 0,
};

function parseGoal(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Read goals from NEXT_PUBLIC_TRACKER_* env (client-safe). */
export function goalsFromEnv(): TrackerGoals {
  return {
    daily: parseGoal(process.env.NEXT_PUBLIC_TRACKER_DAILY_GOAL, DEFAULT_TRACKER_GOALS.daily),
    weekly: parseGoal(
      process.env.NEXT_PUBLIC_TRACKER_WEEKLY_GOAL,
      DEFAULT_TRACKER_GOALS.weekly,
    ),
    monthly: parseGoal(
      process.env.NEXT_PUBLIC_TRACKER_MONTHLY_GOAL,
      DEFAULT_TRACKER_GOALS.monthly,
    ),
    lifetime: parseGoal(
      process.env.NEXT_PUBLIC_TRACKER_LIFETIME_GOAL,
      DEFAULT_TRACKER_GOALS.lifetime,
    ),
  };
}

/** Local calendar day key YYYY-MM-DD (browser / host local TZ). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday 00:00 local of the week containing `d` (Mo–Sun weeks). */
export function startOfWeekMonday(d: Date): Date {
  const x = startOfLocalDay(d);
  const dow = x.getDay(); // 0=Sun … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = startOfLocalDay(d);
  x.setDate(1);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseAppliedAt(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type PacePeriod = {
  label: string;
  count: number;
  goal: number;
  /** 0–1 when goal > 0; null when no goal. */
  progress: number | null;
  met: boolean | null;
};

export type DayBucket = {
  dayKey: string;
  label: string;
  count: number;
  /** Short weekday label for sparkline (Mon, Tue…). */
  weekdayShort: string;
};

export type NamedCount = {
  key: string;
  label: string;
  count: number;
};

export type TrackerStats = {
  goals: TrackerGoals;
  now: string;
  pace: {
    today: PacePeriod;
    week: PacePeriod;
    month: PacePeriod;
    lifetime: PacePeriod;
  };
  /** Status funnel — lifetime. */
  statusLifetime: NamedCount[];
  /** Status funnel — this calendar month. */
  statusMonth: NamedCount[];
  /** Last 14 local calendar days (oldest → newest), including zeros. */
  last14Days: DayBucket[];
  /** Current Mo–Sun week day buckets (Mon → Sun). */
  weekDays: DayBucket[];
  byResumeType: NamedCount[];
  byRoleFamily: NamedCount[];
  byMode: NamedCount[];
  /** Best day in the current Mo–Sun week (null if week is empty). */
  bestDayThisWeek: DayBucket | null;
  /** Consecutive local days with ≥1 app ending today (or yesterday if today=0). */
  streakDays: number;
  /** Mean of non-null coverageHigh values (0–1), or null. */
  avgCoverageHigh: number | null;
  total: number;
};

function pacePeriod(
  label: string,
  count: number,
  goal: number,
): PacePeriod {
  if (goal <= 0) {
    return { label, count, goal: 0, progress: null, met: null };
  }
  const progress = Math.min(1, count / goal);
  return { label, count, goal, progress, met: count >= goal };
}

function countByStatus(
  records: ApplicationRecord[],
): NamedCount[] {
  const map = new Map<ApplicationStatus, number>();
  for (const s of APPLICATION_STATUSES) map.set(s, 0);
  for (const r of records) {
    map.set(r.status, (map.get(r.status) ?? 0) + 1);
  }
  return APPLICATION_STATUSES.map((s) => ({
    key: s,
    label: STATUS_LABELS[s],
    count: map.get(s) ?? 0,
  }));
}

function tallyNamed(
  records: ApplicationRecord[],
  keyOf: (r: ApplicationRecord) => string,
  labelOf: (key: string) => string,
): NamedCount[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = keyOf(r) || "unknown";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: labelOf(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function dayBucketFromKey(dayKey: string, count: number): DayBucket {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    dayKey,
    label: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    weekdayShort: date.toLocaleDateString(undefined, { weekday: "short" }),
    count,
  };
}

function computeStreak(byDay: Map<string, number>, now: Date): number {
  let cursor = startOfLocalDay(now);
  // If today has 0 apps, start streak from yesterday (still "active" if you applied yesterday).
  if ((byDay.get(localDayKey(cursor)) ?? 0) === 0) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  for (;;) {
    const key = localDayKey(cursor);
    if ((byDay.get(key) ?? 0) <= 0) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export type ComputeTrackerStatsOpts = {
  goals?: TrackerGoals;
  now?: Date;
};

/**
 * Aggregate tracker analytics from in-memory ApplicationRecord[].
 * Weeks are Monday–Sunday (local calendar). Day buckets use local TZ.
 */
export function computeTrackerStats(
  records: ApplicationRecord[],
  opts: ComputeTrackerStatsOpts = {},
): TrackerStats {
  const goals = opts.goals ?? goalsFromEnv();
  const now = opts.now ?? new Date();
  const todayStart = startOfLocalDay(now);
  const weekStart = startOfWeekMonday(now);
  const monthStart = startOfMonth(now);
  const todayKey = localDayKey(now);

  const byDay = new Map<string, number>();
  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  const monthRecords: ApplicationRecord[] = [];
  let coverageSum = 0;
  let coverageN = 0;

  for (const r of records) {
    const at = parseAppliedAt(r.appliedAt);
    if (!at) continue;
    const key = localDayKey(at);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);

    if (key === todayKey) todayCount += 1;
    if (at >= weekStart) weekCount += 1;
    if (at >= monthStart) {
      monthCount += 1;
      monthRecords.push(r);
    }
    if (r.coverageHigh != null && Number.isFinite(r.coverageHigh)) {
      coverageSum += r.coverageHigh;
      coverageN += 1;
    }
  }

  const last14Days: DayBucket[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(todayStart, -i);
    const key = localDayKey(d);
    last14Days.push(dayBucketFromKey(key, byDay.get(key) ?? 0));
  }

  const weekDays: DayBucket[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const key = localDayKey(d);
    weekDays.push(dayBucketFromKey(key, byDay.get(key) ?? 0));
  }

  let bestDayThisWeek: DayBucket | null = null;
  for (const b of weekDays) {
    if (b.count === 0) continue;
    if (!bestDayThisWeek || b.count > bestDayThisWeek.count) {
      bestDayThisWeek = b;
    }
  }

  return {
    goals,
    now: now.toISOString(),
    pace: {
      today: pacePeriod("Today", todayCount, goals.daily),
      week: pacePeriod("This week (Mo–Su)", weekCount, goals.weekly),
      month: pacePeriod("This month", monthCount, goals.monthly),
      lifetime: pacePeriod("Lifetime", records.length, goals.lifetime),
    },
    statusLifetime: countByStatus(records),
    statusMonth: countByStatus(monthRecords),
    last14Days,
    weekDays,
    byResumeType: tallyNamed(
      records,
      (r) => r.resumeType || "ml",
      (k) => {
        const hit = records.find((r) => r.resumeType === k);
        return hit?.resumeTypeLabel || k.toUpperCase();
      },
    ),
    byRoleFamily: tallyNamed(
      records,
      (r) => r.roleFamily,
      (k) => ROLE_LABELS[k as RoleFamily] ?? k,
    ),
    byMode: tallyNamed(
      records,
      (r) => r.mode,
      (k) => MODE_LABELS[k as TailorMode] ?? k,
    ),
    bestDayThisWeek,
    streakDays: computeStreak(byDay, now),
    avgCoverageHigh: coverageN > 0 ? coverageSum / coverageN : null,
    total: records.length,
  };
}
