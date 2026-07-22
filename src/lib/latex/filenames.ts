/**
 * Build ATS-download filenames: Resume_{Owner}_{Company}.pdf / .tex
 *
 * The owner is read from NEXT_PUBLIC_RESUME_OWNER_NAME so it works on both the
 * server (compile) and the client (display). When unset, filenames fall back to
 * "Resume_{Company}" with no owner segment.
 */

function sanitizeForFilename(value: string): string {
  return value
    .trim()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function sanitizeCompanyForFilename(company: string): string {
  return sanitizeForFilename(company) || "Company";
}

/** Owner slug from env (e.g. "Jane Doe" → "Jane_Doe"). Empty string if unset. */
export function resumeOwnerSlug(): string {
  return sanitizeForFilename(process.env.NEXT_PUBLIC_RESUME_OWNER_NAME ?? "");
}

/** Filename prefix: "Resume_{Owner}_" — or "Resume_" when no owner is configured. */
export function resumeFilePrefix(): string {
  const slug = resumeOwnerSlug();
  return slug ? `Resume_${slug}_` : "Resume_";
}

export function resumePdfBasename(companyName: string): string {
  return `${resumeFilePrefix()}${sanitizeCompanyForFilename(companyName)}.pdf`;
}

export function resumeTexBasename(companyName: string): string {
  return `${resumeFilePrefix()}${sanitizeCompanyForFilename(companyName)}.tex`;
}

/** Strip the "Resume_{Owner}_" prefix for a friendlier display label. */
export function stripResumePrefix(filename: string): string {
  return filename.replace(resumeFilePrefix(), "");
}
