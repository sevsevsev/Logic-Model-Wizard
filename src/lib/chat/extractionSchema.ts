import { z } from "zod";

export const NEXT_INTENT_VALUES = [
  "intended_impact",
  "resources",
  "activities",
  "outputs_metrics",
  "quality_fidelity",
  "outcomes",
  "causal_review",
  "section_refine",
] as const;

const stakeholderPatchSchema = z.union([
  z.string().min(1),
  z.object({ label: z.string().min(1), type: z.string().min(1).optional() }).strict(),
  z.object({ id: z.string().min(1), label: z.string().min(1), type: z.string().min(1).optional() }).strict(),
]);

const activityOutputPatchSchema = z.union([
  z.string().min(1),
  z.object({
    text: z.string().min(1),
    category: z.string().min(1).optional(),
    subcategory: z.string().min(1).optional(),
  }).strict(),
]);

const activityPatchSchema = z.object({
  item: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  subcategory: z.string().min(1).optional(),
  actions: z.array(z.string().min(1)).optional(),
  outputs: z.array(activityOutputPatchSchema).optional(),
  stakeholderLabels: z.array(z.string().min(1)).optional(),
  stakeholderIds: z.array(z.string().min(1)).optional(),
}).strict();

const outcomePatchEntrySchema = z.union([
  z.string().min(1),
  z.object({
    statement: z.string().min(1),
    stakeholderIds: z.array(z.string().min(1)).optional(),
    stakeholderLabels: z.array(z.string().min(1)).optional(),
  }).strict(),
]);

export const logicModelPatchSchema = z.object({
  intended_impact: z.object({
    population: z.string().min(1).optional(),
    geography: z.string().min(1).optional(),
    long_term_goal: z.string().min(1).optional(),
    compiled_statement: z.string().min(1).optional(),
  }).strict().optional(),
  stakeholders: z.array(stakeholderPatchSchema).optional(),
  implementation: z.object({
    resources: z.object({
      human: z.array(z.string().min(1)).optional(),
      material: z.array(z.string().min(1)).optional(),
      financial: z.array(z.string().min(1)).optional(),
      knowledge: z.array(z.string().min(1)).optional(),
    }).strict().optional(),
    quality_fidelity: z.object({
      fidelity: z.array(z.string().min(1)).optional(),
      quality: z.array(z.string().min(1)).optional(),
    }).strict().optional(),
    activities: z.array(activityPatchSchema).optional(),
  }).strict().optional(),
  outcomes: z.object({
    short_term: z.array(outcomePatchEntrySchema).optional(),
    medium_term: z.array(outcomePatchEntrySchema).optional(),
    long_term: z.array(outcomePatchEntrySchema).optional(),
  }).strict().optional(),
}).strict();

export const routingExtractionSchema = z.object({
  model_patch: logicModelPatchSchema,
  internal_reasoning: z.string().min(1),
  next_intent: z.enum(NEXT_INTENT_VALUES),
  agent_reply: z.string().min(1),
}).strict();

export type LogicModelPatchExtraction = z.infer<typeof logicModelPatchSchema>;
export type RoutingExtraction = z.infer<typeof routingExtractionSchema>;
