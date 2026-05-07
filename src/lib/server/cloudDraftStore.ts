import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { Pool } from "pg";
import {
  type CloudDraftRecord,
  type PersistedDraft,
  isValidPersistedDraft,
} from "@/lib/drafts/types";
import {
  type FeedbackCapture,
  type DebugSnapshotCapture,
  type StoredFeedbackRecord,
  type StoredDebugSnapshotRecord,
  isValidFeedbackCapture,
  isValidDebugSnapshotCapture,
} from "@/lib/feedback/types";

interface CloudDraftDatabase {
  drafts: CloudDraftRecord[];
  feedback: StoredFeedbackRecord[];
  debugSnapshots: StoredDebugSnapshotRecord[];
}

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const USE_POSTGRES = Boolean(DATABASE_URL);
let postgresPool: Pool | null = null;
let postgresSchemaReady: Promise<void> | null = null;

function getPostgresPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!postgresPool) {
    postgresPool = new Pool({
      connectionString: DATABASE_URL,
      max: 3,
    });
  }

  return postgresPool;
}

async function ensurePostgresSchema(): Promise<void> {
  if (!USE_POSTGRES) return;

  if (!postgresSchemaReady) {
    postgresSchemaReady = (async () => {
      const pool = getPostgresPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS cloud_drafts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          persisted_draft JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);

      await pool.query(
        "CREATE INDEX IF NOT EXISTS cloud_drafts_user_updated_idx ON cloud_drafts (user_id, updated_at DESC);"
      );

      await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback_records (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          capture JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);

      await pool.query(
        "CREATE INDEX IF NOT EXISTS feedback_records_user_created_idx ON feedback_records (user_id, created_at DESC);"
      );

      await pool.query(`
        CREATE TABLE IF NOT EXISTS debug_snapshots (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          capture JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);

      await pool.query(
        "CREATE INDEX IF NOT EXISTS debug_snapshots_user_created_idx ON debug_snapshots (user_id, created_at DESC);"
      );

      // Migration: add addressed_at column if it does not yet exist.
      await pool.query(
        "ALTER TABLE debug_snapshots ADD COLUMN IF NOT EXISTS addressed_at TIMESTAMPTZ DEFAULT NULL;"
      );
    })();
  }

  await postgresSchemaReady;
}

function mapDraftRow(row: {
  id: string;
  user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  persisted_draft: PersistedDraft;
}): CloudDraftRecord {
  return {
    id: row.id,
    userId: row.user_id,
    schemaVersion: row.persisted_draft.schemaVersion,
    savedAt: row.persisted_draft.savedAt,
    draft: row.persisted_draft.draft,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapFeedbackRow(row: {
  id: string;
  user_id: string;
  created_at: Date | string;
  capture: FeedbackCapture;
}): StoredFeedbackRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
    capture: row.capture,
  };
}

function mapDebugRow(row: {
  id: string;
  user_id: string;
  created_at: Date | string;
  addressed_at?: Date | string | null;
  capture: DebugSnapshotCapture;
}): StoredDebugSnapshotRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
    addressedAt: row.addressed_at ? new Date(row.addressed_at).toISOString() : null,
    capture: row.capture,
  };
}

async function listCloudDraftsByUserPostgres(userId: string): Promise<CloudDraftRecord[]> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    updated_at: Date | string;
    persisted_draft: PersistedDraft;
  }>(
    `
      SELECT id, user_id, created_at, updated_at, persisted_draft
      FROM cloud_drafts
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId]
  );
  return result.rows.map(mapDraftRow);
}

async function getCloudDraftByIdPostgres(userId: string, id: string): Promise<CloudDraftRecord | null> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    updated_at: Date | string;
    persisted_draft: PersistedDraft;
  }>(
    `
      SELECT id, user_id, created_at, updated_at, persisted_draft
      FROM cloud_drafts
      WHERE user_id = $1 AND id = $2
      LIMIT 1
    `,
    [userId, id]
  );

  return result.rowCount ? mapDraftRow(result.rows[0]) : null;
}

