export interface GlossaryEntry {
  term: string;
  aliases?: string[];
  definition: string;
  useWhen?: string[];
  avoidWhen?: string[];
  goodExamples?: string[];
  commonConfusions?: string[];
}

const FOUNDATION = [
  'Why logic models matter: they clarify program strategy, focus evaluation, support learning, and help communicate impact to stakeholders.',
  'A logic model is a roadmap linking what a program invests and does to the changes it expects to see over time.',
  'Three parts of the model: Intended Impact, Implementation, and Outcomes.',
];

const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Intended impact',
    aliases: ['long-term goal', 'ultimate change', 'north star'],
    definition:
      'The specific population, in a specific geography, achieving a specific long-term change that the program is ultimately accountable for.',
    useWhen: [
      'Clarifying the why behind the program.',
      'Drafting a one-sentence impact statement in the form: [population] in [geography] will [outcome].',
    ],
    avoidWhen: [
      'Describing what the program does each week.',
      'Listing services, sessions, or program activities.',
    ],
    goodExamples: [
      'K-5 students in Philadelphia will read on grade level and remain on track for later academic success.',
      'Unemployed adults on the South Side will gain stable employment and economic self-sufficiency.',
    ],
    commonConfusions: [
      'Activities are not intended impact. Wrong form: "We provide after-school tutoring." Corrected form: "K-5 students in Philadelphia will read on grade level."',
      'An intended impact should not be a measurement target or KPI. Wrong form: "80% of participants will read on grade level by third grade." That belongs in an evaluation plan.',
      'Do not stack multiple milestones as the intended impact. Pick the single most meaningful long-term change for the population and geography.',
      'The intended impact is not the same as the theory of change. The intended impact is one sentence; the theory of change is the reasoning behind why the program will produce it.',
    ],
  },
  {
    term: 'Population',
    aliases: ['who served', 'participants', 'target group'],
    definition:
      'The specific individuals or communities served, ideally described with enough specificity to understand age/grade band, role, or circumstance.',
    useWhen: [
      'Naming who the program serves.',
      'Checking whether the impact statement is specific enough.',
    ],
    avoidWhen: [
      'Using vague labels like at-risk youth with no age, geography, or circumstance.',
    ],
    goodExamples: [
      'K-5 students',
      'High school youth in North Philadelphia',
      'Parents of preschool children',
    ],
    commonConfusions: [
      'Population is not the same as geography.',
      'Population should describe people, not institutions or activities.',
    ],
  },
  {
    term: 'Geography',
    aliases: ['where served', 'service area'],
    definition:
      'The specific place where the program operates or the population is anchored.',
    useWhen: [
      'Clarifying whether the program is citywide, neighborhood-based, school-based, or regional.',
    ],
    avoidWhen: [
      'Leaving geography implicit when place matters to the intended impact statement.',
    ],
    goodExamples: [
      'Philadelphia citywide',
      'Specific schools in North Philadelphia',
      'Neighborhoods in West Baltimore',
    ],
  },
  {
    term: 'Resources',
    aliases: ['inputs'],
    definition:
      'The people, materials, funding, and expertise needed to implement the program as designed.',
    useWhen: [
      'Organizing implementation prerequisites into human, material, financial, and knowledge resources.',
    ],
    avoidWhen: [
      'Mixing resources with activities or outputs.',
    ],
    goodExamples: [
      'Paid staff and volunteers',
      'Curriculum and classroom space',
      'Grant funding',
      'Trauma-informed instructional expertise',
    ],
    commonConfusions: [
      'A resource is something you use, not something you deliver.',
    ],
  },
  {
    term: 'Activities',
    aliases: ['program work', 'core strategies'],
    definition:
      'The main verb-based categories of work the program performs with its resources.',
    useWhen: [
      'Describing what staff or partners actually do.',
      'Grouping related work into a few coherent strategy categories.',
    ],
    avoidWhen: [
      'Listing every small task individually.',
      'Using nouns with no action verb.',
    ],
    goodExamples: [
      'Deliver literacy tutoring sessions',
      'Facilitate family engagement workshops',
      'Coordinate school-based mentoring',
    ],
    commonConfusions: [
      'Activities are not outputs and not intended impact.',
    ],
  },
  {
    term: 'Outputs',
    aliases: ['deliverables', 'direct products'],
    definition:
      'The immediate products of activities, such as counts of services delivered or people reached.',
    useWhen: [
      'Tracking implementation volume or reach.',
    ],
    avoidWhen: [
      'Treating counts delivered as evidence of participant change.',
    ],
    goodExamples: [
      'Number of tutoring sessions delivered',
      'Participants served',
      'Materials distributed',
    ],
    commonConfusions: [
      'Outputs are not outcomes.',
      'Program quality and fidelity are related but distinct from raw output counts.',
    ],
  },
  {
    term: 'Program fidelity',
    aliases: ['implementation fidelity'],
    definition:
      'The degree to which the program is delivered as designed, including adherence to core components, dosage, and reach.',
    useWhen: [
      'Checking whether implementation matched the intended model.',
    ],
    goodExamples: [
      'Sessions delivered at the intended dosage',
      'Facilitators followed the core curriculum sequence',
    ],
    commonConfusions: [
      'Fidelity answers whether the program happened as designed. Quality answers how well it was experienced. Both matter, but they are distinct.',
      'A program can have high fidelity (all sessions delivered on schedule) but low quality (participants felt disengaged or the facilitator was unprepared).',
    ],
  },
  {
    term: 'Program quality',
    aliases: ['quality of implementation'],
    definition:
      'How well the program is delivered and experienced by participants, beyond whether it simply happened.',
    useWhen: [
      'Assessing participant experience, staff preparedness, engagement, and relationship quality.',
    ],
    goodExamples: [
      'Participant satisfaction',
      'Staff preparedness',
      'Engagement and relationship quality',
    ],
    commonConfusions: [
      'Quality is not the same as fidelity. A session can be delivered on schedule (high fidelity) but feel rushed or disconnected to participants (low quality).',
      'Quality indicators often come from participant and staff experience data, not just administrative records.',
    ],
  },
  {
    term: 'Short-term outcomes',
    aliases: ['knowledge or awareness outcomes'],
    definition:
      'Nearer-term changes in knowledge, attitudes, awareness, or understanding.',
    useWhen: [
      'Naming the first believable change after participation.',
    ],
    avoidWhen: [
      'Using long-term status changes like employment or graduation.',
    ],
    goodExamples: [
      'Students increase reading confidence',
      'Parents better understand school supports',
    ],
  },
  {
    term: 'Medium-term outcomes',
    aliases: ['behavior outcomes', 'skills outcomes'],
    definition:
      'Changes in skills, behaviors, or actions that follow short-term learning.',
    useWhen: [
      'Naming what people do differently after knowledge or awareness changes.',
    ],
    goodExamples: [
      'Students attend school more consistently',
      'Parents engage more regularly with teachers',
    ],
  },
  {
    term: 'Long-term outcomes',
    aliases: ['condition outcomes', 'status outcomes'],
    definition:
      'Changes in condition, status, or life circumstances that emerge over time.',
    useWhen: [
      'Naming durable end-state changes linked to the program.',
    ],
    goodExamples: [
      'Students read on grade level',
      'Youth graduate high school',
      'Adults maintain stable employment',
    ],
    commonConfusions: [
      'Long-term outcomes are not the same as activities or output counts.',
    ],
  },
  {
    term: 'Theory of change',
    aliases: ['ToC', 'program theory', 'change theory'],
    definition:
      'The narrative explanation of why a program\'s activities are expected to produce its intended outcomes — the underlying assumptions and causal reasoning behind the logic model.',
    useWhen: [
      'Explaining why the program approach was chosen.',
      'Articulating the assumptions that must hold for activities to produce outcomes.',
    ],
    avoidWhen: [
      'Describing the logic model structure itself.',
    ],
    commonConfusions: [
      'A theory of change is the reasoning behind the model; the logic model is the structured visual representation of that reasoning.',
      'They are related but not interchangeable terms. A program can have a logic model without a fully articulated theory of change.',
    ],
  },
  {
    term: 'Stakeholders',
    aliases: ['stakeholder groups', 'partners', 'community partners'],
    definition:
      'People or groups with a meaningful interest in or connection to the program — including participants, families, funders, community partners, and staff. In the logic model, stakeholders are named so activities and outcomes can be attributed to the groups who experience or enable them.',
    useWhen: [
      'Identifying whose lives the program affects.',
      'Linking activities or outcomes to the groups who experience or deliver them.',
      'Populating the stakeholders array in the JSON model.',
    ],
    goodExamples: [
      'Participants (students, youth, adults served)',
      'Families and caregivers',
      'School or community partners',
      'Funders and grantmakers',
      'Program staff',
    ],
    commonConfusions: [
      'Stakeholders are not just funders — they include everyone whose outcomes the program tracks or who plays a role in delivery.',
      'A stakeholder type in the model helps distinguish participants (people served) from partners (organizations enabling delivery) and funders (organizations providing resources).',
    ],
  },
  {
    term: 'Dosage',
    aliases: ['program dose', 'intensity', 'frequency and duration'],
    definition:
      'The frequency, duration, and total amount of program participation a person receives. Adequate dosage is often a prerequisite for behavior or condition-level outcomes.',
    useWhen: [
      'Defining what a full participant experience looks like.',
      'Distinguishing between partial and full program participants when tracking outcomes.',
      'Describing implementation fidelity for a session-based program.',
    ],
    goodExamples: [
      '20 hours of tutoring delivered over 10 weeks',
      'Two 90-minute sessions per week across a full school year',
      'A 12-week cohort with a minimum attendance threshold of 8 sessions',
    ],
    commonConfusions: [
      'Dosage is about the individual participant\'s experience, not the program\'s total output volume.',
      'Aggregate counts (sessions delivered) are outputs; dosage is the per-participant intensity.',
    ],
  },
  {
    term: 'Causal chain',
    aliases: ['causal logic', 'if-then logic', 'program logic', 'logical sequence'],
    definition:
      'The defensible if-then sequence connecting resources → activities → outputs → short-term outcomes → medium-term outcomes → long-term outcomes. Each link represents a plausible, evidence-informed mechanism of change.',
    useWhen: [
      'Checking whether each step in the model follows logically from the prior step.',
      'Identifying where the chain is missing a middle link.',
    ],
    avoidWhen: [
      'Jumping from activities directly to long-term status outcomes without knowledge and behavior steps in between.',
    ],
    goodExamples: [
      'Tutoring sessions → increased reading practice → improved reading confidence (short-term) → stronger independent reading habits (medium-term) → reading on grade level (long-term).',
    ],
    commonConfusions: [
      'A broken causal chain names the start and end but skips the middle. Example of broken chain: job training activities (activity) → stable employment (short-term outcome). The knowledge and behavior steps are missing.',
      'Long-term outcomes are not directly caused by activities — they are the result of the full outcome progression.',
    ],
  },
];

