import { Pool } from "pg";

// .env.local is loaded by tsx via --env-file flag in package.json

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL not set. Add it to .env.local and re-run.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  // Check whether the topic column exists yet (it is added by rag:ingest migration).
  const colCheck = await pool.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'rag_knowledge_chunks' AND column_name = 'topic'
  `);
  const hasTopicCol = colCheck.rows.length > 0;

  const selectCols = hasTopicCol
    ? "id, title, topic, tags, updated_at"
    : "id, title, tags, updated_at";

  const orderBy = hasTopicCol ? "topic ASC, id ASC" : "id ASC";

  let rows: Array<{
    id: string;
    title: string;
    topic?: string;
    tags: string[];
    updated_at: Date;
  }>;

  try {
    const result = await pool.query<{
      id: string;
      title: string;
      topic?: string;
      tags: string[];
      updated_at: Date;
    }>(`SELECT ${selectCols} FROM rag_knowledge_chunks ORDER BY ${orderBy}`);
    rows = result.rows;
  } catch (err) {
    console.error(
      "Could not query rag_knowledge_chunks — table may not exist yet. Run npm run rag:ingest first."
    );
    console.error(err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log("\nNo chunks in database. Run: npm run rag:ingest\n");
    await pool.end();
    return;
  }

  if (hasTopicCol) {
    // Group by topic
    const byTopic = new Map<string, typeof rows>();
    for (const row of rows) {
      const topic = row.topic ?? "unknown";
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic)!.push(row);
    }

    console.log(`\nVector Knowledge Base  —  ${rows.length} total chunks\n`);
    console.log("─".repeat(70));

    for (const [topic, topicRows] of [...byTopic.entries()].sort()) {
      console.log(`\n  [${topic}]  (${topicRows.length} chunks)`);
      for (const row of topicRows) {
        const tags = row.tags.length > 0 ? `  [${row.tags.join(", ")}]` : "";
        console.log(`    ${row.id.padEnd(38)} ${row.title}${tags}`);
      }
    }

    console.log("\n" + "─".repeat(70));

    // Coverage summary
    console.log("\n  Topic coverage summary:");
    const allTopics = [
      "framework-foundation",
      "geography",
      "population",
      "intended-impact",
      "resources",
      "activities",
      "outputs",
      "outcomes",
      "fidelity-quality",
      "stakeholders",
      "examples",
      "errors-misconceptions",
    ];
    for (const topic of allTopics) {
      const count = byTopic.get(topic)?.length ?? 0;
      const bar = count > 0 ? "█".repeat(Math.min(count, 20)) : "░ (empty)";
      console.log(`    ${topic.padEnd(26)} ${String(count).padStart(2)}  ${bar}`);
    }
    console.log();
  } else {
    console.log(
      `\nVector Knowledge Base  —  ${rows.length} total chunks  (topic column not yet added — run rag:ingest to migrate)\n`
    );
    console.log("─".repeat(70));
    for (const row of rows) {
      console.log(`  ${row.id.padEnd(40)} ${row.title}`);
    }
    console.log();
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
