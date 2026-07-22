import { fillTemplate, PROMPT_PLACEHOLDERS } from "@/lib/agents/prompts";
import { generateJson, isDemoMode } from "@/lib/gemini/client";
import {
  DEFAULT_RESUME_TYPE,
  discoverResumeTypes,
  masterBackupPathFor,
  masterPathFor,
  templatePathFor,
} from "@/lib/resume/resumeTypes";
import { readFile, writeFile } from "fs/promises";

export type MakeMetadataResult = {
  type: string;
  promptId: string;
  usedDemo: boolean;
  wrote: boolean;
  masterPath: string;
  backupPath: string | null;
  summary: string;
  /** Full JSON object returned by the model / demo stub */
  master: unknown;
};

async function loadTemplateAndExisting(type: string): Promise<{
  latexSource: string;
  existingMasterJson: string;
  hadExisting: boolean;
}> {
  const latexSource = await readFile(templatePathFor(type), "utf8");
  let existingMasterJson = "{}";
  let hadExisting = false;
  try {
    existingMasterJson = await readFile(masterPathFor(type), "utf8");
    hadExisting = true;
  } catch {
    // New archetype — no master yet. Model parses from template alone.
  }
  return { latexSource, existingMasterJson, hadExisting };
}

function demoMasterFromExisting(
  existingMasterJson: string,
  type: string,
): unknown {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(existingMasterJson) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  return {
    ...existing,
    meta: {
      ...(typeof existing.meta === "object" && existing.meta
        ? (existing.meta as object)
        : {}),
      lastMakeMetadata: {
        mode: "demo",
        note: "DEMO_MODE stub — did not re-parse LaTeX. Curate makeMetadata prompts, set DEMO_MODE=false, then re-run.",
        sourceTemplate: `data/template_${type}.tex`,
      },
    },
  };
}

/**
 * Parse a single archetype's template_{type}.tex into master_resume_{type}.json.
 */
export async function makeMetadataFromLatex(args?: {
  /** Which archetype to build. Defaults to "ml". */
  type?: string;
  /** When true, write master_resume_{type}.json (after backup). Default true when not demo. */
  write?: boolean;
}): Promise<MakeMetadataResult> {
  const type = args?.type ?? DEFAULT_RESUME_TYPE;
  const prompt = PROMPT_PLACEHOLDERS.makeMetadata;
  const { latexSource, existingMasterJson, hadExisting } =
    await loadTemplateAndExisting(type);

  let master: unknown;
  let usedDemo = false;

  if (isDemoMode()) {
    usedDemo = true;
    master = demoMasterFromExisting(existingMasterJson, type);
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
    if (hadExisting) {
      await writeFile(masterBackupPathFor(type), existingMasterJson, "utf8");
      backupPath = masterBackupPathFor(type);
    }
    await writeFile(
      masterPathFor(type),
      `${JSON.stringify(master, null, 2)}\n`,
      "utf8",
    );
    wrote = true;
  }

  const summary = usedDemo
    ? `[${type}] Demo stub only — LaTeX was not model-parsed; master not overwritten.`
    : wrote
      ? `[${type}] Parsed LaTeX into master_resume_${type}.json${hadExisting ? " (backup saved)" : " (new)"}.`
      : `[${type}] Parsed LaTeX into JSON preview (write skipped).`;

  return {
    type,
    promptId: prompt.id,
    usedDemo,
    wrote,
    masterPath: masterPathFor(type),
    backupPath,
    summary,
    master,
  };
}

export type MakeAllMetadataEntry =
  | { type: string; ok: true; result: MakeMetadataResult }
  | { type: string; ok: false; error: string };

/**
 * Run Make MetaData independently for every discovered archetype
 * (template_{type}.tex). Each type is parsed on its own so a failure in one
 * does not block the rest.
 */
export async function makeAllMetadata(args?: {
  write?: boolean;
}): Promise<MakeAllMetadataEntry[]> {
  const types = await discoverResumeTypes();
  const entries: MakeAllMetadataEntry[] = [];
  for (const { type } of types) {
    try {
      const result = await makeMetadataFromLatex({ type, write: args?.write });
      entries.push({ type, ok: true, result });
    } catch (error) {
      entries.push({
        type,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Make MetaData failed for this type",
      });
    }
  }
  return entries;
}
