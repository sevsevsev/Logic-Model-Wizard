"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConceptMapGraph, ConceptMapNode, LogicStage } from "@/lib/concept-map/types";

const STAGES: Array<{ value: LogicStage | "all"; label: string }> = [
  { value: "all", label: "All stages" },
  { value: "resource", label: "Resources" },
  { value: "activity", label: "Activities" },
  { value: "output", label: "Outputs" },
  { value: "short_term", label: "Short-term outcomes" },
  { value: "medium_term", label: "Medium-term outcomes" },
  { value: "long_term", label: "Long-term outcomes" },
  { value: "impact", label: "Intended impact" },
  { value: "other", label: "Other" },
];

const STAGE_COLORS: Record<LogicStage | "all", string> = {
  all: "#0b315b",
  resource: "#1f6fb2",
  activity: "#277da1",
  output: "#43aa8b",
  short_term: "#90be6d",
  medium_term: "#f9c74f",
  long_term: "#f8961e",
  impact: "#e76f51",
  other: "#7a8494",
};

const WIDTH = 980;
const HEIGHT = 560;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS = 210;

function toPolar(index: number, total: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  return {
    x: CENTER_X + Math.cos(angle) * RADIUS,
    y: CENTER_Y + Math.sin(angle) * RADIUS,
  };
}

function nodeRadius(node: ConceptMapNode): number {
  if (node.logic_stage === "impact") return 23;
  if (node.logic_stage === "long_term") return 20;
  if (node.logic_stage === "medium_term") return 18;
  return 16;
}

export default function ConceptMapExplorer() {
  const [graph, setGraph] = useState<ConceptMapGraph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minWeight, setMinWeight] = useState(0.72);
  const [stage, setStage] = useState<LogicStage | "all">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGraph() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          minWeight: String(minWeight),
          maxNodes: "60",
          stage,
        });

        const response = await fetch(`/api/concept-map/graph?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        const payload = (await response.json()) as ConceptMapGraph & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || `Request failed (${response.status}).`);
        }

        setGraph(payload);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load concept graph.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadGraph();
    return () => controller.abort();
  }, [minWeight, stage]);

  const layout = useMemo(() => {
    if (!graph) return new Map<string, { x: number; y: number }>();
    const sorted = [...graph.nodes].sort((a, b) => a.label.localeCompare(b.label));
    const positions = new Map<string, { x: number; y: number }>();

    sorted.forEach((node, index) => {
      const base = toPolar(index, sorted.length);
      const jitter = (index % 5) * 7;
      positions.set(node.id, { x: base.x + jitter, y: base.y - jitter });
    });

    return positions;
  }, [graph]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedNeighbors = useMemo(() => {
    if (!graph || !selectedNode) return [];
    const relatedIds = new Set<string>();
    graph.edges.forEach((edge) => {
      if (edge.from_node_id === selectedNode.id) relatedIds.add(edge.to_node_id);
      if (edge.to_node_id === selectedNode.id) relatedIds.add(edge.from_node_id);
    });
    return graph.nodes.filter((node) => relatedIds.has(node.id));
  }, [graph, selectedNode]);

  return (
    <section className="rounded-xl border border-[#9fc3da] bg-white shadow-sm">
      <header className="border-b border-[#c6deed] px-5 py-4">
        <h2 className="font-display text-xl font-semibold text-[#0b315b]">Concept Map Explorer</h2>
        <p className="mt-1 text-sm text-[#48617c]">
          Visualize semantic concepts and relationship strength in your vector-backed knowledge graph.
        </p>
      </header>

      <div className="grid gap-4 border-b border-[#e2edf5] px-5 py-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-[#284a69]">
          Logic stage
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value as LogicStage | "all")}
            className="rounded-md border border-[#9fc3da] bg-white px-3 py-2 text-sm text-[#0b315b]"
          >
            {STAGES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-[#284a69]">
          Edge threshold: {minWeight.toFixed(2)}
          <input
            type="range"
            min={0.5}
            max={0.98}
            step={0.01}
            value={minWeight}
            onChange={(event) => setMinWeight(Number(event.target.value))}
            className="accent-[#1f6fb2]"
          />
        </label>

        <div className="rounded-md border border-[#d2e5f2] bg-[#f5fbff] px-3 py-2 text-sm text-[#355879]">
          <p>
            <span className="font-semibold">Source:</span> {graph?.metadata.source ?? "-"}
          </p>
          <p>
            <span className="font-semibold">Nodes:</span> {graph?.nodes.length ?? 0} · <span className="font-semibold">Edges:</span>{" "}
            {graph?.edges.length ?? 0}
          </p>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-[#c6deed] bg-[#f7fbff]">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[420px] w-full">
            <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#f7fbff" />

            {graph?.edges.map((edge) => {
              const source = layout.get(edge.from_node_id);
              const target = layout.get(edge.to_node_id);
              if (!source || !target) return null;

              const edgeOpacity = 0.15 + edge.weight * 0.7;

              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#5488b1"
                  strokeWidth={1 + edge.weight * 2.2}
                  opacity={edgeOpacity}
                />
              );
            })}

            {graph?.nodes.map((node) => {
              const position = layout.get(node.id);
              if (!position) return null;
              const isSelected = selectedNodeId === node.id;
              const color = STAGE_COLORS[node.logic_stage] ?? STAGE_COLORS.other;

              return (
                <g key={node.id} onClick={() => setSelectedNodeId(node.id)} className="cursor-pointer">
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={nodeRadius(node)}
                    fill={color}
                    opacity={isSelected ? 1 : 0.9}
                    stroke={isSelected ? "#0b315b" : "#ffffff"}
                    strokeWidth={isSelected ? 4 : 2}
                  />
                  <text
                    x={position.x}
                    y={position.y + nodeRadius(node) + 16}
                    textAnchor="middle"
                    className="fill-[#0b315b] text-[12px] font-medium"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}

            {!graph && !isLoading && !error ? (
              <text x={CENTER_X} y={CENTER_Y} textAnchor="middle" className="fill-[#48617c] text-[14px]">
                No graph data.
              </text>
            ) : null}

            {isLoading ? (
              <text x={CENTER_X} y={CENTER_Y} textAnchor="middle" className="fill-[#48617c] text-[14px]">
                Loading concept map…
              </text>
            ) : null}
          </svg>
        </div>

        <aside className="rounded-lg border border-[#c6deed] bg-white p-4">
          <h3 className="font-display text-lg font-semibold text-[#0b315b]">Node details</h3>
          {error ? <p className="mt-2 text-sm text-[#a23a3a]">{error}</p> : null}

          {!selectedNode ? (
            <p className="mt-2 text-sm text-[#48617c]">Select a node to inspect its conceptual relationships.</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm text-[#355879]">
              <p>
                <span className="font-semibold text-[#0b315b]">{selectedNode.label}</span>
              </p>
              <p>{selectedNode.description || "No description available."}</p>
              <p>
                <span className="font-semibold">Stage:</span> {selectedNode.logic_stage}
              </p>
              <p>
                <span className="font-semibold">Cluster:</span> {selectedNode.cluster_label || "Unclustered"}
              </p>
              <div>
                <p className="font-semibold">Connected concepts</p>
                {selectedNeighbors.length === 0 ? (
                  <p className="mt-1">No connected concepts at this threshold.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {selectedNeighbors.map((neighbor) => (
                      <li key={neighbor.id}>• {neighbor.label}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
