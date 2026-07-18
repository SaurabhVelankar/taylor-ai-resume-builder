# Tailor Resume AI

A local-first web app that tailors your **LaTeX resume to each job description** for
better ATS keyword alignment. Paste a JD (or a public job URL), pick how aggressive you
want to be, and it runs a cascade of agents — extract keywords → gap analysis → tailor →
LaTeX compile → hard one-page gate → ATS coverage score → "what changed" summary — then
hands you a compiled, single-page PDF plus the editable `.tex`.

Meet **Taylor** (yes, a pun on _tailor_), the friendly assistant that drives the UI.

> **Runs entirely on your machine.** Your resume never leaves your computer except for the
> JD text you send to the Gemini API (and even that is optional — see **Demo mode**).

---

## Features

- **JD in, tailored resume out** — paste JD text or fetch a public posting by URL.
- **Four tailoring modes** — Aggressive Fabrication, Middle Ground (default), Mild Nudging, Use Original.
- **Keyword controls** — pin must-keep terms, force-inject stack keywords (aggressive mode), and an adjustable ATS coverage target.
- **Hard one-page enforcement** — compiles the real PDF and measures the true page count; no character-count guessing.
- **Smart location handling** — remaps the header location based on the JD (e.g. West Coast → San Jose, East Coast → New York).
- **In-browser LaTeX editor** — tweak the `.tex` and recompile without leaving the app.
- **Revert to baseline** — one click resets the working resume back to your master template.
- **Export pack** — download the tailored PDF + `.tex` together.
- **Dark / light mode** and a playful, responsive UI.
- **Demo mode** — explore the whole UI with zero API key using local mocks.

---

## Prerequisites

1. **Node.js 20 or newer** — check with `node --version`.
2. **Tectonic** (the LaTeX engine used to compile PDFs). This is **required to generate
   PDFs** — the app starts and runs without it, but any compile step will fail until it's
   installed. See [Installing Tectonic](#installing-tectonic) below.
3. *(Optional)* A **Google Gemini API key** for real AI tailoring. Without one, the app
   runs in demo mode with local mocks.

---

## Quick start

```bash
git clone <your-repo-url>
cd Tailor_Resume_AI

# 1. install deps
npm install

# 2. set up env
cp .env.example .env.local      # Windows PowerShell: copy .env.example .env.local
#   then edit .env.local (see "Configuration" below)

# 3. install the LaTeX engine (see "Installing Tectonic")

# 4. run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Out of the box, `DEMO_MODE=true` means you can click around and run the cascade with
mocked AI immediately. To get a real compiled PDF you still need Tectonic installed.

---

## Installing Tectonic

Tectonic is a self-contained LaTeX engine. The app looks for it in this order:

1. `tools/bin/tectonic.exe` (Windows) or `tools/bin/tectonic` (macOS/Linux)
2. a `tectonic` command on your system `PATH`

So you can either drop the binary in `tools/bin/` or install it globally — either works.
The **first compile downloads TeX packages once** (network required); later compiles are fast.

**Option A — download the binary into `tools/bin/`**

Grab the matching build from the
[Tectonic releases page](https://github.com/tectonic-typesetting/tectonic/releases),
unzip it, and place the executable at `tools/bin/tectonic` (or `tools/bin/tectonic.exe`
on Windows). `tools/bin/` is gitignored, so it stays local to your machine.

**Option B — install globally (on your PATH)**

```bash
# macOS (Homebrew)
brew install tectonic

# Windows (winget)
winget install TectonicTypesetting.Tectonic

# Arch Linux
sudo pacman -S tectonic

# Cargo (any platform with Rust)
cargo install tectonic
```

Verify:

```bash
tectonic --version
```

> Prefer classic LaTeX? You can install MiKTeX / TeX Live instead, but the app's compile
> path is built for Tectonic. See `tools/README.md` for notes.

---

## Configuration

All config lives in `.env.local` (copied from `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_RESUME_OWNER_NAME` | No | Your name, used only to label output files → `Resume_{Your_Name}_{Company}.pdf`. Blank = `Resume_{Company}.pdf`. |
| `GEMINI_API_KEY` | No* | Google Gemini key for real AI tailoring. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL_PRO` | No | Model for heavier steps (default `gemini-2.5-flash`). |
| `GEMINI_MODEL_FLASH` | No | Model for lighter steps (default `gemini-2.5-flash`). |
| `DEMO_MODE` | No | `true` (default) uses local mocks; `false` calls Gemini. |

\* If `GEMINI_API_KEY` is empty, the app automatically stays in demo mode.

---

## Use your own resume

This repo ships with a sample `data/template.tex` and `data/master_resume.json`. To make
it yours:

1. Replace `data/template.tex` with your own LaTeX resume, **keeping the section markers**
   (e.g. `SKILLS_START` / `SKILLS_END`, `EXPERIENCE_START` / `EXPERIENCE_END`) so the
   agents know which regions they may edit.
2. Set `NEXT_PUBLIC_RESUME_OWNER_NAME` in `.env.local`.
3. Click **Make MetaData** in the app (or `POST /api/metadata`) to rebuild
   `data/master_resume.json` from your template. This is what the tailoring agents read.

Generated artifacts land in `runs/` (gitignored). Use **Revert TeX** to reset the working
copy back to your template at any time — `data/template.tex` itself is never modified.

---

## How it works

```
JD (paste or URL)
   └─> Parse ──> suggestions prefill the controls
                    └─> Run cascade:
                          1. Extract keywords
                          2. Gap analysis
                          3. Tailor (edits structured JSON, not raw .tex)
                          4. Render template + Tectonic compile
                          5. Hard one-page gate (measures real page count)
                          6. ATS keyword coverage score
                          7. "What changed" summary
                    └─> Compiled PDF + editable .tex in runs/
```

Agents edit **structured JSON**, which is deterministically rendered into a frozen LaTeX
template — keeping output stable and one-page-safe. See [GAMEPLAN.md](./GAMEPLAN.md) for
the full design.

---

## Project structure

```
src/app            UI + API routes (/api/parse, /api/tailor, /api/metadata, /api/resume/*)
src/components     Workbench UI (Taylor)
src/lib/agents     Cascade agents + prompts
src/lib/ingest     JD URL fetch + HTML→text
src/lib/gemini     Gemini client (+ demo-mode fallback)
src/lib/latex      Template render + Tectonic compile + filenames
src/lib/pdf        Real page-count + one-page gate
data/              template.tex + master_resume.json (your resume lives here)
runs/              Per-job compiled artifacts (gitignored)
tools/bin/         Local Tectonic binary (gitignored)
```

---

## Troubleshooting

- **"Tectonic failed" / no PDF** — Tectonic isn't installed or isn't found. Run
  `tectonic --version`; if it fails, revisit [Installing Tectonic](#installing-tectonic).
  The first compile also needs internet to fetch TeX packages.
- **First compile is slow** — expected; Tectonic caches packages after the first run.
- **AI results look generic / mocked** — you're in demo mode. Set a real `GEMINI_API_KEY`
  and `DEMO_MODE=false` in `.env.local`.
- **`npm install` or build errors** — confirm Node 20+ (`node --version`).
- **Wrong name on output files** — set `NEXT_PUBLIC_RESUME_OWNER_NAME` and restart `npm run dev`.

---

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

---

## Privacy note

Everything runs locally. Your resume data stays on your machine. Only the **job
description text** is sent to Gemini when `DEMO_MODE=false`. If you fork this repo
publicly, remember to replace the sample resume in `data/` with your own (and don't commit
personal contact details you don't want public).
