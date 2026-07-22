# Tracker Feature — Gameplan (AI-friendly spec)

> Status: **PHASE 1 IMPLEMENTED + ANALYTICS.** Local JSON store + adapter + API
> routes + "I Applied" button + `/applications` table + pace/analytics strip are
> live. Phase 2 leftovers (editable status/notes UI, search/filter/sort) and
> Phase 3 (redis/supabase adapters) remain.
> When implementing Next.js routes/pages, consult `node_modules/next/dist/docs/` per
> `AGENTS.md` — pinned, non-standard Next.js (16.2.10, App Router). Note: `params` in
> route handlers is a **Promise** in this version (`const { id } = await ctx.params`).

---

## 1. Why this feature exists (the problem)

Taylor generates a tailored (often **fabricated**) resume per job. After applying to
many jobs, the user forgets *what they fabricated* for each one. When Company #78
calls and asks "So you know FastAPI?", the user needs to instantly recall whether
FastAPI/Redis/etc. were injected into *that specific* application.

The tracker solves this by persisting a **trace** of each application (metadata +
the "what changed" summary) that the user can browse later. It doubles as a
**job-application tracker** (status, dates, company, etc.).

### Known related gotcha (context, not a task)
`clearPreviousResumes()` in `src/lib/latex/compile.ts` deletes old `runs/Resume_*`
artifacts on every compile. So the exact PDF/TeX sent to a past job is normally gone.
**Decision: we save the `.tex` SOURCE with each record, but NOT the PDF.** The `.tex`
is tiny (~7KB), storing it inline in the record decouples it from `runs/` cleanup, and
it lets the user re-render any past application in Overleaf as a one-off. The PDF is
intentionally NOT stored (larger, regenerable from the tex). Combined with the "what
changed" trace (esp. `keywordsAdded` + `changeSummary`), this fully answers
"what did I fabricate for this job, and here's the exact resume."

---

## 2. Finalized decisions (authoritative — supersede any earlier discussion)

1. **Local running only.** No Vercel/serverless deploy for now. Reason: the cascade
   shells out to a local `tectonic` binary (`tools/bin/tectonic.exe`) and writes to
   `runs/`, which cannot run on Vercel serverless. Revisit only if tectonic is
   replaced by a cloud LaTeX approach.
2. **Local DB for now.** Metadata is stored on the local filesystem. Clicking the
   "View Table" button fetches the local records and renders them.
3. **Adapter-ready for Redis OR Supabase later.** Even though storage is local now,
   wire everything behind a **storage adapter interface** so switching to Upstash
   Redis *or* Supabase Postgres later is a one-module, plug-and-play change. (Which
   one is TBD — support "either" via the adapter; do not hard-couple to local.)
4. **Trace + `.tex` source (no PDF).** Store the tailored `.tex` source string inline
   in each record so the user can re-render it in Overleaf later. Do NOT store the PDF
   (regenerable, larger). See §1. *(Updated: user changed their mind from the earlier
   "trace-only" plan — the tex IS now saved.)*
5. Everything else from prior discussion stands: schema, API shape, "I Applied"
   button, `/applications` tracker page, phasing.

### Deferred / optional
- **Owner-token auth on the API:** not needed while local-only. Only add if/when the
  tracker is exposed on a public URL. Keep endpoints simple for now.

---

## 3. Architecture overview

```
UI (Workbench "I Applied" button) ──POST──> /api/applications ──> ApplicationStore (adapter)
UI (/applications page)          ──GET───> /api/applications ──> ApplicationStore
                                 ──PATCH─> /api/applications/[id]
                                 ──DELETE> /api/applications/[id]
```

- **Storage adapter** isolates persistence. Select backend via env
  `TRACKER_STORE` = `local` (default) | `redis` | `supabase`.
- **Local backend (build now):** one JSON file per record under a gitignored dir.
- **Redis / Supabase backends (stubs/later):** same interface, swapped in via env.

### 3.1 Storage adapter interface

Create `src/lib/tracker/store.ts`:

