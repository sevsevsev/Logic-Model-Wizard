import { Pool } from "pg";
import type {
  ConceptMapEdge,
  ConceptMapGraph,
  ConceptMapNode,
  ConceptMapQuery,
  LogicStage,
} from "@/lib/concept-map/types";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const USE_POSTGRES = Boolean(DATABASE_URL);

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  }

  return pool;
}

async function ensureConceptMapSchema(): Promise<void> {
  if (!USE_POSTGRES) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const pg = getPool();

      await pg.query(`
        CREATE TABLE IF NOT EXISTS concept_map_nodes (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          canonical_label TEXT,
          description TEXT,
          body_text TEXT,
          source_type TEXT,
          source_id TEXT,
          source_title TEXT,
          stakeholder_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          logic_stage TEXT NOT NULL DEFAULT 'other',
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          embedding_json JSONB,
          embedding_model TEXT,
          cluster_id TEXT,
          cluster_label TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await pg.query(
        "CREATE INDEX IF NOT EXISTS concept_map_nodes_stage_idx ON concept_map_nodes (logic_stage);"
      );
      await pg.query(
        "CREATE INDEX IF NOT EXISTS concept_map_nodes_cluster_idx ON concept_map_nodes (cluster_id);"
      );

      await pg.query(`
        CREATE TABLE IF NOT EXISTS concept_map_edges (
          id TEXT PRIMARY KEY,
          from_node_id TEXT NOT NULL REFERENCES concept_map_nodes(id) ON DELETE CASCADE,
          to_node_id TEXT NOT NULL REFERENCES concept_map_nodes(id) ON DELETE CASCADE,
          edge_type TEXT NOT NULL,
          weight DOUBLE PRECISION NOT NULL,
          evidence_snippet TEXT,
          evidence_source_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await pg.query(
        "CREATE INDEX IF NOT EXISTS concept_map_edges_from_idx ON concept_map_edges (from_node_id);"
      );
      await pg.query(
        "CREATE INDEX IF NOT EXISTS concept_map_edges_to_idx ON concept_map_edges (to_node_id);"
      );
      await pg.query(
        "CREATE INDEX IF NOT EXISTS concept_map_edges_weight_idx ON concept_map_edges (weight DESC);"
      );
    })();
  }

  await schemaReady;
}

