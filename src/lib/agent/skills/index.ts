// Skill Framework Entry Point

export interface AgentSkill {
  name: string;
  description: string;
  execute: (context: any) => Promise<any>;
}

export class SkillRegistry {
  private skills: Map<string, AgentSkill> = new Map();

  register(skill: AgentSkill) {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill with name ${skill.name} is already registered.`);
    }
    this.skills.set(skill.name, skill);
  }

  get(skillName: string): AgentSkill | undefined {
    return this.skills.get(skillName);
  }

  list(): string[] {
    return Array.from(this.skills.keys());
  }
}

export const skillRegistry = new SkillRegistry();