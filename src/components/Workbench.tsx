"use client";

import { useState, useTransition } from "react";
import type {
  CascadeStepResult,
  JdSuggestions,
  RoleFamily,
  Seniority,
  TailorMode,
  WorkArrangement,
} from "@/lib/types";
import { MODE_LABELS, ROLE_LABELS } from "@/lib/types";

const DEFAULT_CONTROLS = {
  mode: "middle_ground" as TailorMode,
  roleFamily: "other" as RoleFamily,
  location: "",
  seniority: "unspecified" as Seniority,
  workArrangement: "unspecified" as WorkArrangement,
};

type ParseResponse = {
  ok: boolean;
  suggestions?: JdSuggestions;
  usedDemo?: boolean;
  error?: string;
};

type TailorResponse = {
  ok: boolean;
  steps?: CascadeStepResult[];
  usedDemo?: boolean;
  error?: string;
};

export function Workbench() {
  const [jdText, setJdText] = useState("");
  const [controls, setControls] = useState(DEFAULT_CONTROLS);
  const [suggestions, setSuggestions] = useState<JdSuggestions | null>(null);
  const [steps, setSteps] = useState<CascadeStepResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"parse" | "tailor" | null>(null);

  function applySuggestions(s: JdSuggestions) {
    setSuggestions(s);
    setControls((prev) => ({
      ...prev,
      // Mode stays user-owned; only prefill other metrics.
      roleFamily: s.roleFamily,
      location: s.location || prev.location,
      seniority: s.seniority,
      workArrangement: s.workArrangement,
    }));
  }

  async function onParse() {
    setError(null);
    setSteps(null);
    setBusy("parse");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText }),
      });
      const data = (await res.json()) as ParseResponse;
      if (!data.ok || !data.suggestions) {
        throw new Error(data.error || "Parse failed");
      }
      startTransition(() => {
        applySuggestions(data.suggestions!);
        setStatusNote(
          data.usedDemo
            ? "Parsed in DEMO_MODE (local heuristics). Add GEMINI_API_KEY and set DEMO_MODE=false for model parse."
            : "Parsed with Gemini — suggestions prefilled. Adjust anything before running the cascade.",
        );
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(null);
    }
  }

  async function onTailor() {
    setError(null);
    setBusy("tailor");
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText, controls }),
      });
      const data = (await res.json()) as TailorResponse;
      if (!data.ok || !data.steps) {
        throw new Error(data.error || "Cascade failed");
      }
      startTransition(() => {
        setSteps(data.steps!);
        setStatusNote(
          data.usedDemo
            ? "Cascade finished in DEMO_MODE with placeholder prompts / mocks."
            : "Cascade finished (placeholder prompts still in use until curated).",
        );
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cascade failed");
    } finally {
      setBusy(null);
    }
  }

  const canParse = jdText.trim().length >= 40 && busy === null && !pending;
  const canTailor = canParse && suggestions !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8">
      <header className="space-y-2">
        <p className="font-display text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
          Tailor
        </p>
        <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--muted)]">
          Paste a job description first. Parse fills the controls as suggestions —
          then run the cascade when you’re ready.
        </p>
      </header>

      <section className="space-y-3">
        <label
          htmlFor="jd"
          className="block text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]"
        >
          Job description
        </label>
        <textarea
          id="jd"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste the full JD here…"
          rows={12}
          className="w-full resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onParse}
            disabled={!canParse}
            className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "parse" ? "Parsing…" : "Parse JD"}
          </button>
          <span className="text-xs text-[var(--faint)]">
            URL ingest comes later — paste text for now.
          </span>
        </div>
      </section>

      <section
        className={`space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface)]/80 p-4 transition ${
          suggestions ? "opacity-100" : "opacity-60"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Controls
          </h2>
          {suggestions?.modeHint ? (
            <p className="text-xs text-[var(--muted)]">
              Hint: {MODE_LABELS[suggestions.modeHint]}
              {suggestions.modeHintReason
                ? ` — ${suggestions.modeHintReason}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mode">
            <select
              value={controls.mode}
              onChange={(e) =>
                setControls((c) => ({
                  ...c,
                  mode: e.target.value as TailorMode,
                }))
              }
              className="field"
            >
              {(Object.keys(MODE_LABELS) as TailorMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Role family">
            <select
              value={controls.roleFamily}
              onChange={(e) =>
                setControls((c) => ({
                  ...c,
                  roleFamily: e.target.value as RoleFamily,
                }))
              }
              className="field"
            >
              {(Object.keys(ROLE_LABELS) as RoleFamily[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Location">
            <input
              value={controls.location}
              onChange={(e) =>
                setControls((c) => ({ ...c, location: e.target.value }))
              }
              placeholder="Detected or your override"
              className="field"
            />
          </Field>

          <Field label="Seniority">
            <select
              value={controls.seniority}
              onChange={(e) =>
                setControls((c) => ({
                  ...c,
                  seniority: e.target.value as Seniority,
                }))
              }
              className="field"
            >
              <option value="unspecified">Unspecified</option>
              <option value="intern">Intern</option>
              <option value="new_grad">New grad</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="staff_plus">Staff+</option>
            </select>
          </Field>

          <Field label="Work arrangement">
            <select
              value={controls.workArrangement}
              onChange={(e) =>
                setControls((c) => ({
                  ...c,
                  workArrangement: e.target.value as WorkArrangement,
                }))
              }
              className="field"
            >
              <option value="unspecified">Unspecified</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
          </Field>

          <Field label="Detected title">
            <input
              value={suggestions?.title ?? ""}
              readOnly
              className="field opacity-80"
              placeholder="After parse"
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={onTailor}
          disabled={!canTailor}
          className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent-soft-2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "tailor" ? "Running cascade…" : "Run tailor cascade"}
        </button>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {statusNote ? (
        <p className="text-sm text-[var(--muted)]">{statusNote}</p>
      ) : null}

      {steps ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Cascade
          </h2>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--faint)]">
                    {i + 1}.
                  </span>
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {step.label}
                  </span>
                  <StatusPill status={step.status} />
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {step.summary}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[var(--faint)]">
                    View JSON
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--code-bg)] p-2 text-[11px] leading-relaxed text-[var(--code-fg)]">
                    {JSON.stringify(step.data, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: CascadeStepResult["status"] }) {
  const styles =
    status === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : status === "stub"
        ? "bg-amber-50 text-amber-900"
        : "bg-red-50 text-red-800";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${styles}`}>
      {status}
    </span>
  );
}