const MOCK_GRAPH: ConceptMapGraph = {
  nodes: [
    {
      id: "impact",
      label: "Intended Impact",
      logic_stage: "impact",
      cluster_id: "north-star",
      cluster_label: "Impact Framing",
      description: "Defines who changes, where, and in what long-term way.",
      tags: ["population", "geography", "goal"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "resources",
      label: "Resources",
      logic_stage: "resource",
      cluster_id: "implementation",
      cluster_label: "Implementation Design",
      description: "Human, material, financial, and knowledge inputs required for delivery.",
      tags: ["inputs", "capacity"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "activities",
      label: "Activities",
      logic_stage: "activity",
      cluster_id: "implementation",
      cluster_label: "Implementation Design",
      description: "Verb-based program actions that transform resources into direct work.",
      tags: ["delivery", "strategy"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "outputs",
      label: "Outputs",
      logic_stage: "output",
      cluster_id: "implementation",
      cluster_label: "Implementation Design",
      description: "Immediate deliverables such as sessions delivered or participants reached.",
      tags: ["counts", "reach"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "fidelity",
      label: "Program Fidelity",
      logic_stage: "other",
      cluster_id: "quality",
      cluster_label: "Quality & Fidelity",
      description: "Whether core components are delivered as intended.",
      tags: ["adherence", "dosage"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "quality",
      label: "Program Quality",
      logic_stage: "other",
      cluster_id: "quality",
      cluster_label: "Quality & Fidelity",
      description: "How well participants experience program delivery.",
      tags: ["experience", "engagement"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "short-term",
      label: "Short-Term Outcomes",
      logic_stage: "short_term",
      cluster_id: "outcomes",
      cluster_label: "Outcome Progression",
      description: "Knowledge, awareness, and attitude changes soon after participation.",
      tags: ["learning", "confidence"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "medium-term",
      label: "Medium-Term Outcomes",
      logic_stage: "medium_term",
      cluster_id: "outcomes",
      cluster_label: "Outcome Progression",
      description: "Behavior and skill changes that follow early learning gains.",
      tags: ["behavior", "skills"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "long-term",
      label: "Long-Term Outcomes",
      logic_stage: "long_term",
      cluster_id: "outcomes",
      cluster_label: "Outcome Progression",
      description: "Durable condition/status changes aligned with intended impact.",
      tags: ["status", "durable-change"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
    {
      id: "stakeholders",
      label: "Stakeholders",
      logic_stage: "other",
      cluster_id: "context",
      cluster_label: "Actors & Context",
      description: "Participants, families, partners, funders, and staff linked to model elements.",
      tags: ["actors", "attribution"],
      source_type: "knowledge_base",
      source_title: "Logic Model Glossary",
    },
  ],
  edges: [
    { id: "e1", from_node_id: "resources", to_node_id: "activities", edge_type: "causal_link", weight: 0.95 },
    { id: "e2", from_node_id: "activities", to_node_id: "outputs", edge_type: "causal_link", weight: 0.93 },
    { id: "e3", from_node_id: "outputs", to_node_id: "short-term", edge_type: "causal_link", weight: 0.9 },
    { id: "e4", from_node_id: "short-term", to_node_id: "medium-term", edge_type: "causal_link", weight: 0.89 },
    { id: "e5", from_node_id: "medium-term", to_node_id: "long-term", edge_type: "causal_link", weight: 0.9 },
    { id: "e6", from_node_id: "long-term", to_node_id: "impact", edge_type: "causal_link", weight: 0.92 },
    { id: "e7", from_node_id: "fidelity", to_node_id: "quality", edge_type: "semantic_similar", weight: 0.78 },
    { id: "e8", from_node_id: "fidelity", to_node_id: "outputs", edge_type: "co_occurs", weight: 0.72 },
    { id: "e9", from_node_id: "quality", to_node_id: "short-term", edge_type: "co_occurs", weight: 0.69 },
    { id: "e10", from_node_id: "stakeholders", to_node_id: "activities", edge_type: "taxonomy", weight: 0.74 },
    { id: "e11", from_node_id: "stakeholders", to_node_id: "short-term", edge_type: "taxonomy", weight: 0.71 },
  ],
  metadata: {
    source: "mock",
    minWeight: 0.7,
    stage: "all",
    maxNodes: 50,
  },
};

function stageFilter(nodes: ConceptMapNode[], stage: LogicStage | "all"): ConceptMapNode[] {
  if (stage === "all") return nodes;
  return nodes.filter((node) => node.logic_stage === stage);
}

function graphFromMock(query: Required<ConceptMapQuery>): ConceptMapGraph {
  const filteredNodes = stageFilter(MOCK_GRAPH.nodes, query.stage).slice(0, query.maxNodes);
  const allowedIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = MOCK_GRAPH.edges
    .filter((edge) => edge.weight >= query.minWeight)
    .filter((edge) => allowedIds.has(edge.from_node_id) && allowedIds.has(edge.to_node_id));

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    metadata: {
      source: "mock",
      minWeight: query.minWeight,
      stage: query.stage,
      maxNodes: query.maxNodes,
    },
  };
}

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
  }
  return out;
}

export async function getConceptMapGraph(input: ConceptMapQuery = {}): Promise<ConceptMapGraph> {
  const query: Required<ConceptMapQuery> = {
    minWeight: Number.isFinite(input.minWeight) ? Math.min(1, Math.max(0, input.minWeight ?? 0.7)) : 0.7,
    maxNodes: Number.isFinite(input.maxNodes) ? Math.min(250, Math.max(1, Math.floor(input.maxNodes ?? 50))) : 50,
    stage: input.stage ?? "all",
  };

  if (!USE_POSTGRES) {
    return graphFromMock(query);
  }

  await ensureConceptMapSchema();

  const pg = getPool();
  const stageClause = query.stage === "all" ? "" : "WHERE logic_stage = $1";
  const stageParams = query.stage === "all" ? [] : [query.stage];

  const nodesResult = await pg.query<{
    id: string;
    label: string;
    canonical_label: string | null;
    description: string | null;
    body_text: string | null;
    source_type: string | null;
    source_id: string | null;
    source_title: string | null;
    stakeholder_ids: unknown;
    logic_stage: string;
    tags: unknown;
    cluster_id: string | null;
    cluster_label: string | null;
  }>(
    `
      SELECT
        id,
        label,
        canonical_label,
        description,
        body_text,
        source_type,
        source_id,
        source_title,
        stakeholder_ids,
        logic_stage,
        tags,
        cluster_id,
        cluster_label
      FROM concept_map_nodes
      ${stageClause}
      ORDER BY updated_at DESC
      LIMIT ${query.maxNodes}
    `,
    stageParams
  );

  if (nodesResult.rowCount === 0) {
    return graphFromMock(query);
  }

  const nodes: ConceptMapNode[] = nodesResult.rows.map((row) => ({
    id: row.id,
    label: row.label,
    canonical_label: row.canonical_label ?? undefined,
    description: row.description ?? undefined,
    body_text: row.body_text ?? undefined,
    source_type: row.source_type ?? undefined,
    source_id: row.source_id ?? undefined,
    source_title: row.source_title ?? undefined,
    stakeholder_ids: parseJsonStringArray(row.stakeholder_ids),
    logic_stage: (row.logic_stage as LogicStage) ?? "other",
    tags: parseJsonStringArray(row.tags),
    cluster_id: row.cluster_id ?? undefined,
    cluster_label: row.cluster_label ?? undefined,
  }));

  const nodeIds = nodes.map((node) => node.id);
  const edgesResult = await pg.query<{
    id: string;
    from_node_id: string;
    to_node_id: string;
    edge_type: ConceptMapEdge["edge_type"];
    weight: number;
    evidence_snippet: string | null;
    evidence_source_id: string | null;
  }>(
    `
      SELECT id, from_node_id, to_node_id, edge_type, weight, evidence_snippet, evidence_source_id
      FROM concept_map_edges
      WHERE from_node_id = ANY($1::text[])
        AND to_node_id = ANY($1::text[])
        AND weight >= $2
      ORDER BY weight DESC
    `,
    [nodeIds, query.minWeight]
  );

  const edges: ConceptMapEdge[] = edgesResult.rows.map((row) => ({
    id: row.id,
    from_node_id: row.from_node_id,
    to_node_id: row.to_node_id,
    edge_type: row.edge_type,
    weight: row.weight,
    evidence_snippet: row.evidence_snippet ?? undefined,
    evidence_source_id: row.evidence_source_id ?? undefined,
  }));

  return {
    nodes,
    edges,
    metadata: {
      source: "postgres",
      minWeight: query.minWeight,
      stage: query.stage,
      maxNodes: query.maxNodes,
    },
  };
}
