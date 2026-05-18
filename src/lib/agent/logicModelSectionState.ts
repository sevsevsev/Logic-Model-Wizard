// Map normalized suggestions to LogicModelState
import type { BootstrapSuggestion } from "@/lib/bootstrap/types";

export function mapSuggestionsToLogicModelState(suggestions: BootstrapSuggestion[]): LogicModelState {
  // This is a minimal implementation; expand as needed for your schema
  const state: LogicModelState = {
    intendedImpact: { sufficiency: 'empty', lastUpdated: new Date().toISOString() },
    implementation: { sufficiency: 'empty', lastUpdated: new Date().toISOString() },
    outcomes: { sufficiency: 'empty', lastUpdated: new Date().toISOString() },
  };
  for (const s of suggestions) {
    if (s.path.startsWith('intended_impact')) {
      state.intendedImpact.value = s.value;
      state.intendedImpact.sufficiency = 'sufficient';
      state.intendedImpact.provenance = { type: 'intake', sourceDoc: s.sourceFile || 'upload' };
      state.intendedImpact.lastUpdated = new Date().toISOString();
    } else if (s.path.startsWith('implementation')) {
      state.implementation.value = s.value;
      state.implementation.sufficiency = 'sufficient';
      state.implementation.provenance = { type: 'intake', sourceDoc: s.sourceFile || 'upload' };
      state.implementation.lastUpdated = new Date().toISOString();
    } else if (s.path.startsWith('outcomes')) {
      state.outcomes.value = s.value;
      state.outcomes.sufficiency = 'sufficient';
      state.outcomes.provenance = { type: 'intake', sourceDoc: s.sourceFile || 'upload' };
      state.outcomes.lastUpdated = new Date().toISOString();
    }
  }
  return state;
}
// Section-state schema for logic model domains, with provenance and sufficiency
export type Provenance =
  | { type: 'intake'; sourceDoc: string }
  | { type: 'user'; userId: string }
  | { type: 'external'; system: string }
  | { type: 'agent'; skill: string }
  | { type: 'unknown' };

export type SectionSufficiency =
  | 'empty'
  | 'present'
  | 'sufficient'
  | 'confirmed';

export interface SectionState<T = string> {
  value?: T;
  provenance?: Provenance;
  sufficiency: SectionSufficiency;
  lastUpdated: string; // ISO date
  notes?: string;
}

export interface LogicModelState {
  intendedImpact: SectionState<BootstrapSuggestion["value"]>;
  implementation: SectionState<BootstrapSuggestion["value"]>;
  outcomes: SectionState<BootstrapSuggestion["value"]>;
  // Add other domains as needed
}