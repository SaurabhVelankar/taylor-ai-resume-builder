"use client";

import { useEffect, useRef } from "react";

type LatexEditorProps = {
  open: boolean;
  onClose: () => void;
  texSource: string;
  onTexChange: (value: string) => void;
  texFilename: string | null;
  recompiling: boolean;
  onRecompile: () => void;
  statusNote: string | null;
  pageCount: number | null;
  /** Scroll/select first match when panel opens (from What changed). */
  highlightTerm?: string | null;
};

export function LatexEditorPanel({
  open,
  onClose,
  texSource,
  onTexChange,
  texFilename,
  recompiling,
  onRecompile,
  statusNote,
  pageCount,
  highlightTerm,
}: LatexEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !highlightTerm?.trim()) return;
    const ta = textareaRef.current;
    if (!ta) return;

    const idx = texSource.toLowerCase().indexOf(highlightTerm.toLowerCase());
    if (idx < 0) return;

    const end = idx + highlightTerm.length;
    ta.focus();
    ta.setSelectionRange(idx, end);

    const before = texSource.slice(0, idx);
    const line = before.split("\n").length - 1;
    const lineHeight = 18;
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 3);
  }, [open, highlightTerm, texSource]);

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-[var(--line)] bg-[var(--surface-solid)] shadow-[var(--panel-shadow)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            LaTeX editor
          </h2>
          <p className="text-xs text-[var(--faint)]">
            {texFilename ? `runs/${texFilename}` : "Edit then Recompile"}
            {highlightTerm ? (
              <span className="text-[var(--accent-ink)]">
                {" "}
                · highlighting “{highlightTerm}”
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-ghost !px-2.5 !py-1 text-xs"
        >
          Collapse
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={texSource}
        onChange={(e) => onTexChange(e.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none border-0 bg-[var(--code-bg)] px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--code-fg)] outline-none"
      />

      <div className="space-y-2 border-t border-[var(--line)] px-4 py-3">
        {statusNote ? (
          <p className="text-xs text-[var(--muted)]">{statusNote}</p>
        ) : null}
        {pageCount != null ? (
          <p className="text-xs text-[var(--faint)]">
            Pages after last compile: {pageCount}
            {pageCount === 1 ? " ✓" : pageCount > 1 ? " (overflow)" : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRecompile}
            disabled={recompiling || texSource.trim().length < 20}
            className="btn-primary"
          >
            {recompiling ? "Recompiling…" : "Recompile"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
        <p className="text-[11px] text-[var(--faint)]">
          After Recompile, use <strong>Open PDF</strong> on the main page to
          preview.
        </p>
      </div>
    </aside>
  );
}