const POPULATION_STAGE_TAXONOMY = [
  'Early childhood (PreK, ages 0–5): plausible long-term markers include school readiness, kindergarten entry skills, language and vocabulary development, and family engagement in early learning.',
  'Elementary (K–5, ages 5–11): plausible long-term markers include reading on grade level, math proficiency, chronic absenteeism reduction, and social-emotional skill development.',
  'Middle school (grades 6–8, ages 11–14): plausible long-term markers include academic recovery and engagement, belonging and connectedness, transition readiness, and reduced chronic absenteeism.',
  'High school (grades 9–12, ages 14–18): plausible long-term markers include credit accumulation, on-track graduation status, postsecondary planning, and high school diploma attainment.',
  'Young adult / transition age (18–24): plausible long-term markers include postsecondary enrollment and persistence, credential attainment, early workforce entry, and stable housing.',
  'Adult / workforce (25+): plausible long-term markers include employment retention, wage growth, credential or certification completion, economic self-sufficiency, and family stability.',
  'Use population stage to determine which downstream outcome markers are plausible. Do not suggest graduation, employment, or workforce markers for elementary or early childhood populations unless the program explicitly bridges to those outcomes over a very long time horizon.',
  'When the population spans multiple stages (e.g., K–12), anchor the intended impact to the latest plausible stage within the program\'s scope, and note that earlier stages contribute to that progression.',
];

