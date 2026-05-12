# Agentic RAG Setup

This project now supports a vector-first retrieval path with safe fallback to keyword retrieval.

## Prompt strategy (minimal by default)

The active prompt design now intentionally avoids heavy scripted instruction trees.

Principles:
- Keep static system instructions short and stable.
- Let model reasoning handle phrasing and conversational flow.
- Keep strict structure only where required for parsing (`question_intent`, `model_patch`, JSON shape).
- Use retrieved vector evidence as guidance, not as user-confirmed facts.
- Enforce progression and patch safety in code-level guardrails rather than prompt micromanagement.

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
- Retrieved evidence is injected as coaching context to improve distinctions and definitions.
- Explicit user facts always override retrieved guidance when there is conflict.

When `AGENTIC_DUAL_RUN=true` and `ENABLE_AGENTIC_TURN=false`:
- Route returns legacy output.
- Agentic output is logged for comparison in debug logs.

## Notes

- pgvector extension installation may require elevated database permissions.
- If pgvector is unavailable, keyword fallback keeps the system operational.
- The prompt is intentionally concise; reliability should come from validators, intent gates,
  and domain-scoped patch application in runtime code.