async function saveCloudDraftPostgres(
  userId: string,
  persistedDraft: PersistedDraft,
  id?: string
): Promise<CloudDraftRecord> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const now = new Date().toISOString();

  if (id) {
    const updateResult = await pool.query<{
      id: string;
      user_id: string;
      created_at: Date | string;
      updated_at: Date | string;
      persisted_draft: PersistedDraft;
    }>(
      `
        UPDATE cloud_drafts
        SET persisted_draft = $3::jsonb,
            updated_at = $4::timestamptz
        WHERE user_id = $1 AND id = $2
        RETURNING id, user_id, created_at, updated_at, persisted_draft
      `,
      [userId, id, JSON.stringify(persistedDraft), now]
    );

    if (updateResult.rowCount) {
      return mapDraftRow(updateResult.rows[0]);
    }
  }

  const createdId = crypto.randomUUID();
  const insertResult = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    updated_at: Date | string;
    persisted_draft: PersistedDraft;
  }>(
    `
      INSERT INTO cloud_drafts (id, user_id, persisted_draft, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
      RETURNING id, user_id, created_at, updated_at, persisted_draft
    `,
    [createdId, userId, JSON.stringify(persistedDraft), now, now]
  );

  return mapDraftRow(insertResult.rows[0]);
}

async function deleteCloudDraftPostgres(userId: string, id: string): Promise<boolean> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const result = await pool.query(
    "DELETE FROM cloud_drafts WHERE user_id = $1 AND id = $2",
    [userId, id]
  );
  return (result.rowCount ?? 0) > 0;
}

async function saveFeedbackForUserPostgres(
  userId: string,
  capture: FeedbackCapture
): Promise<StoredFeedbackRecord> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    capture: FeedbackCapture;
  }>(
    `
      INSERT INTO feedback_records (id, user_id, capture, created_at)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz)
      RETURNING id, user_id, created_at, capture
    `,
    [id, userId, JSON.stringify(capture), now]
  );

  return mapFeedbackRow(result.rows[0]);
}

async function saveDebugSnapshotForUserPostgres(
  userId: string,
  capture: DebugSnapshotCapture
): Promise<StoredDebugSnapshotRecord> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    addressed_at: Date | string | null;
    capture: DebugSnapshotCapture;
  }>(
    `
      INSERT INTO debug_snapshots (id, user_id, capture, created_at)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz)
      RETURNING id, user_id, created_at, addressed_at, capture
    `,
    [id, userId, JSON.stringify(capture), now]
  );

  return mapDebugRow(result.rows[0]);
}

async function listDebugSnapshotsByUserPostgres(
  userId: string,
  limit = 100
): Promise<StoredDebugSnapshotRecord[]> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    addressed_at: Date | string | null;
    capture: DebugSnapshotCapture;
  }>(
    `
      SELECT id, user_id, created_at, addressed_at, capture
      FROM debug_snapshots
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, Math.max(1, limit)]
  );

  return result.rows.map(mapDebugRow);
}

async function listAllDebugSnapshotsPostgres(
  limit = 200
): Promise<StoredDebugSnapshotRecord[]> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    addressed_at: Date | string | null;
    capture: DebugSnapshotCapture;
  }>(
    `
      SELECT id, user_id, created_at, addressed_at, capture
      FROM debug_snapshots
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [Math.max(1, limit)]
  );

  return result.rows.map(mapDebugRow);
}

async function deleteDebugSnapshotPostgres(id: string): Promise<boolean> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const result = await pool.query(
    "DELETE FROM debug_snapshots WHERE id = $1",
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

async function markDebugSnapshotAddressedPostgres(id: string, addressed: boolean): Promise<StoredDebugSnapshotRecord | null> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const now = addressed ? new Date().toISOString() : null;
  const result = await pool.query<{
    id: string;
    user_id: string;
    created_at: Date | string;
    addressed_at: Date | string | null;
    capture: DebugSnapshotCapture;
  }>(
    `
      UPDATE debug_snapshots
      SET addressed_at = $2
      WHERE id = $1
      RETURNING id, user_id, created_at, addressed_at, capture
    `,
    [id, now]
  );
  return result.rowCount ? mapDebugRow(result.rows[0]) : null;
}

function resolveDbPath(): string {
  const configuredPath = process.env.CLOUD_DRAFT_DB_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  // Serverless runtimes (e.g. Vercel) expose a read-only app filesystem, but /tmp is writable.
  if (process.env.VERCEL) {
    return path.join("/tmp", "cloud-drafts.json");
  }

  return path.join(process.cwd(), ".data", "cloud-drafts.json");
}

const DB_PATH = resolveDbPath();

