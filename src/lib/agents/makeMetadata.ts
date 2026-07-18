import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const TEMPLATE_PATH = path.join(DATA_DIR, "template.tex");
const MASTER_PATH = path.join(DATA_DIR, "master_resume.json");
const BACKUP_PATH = path.join(DATA_DIR, "master_resume.backup.json");

export type MakeMetadataResult = {
  promptId: string;
  usedDemo: boolean;
  wrote: boolean;
  masterPath: string;
  backupPath: string | null;
  summary: string;
  /** Full JSON object returned by the model / demo stub */
  master: unknown;
};

async function loadTemplateAndExisting(): Promise<{
  latexSource: string;
  existingMasterJson: string;
}> {
  const latexSource = await readFile(TEMPLATE_PATH, "utf8");
  const existingMasterJson = await readFile(MASTER_PATH, "utf8");
  return { latexSource, existingMasterJson };
}

function demoMasterFromExisting(existingMasterJson: string): unknown {
  const existing = JSON.parse(existingMasterJson) as Record<string, unknown>;
  return {
    ...existing,
    meta: {
      ...(typeof existing.meta === "object" && existing.meta
        ? (existing.meta as object)
        : {}),
      lastMakeMetadata: {
        mode: "demo",
        note: "DEMO_MODE stub — did not re-parse LaTeX. Curate makeMetadata prompts, set DEMO_MODE=false, then re-run.",
        sourceTemplate: "data/template.tex",
      },
    },
  };
}

export async function makeMetadataFromLatex(args?: {
  /** When true, write data/master_resume.json (after backup). Default true when not demo. */
  write?: boolean;
}): Promise<MakeMetadataResult> {
  const prompt = PROMPT_PLACEHOLDERS.makeMetadata;
  const { latexSource, existingMasterJson } = await loadTemplateAndExisting();

  let master: unknown;
  let usedDemo = false;

  if (isDemoMode()) {
    usedDemo = true;
    master = demoMasterFromExisting(existingMasterJson);
  } else {
    const { parsed } = await generateJson<unknown>({
      system: prompt.system,
      user: fillTemplate(prompt.userTemplate, {
        latexSource,
        existingMasterJson,
      }),
      kind: "pro",
    });
    master = parsed;
  }

  const shouldWrite = args?.write ?? !usedDemo;
  let wrote = false;
  let backupPath: string | null = null;

  if (shouldWrite) {
    await writeFile(BACKUP_PATH, existingMasterJson, "utf8");
    backupPath = BACKUP_PATH;
    await writeFile(MASTER_PATH, `${JSON.stringify(master, null, 2)}\n`, "utf8");
    wrote = true;
  }

  const summary = usedDemo
    ? "Demo stub only — LaTeX was not model-parsed; master file not overwritten."
    : wrote
      ? "Parsed LaTeX into master_resume.json (backup saved)."
      : "Parsed LaTeX into JSON preview (write skipped).";

  return {
    promptId: prompt.id,
    usedDemo,
    wrote,
    masterPath: MASTER_PATH,
    backupPath,
    summary,
    master,
  };
}
