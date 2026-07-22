# Local TeX tools

`tools/bin/` holds machine-local binaries (gitignored).

## Tectonic (recommended)

Already usable on this machine after first download:

```powershell
.\tools\bin\tectonic.exe --version
.\tools\bin\tectonic.exe data\template_ml.tex -o runs\compile-smoke
```

First compile downloads TeX packages once (network required). Later compiles are fast.

macOS / Linux contributors download the matching [Tectonic release](https://github.com/tectonic-typesetting/tectonic/releases) into `tools/bin/` the same way — not Windows-only.

## MiKTeX alternative (classic pdflatex)

```powershell
winget install MiKTeX.MiKTeX
pdflatex data\template_ml.tex
```
