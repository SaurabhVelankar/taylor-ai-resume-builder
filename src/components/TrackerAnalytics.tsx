"use client";

import {
  computeTrackerStats,
  goalsFromEnv,
  type DayBucket,
  type NamedCount,
  type PacePeriod,
  type TrackerStats,
} from "@/lib/tracker/stats";
import type { ApplicationRecord } from "@/lib/tracker/types";
import { useMemo, useState, type ReactNode } from "react";

type FunnelScope = "lifetime" | "month";

export function TrackerAnalytics({
  records,
}: {
  records: ApplicationRecord[];
}) {
  // Collapsed by default on small screens so the table stays primary on phone.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 639px)").matches;
  });
  const [funnelScope, setFunnelScope] = useState<FunnelScope>("lifetime");
  const stats = useMemo(
    () => computeTrackerStats(records, { goals: goalsFromEnv() }),
    [records],
  );

  if (records.length === 0) return null;

  const funnel =
    funnelScope === "month" ? stats.statusMonth : stats.statusLifetime;
  const funnelTotal = funnel.reduce((n, x) => n + x.count, 0);

  return (
    <section className="panel mb-5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-end justify-between gap-2 px-4 py-3 text-left sm:px-5 ${open ? "border-b border-[var(--line)]" : ""}`}
      >
        <div>
          <p className="section-label">Pace &amp; analytics</p>
          <p className="text-sm text-[var(--muted)]">
            Local calendar · weeks run Monday–Sunday
            {stats.streakDays > 0
              ? ` · ${stats.streakDays}-day streak`
              : ""}
            {stats.bestDayThisWeek
              ? ` · best this week: ${stats.bestDayThisWeek.weekdayShort} (${stats.bestDayThisWeek.count})`
              : ""}
            {stats.avgCoverageHigh != null
              ? ` · avg ATS ${Math.round(stats.avgCoverageHigh * 100)}%`
              : ""}
          </p>
        </div>
        <span className="shrink-0 text-[var(--faint)]" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <>
          <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-4">
            <PaceCell period={stats.pace.today} />
            <PaceCell period={stats.pace.week} />
            <PaceCell period={stats.pace.month} />
            <PaceCell period={stats.pace.lifetime} />
          </div>

          <div className="grid gap-5 border-t border-[var(--line)] px-4 py-4 sm:px-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="section-label">Status funnel</p>
                <div className="flex gap-1">
                  <ScopeBtn
                    active={funnelScope === "lifetime"}
                    onClick={() => setFunnelScope("lifetime")}
                  >
                    Lifetime
                  </ScopeBtn>
                  <ScopeBtn
                    active={funnelScope === "month"}
                    onClick={() => setFunnelScope("month")}
                  >
                    This month
                  </ScopeBtn>
                </div>
              </div>
              <FunnelBar items={funnel} total={funnelTotal} />
            </div>

            <div>
              <p className="section-label mb-2">Last 14 days</p>
              <Sparkline days={stats.last14Days} />
            </div>
          </div>

          <div className="grid gap-4 border-t border-[var(--line)] px-4 py-4 sm:px-5 lg:grid-cols-3">
            <Breakdown title="Resume type" items={stats.byResumeType} />
            <Breakdown title="Role family" items={stats.byRoleFamily} />
            <Breakdown title="Mode" items={stats.byMode} />
          </div>

          <WeekStrip stats={stats} />
        </>
      ) : null}
    </section>
  );
}

