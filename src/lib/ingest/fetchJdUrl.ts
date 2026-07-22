const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) job links are supported.");
  }

  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error("That URL cannot be fetched from this app.");
  }

  return url;
}

/** Naive HTML → readable text for public JD pages. */
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export type FetchJdResult = {
  url: string;
  text: string;
  title: string | null;
  warning: string | null;
};

/**
 * Fetch a public job posting page and extract plain text.
 * Login-gated / heavy JS boards often fail — caller should fall back to paste.
 */
export async function fetchJdFromUrl(rawUrl: string): Promise<FetchJdResult> {
  const url = assertPublicHttpUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "TailorResumeAI/0.1 (+local; JD fetch for personal job applications)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Timed out fetching that URL. Paste the JD text instead.",
      );
    }
    throw new Error(
      "Could not reach that URL. If the board needs login, paste the JD text instead.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "That posting looks login-gated. Paste the JD text instead.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Fetch failed (${response.status}). Paste the JD text instead.`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (
    !/html|text|xml|json/i.test(contentType) &&
    body.trim().startsWith("<") === false
  ) {
    throw new Error(
      "URL did not return a readable page. Paste the JD text instead.",
    );
  }

  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || null;
  const text = htmlToPlainText(body);

  if (text.length < 80) {
    throw new Error(
      "Almost no job text came back (often a JS-only or gated page). Paste the JD instead.",
    );
  }

  let warning: string | null = null;
  if (
    /sign in|log in|enable javascript|captcha|access denied/i.test(text) &&
    text.length < 600
  ) {
    warning =
      "Page may be gated or incomplete. Review the extracted text and paste a fuller JD if needed.";
  }

  return { url: url.toString(), text, title, warning };
}

export async function resolveJdInput(args: {
  jdText?: string;
  jdUrl?: string;
}): Promise<{
  jdText: string;
  source: "paste" | "url" | "paste+url";
  fetchedUrl: string | null;
  warning: string | null;
}> {
  const pasted = args.jdText?.trim() || "";
  const url = args.jdUrl?.trim() || "";

  if (!pasted && !url) {
    throw new Error("Paste a job description or provide a public job URL.");
  }

  if (url && pasted.length >= 40) {
    // Prefer explicit paste when both provided (user already has text).
    return {
      jdText: pasted,
      source: "paste+url",
      fetchedUrl: url,
      warning:
        "Using pasted JD text. URL was kept for reference and not scraped.",
    };
  }

  if (url) {
    const fetched = await fetchJdFromUrl(url);
    return {
      jdText: fetched.text,
      source: "url",
      fetchedUrl: fetched.url,
      warning: fetched.warning,
    };
  }

  return {
    jdText: pasted,
    source: "paste",
    fetchedUrl: null,
    warning: null,
  };
}