const OUTCOME_SEQUENCING_RULES = [
  'Short-term outcomes must represent knowledge, awareness, or attitude change — what participants newly know, believe, or understand.',
  'Medium-term outcomes must represent behavior or skill change — what participants now do differently as a result of that knowledge.',
  'Long-term outcomes must represent condition or status change — durable changes in life circumstances that emerge over time.',
  'The chain must not skip from knowledge change to condition change without a behavioral link.',
  'Example of a broken outcome chain: "Participants learn about healthy eating (short-term) → participants have improved health outcomes (long-term)." Missing: a behavior change in food choices and preparation (medium-term).',
  'Each level must be plausibly produced by the prior level and defensibly connected to the program\'s activities and dosage.',
];

const IMPACT_STATEMENT_RULES = [
  'long_term_goal: the raw elicited aspiration or marker in the user\'s own words, filled in progressively as the change type or concrete marker is clarified.',
  'compiled_statement: the best-available impact sentence in the form "[Population] in [geography] will [long-term change]." Preserve and refine this field as new details arrive; do not blank it during clarification turns.',
  'When the user clarifies impact details, keep the current compiled_statement as a draft and strengthen it with the new information instead of erasing it.',
  'If population or geography is still uncertain, continue eliciting those before finalizing a fully polished version of compiled_statement, but keep the existing draft visible.',
];

