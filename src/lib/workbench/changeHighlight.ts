/** Guess a LaTeX search string from a change-summary bullet. */
export function guessHighlightTerm(
  bullet: string,
  keywordsAdded: string[] = [],
): string | null {
  for (const k of keywordsAdded) {
    if (k.trim() && bullet.toLowerCase().includes(k.toLowerCase())) {
      return k;
    }
  }

  const quoted = bullet.match(/"([^"]{2,60})"/);
  if (quoted?.[1]) return quoted[1];

  const afterColon = bullet.match(
    /(?:skills?|experience|group|emphasized|added|injected)[^:]*:\s*([^.]+)/i,
  );
  if (afterColon?.[1]) {
    const first = afterColon[1].split(/[,;]/)[0]?.trim();
    if (first && first.length >= 2) return first;
  }

  const capitalToken = bullet.match(
    /\b([A-Z][A-Za-z0-9.+#/\-]{1,30})\b/,
  );
  if (capitalToken?.[1] && !/^(I|The|Added|Updated|Reframed|Skills|Experience)$/i.test(capitalToken[1])) {
    return capitalToken[1];
  }

  return null;
}
