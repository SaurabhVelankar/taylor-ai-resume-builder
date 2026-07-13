# Tailor Resume AI — Locked Game Plan

Local-first webapp for real-time JD → keyword-aligned LaTeX resume, aimed at ATS hit-rate during active job hunt.

## Locked product flow

1. **Paste JD first** (URL ingest later).
2. **Parse agent** extracts location, role family, seniority, work mode, etc. as **suggestions**.
3. Suggestions **pre-select dropdowns**; user can override anything before running.
4. **Mode** stays user-owned (default: Middle Ground). Parse may hint but does not auto-pick Aggressive.
5. Cascading agents: Extract keywords → Gap analysis → Tailor → (later) LaTeX compile → ATS score.
6. **Hard 1-page enforcement**: compile PDF → measure real page count → compress/retry tiers until `pages === 1` or fail explicitly. No estimate-as-truth.

## Modes

| Mode | Intent |
|------|--------|
| Aggressive Fabrication | Strong keyword injection; high ATS, high interview risk |
| Middle Ground | Reframe true experience; default |
| Mild Nudging | Reorder / synonym / wording only |
| Use Original | Minimal or no content rewrite |

## Role families

`ml` | `swe` | `data_science` | `other` — each maps to a separate prompt pack later.

## Architecture rules

- Agents edit **structured JSON**, not free-form `.tex`.
- Frozen LaTeX template + markers; deterministic render → compile.
- Gemini Pro for heavy steps; Flash optional for extract/score (later).
- Prompts live in `src/lib/agents/prompts.ts` as **placeholders** until curated.
- Local only for now (`npm run dev`). Ignore Vercel.

## Phases

- **Phase 0–1 (this scaffold):** App shell, JD parse → prefilled controls, cascade stubs, env/git, latex/pdf stubs.
- **Phase 1b:** Real prompts, master resume JSON fill, LaTeX compile + page-count gate.
- **Phase 2:** Run history, diffs, regenerate.
- **Phase 3:** URL ingest, cover letter stub.

## Testable now

```bash
cp .env.example .env.local   # add GEMINI_API_KEY (optional for UI mock)
npm run dev
```

1. Paste a JD → **Parse JD** → dropdowns fill from suggestions.
2. Tweak controls → **Run tailor cascade** → see step outputs (stubs / placeholder model calls).
