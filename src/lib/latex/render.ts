import {
  escapeLatex,
  loadMasterResume,
  mergeTailoredResume,
  type MasterExperience,
} from "@/lib/resume/master";
import type { LayoutCompressOpts } from "@/lib/agents/compress";
import {
  HEADER_LOCATION_DEFAULT,
  resolveHeaderLocation,
  type HeaderLocationDecision,
} from "@/lib/resume/headerLocation";
import type { RoleFamily, TailoredResume } from "@/lib/types";
import { readFile } from "fs/promises";
import path from "path";

function replaceMarkedSection(
  source: string,
  startMarker: string,
  endMarker: string,
  replacement: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return source;
  const before = source.slice(0, start + startMarker.length);
  const after = source.slice(end);
  return `${before}\n${replacement}\n${after}`;
}

function formatSkillLines(groups: { label: string; items: string[] }[]): string {
  return groups
    .filter((g) => g.items.length > 0)
    .map(
      (g) =>
        `\\textbf{${escapeLatex(g.label)}:} ${escapeLatex(g.items.join(", "))} \\\\`,
    )
    .join("\n");
}

function formatJobBlock(job: MasterExperience): string {
  const linkPart = job.link ? ` \\href{${job.link}}{Link}` : "";
  const header = `\\textbf{${escapeLatex(job.title)}} -- \\textit{${escapeLatex(job.organization)}, ${escapeLatex(job.location)}}${linkPart} \\hfill ${escapeLatex(job.start)} -- ${escapeLatex(job.end)}`;
  const items = job.bullets
    .map((b) => `    \\item ${escapeLatex(b.text)}`)
    .join("\n");
  return `${header}\n\\begin{itemize}[leftmargin=*, nosep]\n${items}\n\\end{itemize}\n\\vspace{2pt}`;
}

/** Trim project itemize blocks + optionally drop whole projects / research. */
function applyLayoutToTemplate(
  tex: string,
  layout: LayoutCompressOpts,
): string {
  let out = tex;

  // Never wipe Academic Research — section stays even on overflow tiers.
  // (dropResearch is reserved/always false)

  const start = out.indexOf("% === PROJECTS_START ===");
  const end = out.indexOf("% === PROJECTS_END ===");
  if (start === -1 || end === -1 || end < start) return out;

  let projectsBody = out.slice(
    start + "% === PROJECTS_START ===".length,
    end,
  );

  // Limit bullets inside each itemize
  if (Number.isFinite(layout.projectMaxBullets)) {
    const max = layout.projectMaxBullets as number;
    projectsBody = projectsBody.replace(
      /(\\begin\{itemize\}\[[^\]]*\]\s*)([\s\S]*?)(\\end\{itemize\})/g,
      (_m, open: string, body: string, close: string) => {
        const items = [...body.matchAll(/\\item\s+[\s\S]*?(?=\\item\s+|$)/g)].map(
          (x) => x[0].trimEnd(),
        );
        const kept = items.slice(0, max).join("\n");
        return `${open}\n${kept}\n${close}`;
      },
    );
  }

  // Keep only first N project blocks (header + itemize + optional vspace)
  if (Number.isFinite(layout.projectMaxCount)) {
    const maxProjects = layout.projectMaxCount as number;
    const sectionHeader = projectsBody.match(/^[\s\S]*?\\section\*\{TECHNICAL PROJECTS\}/)?.[0] ?? "\\section*{TECHNICAL PROJECTS}\n";
    const rest = projectsBody.replace(/^[\s\S]*?\\section\*\{TECHNICAL PROJECTS\}\s*/, "");
    const blocks = rest.split(/(?=\\textbf\{)/).filter((b) => b.trim());
    const kept = blocks.slice(0, maxProjects).join("\n");
    projectsBody = `${sectionHeader}\n${kept}`;
  }

  return (
    out.slice(0, start + "% === PROJECTS_START ===".length) +
    "\n" +
    projectsBody.trim() +
    "\n" +
    out.slice(end)
  );
}

/**
 * Swap the city in the frozen HEADER block (first field before `|`).
 * Keeps phone / email / links unchanged.
 */
export function applyHeaderLocation(
  tex: string,
  headerLocation: string,
): string {
  const startMarker = "% === HEADER_START ===";
  const endMarker = "% === HEADER_END ===";
  const start = tex.indexOf(startMarker);
  const end = tex.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return tex;

  const before = tex.slice(0, start + startMarker.length);
  const body = tex.slice(start + startMarker.length, end);
  const after = tex.slice(end);

  // Contact line is the one with "City | phone | …"
  const updated = body.replace(
    /^(\s*)([^|\n]+?)(\s*\|\s*)/m,
    (_m, indent: string, _oldLoc: string, sep: string) =>
      `${indent}${escapeLatex(headerLocation)}${sep}`,
  );

  return `${before}${updated}${after}`;
}

const DEFAULT_LAYOUT: LayoutCompressOpts = {
  projectMaxBullets: Infinity,
  projectMaxCount: Infinity,
  dropResearch: false,
};

/**
 * Merge tailored patches into the frozen template — preserve job headers,
 * grouped skills. Optional layout compress for projects/research on overflow.
 * Optional `detectedLocation` (Controls field) drives header city mapping.
 */
export async function renderLatex(
  tailored: TailoredResume,
  roleFamily: RoleFamily = "other",
  layout: LayoutCompressOpts = DEFAULT_LAYOUT,
  detectedLocation: string = "",
): Promise<{ tex: string; headerDecision: HeaderLocationDecision }> {
  const templatePath = path.join(process.cwd(), "data", "template.tex");
  let tex = await readFile(templatePath, "utf8");
  const master = await loadMasterResume();

  const merged = mergeTailoredResume(master, tailored, roleFamily);

  const skillsBody = [
    "\\section*{TECHNICAL SKILLS}",
    formatSkillLines(merged.skillGroups),
  ].join("\n");

  const experienceBody = [
    "\\section*{WORK EXPERIENCE}",
    ...merged.experience.map(formatJobBlock),
  ].join("\n");

  tex = replaceMarkedSection(
    tex,
    "% === SKILLS_START ===",
    "% === SKILLS_END ===",
    skillsBody,
  );

  tex = replaceMarkedSection(
    tex,
    "% === EXPERIENCE_START ===",
    "% === EXPERIENCE_END ===",
    experienceBody,
  );

  const headerDecision = resolveHeaderLocation(detectedLocation);
  tex = applyHeaderLocation(
    tex,
    headerDecision.headerLocation || HEADER_LOCATION_DEFAULT,
  );

  return {
    tex: applyLayoutToTemplate(tex, layout),
    headerDecision,
  };
}

/** @deprecated use renderLatex */
export async function renderLatexStub(
  tailored: TailoredResume,
  roleFamily?: RoleFamily,
): Promise<string> {
  const { tex } = await renderLatex(tailored, roleFamily);
  return tex;
}