```ts
export interface ApplicationStore {
  list(): Promise<ApplicationRecord[]>;              // newest first
  get(id: string): Promise<ApplicationRecord | null>;
  create(input: NewApplicationInput): Promise<ApplicationRecord>;
  update(id: string, patch: ApplicationPatch): Promise<ApplicationRecord>;
  remove(id: string): Promise<void>;
}

export function getStore(): ApplicationStore { /* switch on TRACKER_STORE */ }
```

- `src/lib/tracker/localStore.ts` — implements `ApplicationStore` on disk (build now).
- `src/lib/tracker/redisStore.ts` — Upstash Redis impl (later; can start as a stub
  that throws "not configured").
- `src/lib/tracker/supabaseStore.ts` — Supabase impl (later; stub for now).

### 3.2 Local backend details
- **Location:** `data/applications/` with one file per record: `data/applications/{id}.json`.
  (One-file-per-record = atomic-ish, no giant-file rewrites, easy `list()` via readdir.)
- **Writes:** atomic (write to `{id}.json.tmp` then `rename`). Follow existing
  `fs/promises` usage patterns seen in `src/lib/latex/compile.ts`.
- **IDs:** `crypto.randomUUID()`.
- **Gitignore:** add `data/applications/` to `.gitignore` (sensitive fabrication data;
  keep out of git). Note: `data/template_<type>.tex` and `data/master_resume_<type>.json`
  ARE committed, so only ignore the new subfolder.

---

## 4. Data model

`src/lib/tracker/types.ts` — define a zod schema + inferred type (mirror the
existing style in `src/lib/types.ts`). Fields are grounded in what the app already
produces (see §5 for exact sources).

```ts
ApplicationRecord = {
  id: string;
  schemaVersion: 1 | 2;        // v2 adds resumeType/resumeTypeLabel (multi-master)
  appliedAt: string;           // ISO timestamp
  status: "applied" | "screen" | "interview" | "offer" | "rejected" | "ghosted";
  notes: string;               // free text, user-editable

  // Job identity
  company: string;
  roleTitle: string;           // suggestions.title
  jdUrl: string;               // may be ""

  // Multi-master (v2)
  resumeType: string;          // archetype slug used (ml/ds/swe/…)
  resumeTypeLabel: string;     // human label ("Machine Learning")

  // Targeting
  roleFamily: RoleFamily;
  seniority: Seniority;
  workArrangement: WorkArrangement;
  mode: TailorMode;
  aggressiveTarget: number | null; // controls.aggressiveCoverageTarget (aggressive mode only)

  // Location (all three can differ — keep all)
  detectedLocation: string;    // suggestions.location
  overrideLocation: string;    // controls.location
  headerLocation: string;      // ACTUAL printed location (latex_compile step)

  // Keywords
  mustHaveHigh: string[];
  niceToHaveLow: string[];
  tools: string[];
  themes: string[];
  pinnedKeywords: string[];
  forceInjectKeywords: string[];

  // ATS truth
  coverageHigh: number | null; // 0..1
  presentHigh: string[];
  missingHigh: string[];

  // The fabrication memory (the star)
  changeSummary: {
    headline: string;
    bullets: string[];
    keywordsAdded: string[];   // "did I add FastAPI?" -> check here
    sectionsTouched: string[];
  } | null;

  // Applied resume source — TeX ONLY (no PDF). ~7KB, stored inline so it survives
  // runs/ cleanup. Lets the user re-render this exact resume in Overleaf later.
  texSource: string;           // may be "" if none was available at save time
  texFilename: string | null;  // e.g. Resume_{Owner}_{Company}.tex (for download naming)
};
```

- `NewApplicationInput` = `ApplicationRecord` minus `{ id, appliedAt, schemaVersion }`
  and with `status`/`notes` optional (default `status: "applied"`, `notes: ""`).
- `ApplicationPatch` = partial of `{ status, notes }` (v2 editing).

