# AI Email Composition - Implementation Summary

## Executive Summary

This document analyzes the AI email composition capabilities comparing Zero-main's implementation with MailAgent's current state, identifying gaps and providing implementation recommendations.

---

## 1. Current State Analysis

### 1.1 MailAgent - Existing AI Features

| Feature | Status | Endpoint |
|---------|--------|----------|
| Chat Completion | Done | `POST /ai/chat` |
| Agent Workflow | Done | `POST /ai/agent` |
| Email Summarization | Done | `POST /ai/summarize/:emailId` |
| Smart Replies (Reply Mode) | Done | `POST /ai/smart-reply/:emailId` |
| Email Categorization | Done | `POST /ai/categorize/:emailId` |
| Knowledge Base Search | Done | `POST /ai/memory/search` |
| Multi-Agent Processing | Done | `POST /ai/multi-agent/process` |
| Pending Actions (HITL) | Done | `GET/POST /ai/multi-agent/pending-actions` |

### 1.2 MailAgent - ComposeDialog Features
- TipTap rich text editor
- To/CC/BCC with contact autocomplete
- Attachments support
- Draft autosave
- Smart Reply Suggestions (only in reply mode)

### 1.3 What's MISSING
- **No AI compose assistance** - Users cannot ask AI to write/draft emails
- **No AI chat panel** in compose dialog
- **No writing style learning** - AI doesn't adapt to user's writing patterns
- **No search query builder** - No AI-assisted email search

---

## 2. Zero-main Reference Implementation

### 2.1 AI Compose Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ComposeDialog                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │  Email Editor    │    │      AI Chat Panel            │  │
│  │  (TipTap)        │    │  ┌─────────────────────────┐  │  │
│  │                  │    │  │ Example Queries         │  │  │
│  │                  │    │  │ • Write a follow-up...  │  │  │
│  │                  │    │  │ • Draft reply about...  │  │  │
│  │                  │    │  └─────────────────────────┘  │  │
│  │                  │    │  ┌─────────────────────────┐  │  │
│  │                  │◄───│  │ AI Response             │  │  │
│  │                  │    │  │ (Generated email body)  │  │  │
│  └──────────────────┘    │  └─────────────────────────┘  │  │
│                          │  ┌─────────────────────────┐  │  │
│                          │  │ User Prompt Input       │  │  │
│                          │  │ "Write email about..."  │  │  │
│                          │  └─────────────────────────┘  │  │
│                          └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Zero-main Features

#### A. Styled Email Assistant
```typescript
// Zero-main: apps/server/src/lib/prompts.ts
StyledEmailAssistantSystemPrompt = () => `
  <role>
    AI assistant that composes email bodies while mirroring
    the sender's personal writing style.
  </role>

  <style_adaptation>
    - Greeting & sign-off patterns
    - Sentence structure (length, complexity)
    - Vocabulary diversity (typeTokenRatio, lexicalDensity)
    - Punctuation habits (commas, exclamation marks)
    - Tone & sentiment (formality, empathy phrases)
    - Readability metrics (Flesch score, SMOG index)
  </style_adaptation>
`
```

#### B. Writing Style Matrix (52 Metrics)
Zero-main tracks these writing style metrics:
- `averageSentenceLength`
- `averageLinesPerParagraph`
- `emojiRate`
- `formalityScore`
- `contractionRate`
- `empathyPhraseRate`
- `rhetoricalQuestionRate`
- And 45+ more metrics

#### C. ComposeEmail Tool
```typescript
// Tool invocation in AI chat
composeEmail({
  prompt: "Follow-up email about project deadline",
  to: ["recipient@example.com"],
  threadId: "optional-thread-for-context"
})
```

#### D. AI Chat Panel Features
- Example queries (one-click suggestions)
- Tool responses displayed inline
- Thread context awareness
- Web search integration for research

---

## 3. Implementation Recommendations

### Phase 1: AI Compose Button (Quick Win)
Add an AI assist button to the ComposeDialog toolbar.

