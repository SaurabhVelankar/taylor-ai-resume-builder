"use client";

import { useState } from "react";
import type { TailorMode } from "@/lib/types";

type KeywordChipRowProps = {
  label: string;
  terms: string[];
  tone: "high" | "low" | "tool" | "theme";
  interactive?: boolean;
  pinnedTerms?: string[];
  forceInjectTerms?: string[];
  mode?: TailorMode;
  onPin?: (term: string) => void;
  onForceInject?: (term: string) => void;
  onCopy?: (term: string) => void;
};

export function KeywordChipRow({
  label,
  terms,
  tone,
  interactive = false,
  pinnedTerms = [],
  forceInjectTerms = [],
  mode,
  onPin,
  onForceInject,
  onCopy,
}: KeywordChipRowProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!terms.length) return null;

  const chipBase =
    tone === "high"
      ? "bg-[var(--chip-high-bg)] text-[var(--chip-high-fg)] border-[var(--chip-high-bd)]"
      : tone === "low"
        ? "bg-[var(--chip-low-bg)] text-[var(--chip-low-fg)] border-[var(--chip-low-bd)]"
        : tone === "theme"
          ? "bg-[var(--chip-theme-bg)] text-[var(--chip-theme-fg)] border-[var(--chip-theme-bd)]"
          : "bg-[var(--chip-tool-bg)] text-[var(--chip-tool-fg)] border-[var(--chip-tool-bd)]";

  const isStack = tone !== "theme";
  const canForce = mode === "aggressive_fabrication" && isStack;

  async function handleCopy(term: string) {
    try {
      await navigator.clipboard.writeText(term);
      setCopied(term);
      window.setTimeout(() => setCopied(null), 1200);
      onCopy?.(term);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[var(--faint)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => {
          const pinned = pinnedTerms.some(
            (t) => t.toLowerCase() === term.toLowerCase(),
          );
          const forced = forceInjectTerms.some(
            (t) => t.toLowerCase() === term.toLowerCase(),
          );

          if (!interactive || tone === "theme") {
            return (
              <span
                key={`${label}-${term}`}
                className={`rounded-md border px-2 py-0.5 text-xs ${chipBase}`}
              >
                {term}
              </span>
            );
          }

          return (
            <span
              key={`${label}-${term}`}
              className={`keyword-chip group inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-xs ${chipBase} ${
                pinned ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-solid)]" : ""
              } ${forced ? "border-[var(--accent)] border-dashed" : ""}`}
            >
              <span className="px-1">{term}</span>
              <span className="keyword-chip__actions inline-flex overflow-hidden rounded opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  title="Copy"
                  className="px-1 py-0.5 text-[10px] hover:bg-black/5"
                  onClick={() => handleCopy(term)}
                >
                  {copied === term ? "✓" : "⎘"}
                </button>
                {onPin ? (
                  <button
                    type="button"
                    title={pinned ? "Unpin must-keep" : "Pin must-keep"}
                    className="px-1 py-0.5 text-[10px] hover:bg-black/5"
                    onClick={() => onPin(term)}
                  >
                    {pinned ? "📌" : "○"}
                  </button>
                ) : null}
                {canForce && onForceInject ? (
                  <button
                    type="button"
                    title={forced ? "Remove force inject" : "Force inject (Aggressive)"}
                    className="px-1 py-0.5 text-[10px] hover:bg-black/5"
                    onClick={() => onForceInject(term)}
                  >
                    {forced ? "⚡" : "+"}
                  </button>
                ) : null}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
