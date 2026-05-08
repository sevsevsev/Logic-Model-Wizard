# Agentic RAG Setup

This project now supports a vector-first retrieval path with safe fallback to keyword retrieval.

## Flags

Add these to `.env.local`:

- `ENABLE_AGENTIC_TURN=true` to serve agentic structured responses.
- `AGENTIC_DUAL_RUN=true` to execute agentic turn in parallel while still serving legacy response.
- `ENABLE_RAG_RETRIEVAL=true` to enable vector-first retrieval.
- `DATABASE_URL=...` required for pgvector storage.
- `GEMINI_API_KEY=...` required for embedding generation.

## One-time ingestion

1. Ensure Postgres is reachable via `DATABASE_URL`.
2. Ensure `GEMINI_API_KEY` is set.
3. Run:

```bash
npm run rag:ingest
```

The script will:
- Ensure the `rag_knowledge_chunks` table exists.
- Attempt to enable `vector` extension.
- Upsert seeded knowledge chunks with embeddings.

## Runtime behavior

When `ENABLE_RAG_RETRIEVAL=true`:
- Retrieval attempts vector search first.
- If embeddings or vector query fail, retrieval falls back to keyword scoring.

When `AGENTIC_DUAL_RUN=true` and `ENABLE_AGENTIC_TURN=false`:
- Route returns legacy output.
- Agentic output is logged for comparison in debug logs.

## Notes

- pgvector extension installation may require elevated database permissions.
- If pgvector is unavailable, keyword fallback keeps the system operational.