**Backend Changes:**
```typescript
// New endpoint: POST /ai/compose
// File: backend/src/modules/ai/controllers/ai.controller.ts

@Post('compose')
@ApiOperation({ summary: 'AI-assisted email composition' })
async composeEmail(
  @Request() req: AuthenticatedRequest,
  @Body() dto: ComposeEmailDto,
): Promise<ComposeEmailResponseDto> {
  // dto contains: prompt, recipients, subject, threadContext, tone
  const result = await this.emailInsightsService.composeEmail(
    req.user.tenantId,
    dto,
  );
  return { success: true, body: result.body, subject: result.subject };
}
```

**Frontend Changes:**
```typescript
// File: frontend/lib/api/ai.ts
composeEmail(payload: {
  prompt: string;
  to?: string[];
  subject?: string;
  threadContext?: { emailId: string; body: string }[];
  tone?: 'formal' | 'casual' | 'technical';
  locale?: string;
}) {
  return apiClient.post<{ success: boolean; body: string; subject?: string }>(
    '/ai/compose',
    payload,
  );
}
```

### Phase 2: AI Chat Panel in Compose
Add a collapsible AI chat panel to ComposeDialog.

**Component Structure:**
```
frontend/components/email/ComposeDialog/
├── ComposeDialog.tsx (existing)
├── EditorToolbar.tsx (existing)
├── AiComposePanel.tsx (NEW)
├── AiComposeSuggestions.tsx (NEW)
└── index.ts
```

**UI Elements:**
- Toggle button to show/hide AI panel
- Example queries (clickable suggestions)
- Chat input for custom prompts
- Insert button to apply AI-generated content

### Phase 3: Writing Style Learning
Track and learn user's writing patterns.

**Database Schema:**
```prisma
model WritingStyleProfile {
  id                String   @id @default(cuid())
  tenantId          String
  userId            String

  // Structure metrics
  avgSentenceLength Float    @default(0)
  avgParagraphLines Float    @default(0)
  bulletListRate    Float    @default(0)

  // Vocabulary metrics
  formalityScore    Float    @default(0.5)
  contractionRate   Float    @default(0)
  emojiRate         Float    @default(0)

  // Tone metrics
  sentimentPolarity Float    @default(0)
  empathyPhraseRate Float    @default(0)

  // Samples analyzed
  sampleCount       Int      @default(0)
  lastAnalyzed      DateTime @default(now())

  tenant            Tenant   @relation(...)
  user              User     @relation(...)

  @@unique([tenantId, userId])
}
```

**Analysis Service:**
```typescript
// File: backend/src/modules/ai/services/writing-style.service.ts
@Injectable()
export class WritingStyleService {
  async analyzeEmail(email: Email): Promise<WritingMetrics> {
    // Analyze sent emails to build profile
  }

  async getStylePrompt(userId: string): Promise<string> {
    // Generate prompt section with user's style metrics
  }
}
```

### Phase 4: Search Query Builder
AI-assisted email search.

**Example:**
- User types: "emails from John about the budget last week"
- AI generates: `from:john subject:budget newer_than:7d`

---

## 4. Backend-Frontend API Alignment

### Current Alignment Status: VERIFIED

| Backend Endpoint | Frontend API | Status |
|-----------------|--------------|--------|
| `POST /ai/chat` | `aiApi.sendAgentMessage` | Partial (uses /ai/agent) |
| `GET/POST/DELETE /ai/chat/sessions` | `aiApi.listSessions/createSession/deleteSession` | Aligned |
| `POST /ai/agent` | `aiApi.sendAgentMessage` | Aligned |
| `POST /ai/summarize/:emailId` | `aiApi.summarizeEmail` | Aligned |
| `POST /ai/smart-reply/:emailId` | `aiApi.generateSmartReplies` | Aligned |
| `POST /ai/categorize/:emailId` | `aiApi.categorizeEmail` | Aligned |
| `POST /ai/memory/search` | `aiApi.searchMemory` | Aligned |
| `POST /ai/multi-agent/process` | `multiAgentApi.processMessage` | Aligned |
| `GET /ai/multi-agent/agents` | `multiAgentApi.getAgents` | Aligned |
| `GET /ai/multi-agent/pending-actions` | `multiAgentApi.getPendingActions` | Aligned |
| `POST .../approve` | `multiAgentApi.approveAction` | Aligned |
| `POST .../reject` | `multiAgentApi.rejectAction` | Aligned |
| `GET /ai/multi-agent/stats/*` | `multiAgentApi.getActionCounts/getLearningStats/getAggregateStats` | Aligned |
| `GET /ai/multi-agent/feedback` | `multiAgentApi.getFeedback` | Aligned |
| `POST /ai/multi-agent/learning/reset` | `multiAgentApi.resetLearning` | Aligned |

