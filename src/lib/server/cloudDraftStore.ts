import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  type CloudDraftRecord,
  type PersistedDraft,
  isValidPersistedDraft,
} from "@/lib/drafts/types";

interface CloudDraftDatabase {
  drafts: CloudDraftRecord[];
}

const DB_PATH = path.join(process.cwd(), ".data", "cloud-drafts.json");

async function ensureDbFile(): Promise<void> {
  const folder = path.dirname(DB_PATH);
  await fs.mkdir(folder, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    const seed: CloudDraftDatabase = { drafts: [] };
    await fs.writeFile(DB_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function readDb(): Promise<CloudDraftDatabase> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as CloudDraftDatabase;
    if (!parsed || !Array.isArray(parsed.drafts)) {
      return { drafts: [] };
    }
    return parsed;
  } catch {
    return { drafts: [] };
  }
}

async function writeDb(db: CloudDraftDatabase): Promise<void> {
  await ensureDbFile();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function listCloudDraftsByUser(userId: string): Promise<CloudDraftRecord[]> {
  const db = await readDb();
  return db.drafts
    .filter((d) => d.userId === userId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getCloudDraftById(
  userId: string,
  id: string
): Promise<CloudDraftRecord | null> {
  const db = await readDb();
  return db.drafts.find((d) => d.userId === userId && d.id === id) ?? null;
}

export async function saveCloudDraft(
  userId: string,
  persistedDraft: PersistedDraft,
  id?: string
): Promise<CloudDraftRecord> {
  if (!isValidPersistedDraft(persistedDraft)) {
    throw new Error("Invalid draft payload");
  }

  const db = await readDb();
  const now = new Date().toISOString();

  if (id) {
    const existingIndex = db.drafts.findIndex(
      (d) => d.userId === userId && d.id === id
    );

    if (existingIndex >= 0) {
      const updated: CloudDraftRecord = {
        ...db.drafts[existingIndex],
        ...persistedDraft,
        updatedAt: now,
      };
      db.drafts[existingIndex] = updated;
      await writeDb(db);
      return updated;
    }
  }

  const created: CloudDraftRecord = {
    id: crypto.randomUUID(),
    userId,
    ...persistedDraft,
    createdAt: now,
    updatedAt: now,
  };

  db.drafts.push(created);
  await writeDb(db);
  return created;
}

export async function deleteCloudDraft(userId: string, id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.drafts.length;
  db.drafts = db.drafts.filter((d) => !(d.userId === userId && d.id === id));
  const changed = db.drafts.length < before;
  if (changed) {
    await writeDb(db);
  }
  return changed;
}
