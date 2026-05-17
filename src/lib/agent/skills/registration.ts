/**
 * Skill Registration Module
 * 
 * Registers all available agent skills at application startup.
 * Follows progressive disclosure pattern from Agent Skills spec:
 * https://agentskills.io/
 */

import { skillRegistry } from "./index";
import { impactStatementScaffolderSkill } from "./impact-statement-scaffolder";
import { proceduralDependencyEnforcerSkill } from "./procedural-dependency-enforcer";
import { componentQualityValidatorSkill } from "./component-quality-validator";

/**
 * Register all Phase 1 skills (high impact, lower complexity)
 */
function registerPhaseOneSkills(): void {
  skillRegistry.register(impactStatementScaffolderSkill);
  skillRegistry.register(proceduralDependencyEnforcerSkill);
  skillRegistry.register(componentQualityValidatorSkill);
}

/**
 * Initialize all available skills
 * Called once at application startup
 */
export function initializeSkills(): void {
  registerPhaseOneSkills();
  // Phase 2 and Phase 3 skills can be registered here as they're implemented
}

/**
 * Log available skills for debugging
 */
export function logAvailableSkills(): void {
  const discoverable = skillRegistry.listDiscoverable();
  console.log("Registered Agent Skills:");
  discoverable.forEach((skill) => {
    console.log(`  - ${skill.name}: ${skill.description}`);
  });
}
