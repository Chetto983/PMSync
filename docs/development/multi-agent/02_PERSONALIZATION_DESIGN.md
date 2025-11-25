# AI Personalization System Design

## Overview

This document outlines the personalization architecture for the PMS (PMSync) multi-agent AI system. The goal is to create an intelligent assistant that learns from user behavior, adapts to their job role, and provides increasingly personalized responses over time.

---

## 1. Architecture Overview

```
+-------------------+     +-------------------+     +-------------------+
|   User Profile    |     |  Semantic Memory  |     | Interaction       |
|   (Explicit)      |     |  (Embeddings)     |     | Learning          |
+-------------------+     +-------------------+     +-------------------+
        |                         |                         |
        v                         v                         v
+-----------------------------------------------------------------------+
|                    PersonalizationService                              |
|  - Profile loader   - Memory retrieval    - Confidence adjustment     |
|  - Role templates   - Fact extraction     - Pattern recognition       |
+-----------------------------------------------------------------------+
        |
        v
+-------------------+     +-------------------+     +-------------------+
|   RouterAgent     | --> |  Specialized      | --> |   Response        |
|   (Intent)        |     |  Agents           |     |   Generation      |
+-------------------+     +-------------------+     +-------------------+
```

---

## 2. User Profile System

### 2.1 Explicit Profile Data (Database)

**New `UserProfile` model fields:**

```prisma
model UserPreferences {
  // ... existing fields ...

  // Job/Role Personalization
  jobTitle              String?               // "Marketing Manager", "Software Engineer"
  jobRole               UserJobRole?          // EXECUTIVE, MANAGER, IC, FREELANCER, STUDENT
  department            String?               // "Engineering", "Sales", "HR"
  industry              String?               // "Technology", "Healthcare", "Finance"
  companySize           CompanySize?          // STARTUP, SMB, ENTERPRISE

  // Communication Style
  communicationStyle    CommunicationStyle?   // FORMAL, CASUAL, TECHNICAL, CREATIVE
  responseLength        ResponseLength?       // BRIEF, MODERATE, DETAILED

  // Work Patterns
  workingHoursStart     String?               // "09:00"
  workingHoursEnd       String?               // "18:00"
  workingDays           String[]              // ["MON", "TUE", "WED", "THU", "FRI"]

  // AI Behavior
  proactivityLevel      ProactivityLevel?     // LOW, MEDIUM, HIGH
  notificationFrequency NotificationFrequency? // IMMEDIATE, DIGEST, MINIMAL
}

enum UserJobRole {
  EXECUTIVE       // C-level, VP - needs executive summaries, strategic focus
  MANAGER         // Team leads - needs delegation, team coordination
  IC              // Individual contributor - task-focused, detailed
  FREELANCER      // Independent - client management, billing focus
  STUDENT         // Learning-focused, educational tone
  OTHER
}

enum CompanySize {
  SOLO            // 1 person
  STARTUP         // 2-50
  SMB             // 51-500
  ENTERPRISE      // 500+
}

enum CommunicationStyle {
  FORMAL          // Professional, third-person
  CASUAL          // Friendly, first-person
  TECHNICAL       // Detailed, precise
  CREATIVE        // Expressive, varied
}

enum ResponseLength {
  BRIEF           // 1-2 sentences
  MODERATE        // 3-5 sentences
  DETAILED        // Full paragraphs
}

enum ProactivityLevel {
  LOW             // Only respond when asked
  MEDIUM          // Suggest related actions
  HIGH            // Proactive reminders, suggestions
}
```

### 2.2 Job Role Templates

Different job roles get different system prompts and behaviors:

```typescript
const JOB_ROLE_TEMPLATES: Record<UserJobRole, RoleTemplate> = {
  EXECUTIVE: {
    systemPromptAddition: `
      The user is an executive. Prioritize:
      - High-level summaries over details
      - Strategic implications
      - Time-efficient communication
      - Delegation suggestions when appropriate
      - Key metrics and KPIs
    `,
    defaultResponseLength: 'BRIEF',
    focusAreas: ['strategy', 'delegation', 'metrics'],
    emailPrioritization: ['urgent', 'board', 'investor', 'key_client'],
  },

  MANAGER: {
    systemPromptAddition: `
      The user is a team manager. Prioritize:
      - Team coordination and delegation
      - Status updates and blockers
      - Meeting scheduling efficiency
      - Cross-functional communication
    `,
    defaultResponseLength: 'MODERATE',
    focusAreas: ['team', 'coordination', 'scheduling'],
    emailPrioritization: ['team', 'reports', 'stakeholders'],
  },

  IC: {
    systemPromptAddition: `
      The user is an individual contributor. Prioritize:
      - Task-focused assistance
      - Technical accuracy
      - Detailed explanations when needed
      - Focus time protection
    `,
    defaultResponseLength: 'MODERATE',
    focusAreas: ['tasks', 'technical', 'focus'],
    emailPrioritization: ['actionable', 'assigned', 'feedback'],
  },

  FREELANCER: {
    systemPromptAddition: `
      The user is a freelancer. Prioritize:
      - Client relationship management
      - Project deadlines and milestones
      - Invoice and payment tracking
      - Professional communication
    `,
    defaultResponseLength: 'MODERATE',
    focusAreas: ['clients', 'projects', 'billing'],
    emailPrioritization: ['client', 'payment', 'contract'],
  },

  STUDENT: {
    systemPromptAddition: `
      The user is a student. Prioritize:
      - Clear, educational explanations
      - Learning resources and tips
      - Assignment and deadline tracking
      - Study schedule optimization
    `,
    defaultResponseLength: 'DETAILED',
    focusAreas: ['learning', 'deadlines', 'study'],
    emailPrioritization: ['professor', 'assignment', 'group'],
  },
};
```