async function ensureDbFile(): Promise<void> {
  const folder = path.dirname(DB_PATH);
  await fs.mkdir(folder, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    const seed: CloudDraftDatabase = { drafts: [], feedback: [], debugSnapshots: [] };
    await fs.writeFile(DB_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function readDb(): Promise<CloudDraftDatabase> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as CloudDraftDatabase;
    if (!parsed || !Array.isArray(parsed.drafts)) {
      return { drafts: [], feedback: [], debugSnapshots: [] };
    }
    return {
      drafts: parsed.drafts,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      debugSnapshots: Array.isArray(parsed.debugSnapshots) ? parsed.debugSnapshots : [],
    };
  } catch {
    return { drafts: [], feedback: [], debugSnapshots: [] };
  }
}

async function writeDb(db: CloudDraftDatabase): Promise<void> {
  await ensureDbFile();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function listCloudDraftsByUser(userId: string): Promise<CloudDraftRecord[]> {
  if (USE_POSTGRES) {
    return listCloudDraftsByUserPostgres(userId);
  }

  const db = await readDb();
  return db.drafts
    .filter((d) => d.userId === userId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getCloudDraftById(
  userId: string,
  id: string
): Promise<CloudDraftRecord | null> {
  if (USE_POSTGRES) {
    return getCloudDraftByIdPostgres(userId, id);
  }

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

  if (USE_POSTGRES) {
    return saveCloudDraftPostgres(userId, persistedDraft, id);
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
  if (USE_POSTGRES) {
    return deleteCloudDraftPostgres(userId, id);
  }

  const db = await readDb();
  const before = db.drafts.length;
  db.drafts = db.drafts.filter((d) => !(d.userId === userId && d.id === id));
  const changed = db.drafts.length < before;
  if (changed) {
    await writeDb(db);
  }
  return changed;
}

export async function saveFeedbackForUser(
  userId: string,
  capture: FeedbackCapture
): Promise<StoredFeedbackRecord> {
  if (!isValidFeedbackCapture(capture)) {
    throw new Error("Invalid feedback payload");
  }

  if (USE_POSTGRES) {
    return saveFeedbackForUserPostgres(userId, capture);
  }

  const db = await readDb();
  const now = new Date().toISOString();

  const record: StoredFeedbackRecord = {
    id: crypto.randomUUID(),
    userId,
    createdAt: now,
    capture,
  };

  db.feedback.push(record);
  await writeDb(db);

  return record;
}

export async function saveDebugSnapshotForUser(
  userId: string,
  capture: DebugSnapshotCapture
): Promise<StoredDebugSnapshotRecord> {
  if (!isValidDebugSnapshotCapture(capture)) {
    throw new Error("Invalid debug snapshot payload");
  }

  if (USE_POSTGRES) {
    return saveDebugSnapshotForUserPostgres(userId, capture);
  }

  const db = await readDb();
  const now = new Date().toISOString();

  const record: StoredDebugSnapshotRecord = {
    id: crypto.randomUUID(),
    userId,
    createdAt: now,
    addressedAt: null,
    capture,
  };

  db.debugSnapshots.push(record);
  await writeDb(db);

  return record;
}

export async function listDebugSnapshotsByUser(
  userId: string,
  limit = 100
): Promise<StoredDebugSnapshotRecord[]> {
  if (USE_POSTGRES) {
    return listDebugSnapshotsByUserPostgres(userId, limit);
  }

  const db = await readDb();
  return db.debugSnapshots
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, Math.max(1, limit))
    .map((e) => ({ ...e, addressedAt: e.addressedAt ?? null }));
}

export async function listAllDebugSnapshots(
  limit = 200
): Promise<StoredDebugSnapshotRecord[]> {
  if (USE_POSTGRES) {
    return listAllDebugSnapshotsPostgres(limit);
  }

  const db = await readDb();
  return db.debugSnapshots
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, Math.max(1, limit))
    .map((e) => ({ ...e, addressedAt: e.addressedAt ?? null }));
}

export async function deleteDebugSnapshot(id: string): Promise<boolean> {
  if (USE_POSTGRES) {
    return deleteDebugSnapshotPostgres(id);
  }

  const db = await readDb();
  const before = db.debugSnapshots.length;
  db.debugSnapshots = db.debugSnapshots.filter((s) => s.id !== id);
  if (db.debugSnapshots.length === before) return false;
  await writeDb(db);
  return true;
}

export async function markDebugSnapshotAddressed(
  id: string,
  addressed: boolean
): Promise<StoredDebugSnapshotRecord | null> {
  if (USE_POSTGRES) {
    return markDebugSnapshotAddressedPostgres(id, addressed);
  }

  const db = await readDb();
  const entry = db.debugSnapshots.find((s) => s.id === id);
  if (!entry) return null;
  entry.addressedAt = addressed ? new Date().toISOString() : null;
  await writeDb(db);
  return entry;
}