Reuse existing enums/types from `@/lib/types` (`RoleFamily`, `Seniority`,
`WorkArrangement`, `TailorMode`, `AtsScore`, `ChangeSummary`).

---

## 5. Where each field comes from (in `src/components/Workbench.tsx`)

At "I Applied" click time, assemble the record from current React state:

| Record field | Source |
|---|---|
| `company` | `companyName` state |
| `roleTitle` | `suggestions?.title` |
| `jdUrl` | `jdUrl` state |
| `roleFamily` / `seniority` / `workArrangement` / `mode` | `controls.*` |
| `aggressiveTarget` | `controls.aggressiveCoverageTarget` (null unless aggressive) |
| `detectedLocation` | `suggestions?.location` |
| `overrideLocation` | `controls.location` |
| `headerLocation` | `steps.find(s => s.id === "latex_compile").data.headerDecision.headerLocation` |
| `mustHaveHigh`/`niceToHaveLow`/`tools`/`themes` | `keywords.*` |
| `pinnedKeywords`/`forceInjectKeywords` | `controls.*` |
| `coverageHigh`/`presentHigh`/`missingHigh` | `steps.find(s => s.id === "ats_score").data` (AtsScore) |
| `changeSummary` | `changeSummary` state |
| `texSource` | `texSource` state (the tailored `.tex` currently in the editor/session) |
| `texFilename` | `texFilename` state |

Note: `steps` is set to `null` outside a cascade; guard all `.find(...)` reads.
The button should be enabled only when a compiled resume exists (i.e. `cascadeDone`
is true and `pdfUrl`/`texSource` present), same gating as the results panel.

---

## 6. API routes (App Router, `runtime = "nodejs"`)

Follow the existing route style: `NextResponse.json`, `zod` body parsing, try/catch
returning `{ ok: false, error }` with status 400. See
`src/app/api/resume/recompile/route.ts` and `src/app/api/metadata/route.ts` as
templates.

- `src/app/api/applications/route.ts`
  - `POST` — validate body (NewApplicationInput), `getStore().create(...)`, return record.
  - `GET` — `getStore().list()`, return `{ ok: true, applications }`.
- `src/app/api/applications/[id]/route.ts`
  - `PATCH` — validate `{ status?, notes? }`, `getStore().update(id, patch)`.
  - `DELETE` — `getStore().remove(id)`.

(For dynamic route param typing/conventions in this pinned Next version, check
`node_modules/next/dist/docs/` before coding — params handling may differ from
older Next.)

---

## 7. UI

### 7.1 "I Applied" button (Phase 1)
- Location: the results panel in `Workbench.tsx` (the block gated by
  `cascadeDone && (pdfUrl || texSource)`), next to "Open PDF" / "Download PDF + TeX".
- On click: POST assembled record → `/api/applications`. On success, show a light,
  non-invasive toast (reuse `PdfReadyToast` pattern or a small inline note), e.g.
  "Saved to tracker · {company}". Add a `busy` state value `"applying"` (extend the
  existing `busy` union: `"parse" | "tailor" | "metadata" | "revert" | "applying"`).
- Guard: warn (but still allow) if an entry for the same company already exists today
  (optional nicety; can defer to v2).

### 7.2 Tracker page (Phase 1)
- New route: `src/app/applications/page.tsx` (client component; fetch `GET /api/applications`).
- Header link/button "My Applications" (or "Tracker") added to the `<header>` in
  `Workbench.tsx` next to "Revert TeX" / "Make MetaData", linking to `/applications`.
- Table columns: Date · Company · Title · Header location · Mode · Coverage% · Status.
- Expandable row → full "what changed" (headline + bullets), `keywordsAdded`,
  `presentHigh` / `missingHigh`, `notes`, and a **"Copy TeX" / "Download .tex"**
  action (uses `texSource` + `texFilename`) so the user can re-render in Overleaf.
  No PDF action — PDF is not stored.
- Match existing visual system: `panel`, `field`, `btn-*`, CSS vars in
  `src/app/globals.css` (dark/light aware). Keep the flexbox/column aesthetic.

