# Multi-Master Resume — design & gameplan

> AI-friendly design note. A later instance of the agent (or a contributor) can
> pick this up. This feature is **implemented**; this file documents how it works
> and the decisions behind it.

## Why

One master resume isn't enough. A Data Science resume highlights statistical /
analytics projects; an MLE resume highlights modeling / systems work. Rather than
force one base to serve every role, we keep **multiple base resumes** ("archetypes")
and let the user (or deterministic detection) pick which one the cascade tailors.

## Core idea

Each archetype is one **LaTeX template + one master JSON** pair, keyed by a slug:

```
data/template_<slug>.tex       ← frozen base (never modified by the app)
data/master_resume_<slug>.json ← structured master the agents read (Make MetaData output)
```

- `<slug>` must match `^[a-z0-9_]+$` (filesystem-safe, path-traversal proof).
- Default / fallback slug is **`ml`**.
- Types are **discovered dynamically** by scanning `data/` for `template_*.tex`.
  Adding a type = drop a `template_<slug>.tex` + run **Make MetaData**. No code change.

## Decisions (approved)

1. **Dynamic discovery** of types from `template_<slug>.tex` (not a fixed enum).
2. **Deterministic** role-family → type mapping (no new AI classifier):
   `ml→ml`, `data_science→ds`, `swe→swe`, `other→ml`. Applied post-Parse, but only
   if that archetype's template actually exists; otherwise keep current / fall back to `ml`.
3. **No type slug in the output PDF filename** — naming stays as-is.
4. **Revert = revert ALL types**: rebuilds every `master_resume_<slug>.json`, then
   reloads the *currently selected* type's baseline into the editor.
5. Fallback everywhere is **`ml`** when nothing is selected/detected/valid.
6. The selected type is **recorded in the tracker** (`resumeType` + `resumeTypeLabel`).

## Key modules

| File | Role |
| --- | --- |
| `src/lib/resume/resumeTypeShared.ts` | **Client-safe** pure helpers: `DEFAULT_RESUME_TYPE`, slug validation, `resumeTypeLabel`, `resumeTypeFromRoleFamily`. No `fs`. |
| `src/lib/resume/resumeTypes.ts` | **Server-only** registry: path helpers (`templatePathFor`, `masterPathFor`, `masterBackupPathFor`), `discoverResumeTypes()`, `resolveResumeType()` (validates slug + confirms template exists, else `ml`). Re-exports the shared helpers. |
| `src/lib/resume/master.ts` | `loadMasterResume(resumeType)` reads `master_resume_<type>.json`. |
| `src/lib/latex/render.ts` | `renderLatex(..., resumeType)` reads `template_<type>.tex` + that master. |
| `src/lib/pdf/onePageGate.ts` | `enforceOnePage(..., resumeType)` → threads to `renderLatex`. |
| `src/lib/agents/cascade.ts` | Resolves `resumeType` **once** at entry (`resolveResumeType(controls.resumeType)`) and threads it to gap/tailor/hard-inject/render/gate + "Use Original". |
| `src/lib/agents/tailor.ts`, `hardInject.ts` | Accept `resumeType`; load the matching master. |
| `src/lib/agents/makeMetadata.ts` | `makeMetadataFromLatex({ type, write })` per archetype (handles a **missing** master = new type). `makeAllMetadata()` iterates every discovered type independently. |

## Request flow

- **`resumeType` lives on `TailorControls`** (`src/lib/types.ts`, optional, default `"ml"`),
  so it flows through `/api/tailor` and into `runTailorCascade` with no extra plumbing.
- The **server re-validates** the slug against disk (`resolveResumeType`) — the client is
  never trusted for a file path.

## API surface

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/resume-types` | Lists discovered archetypes: `{ type, label, hasMaster }[]`. |
| `POST /api/metadata` | Runs **Make MetaData for every type** independently; returns per-type `results[]`. Errors in one type don't block the rest. |
| `POST /api/resume/revert` | Body `{ resumeType? }`. Rebuilds **all** masters, recompiles the requested (selected) type's baseline, returns its `texSource` for the editor. |
| `POST /api/tailor` | Uses `controls.resumeType`. |

## UI (`src/components/Workbench.tsx`)

- Fetches `/api/resume-types` on mount → **Resume type** dropdown (shows label, slug,
  and a "· no metadata yet" hint when `master_resume_<type>.json` is missing).
- After **Parse**, auto-selects the mapped type when it exists (else keeps selection).
- **I Applied** payload includes `resumeType` + `resumeTypeLabel`.
- **Revert** sends the selected `resumeType`.

## Tracker (`src/lib/tracker/types.ts`)

- `ApplicationRecordSchema.schemaVersion` is now `1 | 2` (default `2`). Old v1 records
  still parse — `resumeType` defaults to `"ml"`, `resumeTypeLabel` to `""`.
- New records are written as v2 with the archetype used.
- `/applications` table has a **Type** column; the detail pane shows it under Targeting.

## Adding a new archetype (user steps)

1. Add `data/template_<slug>.tex` (keep the section markers:
   `HEADER_*`, `SKILLS_*`, `EXPERIENCE_*`, `PROJECTS_*`).
2. Click **Make MetaData** → generates `data/master_resume_<slug>.json`.
3. Select it in the **Resume type** dropdown (or let Parse auto-detect it).

## Invariants

- The app **never writes** `template_*.tex` (frozen baselines).
- All type→path resolution goes through `resumeTypes.ts`; never build a `template_` /
  `master_resume_` path by hand elsewhere.
- Every `template_<slug>.tex` must honor the standard section markers or render is a no-op
  for that region.