---

## 3. Semantic Memory System

### 3.1 User Profile Embedding

Store embeddings of user behavior patterns for semantic retrieval:

```prisma
model UserProfileEmbedding {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String

  // What type of memory this is
  memoryType  MemoryType  // PREFERENCE, FACT, PATTERN, INTERACTION

  // The content being embedded
  content     String      // "User prefers morning meetings before 10am"
  vector      Unsupported("vector")?

  // Source of this memory
  source      MemorySource // EXPLICIT (user said), INFERRED (learned), BEHAVIOR (observed)
  confidence  Float       @default(0.5)  // How confident are we in this memory

  // Metadata
  category    String?     // "scheduling", "email", "communication"
  expiresAt   DateTime?   // Some memories should expire

  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  usageCount  Int         @default(0)    // How often this memory is used
  lastUsedAt  DateTime?

  @@index([tenantId, userId])
  @@index([tenantId, userId, memoryType])
  @@map("user_profile_embeddings")
}

enum MemoryType {
  PREFERENCE    // "prefers short emails"
  FACT          // "works at Acme Corp"
  PATTERN       // "usually busy Monday mornings"
  INTERACTION   // "asked about project X"
  CONTACT_NOTE  // "John is the key decision maker"
}

enum MemorySource {
  EXPLICIT      // User directly stated
  INFERRED      // AI inferred from conversation
  BEHAVIOR      // Observed from actions (approved/rejected)
}
```

### 3.2 Memory Extraction from Conversations

The AI extracts facts and preferences from conversations:

```typescript
interface ExtractedMemory {
  content: string;
  memoryType: MemoryType;
  source: MemorySource;
  confidence: number;
  category: string;
}

// Example extractions from conversation:
// User: "I prefer to have meetings in the afternoon"
// → { content: "User prefers afternoon meetings", type: PREFERENCE, confidence: 0.9 }

// User: "My team has standup at 9am every day"
// → { content: "User's team has daily standup at 9am", type: FACT, confidence: 0.95 }

// User rejects a morning meeting suggestion 3 times
// → { content: "User avoids morning meetings", type: PATTERN, source: BEHAVIOR, confidence: 0.7 }
```

### 3.3 Memory Retrieval for Context

Before generating responses, retrieve relevant memories:

```typescript
async function enrichContextWithMemories(
  userId: string,
  tenantId: string,
  currentMessage: string,
): Promise<string[]> {
  // 1. Embed the current message
  const messageEmbedding = await createEmbedding(currentMessage);

  // 2. Find similar memories using vector search
  const relevantMemories = await findSimilarMemories(
    tenantId,
    userId,
    messageEmbedding,
    limit: 5,
  );

  // 3. Return as context strings
  return relevantMemories.map(m => `[Memory] ${m.content}`);
}
```

---

## 4. Interaction-Based Learning

### 4.1 Learning from Approvals/Rejections

The existing `AgentLearningProfile` tracks patterns:

```prisma
model AgentLearningProfile {
  // ... existing fields ...

  // New fields for deeper learning
  userFeedbackPositive    Int     @default(0)   // Thumbs up count
  userFeedbackNegative    Int     @default(0)   // Thumbs down count
  averageResponseTime     Float?                // How long user takes to respond
  preferredActionPatterns Json?                 // { "email": { "tone": "formal", ... } }
}
```

### 4.2 Pattern Recognition

Track patterns to adjust future suggestions:

```typescript
interface LearningPattern {
  // Email patterns
  emailTonePreference: 'formal' | 'casual' | 'mixed';
  emailLengthPreference: 'short' | 'medium' | 'long';

  // Scheduling patterns
  preferredMeetingTimes: TimeSlot[];
  avoidedMeetingTimes: TimeSlot[];
  typicalMeetingDuration: number; // minutes

  // Contact patterns
  frequentContacts: string[];      // Contact IDs
  importantContacts: string[];     // Based on priority emails

  // Action patterns
  autoApprovePatterns: ActionPattern[];  // Actions that are always approved
  neverApprovePatterns: ActionPattern[]; // Actions that are always rejected
}
```