function PaceCell({ period }: { period: PacePeriod }) {
  const hasGoal = period.goal > 0;
  const pct =
    period.progress != null ? Math.round(period.progress * 100) : null;
  const tone =
    period.met === true
      ? "ok"
      : period.met === false && period.count > 0
        ? "warn"
        : "neutral";

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">
        {period.label}
      </p>
      <p className="mt-0.5 font-display text-2xl tracking-tight text-[var(--ink)]">
        {period.count}
        {hasGoal ? (
          <span className="text-base font-normal text-[var(--faint)]">
            {" "}
            / {period.goal}
          </span>
        ) : null}
      </p>
      {hasGoal ? (
        <>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-sm bg-[var(--line)]"
            role="progressbar"
            aria-valuenow={pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${period.label} progress`}
          >
            <div
              className="h-full rounded-sm transition-[width] duration-300"
              style={{
                width: `${pct ?? 0}%`,
                background:
                  tone === "ok"
                    ? "var(--accent)"
                    : tone === "warn"
                      ? "var(--stub-fg)"
                      : "var(--muted)",
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--faint)]">
            {period.met
              ? "Goal met"
              : `${pct}% of goal · ${Math.max(0, period.goal - period.count)} to go`}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-[var(--faint)]">No goal set</p>
      )}
    </div>
  );
}

function ScopeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors"
      style={
        active
          ? {
              borderColor: "var(--accent)",
              background: "var(--accent-soft)",
              color: "var(--accent-ink)",
            }
          : {
              borderColor: "var(--line)",
              background: "transparent",
              color: "var(--faint)",
            }
      }
    >
      {children}
    </button>
  );
}

function FunnelBar({ items, total }: { items: NamedCount[]; total: number }) {
  if (total === 0) {
    return (
      <p className="text-sm text-[var(--faint)]">No applications in this scope.</p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = total ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2">
            <span className="truncate text-xs text-[var(--muted)]">{item.label}</span>
            <div className="h-1.5 overflow-hidden rounded-sm bg-[var(--line)]">
              <div
                className="h-full rounded-sm bg-[var(--accent)] transition-[width] duration-300"
                style={{ width: `${pct}%`, opacity: item.count ? 1 : 0.25 }}
              />
            </div>
            <span className="text-right text-xs tabular-nums text-[var(--ink)]">
              {item.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ days }: { days: DayBucket[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const w = 280;
  const h = 56;
  const pad = 4;
  const barGap = 2;
  const barW = (w - pad * 2 - barGap * (days.length - 1)) / days.length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-14 w-full max-w-md"
        role="img"
        aria-label="Applications per day over the last 14 days"
      >
        {days.map((d, i) => {
          const barH = (d.count / max) * (h - pad * 2 - 12);
          const x = pad + i * (barW + barGap);
          const y = h - pad - 12 - barH;
          return (
            <g key={d.dayKey}>
              <title>{`${d.label}: ${d.count}`}</title>
              <rect
                x={x}
                y={d.count ? y : h - pad - 12 - 1}
                width={barW}
                height={d.count ? Math.max(barH, 1) : 1}
                rx={1}
                fill="var(--accent)"
                opacity={d.count ? 0.85 : 0.2}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex max-w-md justify-between text-[10px] text-[var(--faint)]">
        <span>{days[0]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: NamedCount[] }) {
  return (
    <div>
      <p className="section-label mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--faint)]">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1.5 rounded border border-[var(--line)] bg-[var(--surface-solid)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
            >
              <span className="font-medium text-[var(--ink)]">{item.label}</span>
              <span className="tabular-nums text-[var(--faint)]">{item.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WeekStrip({ stats }: { stats: TrackerStats }) {
  const max = Math.max(1, ...stats.weekDays.map((d) => d.count));
  return (
    <div className="border-t border-[var(--line)] px-4 py-4 sm:px-5">
      <p className="section-label mb-2">This week (Mon → Sun)</p>
      <div className="grid grid-cols-7 gap-1.5">
        {stats.weekDays.map((d) => (
          <WeekDayCell key={d.dayKey} day={d} max={max} />
        ))}
      </div>
    </div>
  );
}

function WeekDayCell({ day, max }: { day: DayBucket; max: number }) {
  const fill = day.count / max;
  return (
    <div
      className="rounded border border-[var(--line)] px-1 py-2 text-center"
      style={{
        background:
          day.count > 0
            ? `color-mix(in srgb, var(--accent-soft) ${30 + fill * 70}%, transparent)`
            : "transparent",
      }}
      title={`${day.label}: ${day.count}`}
    >
      <p className="text-[10px] font-semibold uppercase text-[var(--faint)]">
        {day.weekdayShort}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ink)]">
        {day.count}
      </p>
    </div>
  );
}
