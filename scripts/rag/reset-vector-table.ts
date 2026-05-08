/**
 * Drops and recreates the rag_knowledge_chunks table.
 * Run this once when changing the embedding model / vector dimensions.
 * Usage: npm run rag:reset-table
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFromFile(path.join(process.cwd(), ".env.local"));
loadEnvFromFile(path.join(process.cwd(), ".env"));

import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query("DROP TABLE IF EXISTS rag_knowledge_chunks CASCADE;");
    console.log("Table rag_knowledge_chunks dropped (or did not exist).");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
