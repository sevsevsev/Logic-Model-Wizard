# Refactored Architecture: Conversational Model Extraction

## Overview

The app has been refactored to separate **conversation collection** from **model extraction analysis**. Instead of trying to parse JSON and validate schemas on every turn, the agent now:

1. **Collects** messages naturally in a conversation transcript
2. **Analyzes** the full transcript deterministically to extract structured logic model

This fixes the core issue: first-turn narratives no longer fail because the agent is no longer forced into a rigid JSON parsing role.

## New Files Created

### 1. `src/lib/chat/transcript.ts`
**Purpose:** Manage conversation transcripts

**Key Types:**
- `ConversationTurn`: Single message (user or assistant)
- `ConversationTranscript`: Full conversation history with metadata

**Key Functions:**
- `addTurn()`: Add a message to transcript
- `getUserMessages()`: Get all user messages
- `transcriptToString()`: Convert to text for LLM analysis
- `recordQuestionAsked()`: Track which topics agent has asked about (prevents repetition)

### 2. `src/lib/chat/modelExtractor.ts`
**Purpose:** Extract structured LogicModel from conversation transcript

**Key Function:**
- `extractModelFromTranscript(transcript)`: Deterministic extraction that returns:
  - `model`: Partial LogicModel with population, geography, activities, outcomes, quality
  - `completeness`: Confidence scores (0-100) for each field
  - `gaps`: List of missing critical information
  - `suggestedNextQuestions`: What to ask next to fill gaps

**How It Works:**
- Uses regex pattern matching to extract semantic chunks
- Returns confidence scores so UI can highlight uncertain fields
- Identifies exactly what's missing
- Suggests follow-up questions automatically

### 3. `src/lib/agent/conversationalInstructions.ts`
**Purpose:** Agent system instructions for natural dialogue

**Key Features:**
- No JSON parsing required
- Agents follow a conversational flow (Intended Impact → Implementation → Outcomes → Quality)
- Guided to ask one question at a time
- Instructed not to re-ask topics already covered
- Examples and guidance in plain language

### 4. `src/app/api/analyze/route.ts`
**Purpose:** On-demand model extraction endpoint

```
POST /api/analyze
Body: { transcript: ConversationTranscript }
Returns: { analysis: ExtractionAnalysis, timestamp }
```

Runs the deterministic extraction analysis on a transcript.

### 5. `src/app/api/chat/conversational/route.ts`
**Purpose:** NEW simplified chat endpoint using conversational architecture

```
POST /api/chat/conversational
Body: { message: string, transcript?: ConversationTranscript }
Returns: {
  reply: string,
  transcript: ConversationTranscript,
  analysis: ExtractionAnalysis,
  retrieval: { knowledgeChunkCount, trace },
  timestamp
}
```

**Flow:**
1. Accepts user message
2. Adds to transcript
3. Calls agent with conversational instructions
4. Agent responds naturally (no JSON)
5. Adds response to transcript
6. Runs analysis on full transcript
7. Returns both reply AND current model understanding

### 6. `src/store/useLogicModelStore.ts` (Updated)
**Changes:**
- Added `transcript: ConversationTranscript` field
- Added `addTranscriptTurn()` action
- Added `setTranscript()` action
- Transcript persists in Zustand store (session-scoped)

## How to Use

### Option A: Use New Conversational Endpoint (Recommended)

```javascript
// Initialize empty transcript
let transcript = undefined;
let model = {};

// Turn 1: User submits narrative
const res1 = await fetch("/api/chat/conversational", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "We work with students in Philadelphia...",
    transcript,
  }),
});

const data1 = await res1.json();
transcript = data1.transcript; // Save for next turn
model = data1.analysis.model; // Current understanding

console.log("Agent reply:", data1.reply);
console.log("Current model:", model);
console.log("Gaps:", data1.analysis.gaps);
console.log("Suggested questions:", data1.analysis.suggestedNextQuestions);

// Turn 2+: Continue conversation
const res2 = await fetch("/api/chat/conversational", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "About 200 students per year",
    transcript, // Pass previous transcript
  }),
});

const data2 = await res2.json();
transcript = data2.transcript;
model = data2.analysis.model; // Model updated from full transcript
// ... and so on
```

### Option B: Analyze Existing Transcript On-Demand

```javascript
// Get current understanding without agent response
const res = await fetch("/api/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transcript }),
});

const { analysis } = await res.json();
console.log("Current completeness:", analysis.completeness);
console.log("What's missing:", analysis.gaps);
```

## Benefits

### 1. **Robustness**
- Agent response doesn't need to be valid JSON
- No schema validation failures
- Fallback heuristic extraction is automatic

### 2. **Transparency**
- Can see exactly what was extracted and confidence score
- Know what information is missing
- Can see suggested follow-ups

### 3. **Incremental Progress**
- Model understanding improves as conversation progresses
- Can see partial progress even with incomplete narrative

### 4. **Natural Dialogue**
- Agent doesn't fight to fit data into JSON schema
- Can ask natural follow-up questions
- Can skip topics already covered

### 5. **Debuggability**
- Extraction is deterministic (regex patterns, not LLM-dependent)
- Can inspect transcript to see exactly what was said
- Can manually adjust extraction patterns

## Integration Paths

### Immediate (Session-Scoped, Testing)
Use new `/api/chat/conversational` endpoint directly. No DB changes needed.

### Short-term (Add UI Components)
- Show extraction analysis alongside chat
- Display confidence scores for each field
- Show gaps and suggested questions
- Allow user to confirm/revise extracted data

### Long-term (Full Migration)
- Update existing `/api/chat` to use conversational mode (or keep both)
- Store transcripts in database for analytics
- Build per-field revision UI
- Add conflict detection and clarification flows

## Key Differences from Old Architecture

| Aspect | Old | New |
|--------|-----|-----|
| **Agent Job** | Parse JSON into schema | Ask questions naturally |
| **Parsing** | After each turn | After full conversation ends |
| **Failure Mode** | "null agentic result" | Graceful degradation (heuristics) |
| **Model Updates** | Incremental patches merged | Full extraction from transcript |
| **Observability** | "Which field am I extracting?" | "What information do we have?" |
| **Confidence** | Implicit | Explicit scores per field |
| **Gaps** | Not identified | Listed explicitly |
| **Suggested Follow-Ups** | Generic questions | Targeted to missing fields |

## Testing

Run with Musicopia test:

```javascript
const transcript = createEmptyTranscript();
const message = "Musicopia advances lifelong learning..."; // Full narrative

const res = await fetch("/api/chat/conversational", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, transcript }),
});

const data = await res.json();
console.log("Reply length:", data.reply.length);
console.log("Population:", data.analysis.model.intended_impact?.population);
console.log("Geography:", data.analysis.model.intended_impact?.geography);
console.log("Activities:", data.analysis.model.implementation?.activities?.length);
console.log("Outcomes:", data.analysis.model.outcomes?.short_term?.length);
console.log("Gaps:", data.analysis.gaps);
```

## Backward Compatibility

- Existing `/api/chat` endpoint still works (unchanged)
- New `/api/chat/conversational` is a parallel endpoint
- Can gradually migrate UI components to use new data structures
- No breaking changes to existing code

## Next Steps

1. **Test conversational endpoint** with Musicopia narrative
2. **Update UI components** to display transcript and analysis
3. **Add confidence visualization** for each field
4. **Build field-level revision interface** (allow user to correct extractions)
5. **Integrate into existing chat component** or create new component
6. **Monitor extraction quality** as patterns improve
