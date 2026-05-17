/**
 * Agent Skills Framework
 * 
 * Implements the Agent Skills standard (https://agentskills.io/)
 * Skills are directories containing SKILL.md (metadata + instructions) and optional:
 * - scripts/: executable code
 * - references/: additional documentation
 * - assets/: templates and resources
 */

import type { LogicModel, ChatMessage } from "@/store/useLogicModelStore";
import type { RetrievedChunk } from "@/lib/rag/types";

/**
 * Agent Skills Frontmatter (from SKILL.md)
 * https://agentskills.io/specification#skillmd-format
 */
export interface SkillMetadata {
  name: string; // lowercase, hyphens only, 1-64 chars
  description: string; // what the skill does and when to use it, max 1024 chars
  license?: string; // license name or reference to bundled license file
  compatibility?: string; // environment requirements, max 500 chars
  metadata?: Record<string, string>; // additional arbitrary metadata
  "allowed-tools"?: string; // space-separated pre-approved tools (experimental)
}

/**
 * Execution context passed to skill functions
 */
export interface SkillContext {
  modelSnapshot?: LogicModel;
  modelPatch?: Partial<LogicModel> | null;
  userMessage: string;
  history: ChatMessage[];
  questionIntent?: string;
  retrievedEvidence?: RetrievedChunk[];
}

/**
 * Result returned by skill execution
 */
export interface SkillResult {
  success: boolean;
  message?: string;
  data?: unknown;
  shouldProceed?: boolean; // whether to proceed with normal flow
  nextAction?: "redirect" | "validate" | "block" | "continue";
}

/**
 * Agent Skill definition
 * Encapsulates metadata, instructions, and executable logic
 */
export interface AgentSkill {
  metadata: SkillMetadata;
  instructions: string; // Markdown body from SKILL.md
  execute: (context: SkillContext) => Promise<SkillResult>;
}

/**
 * Skill Registry
 * Manages skill discovery, activation, and execution following progressive disclosure
 */
export class SkillRegistry {
  private skills: Map<string, AgentSkill> = new Map();

  /**
   * Register a new skill
   * @param skill The skill to register
   * @throws Error if skill name already registered
   */
  register(skill: AgentSkill) {
    if (this.skills.has(skill.metadata.name)) {
      throw new Error(`Skill with name ${skill.metadata.name} is already registered.`);
    }
    this.skills.set(skill.metadata.name, skill);
  }

  /**
   * Get a skill by name
   * @param skillName The name of the skill
   * @returns The skill or undefined if not found
   */
  get(skillName: string): AgentSkill | undefined {
    return this.skills.get(skillName);
  }

  /**
   * List all available skills (for discovery phase)
   * Returns only metadata (name + description) to minimize context usage
   * @returns Array of skill names and descriptions
   */
  listDiscoverable(): Array<{ name: string; description: string }> {
    return Array.from(this.skills.values()).map((skill) => ({
      name: skill.metadata.name,
      description: skill.metadata.description,
    }));
  }

  /**
   * List all skill names
   * @returns Array of all registered skill names
   */
  list(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Execute a skill with the given context
   * @param skillName The name of the skill to execute
   * @param context The execution context
   * @returns The result of skill execution
   * @throws Error if skill not found
   */
  async execute(skillName: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill ${skillName} not found.`);
    }
    return await skill.execute(context);
  }
}

export const skillRegistry = new SkillRegistry();

// Export registration functions
export { initializeSkills, logAvailableSkills } from "./registration";