### 7.3 v2 additions
- Editable `status` dropdown (PATCH) and editable `notes`.
- Delete row (DELETE) with confirm.
- Search by company, filter by status, sort by date.

---

## 8. Considerations / edge cases
- **Guard null `steps`/`keywords`/`changeSummary`** — user may save from
  "Use Original" mode or a partial run; store nulls/empties gracefully.
- **`texSource` stored inline** in the record JSON (~7KB). No PDF is stored. When
  moving to Redis/Supabase later, this is just a text field/column — no blob storage
  needed.
- **Atomic local writes** (temp + rename) to avoid corrupt JSON.
- **Privacy:** gitignore `data/applications/`. This is sensitive fabrication data.
- **Adapter env:** default `TRACKER_STORE=local`. Document `redis`/`supabase` envs in
  `.env.example` as commented placeholders (do NOT commit real secrets).
- **No auth for now** (local-only). Add owner-token guard only if exposed publicly.
- **Serverless caveat (future):** local file store won't work on Vercel; that's the
  whole reason for the adapter — swap to Redis/Supabase at deploy time.

---

## 9. Implementation phasing
- **Phase 1 (core):** adapter interface + local store + `data/applications/` +
  gitignore + `POST`/`GET` routes + "I Applied" button + `/applications` table
  (read-only, with expandable what-changed) + header link.
- **Phase 2 (manage):** `PATCH`/`DELETE`, editable status/notes, search/filter/sort,
  duplicate-warning.
- **Phase 3 (optional, later):** implement `redisStore` (Upstash) and/or
  `supabaseStore`; flip `TRACKER_STORE` env. No UI/API changes required.

---

## 10. File checklist (Phase 1) — DONE
- [x] `src/lib/tracker/types.ts` — zod schema + types
- [x] `src/lib/tracker/store.ts` — `ApplicationStore` interface + `getStore()`
- [x] `src/lib/tracker/localStore.ts` — local JSON impl (atomic writes, newest-first)
- [x] `src/lib/tracker/redisStore.ts` — stub (throws "not implemented")
- [x] `src/lib/tracker/supabaseStore.ts` — stub (throws "not implemented")
- [x] `src/app/api/applications/route.ts` — POST + GET
- [x] `src/app/api/applications/[id]/route.ts` — PATCH + DELETE (routes exist; UI wiring is Phase 2)
- [x] `src/components/Workbench.tsx` — green "I Applied ✓" button + header "My Applications" link
- [x] `src/app/applications/page.tsx` — tracker table (expandable what-changed + Copy/Download TeX)
- [x] `.gitignore` — added `data/applications/`
- [x] `.env.example` — `TRACKER_STORE` + redis/supabase placeholders
- [x] `src/app/globals.css` — `.btn-applied` green button style

---

## 11. Analytics panel (implemented)

Same page (`/applications`), strip **above** the table. Pure TypeScript aggregation
over the already-loaded `ApplicationRecord[]` — **no CSV, no Pandas**.

### Files
- `src/lib/tracker/stats.ts` — `computeTrackerStats(records, opts)`, `goalsFromEnv()`
- `src/components/TrackerAnalytics.tsx` — UI strip
- Goals via `NEXT_PUBLIC_TRACKER_{DAILY,WEEKLY,MONTHLY,LIFETIME}_GOAL` (defaults 5 / 25 / 100 / 0)

### Rules
- **Local calendar** day buckets (browser TZ).
- **Weeks = Monday–Sunday** (`startOfWeekMonday`).
- Goal `0` = hide meter ("No goal set").
- Streak: consecutive days with ≥1 app; if today is 0, streak may still count from yesterday.

### Panel contents
1. Pace: Today / This week (Mo–Su) / This month / Lifetime (+ progress bars)
2. Status funnel (Lifetime | This month toggle)
3. Last-14-days sparkline (SVG bars)
4. Breakdown chips: resume type · role family · mode
5. This-week Mon→Sun day strip + streak / best day / avg ATS in the header line
