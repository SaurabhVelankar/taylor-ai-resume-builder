import { spawn } from "child_process";
import { access, mkdir, readdir, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { resumePdfBasename, resumeTexBasename } from "@/lib/latex/filenames";

function tectonicCandidates(): string[] {
  const root = process.cwd();
  return [
    path.join(root, "tools", "bin", "tectonic.exe"),
    path.join(root, "tools", "bin", "tectonic"),
    "tectonic",
  ];
}

async function resolveTectonic(): Promise<string> {
  for (const candidate of tectonicCandidates()) {
    if (candidate === "tectonic") return candidate;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return "tectonic";
}

function runTectonic(
  bin: string,
  texPath: string,
  outDir: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, [texPath, "-o", outDir], {
      cwd: outDir,
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 1, stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

/** Clear prior runs artifacts but keep the current company PDF + TeX. */
async function clearPreviousResumes(
  runsDir: string,
  keepPdf: string,
  keepTex: string,
) {
  try {
    const entries = await readdir(runsDir);
    await Promise.all(
      entries.map(async (name) => {
        if (name === ".gitkeep") return;
        if (name === keepPdf || name === keepTex) return;
        if (
          name.startsWith("Resume_") ||
          name.startsWith("run-") ||
          name === "resume.tex" ||
          name === "resume.pdf" ||
          name.endsWith(".aux") ||
          name.endsWith(".log")
        ) {
          try {
            await unlink(path.join(runsDir, name));
          } catch {
            // ignore dirs / locks
          }
        }
      }),
    );
  } catch {
    // runs may not exist yet
  }
}

export type CompileLatexResult = {
  pdfPath: string | null;
  texPath: string;
  pdfFilename: string;
  texFilename: string;
  status: "ok" | "error";
  message: string;
};

/**
 * Compile .tex → flat PDF under runs/, and KEEP the matching .tex for edits.
 * Resume_{Owner}_{Company}.pdf / .tex (owner from NEXT_PUBLIC_RESUME_OWNER_NAME)
 */
export async function compileLatex(
  texSource: string,
  companyName: string,
): Promise<CompileLatexResult> {
  const runsDir = path.join(process.cwd(), "runs");
  await mkdir(runsDir, { recursive: true });

  const pdfFilename = resumePdfBasename(companyName);
  const texFilename = resumeTexBasename(companyName);
  const texPath = path.join(runsDir, texFilename);
  const pdfPath = path.join(runsDir, pdfFilename);

  await clearPreviousResumes(runsDir, pdfFilename, texFilename);
  await writeFile(texPath, texSource, "utf8");

  const bin = await resolveTectonic();
  const result = await runTectonic(bin, texPath, runsDir);

  const tectonicPdf = path.join(
    runsDir,
    texFilename.replace(/\.tex$/i, ".pdf"),
  );

  if (result.code !== 0) {
    return {
      pdfPath: null,
      texPath,
      pdfFilename,
      texFilename,
      status: "error",
      message: `Tectonic failed (exit ${result.code}). ${result.stderr.slice(-500) || "No stderr."}`,
    };
  }

  try {
    await access(tectonicPdf);
    if (tectonicPdf !== pdfPath) {
      await rename(tectonicPdf, pdfPath);
    }
  } catch {
    return {
      pdfPath: null,
      texPath,
      pdfFilename,
      texFilename,
      status: "error",
      message: `Tectonic finished but ${pdfFilename} was not found.`,
    };
  }

  return {
    pdfPath,
    texPath,
    pdfFilename,
    texFilename,
    status: "ok",
    message: `Compiled PDF → runs/${pdfFilename} (TeX kept at runs/${texFilename})`,
  };
}
