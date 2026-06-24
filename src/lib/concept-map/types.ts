export type LogicStage =
  | "resource"
  | "activity"
  | "output"
  | "short_term"
  | "medium_term"
  | "long_term"
  | "impact"
  | "other";

export type EdgeType = "semantic_similar" | "co_occurs" | "causal_link" | "taxonomy";

export interface ConceptMapNode {
  id: string;
  label: string;
  canonical_label?: string;
  description?: string;
  body_text?: string;
  source_type?: string;
  source_id?: string;
  source_title?: string;
  stakeholder_ids?: string[];
  logic_stage: LogicStage;
  tags?: string[];
  cluster_id?: string;
  cluster_label?: string;
}

export interface ConceptMapEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: EdgeType;
  weight: number;
  evidence_snippet?: string;
  evidence_source_id?: string;
}

export interface ConceptMapGraph {
  nodes: ConceptMapNode[];
  edges: ConceptMapEdge[];
  metadata: {
    source: "mock" | "postgres";
    minWeight: number;
    stage: LogicStage | "all";
    maxNodes: number;
  };
}

export interface ConceptMapQuery {
  minWeight?: number;
  maxNodes?: number;
  stage?: LogicStage | "all";
}
