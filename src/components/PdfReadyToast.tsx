"use client";

import { useEffect } from "react";

type PdfReadyToastProps = {
  open: boolean;
  message: string;
  pdfUrl: string | null;
  onDismiss: () => void;
};

export function PdfReadyToast({
  open,
  message,
  pdfUrl,
  onDismiss,
}: PdfReadyToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(t);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="pdf-ready-toast"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="pdf-ready-toast__check" aria-hidden="true">
          ✓
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Resume ready
          </p>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            {message}
          </p>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline"
            >
              Open PDF
            </a>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[var(--faint)] hover:text-[var(--ink)]"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
