# Tailor Resume AI

Local webapp to tailor a LaTeX resume to each job description (ATS keyword alignment).

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **DEMO_MODE=true** (default): parse + cascade use local mocks — no API key required to test the UI.
- Set `GEMINI_API_KEY` and `DEMO_MODE=false` to hit Gemini (prompts are still placeholders).

## Locked flow

See [GAMEPLAN.md](./GAMEPLAN.md).

1. Paste JD → Parse → controls prefilled from suggestions  
2. Override dropdowns → Run tailor cascade  
3. Inspect step JSON (LaTeX compile + 1-page gate are stubbed until your Overleaf template is ready)

## Layout

```
src/app            UI + API routes (/api/parse, /api/tailor)
src/components     Workbench UI
src/lib/agents     Cascade agents + prompt placeholders
src/lib/gemini     Gemini client
src/lib/latex      Render/compile stubs
src/lib/pdf        Page-count + one-page gate stubs
data/              master_resume.json + template.tex
runs/              Per-run artifacts (gitignored)
```
