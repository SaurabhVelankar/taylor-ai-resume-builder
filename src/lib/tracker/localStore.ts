import { mkdir, readFile, readdir, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import type { ApplicationStore } from "./store";
import {
  ApplicationRecordSchema,
  type ApplicationRecord,
} from "./types";

const DIR = path.join(process.cwd(), "data", "applications");

async function ensureDir(): Promise<void> {
  await mkdir(DIR, { recursive: true });
}

function recordPath(id: string): string {
  return path.join(DIR, `${id}.json`);
}

async function readRecordFile(file: string): Promise<ApplicationRecord | null> {
  try {
    const raw = await readFile(path.join(DIR, file), "utf8");
    const parsed = ApplicationRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Atomic write: temp file + rename, so a crash can't leave half-written JSON. */
async function writeRecord(record: ApplicationRecord): Promise<void> {
  const tmp = `${recordPath(record.id)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(tmp, recordPath(record.id));
}

/** One JSON file per record under data/applications/ (gitignored). */
export function createLocalStore(): ApplicationStore {
  return {
    async list() {
      await ensureDir();
      const files = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
      const records = await Promise.all(files.map(readRecordFile));
      return records
        .filter((r): r is ApplicationRecord => r !== null)
        .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
    },

    async get(id) {
      await ensureDir();
      return readRecordFile(`${id}.json`);
    },

    async create(input) {
      await ensureDir();
      const record = ApplicationRecordSchema.parse({
        ...input,
        id: crypto.randomUUID(),
        schemaVersion: 2,
        appliedAt: new Date().toISOString(),
        status: input.status ?? "applied",
        notes: input.notes ?? "",
      });
      await writeRecord(record);
      return record;
    },

    async update(id, patch) {
      await ensureDir();
      const existing = await readRecordFile(`${id}.json`);
      if (!existing) throw new Error("Application not found");
      const updated = ApplicationRecordSchema.parse({ ...existing, ...patch });
      await writeRecord(updated);
      return updated;
    },

    async remove(id) {
      try {
        await unlink(recordPath(id));
      } catch {
        // already gone — treat as success
      }
    },
  };
}