const RIGHT_SIZING_NOTES = [
  'The logic model should capture the type of change expected, not a detailed measurement target.',
  'Example: Increase reading level is usually the right level for the model; percent of participants reading on grade level by third grade belongs in the evaluation plan.',
];

const WHY_LOGIC_MODELS_BENEFITS = [
  'Clarifies program strategy and surfaces gaps in program logic that should be refined.',
  'Creates a shared language and alignment across staff and stakeholders.',
  'Anchors evaluation design by focusing data collection on strategic questions and priorities.',
  'Supports learning and storytelling by connecting implementation and outcomes to intended impact.',
];

const REFLECTION_3PS = [
  'Purpose (WHY): Does the model capture what matters most and keep intended impact focused on outcomes, not activities?',
  'People (WHO): Does the model reflect participant needs, context, and whether staff have sufficient resources to deliver as designed?',
  'Process (HOW): Are you engaging a diverse group of stakeholders in design, review, and refinement of the model?',
];

const ARC_STAKEHOLDER_ENGAGEMENT = [
  'Accessible: meet people where they are and reduce jargon so stakeholders can participate with confidence.',
  'Reciprocal: make participation two-way by clarifying how input is used and recognizing stakeholder contribution.',
  'Creative: use engaging facilitation approaches that strengthen relationships and shared understanding.',
];

const COMMON_MISTAKES = [
  'Intended impact describes activities instead of outcomes.',
  'Activities are written as nouns instead of verb phrases.',
  'Outputs are confused for outcomes.',
  'Outcome levels skip from short-term directly to long-term status change.',
  'Population labels are too vague to guide design or evaluation.',
  'Outcomes are too vague to assess in any believable way.',
  'The model has too many activity categories and loses strategic focus.',
  'The causal logic is broken because the activity-to-outcome connection is not defensible.',
];