### 4.3 Confidence Adjustment Algorithm

```typescript
function calculateAdjustedConfidence(
  baseConfidence: number,
  agentName: string,
  actionType: string,
  userId: string,
): number {
  const profile = await getLearningProfile(userId, agentName, actionType);

  if (!profile) return baseConfidence;

  // Calculate approval rate
  const totalActions = profile.approvalCount + profile.rejectionCount;
  if (totalActions < 5) return baseConfidence; // Not enough data

  const approvalRate = profile.approvalCount / totalActions;

  // Boost or reduce confidence based on history
  // Range: -0.2 to +0.2 adjustment
  const adjustment = (approvalRate - 0.5) * 0.4;

  return Math.max(0, Math.min(1, baseConfidence + adjustment));
}
```

---

## 5. Implementation Plan

### Phase 1: Schema Updates (1-2 days)

1. Add job/role fields to `UserPreferences`
2. Create `UserProfileEmbedding` model
3. Run Prisma migration
4. Update DTOs and types

### Phase 2: Profile Service (2-3 days)

1. Create `UserProfileService`
   - Load and cache user profile
   - Get role template for user
   - Build personalized system prompt
2. Integrate with `MultiAgentController`
3. Add profile to `AgentContext`

### Phase 3: Semantic Memory (3-4 days)

1. Create `SemanticMemoryService`
   - Extract memories from conversations
   - Store embeddings with pgvector
   - Retrieve relevant memories
2. Create memory extraction prompts
3. Integrate with conversation flow
4. Add memory management API

### Phase 4: Learning System (2-3 days)

1. Enhance `FeedbackService`
   - Track patterns from approvals/rejections
   - Calculate preference scores
2. Add pattern-based confidence adjustment
3. Create learning dashboard API

### Phase 5: Frontend Integration (3-4 days)

1. Profile settings page
   - Job role selector
   - Communication preferences
   - Work schedule
2. Memory viewer (optional)
   - Show what the AI remembers
   - Allow editing/deleting memories
3. Learning insights (optional)
   - Show learned patterns
   - Approval rate statistics

---

## 6. API Endpoints

```typescript
// Profile Management
GET    /users/me/profile              // Get full profile with personalization
PATCH  /users/me/profile              // Update profile settings
GET    /users/me/profile/role-preview // Preview how role affects responses

// Semantic Memory
GET    /ai/memory                     // List user's semantic memories
POST   /ai/memory                     // Manually add a memory
DELETE /ai/memory/:id                 // Delete a memory
POST   /ai/memory/extract             // Extract memories from text

// Learning Insights
GET    /ai/learning/patterns          // Get learned patterns
GET    /ai/learning/statistics        // Approval rates, confidence trends
POST   /ai/learning/reset             // Reset learning for agent/action
```

---

## 7. Privacy Considerations

### Data Retention
- Profile data: Retained until user deletes account
- Semantic memories: Configurable retention (default 1 year)
- Learning data: Retained with profile

### Data Export
- Users can export all personalization data
- GDPR-compliant data deletion

### Transparency
- Show users what the AI has learned
- Allow users to correct or delete memories
- Explain why certain suggestions are made

---

## 8. References

### Research Sources
- [LangMem SDK: Personalizing AI Agents with Semantic Memory](https://www.analyticsvidhya.com/blog/2025/03/langmem-sdk/)
- [LangChain Memory Overview](https://docs.langchain.com/oss/python/concepts/memory)
- [Creating Personalized User Experiences with Vector Databases](https://zilliz.com/learn/creating-personalized-user-experiences-through-vector-databases)
- [Personalized AI Search with Vector Embeddings](https://www.datasqrl.com/blog/personalized-ai-search/)
- [AI-Powered Personalization in 2025](https://techbullion.com/ai-powered-personalization-in-2025-transforming-user-experiences/)
- [MongoDB + LangChain Memory Integration](https://www.mongodb.com/developer/products/atlas/add-memory-to-javascript-rag-application-mongodb-langchain/)
- [OpenAI Fine-tuning vs Embeddings](https://community.openai.com/t/fine-tuning-vs-embedding/35813)
- [PostgresML Personalized Embeddings](https://postgresml.org/blog/personalize-embedding-results-with-application-data-in-your-database)

### Key Insights
1. **Embeddings > Fine-tuning** for personalization - Use vector similarity for user context
2. **Profile Memory** for stable preferences, **Session Memory** for conversation context
3. **Incremental learning** - Update user embeddings as behavior evolves
4. **Hybrid search** - Combine dense (semantic) + sparse (keyword) for best results
5. **Cold start problem** - Use job role templates for new users until enough data

---

**Version:** 1.0
**Created:** 2025-11-25
**Author:** Claude Code
