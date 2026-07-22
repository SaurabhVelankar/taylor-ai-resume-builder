"use client";

import { TrackerAnalytics } from "@/components/TrackerAnalytics";
import { MODE_LABELS } from "@/lib/types";
import {
  STATUS_LABELS,
  type ApplicationRecord,
} from "@/lib/tracker/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function coveragePct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export default function ApplicationsPage() {
  const [rows, setRows] = useState<ApplicationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/applications");
      const data = (await res.json()) as {
        ok?: boolean;
        applications?: ApplicationRecord[];
        error?: string;
      };
      if (!data.ok || !data.applications) {
        throw new Error(data.error || "Failed to load applications");
      }
      setRows(data.applications);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applications");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function removeApplication(id: string): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || "Delete failed");
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      setExpandedId((prev) => (prev === id ? null : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function copyTex(rec: ApplicationRecord) {
    if (!rec.texSource) return;
    try {
      await navigator.clipboard.writeText(rec.texSource);
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId((c) => (c === rec.id ? null : c)), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  function downloadTex(rec: ApplicationRecord) {
    if (!rec.texSource) return;
    const blob = new Blob([rec.texSource], { type: "text/x-tex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.texFilename ?? `Resume_${rec.company || "Company"}.tex`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="relative min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="section-label">Application tracker</p>
            <h1 className="font-display text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
              My Applications
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Every resume you marked <span className="font-semibold">I Applied ✓</span>
              , with the exact keywords and “what changed” trace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void load()} className="btn-ghost">
              Refresh
            </button>
            <Link href="/" className="btn-primary" prefetch={false}>
              Back to Taylor
            </Link>
          </div>
        </header>

        {error ? (
          <p
            className="mb-4 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--danger-bd)",
              background: "var(--danger-bg)",
              color: "var(--danger-fg)",
            }}
          >
            {error}
          </p>
        ) : null}

        {rows && rows.length > 0 ? <TrackerAnalytics records={rows} /> : null}

        <section className="panel overflow-hidden">
          {rows === null ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--faint)]">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <div className="space-y-2 px-5 py-10 text-center text-sm text-[var(--faint)]">
              <p className="font-medium text-[var(--muted)]">
                No applications yet — the tracker fills when you say you applied.
              </p>
              <p>
                On the home page: finish a cascade you like, then click{" "}
                <span className="font-semibold text-[var(--muted)]">I Applied ✓</span>{" "}
                (next to Open PDF). That saves the job metadata, “what changed”
                trace, and tailored `.tex` here — including pace analytics above
                once you have rows.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[var(--faint)]">
                    <th className="px-3 py-2.5 font-semibold" />
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Company</th>
                    <th className="px-3 py-2.5 font-semibold">Title</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Location</th>
                    <th className="px-3 py-2.5 font-semibold">Mode</th>
                    <th className="px-3 py-2.5 font-semibold">Coverage</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((rec) => (
                    <RowGroup
                      key={rec.id}
                      rec={rec}
                      isOpen={expandedId === rec.id}
                      copied={copiedId === rec.id}
                      onToggle={() => toggle(rec.id)}
                      onCopyTex={() => void copyTex(rec)}
                      onDownloadTex={() => downloadTex(rec)}
                      onDelete={() => removeApplication(rec.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {rows && rows.length > 0 ? (
          <p className="mt-3 text-xs text-[var(--faint)]">
            {rows.length} application{rows.length === 1 ? "" : "s"} tracked.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function RowGroup({
  rec,
  isOpen,
  copied,
  onToggle,
  onCopyTex,
  onDownloadTex,
  onDelete,
}: {
  rec: ApplicationRecord;
  isOpen: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopyTex: () => void;
  onDownloadTex: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileErr, setCompileErr] = useState<string | null>(null);

  // Reset transient action state whenever the row collapses.
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      setCompileErr(null);
    }
  }, [isOpen]);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    await onDelete();
    // On success the row is removed by the parent; if it failed, re-arm.
    setDeleting(false);
    setConfirmDelete(false);
  }

  async function downloadResume() {
    if (!rec.texSource) return;
    setCompiling(true);
    setCompileErr(null);
    try {
      const res = await fetch("/api/resume/recompile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: rec.company || "Company",
          texSource: rec.texSource,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        pdfUrl?: string;
        pdfFilename?: string;
      };
      if (!data.ok || !data.pdfUrl) {
        throw new Error(data.error || "Compile failed");
      }
      const pdfRes = await fetch(data.pdfUrl);
      if (!pdfRes.ok) throw new Error("Could not fetch compiled PDF");
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.pdfFilename ?? `Resume_${rec.company || "Company"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setCompileErr(e instanceof Error ? e.message : "Compile failed");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--line)] align-top hover:bg-[var(--accent-soft)]/40"
        onClick={onToggle}
      >
        <td className="px-3 py-3 text-[var(--faint)]">{isOpen ? "▾" : "▸"}</td>
        <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">
          {formatDate(rec.appliedAt)}
        </td>
        <td className="px-3 py-3 font-medium text-[var(--ink)]">{rec.company}</td>
        <td className="px-3 py-3 text-[var(--muted)]">{rec.roleTitle || "—"}</td>
        <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">
          {rec.resumeTypeLabel || rec.resumeType || "—"}
        </td>
        <td className="px-3 py-3 text-[var(--muted)]">
          {rec.headerLocation || "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-[var(--muted)]">
          {MODE_LABELS[rec.mode] ?? rec.mode}
        </td>
        <td className="px-3 py-3 text-[var(--muted)]">
          {coveragePct(rec.coverageHigh)}
        </td>
        <td className="px-3 py-3">
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-solid)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
            {STATUS_LABELS[rec.status] ?? rec.status}
          </span>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-[var(--line)] bg-[var(--surface-solid)]/50">
          <td colSpan={9} className="px-5 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="section-label mb-1">What changed</p>
                  {rec.changeSummary ? (
                    <>
                      <p className="text-sm font-medium text-[var(--ink)]">
                        {rec.changeSummary.headline || "—"}
                      </p>
                      {rec.changeSummary.bullets.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                          {rec.changeSummary.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--faint)]">No trace recorded.</p>
                  )}
                </div>

                {rec.changeSummary?.keywordsAdded.length ? (
                  <div>
                    <p className="section-label mb-1">Keywords added</p>
                    <p className="text-sm text-[var(--muted)]">
                      {rec.changeSummary.keywordsAdded.join(", ")}
                    </p>
                  </div>
                ) : null}

                {rec.notes ? (
                  <div>
                    <p className="section-label mb-1">Notes</p>
                    <p className="text-sm text-[var(--muted)]">{rec.notes}</p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="section-label mb-1">ATS coverage</p>
                  <p className="text-sm text-[var(--muted)]">
                    <span className="font-medium text-[var(--ink)]">Present:</span>{" "}
                    {rec.presentHigh.length ? rec.presentHigh.join(", ") : "—"}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    <span className="font-medium text-[var(--ink)]">Missing:</span>{" "}
                    {rec.missingHigh.length ? rec.missingHigh.join(", ") : "—"}
                  </p>
                </div>

                <div>
                  <p className="section-label mb-1">Targeting</p>
                  <p className="text-sm text-[var(--muted)]">
                    {rec.roleFamily} · {rec.seniority} · {rec.workArrangement}
                    {rec.aggressiveTarget != null
                      ? ` · target ${Math.round(rec.aggressiveTarget * 100)}%`
                      : ""}
                    {` · resume: ${rec.resumeTypeLabel || rec.resumeType}`}
                  </p>
                  {rec.jdUrl ? (
                    <a
                      href={rec.jdUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--accent-ink)] underline"
                    >
                      Job posting
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onCopyTex}
                    disabled={!rec.texSource}
                    className="btn-ghost !py-1.5 !px-3 !text-xs"
                  >
                    {copied ? "Copied ✓" : "Copy TeX"}
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadTex}
                    disabled={!rec.texSource}
                    className="btn-ghost !py-1.5 !px-3 !text-xs"
                  >
                    Download .tex
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadResume()}
                    disabled={!rec.texSource || compiling}
                    title="Compile this TeX with Tectonic and download the PDF"
                    className="btn-ghost !py-1.5 !px-3 !text-xs"
                  >
                    {compiling ? "Compiling…" : "Download Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="btn-ghost !ml-auto !py-1.5 !px-3 !text-xs"
                    style={
                      confirmDelete
                        ? {
                            borderColor: "var(--danger-bd)",
                            background: "var(--danger-bg)",
                            color: "var(--danger-fg)",
                          }
                        : undefined
                    }
                  >
                    {deleting
                      ? "Deleting…"
                      : confirmDelete
                        ? "You sure?"
                        : "Delete"}
                  </button>
                </div>
                {compileErr ? (
                  <p className="text-xs text-[var(--danger-fg)]">{compileErr}</p>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