### Missing Endpoints (To Implement)

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `POST /ai/compose` | AI email composition | High |
| `POST /ai/refine` | Refine/improve draft | Medium |
| `GET /ai/writing-style` | Get user's style profile | Medium |
| `POST /ai/search-query` | Build email search query | Low |

---

## 5. Implementation Priority

### High Priority (Phase 1)
1. Add `POST /ai/compose` endpoint to backend
2. Add `composeEmail` method to frontend `aiApi`
3. Add AI compose button to `EditorToolbar`
4. Create basic `AiComposeDialog` component

### Medium Priority (Phase 2)
5. Add `AiComposePanel` to `ComposeDialog`
6. Implement example queries/suggestions
7. Add writing style analysis service
8. Store and use writing style profiles

### Low Priority (Phase 3)
9. Add search query builder
10. Advanced style metrics (52 metrics like Zero-main)
11. Thread-aware composition

---

## 6. Example Implementation

### Backend: Compose Email Service

```typescript
// File: backend/src/modules/ai/services/email-insights.service.ts
// Add to existing service:

async composeEmail(
  tenantId: string,
  dto: {
    prompt: string;
    to?: string[];
    subject?: string;
    threadContext?: Array<{ from: string; body: string }>;
    tone?: 'formal' | 'casual' | 'technical';
  },
  locale?: string,
): Promise<{ body: string; subject?: string }> {
  const lang = this.resolveLocale(locale);
  const toneInstructions = this.getToneInstructions(dto.tone || 'casual', lang);

  const threadSummary = dto.threadContext
    ? dto.threadContext.map(m => `From: ${m.from}\n${m.body}`).join('\n---\n')
    : '';

  const systemPrompt = lang === 'it'
    ? `Sei un assistente che compone email professionali. ${toneInstructions}
       Rispondi SOLO con il corpo dell'email, senza formattazione markdown.`
    : `You are an assistant who composes professional emails. ${toneInstructions}
       Reply with ONLY the email body, no markdown formatting.`;

  const userPrompt = `
    ${dto.to ? `Recipients: ${dto.to.join(', ')}` : ''}
    ${dto.subject ? `Subject: ${dto.subject}` : ''}
    ${threadSummary ? `Thread context:\n${threadSummary}` : ''}

    User request: ${dto.prompt}
  `;

  const body = await this.mistral.completePrompt({
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    maxTokens: 1000,
  });

  return { body: this.stripMarkdown(body.trim()) };
}
```

### Frontend: AI Compose Button

```typescript
// File: frontend/components/email/ComposeDialog/EditorToolbar.tsx
// Add AI compose button:

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { AiComposeDialog } from './AiComposeDialog';

// In the toolbar:
const [showAiCompose, setShowAiCompose] = useState(false);

// Add button after existing toolbar buttons:
<Tooltip title={t.dashboard.email.composer.aiCompose}>
  <IconButton
    size="small"
    onClick={() => setShowAiCompose(true)}
    sx={{ width: 32, height: 32 }}
  >
    <Sparkles size={18} />
  </IconButton>
</Tooltip>

<AiComposeDialog
  open={showAiCompose}
  onClose={() => setShowAiCompose(false)}
  onApply={(generatedBody) => {
    editor?.commands.setContent(generatedBody);
    setShowAiCompose(false);
  }}
  recipients={to}
  subject={subject}
/>
```

---

## 7. Conclusion

MailAgent has a solid AI infrastructure with multi-agent processing, HITL workflows, and email insights. The main gap is **AI-assisted email composition in the compose dialog**.

**Recommended Next Steps:**
1. Implement Phase 1 (AI compose button) - ~2-3 hours of work
2. Add translations for new AI compose UI elements
3. Test with real data using existing endpoints

The backend multi-agent system already supports email composition via `EmailAgent` with action type `SEND_EMAIL`. The missing piece is a dedicated compose endpoint and frontend UI that integrates into the ComposeDialog.