const GUIDING_QUESTIONS: Record<string, string[]> = {
  'Intended Impact': [
    'If the program succeeded completely in 10 years, what would be different about participants\' lives?',
    'What grade level, age range, or specific population does the program serve?',
    'What geography should anchor the impact statement?',
  ],
  Resources: [
    'Who are the key people that make the program run?',
    'What spaces, technology, equipment, funding, or expertise does the program rely on?',
  ],
  Activities: [
    'What does the team actually do in a typical week?',
    'What are the main strategy categories, not every small task?',
  ],
  Outputs: [
    'How would you count whether the activity happened?',
    'What is the unit of measure: participants, sessions, materials, events, or hours?',
  ],
  Outcomes: [
    'What should participants know that they did not know before?',
    'What should they do differently later?',
    'What longer-term life condition should eventually change?',
  ],
};

const COACHING_RULES = [
  'Ask one focused question at a time.',
  'Use the glossary and distinctions above as the canonical reference for term meaning.',
  'Treat the user\'s initial description as a live source of impact cues, not just setup text.',
  'If the user has already given population plus geography, do not over-probe for narrower subgroup detail.',
  'Keep intended impact outcome-focused rather than activity-focused.',
  'Use ARC, the 3 P\'s, and common-mistake checks as review tools rather than reciting them mechanically.',
];

const RESPONSIBILITY_RULES = [
  'Population depth: ask once when grade, age, or school type is missing; then move on.',
  'Do not over-probe population specificity after the user gives a grade band, age range, or school type plus geography.',
  'Your primary goal is to help the user complete a full working draft of the logic model as quickly as possible. Capture imperfect or vague answers in the JSON patch to maintain momentum. Do not interrogate the user to perfect a single field before moving on. Draft statements using the best available information and proceed.',
  'Use internal_reasoning as a private scratchpad to justify routing decisions toward draft completion speed and coverage; never expose internal_reasoning to the user-facing reply.',
  'Treat good-enough inputs as acceptable during sketching. Save deeper quality critique for causal_review after a full draft exists.',
  'Dynamically route to the emptiest section of the logic model next until a complete sketch exists (intended impact, resources, activities, outputs/quality, outcomes).',
  'Avoid evaluation jargon in user-facing replies. Translate technical terms into plain language and keep momentum with one concrete next-step question.',
  'Guided long-term goal elicitation should move in sequence: aspiration, change type, concrete marker, then draft-and-review.',
  'If impact details remain imperfect after one focused follow-up, preserve best-available wording and advance to the next section.',
  'If the user uploads or already has an existing impact statement, do not rewrite it from scratch. When they provide new details (like a specific population), suggest a refined version that integrates their new detail into their original phrasing.',
  'Never clear an existing intended_impact.compiled_statement on a refinement turn; revise it or leave the prior draft in place.',
  'You may progressively capture intended_impact.population, intended_impact.geography, and intended_impact.long_term_goal as the user provides them.',
  'Only finalize intended_impact.compiled_statement when the user explicitly accepts it; until then, keep the draft visible and refine it rather than clearing it.',
  'When the user is struggling with evaluation jargon (like "outcomes" or "indicators"), drop the jargon and ask them plain-language questions about what their staff does day-to-day or what changes they expect to see.',
  'The Catch and Sort: if the user mixes up Activities (actions) and Outputs (countable products), do not correct them or ask them to retry. Silently map the content into the correct model_patch field and continue forward seamlessly.',
  'Reverse-Engineering Impact: if the user struggles with abstract intended impact language, pivot to concrete daily activities first; use those activities to draft a baseline intended impact statement on their behalf, then ask for refinement.',
  'Keep activities verb-based, outcome levels properly ordered, and resources bucketed by human, material, financial, and knowledge.',
];

const JSON_UPDATE_RULES = [
  'Return one strict JSON object with exactly four top-level keys: model_patch, internal_reasoning, next_intent, agent_reply.',
  'Use next_intent values that advance draft completion: intended_impact, resources, activities, outputs_metrics, quality_fidelity, outcomes, causal_review, section_refine.',
  'Keep internal_reasoning concise and private; include routing logic there, not in agent_reply.',
  'Use agent_reply for user-facing coaching and one focused next-step question.',
  'Omit unchanged fields from model_patch and include only populated strings or arrays.',
];

