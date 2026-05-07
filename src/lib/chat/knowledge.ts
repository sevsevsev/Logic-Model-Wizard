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
      'Activities are not intended impact.',
      'An intended impact should not be a measurement target or KPI.',
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
];

const RIGHT_SIZING_NOTES = [
  'The logic model should capture the type of change expected, not a detailed measurement target.',
  'Example: Increase reading level is usually the right level for the model; percent of participants reading on grade level by third grade belongs in the evaluation plan.',
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
  'Guided long-term goal elicitation should move in sequence: aspiration, change type, concrete marker, then draft-and-review.',
  'Only draft an intended impact statement when population, geography, and a concrete long-term marker are all known.',
  'Do not write intended_impact fields to the hidden patch until the user confirms or accepts a complete draft statement.',
  'Keep activities verb-based, outcome levels properly ordered, and resources bucketed by human, material, financial, and knowledge.',
];

const JSON_UPDATE_RULES = [
  'Reply with coaching first, then <question_intent>, then <model_patch>.',
  'Use only the allowed question-intent values.',
  'Choose the question intent from the final user-answerable question in the visible reply.',
  'Use none when the visible reply does not end with a clear question or chips would not help.',
  'Use impact_review only for draft-review questions, never for change-type classification.',
  'Omit unchanged fields from the patch and include only populated strings or arrays.',
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
    formatSection('Common Mistakes to Catch and Correct', COMMON_MISTAKES),
    '',
    Object.entries(GUIDING_QUESTIONS)
      .map(([section, questions]) => formatSection(`Guiding Questions - ${section}`, questions))
      .join('\n\n'),
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
    '2. JSON update and hidden tags:',
    formatBulletList(JSON_UPDATE_RULES),
    '',
    'JSON schema:',
    '{',
    '  "stakeholders": [{ "id": "...", "label": "...", "type": "..." }],',
    '  "intended_impact": { "population": "...", "geography": "...", "long_term_goal": "...", "compiled_statement": "..." },',
    '  "implementation": {',
    '    "resources": { "human": [], "material": [], "financial": [], "knowledge": [] },',
    '    "activities": [{ "item": "...", "category": "...", "actions": [], "outputs": [{ "text": "...", "category": "..." }], "stakeholderLabels": [] }]',
    '  },',
    '  "outcomes": {',
    '    "short_term": [{ "statement": "...", "stakeholderLabels": [] }],',
    '    "medium_term": [{ "statement": "...", "stakeholderLabels": [] }],',
    '    "long_term": [{ "statement": "...", "stakeholderLabels": [] }]',
    '  }',
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