const CHIP_ENGINE_RULES = [
  'Chips must answer the exact final question asked in the visible reply.',
  'If chips would answer a different question, emit none.',
  'Use chips as guided input, not as wording-similarity guesses.',
  'If a revised impact-statement question asks whether the wording now captures the goal, that is still impact_review.',
  'Prefer concrete, observable markers over broad domains for impact-specificity chips.',
  'When the likely answer is still broad, use prefill or open-input rather than overconfident canned text.',
];

const CHIP_FAMILY_GUIDANCE = [
  'impact_review: approval or revision chips only.',
  'geography: citywide, neighborhoods or ZIP codes, or specific schools only.',
  'population_focus: subgroup chips only.',
  'impact_change_type: think/feel vs do vs life conditions vs combination.',
  'impact_specificity: concrete markers such as reading on grade level, regular attendance, graduation, postsecondary persistence, stable employment, reduced justice involvement, or stable housing and mental health.',
];

const CONVERSATION_PHASES = [
  'Phase 1: Intended Impact - population, geography, long-term change, then confirm a one-sentence impact statement.',
  'Phase 2: Implementation - resources and core activity categories.',
  'Phase 3: Outputs and Quality - counts, dosage, reach, fidelity, and quality.',
  'Phase 4: Outcomes - short-term, medium-term, long-term.',
  'Phase 5: Stakeholder Alignment - refine using stakeholder perspective and plain language.',
];

function formatBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function formatGlossaryEntry(entry: GlossaryEntry): string {
  const lines = [`Term: ${entry.term}`];
  if (entry.aliases?.length) {
    lines.push(`Aliases: ${entry.aliases.join(', ')}`);
  }
  lines.push(`Definition: ${entry.definition}`);
  if (entry.useWhen?.length) {
    lines.push('Use when:');
    lines.push(formatBulletList(entry.useWhen));
  }
  if (entry.avoidWhen?.length) {
    lines.push('Do not use when:');
    lines.push(formatBulletList(entry.avoidWhen));
  }
  if (entry.goodExamples?.length) {
    lines.push('Good examples:');
    lines.push(formatBulletList(entry.goodExamples));
  }
  if (entry.commonConfusions?.length) {
    lines.push('Common confusions:');
    lines.push(formatBulletList(entry.commonConfusions));
  }
  return lines.join('\n');
}

function formatSection(title: string, items: string[]): string {
  return `${title}\n${formatBulletList(items)}`;
}

export function buildKnowledgeBase(): string {
  return [
    '================================================================================',
    'KNOWLEDGE BASE - LOGIC MODEL REFERENCE',
    '================================================================================',
    '',
    formatSection('Foundation', FOUNDATION),
    '',
    'Canonical glossary:',
    GLOSSARY.map(formatGlossaryEntry).join('\n\n'),
    '',
    formatSection('Right-Sizing Notes', RIGHT_SIZING_NOTES),
    '',
    formatSection('Why Logic Models Matter in Practice', WHY_LOGIC_MODELS_BENEFITS),
    '',
    formatSection('Reflection Questions - 3 P\'s', REFLECTION_3PS),
    '',
    formatSection('Stakeholder Engagement - ARC Method', ARC_STAKEHOLDER_ENGAGEMENT),
    '',
    formatSection('Population Stage Taxonomy', POPULATION_STAGE_TAXONOMY),
    '',
    formatSection('Outcome Sequencing Rules', OUTCOME_SEQUENCING_RULES),
    '',
    formatSection('Common Mistakes to Catch and Correct', COMMON_MISTAKES),
    '',
    Object.entries(GUIDING_QUESTIONS)
      .map(([section, questions]) => formatSection(`Guiding Questions - ${section}`, questions))
      .join('\n\n'),
  ].join('\n');
}

export function buildCompactKnowledgeBase(): string {
  return [
    '================================================================================',
    'KNOWLEDGE BASE - COMPACT REFERENCE',
    '================================================================================',
    '',
    formatSection('Foundation', FOUNDATION),
    '',
    formatSection('Outcome Sequencing Rules', OUTCOME_SEQUENCING_RULES),
    '',
    formatSection('Common Mistakes to Catch and Correct', COMMON_MISTAKES),
    '',
    formatSection('Reflection Questions - 3 P\'s', REFLECTION_3PS),
    '',
    formatSection('Stakeholder Engagement - ARC Method', ARC_STAKEHOLDER_ENGAGEMENT),
    '',
    formatSection('Core Prompting Rules', [
      'Ask one focused question at a time.',
      'Keep intended impact outcome-focused rather than activity-focused.',
      'If the user has already given specific population and geography, do not over-probe for narrower subgroup detail.',
      'Prefer moving forward in phase order unless a critical gap must be resolved first.',
    ]),
  ].join('\n');
}

export function buildResponsibilities(): string {
  return [
    '================================================================================',
    'YOUR RESPONSIBILITIES',
    '================================================================================',
    '',
    '1. Chat response and coaching:',
    formatBulletList([...COACHING_RULES, ...RESPONSIBILITY_RULES]),
    '',
    '2. JSON routing envelope:',
    formatBulletList(JSON_UPDATE_RULES),
    '',
    '3. Impact statement field rules:',
    formatBulletList(IMPACT_STATEMENT_RULES),
    '',
    'Routing JSON schema:',
    '{',
    '  "model_patch": {',
    '    "stakeholders": [{ "id": "...", "label": "...", "type": "..." }],',
    '    "intended_impact": { "population": "...", "geography": "...", "long_term_goal": "...", "compiled_statement": "..." },',
    '    "implementation": {',
    '      "resources": { "human": [], "material": [], "financial": [], "knowledge": [] },',
    '      "quality_fidelity": { "fidelity": [], "quality": [] },',
    '      "activities": [{ "item": "...", "category": "...", "actions": [], "outputs": [{ "text": "...", "category": "..." }], "stakeholderLabels": [] }]',
    '    },',
    '    "outcomes": {',
    '      "short_term": [{ "statement": "...", "stakeholderLabels": [] }],',
    '      "medium_term": [{ "statement": "...", "stakeholderLabels": [] }],',
    '      "long_term": [{ "statement": "...", "stakeholderLabels": [] }]',
    '    }',
    '  },',
    '  "internal_reasoning": "...",',
    '  "next_intent": "intended_impact|resources|activities|outputs_metrics|quality_fidelity|outcomes|causal_review|section_refine",',
    '  "agent_reply": "..."',
    '}',
  ].join('\n');
}

export function buildChipEngineGuidance(): string {
  return [
    '================================================================================',
    'CHIP ENGINE GUIDANCE',
    '================================================================================',
    '',
    formatSection('Core Rules', CHIP_ENGINE_RULES),
    '',
    'Chip behavior types:',
    formatBulletList([
      'send: a complete answer that should advance the flow immediately.',
      'prefill: opens input with starter text the user completes.',
      'open-input: opens a blank text input.',
    ]),
    '',
    formatSection('Likely Chip Families by Intent', CHIP_FAMILY_GUIDANCE),
    '',
    formatSection('Conversation Phase Order for Chip Intent Selection', [
      'Intended Impact: population -> geography -> long-term impact',
      'Implementation: resources -> activities',
      'Tracking: outputs metrics -> quality or fidelity',
      'Outcomes: short-term -> medium-term -> long-term',
    ]),
  ].join('\n');
}

export function buildConversationResponseTree(): string {
  return [
    '================================================================================',
    'CONVERSATION RESPONSE TREE',
    '================================================================================',
    '',
    formatSection('Phase Order', CONVERSATION_PHASES),
    '',
    formatSection('Prompting Rules', [
      'Ask one focused question at a time.',
      'If the user already provided specific population and geography, do not ask for narrower subgroup detail.',
      'If the user gives an activity when asked for impact, pivot back to outcome language.',
      'Prefer moving forward in phase order unless a critical gap must be resolved first.',
    ]),
  ].join('\n');
}
