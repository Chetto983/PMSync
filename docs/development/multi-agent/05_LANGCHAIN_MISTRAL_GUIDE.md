# 🤖 Guida Integrazione LangChain + Mistral AI

## 📋 Indice

- [1. Overview](#1-overview)
- [2. Setup & Configurazione](#2-setup--configurazione)
- [3. LangChain Agents con Mistral](#3-langchain-agents-con-mistral)
- [4. Tools Personalizzati](#4-tools-personalizzati)
- [5. Memory & Context](#5-memory--context)
- [6. RAG Implementation](#6-rag-implementation)
- [7. Function Calling](#7-function-calling)
- [8. Best Practices](#8-best-practices)
- [9. Esempi Pratici](#9-esempi-pratici)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. Overview

### 1.1 Stack Tecnologico

```typescript
┌─────────────────────────────────────────────┐
│         Application Layer (NestJS)          │
│  ┌───────────┐  ┌───────────┐  ┌─────────┐  │
│  │  Agents   │  │   Tools   │  │ Memory  │  │
│  └───────────┘  └───────────┘  └─────────┘  │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌────────────────┐      ┌──────────────────┐
│   LangChain    │      │   Mistral AI     │
│   TypeScript   │◄────►│   - Chat API     │
│   - Agents     │      │   - Embeddings   │
│   - Tools      │      │   - Functions    │
│   - Memory     │      │                  │
└────────────────┘      └──────────────────┘
```

### 1.2 Pacchetti Utilizzati

```json
{
  "dependencies": {
    "@langchain/mistralai": "^0.0.24",
    "langchain": "^0.1.30",
    "@mistralai/mistralai": "^0.1.3",
    "zod": "^3.22.4"
  }
}
```

**Riferimenti:**
- **[LangChain JS Docs](https://js.langchain.com/)** - Documentazione ufficiale
- **[Mistral AI Docs](https://docs.mistral.ai/)** - API reference
- **[LangSmith](https://smith.langchain.com/)** - Debugging & monitoring

---

## 2. Setup & Configurazione

### 2.1 Installazione Dipendenze

```bash
npm install @langchain/mistralai langchain @mistralai/mistralai zod
```

### 2.2 Configurazione Ambiente

**File:** `.env`
```bash
# Mistral AI
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_MODEL=mistral-large-latest
MISTRAL_EMBEDDING_MODEL=mistral-embed
MISTRAL_TEMPERATURE=0.7
MISTRAL_MAX_TOKENS=1024

# LangChain (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your_langsmith_key
LANGCHAIN_PROJECT=mailagent-multi-agent
```

### 2.3 Service Base - MistralService

**File:** `backend/src/modules/ai/services/mistral.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';

@Injectable()
export class MistralService {
  private readonly logger = new Logger(MistralService.name);
  private readonly defaultModel: string;
  private readonly embeddingModel: string;

  constructor(private configService: ConfigService) {
    this.defaultModel = this.configService.get<string>('MISTRAL_MODEL') || 'mistral-large-latest';
    this.embeddingModel = this.configService.get<string>('MISTRAL_EMBEDDING_MODEL') || 'mistral-embed';
  }

  private getApiKey(): string {
    const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }
    return apiKey;
  }

  async createMistralClient(): Promise<Mistral> {
    return new Mistral({ apiKey: this.getApiKey() });
  }

  getModel(): string {
    return this.defaultModel;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  /**
   * Genera embeddings per RAG
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const client = await this.createMistralClient();
    const response = await client.embeddings.create({
      model: this.embeddingModel,
      inputs: text,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error('Empty embedding returned from Mistral');
    }

    return embedding;
  }

  /**
   * Bulk embeddings per ottimizzazione
   */
  async generateBulkEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    const client = await this.createMistralClient();
    const response = await client.embeddings.create({
      model: this.embeddingModel,
      inputs: texts,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Empty bulk embedding response');
    }

    // Ordina per index
    const sortedData = response.data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sortedData.map(item => item.embedding);
  }

  /**
   * Chat completion semplice
   */
  async completePrompt(options: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const { systemPrompt, userPrompt, temperature = 0.7, maxTokens = 1024 } = options;

    const client = await this.createMistralClient();
    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const completion = await client.chat.complete({
      model: this.defaultModel,
      messages,
      temperature,
      maxTokens,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Mistral');
    }

    return typeof content === 'string' ? content.trim() : '';
  }
}
```

**Riferimenti:**
- **[Mistral SDK TypeScript](https://github.com/mistralai/client-ts)** - Client library
- **[Mistral API Reference](https://docs.mistral.ai/api/)** - Endpoint docs

---

## 3. LangChain Agents con Mistral

### 3.1 Agent Base con ChatMistralAI

**File:** `backend/src/modules/ai/services/agent.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, tool } from 'langchain';
import { z } from 'zod';
import { MistralService } from './mistral.service';
import { EmbeddingsService } from './embeddings.service';

interface RunAgentOptions {
  tenantId: string;
  userId: string;
  prompt: string;
  conversationId?: string | null;
  history?: Array<{ role: string; content: string }>;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async runAgent(options: RunAgentOptions) {
    const apiKey = this.mistralService.getApiKey();
    const model = this.mistralService.getModel();

    // 1. Crea ChatMistralAI model
    const chatModel = new ChatMistralAI({
      apiKey,
      model,
      temperature: 0.2,
      maxTokens: 1024,
    });

    // 2. Definisci tools
    const knowledgeSearchTool = tool(
      async ({ query, limit }: { query: string; limit?: number }) => {
        // Genera embedding della query
        const embedding = await this.mistralService.generateEmbedding(query);

        // Cerca vettori simili
        const results = await this.embeddingsService.findSimilarContent(
          options.tenantId,
          embedding,
          limit ?? 3,
        );

        if (!results.length) {
          return 'No relevant knowledge base entries found.';
        }

        return results
          .map((item, index) => {
            const title = item.documentName || `Document ${index + 1}`;
            return `${title}:\n${item.content}`;
          })
          .join('\n\n---\n\n');
      },
      {
        name: 'knowledge_search',
        description: 'Search the internal knowledge base for relevant documents or emails.',
        schema: z.object({
          query: z.string().describe('Natural language search query'),
          limit: z.number().int().positive().max(10).optional(),
        }),
      },
    );

    const recentEmailsTool = tool(
      async ({ limit, folder }: { limit?: number; folder?: string }) => {
        // Query database per email recenti
        const emails = await this.prisma.email.findMany({
          where: {
            tenantId: options.tenantId,
            ...(folder ? { folder: folder.toUpperCase() } : {}),
          },
          orderBy: { receivedAt: 'desc' },
          take: Math.min(limit ?? 3, 10),
          select: {
            subject: true,
            from: true,
            snippet: true,
            folder: true,
            receivedAt: true,
          },
        });

        if (!emails.length) {
          return 'No emails found.';
        }

        return emails
          .map((email) => {
            const received = email.receivedAt
              ? new Date(email.receivedAt).toISOString()
              : 'Unknown';
            return `Subject: ${email.subject}\nFrom: ${email.from}\nFolder: ${email.folder}\nReceived: ${received}\nSnippet: ${email.snippet ?? '(no snippet)'}`;
          })
          .join('\n\n---\n\n');
      },
      {
        name: 'recent_emails',
        description: 'Look up recent emails for this workspace to summarize or answer questions.',
        schema: z.object({
          limit: z.number().int().positive().max(10).optional(),
          folder: z.string().optional().describe('Folder name (e.g. INBOX, SENT)'),
        }),
      },
    );

    // 3. Crea agent
    const agent = createAgent({
      model: chatModel,
      tools: [knowledgeSearchTool, recentEmailsTool],
    });

    // 4. Prepara messaggi conversazione
    const conversationMessages = [
      ...(options.history ?? []).map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.content,
      })),
      { role: 'user', content: options.prompt },
    ];

    // 5. Esegui agent
    const startTime = Date.now();
    this.logger.log(
      `Agent run started for tenant=${options.tenantId} user=${options.userId}`,
    );

    try {
      const result = await agent.invoke({
        input: options.prompt,
        messages: conversationMessages,
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Agent completed in ${durationMs}ms for tenant=${options.tenantId}`,
      );

      // 6. Estrai output
      let output = '';
      if (typeof result?.output === 'string') {
        output = result.output.trim();
      } else if (Array.isArray(result?.messages)) {
        const lastAiMessage = [...result.messages]
          .reverse()
          .find((msg) => msg.role === 'assistant' || msg._getType?.() === 'ai');
        output = lastAiMessage?.content || '';
      }

      if (!output) {
        output = 'I could not produce a response.';
      }

      // 7. Estrai tool steps
      const intermediateSteps = this.extractToolSteps(result);

      return {
        output,
        intermediateSteps,
      };
    } catch (error) {
      this.logger.error(
        `Agent failed: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private extractToolSteps(result: any) {
    const executed =
      result?.executedTools ||
      result?.steps ||
      result?.toolInvocations;

    if (!Array.isArray(executed)) {
      return undefined;
    }

    const mapped = executed
      .map((entry: any) => {
        const toolName = entry?.name ?? entry?.tool ?? 'tool';
        const rawOutput =
          entry?.result ??
          entry?.output ??
          entry?.response;

        if (rawOutput === undefined || rawOutput === null) {
          return { tool: toolName, output: '' };
        }

        const output = typeof rawOutput === 'string'
          ? rawOutput
          : JSON.stringify(rawOutput);

        return { tool: toolName, output };
      })
      .filter((item) => item.output.length > 0);

    return mapped.length ? mapped : undefined;
  }
}
```

**Riferimenti:**
- **[LangChain Agents Guide](https://js.langchain.com/docs/modules/agents/)** - Agent patterns
- **[ChatMistralAI](https://js.langchain.com/docs/integrations/chat/mistral)** - Model integration

---

## 4. Tools Personalizzati

### 4.1 Tool per Inviare Email

```typescript
import { tool } from 'langchain';
import { z } from 'zod';

const sendEmailTool = tool(
  async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    try {
      // Validazione email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return `Error: Invalid email address: ${to}`;
      }

      // TODO: Implementare invio email
      // await this.emailService.sendEmail({ to, subject, body });

      return `Email sent successfully to ${to}`;
    } catch (error) {
      return `Error sending email: ${error instanceof Error ? error.message : error}`;
    }
  },
  {
    name: 'send_email',
    description: 'Send an email to a recipient. Use this when the user explicitly asks to send an email.',
    schema: z.object({
      to: z.string().describe('Recipient email address'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Email body content'),
    }),
  },
);
```

### 4.2 Tool per Creare Eventi Calendario

```typescript
const createCalendarEventTool = tool(
  async ({ title, startTime, endTime, attendees }: {
    title: string;
    startTime: string;
    endTime?: string;
    attendees?: string[];
  }) => {
    try {
      // Validazione date
      const start = new Date(startTime);
      if (isNaN(start.getTime())) {
        return `Error: Invalid start time: ${startTime}`;
      }

      // TODO: Implementare creazione evento
      // await this.calendarService.createEvent({ title, startTime, endTime, attendees });

      return `Calendar event "${title}" created successfully for ${startTime}`;
    } catch (error) {
      return `Error creating event: ${error instanceof Error ? error.message : error}`;
    }
  },
  {
    name: 'create_calendar_event',
    description: 'Create a calendar event with title, time, and optional attendees.',
    schema: z.object({
      title: z.string().describe('Event title'),
      startTime: z.string().describe('Start time in ISO 8601 format'),
      endTime: z.string().optional().describe('End time in ISO 8601 format'),
      attendees: z.array(z.string()).optional().describe('List of attendee emails'),
    }),
  },
);
```

### 4.3 Tool per Search Contatti

```typescript
const searchContactsTool = tool(
  async ({ query }: { query: string }) => {
    try {
      const contacts = await this.prisma.contact.findMany({
        where: {
          tenantId: this.tenantId,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
            { emails: { string_contains: query } },
          ],
        },
        take: 10,
      });

      if (!contacts.length) {
        return `No contacts found matching "${query}"`;
      }

      return contacts
        .map((c) => {
          const name = c.displayName || `${c.firstName} ${c.lastName}`;
          const emails = Array.isArray(c.emails)
            ? c.emails.map((e: any) => e.value).join(', ')
            : 'No email';
          return `${name} (${emails})`;
        })
        .join('\n');
    } catch (error) {
      return `Error searching contacts: ${error instanceof Error ? error.message : error}`;
    }
  },
  {
    name: 'search_contacts',
    description: 'Search contacts by name or email address.',
    schema: z.object({
      query: z.string().describe('Search query (name or email)'),
    }),
  },
);
```

**Riferimenti:**
- **[LangChain Tools](https://js.langchain.com/docs/modules/agents/tools/)** - Creating custom tools
- **[Zod Validation](https://zod.dev/)** - Schema validation

---

## 5. Memory & Context

### 5.1 Conversation Buffer Memory

```typescript
import { BufferMemory } from 'langchain/memory';
import { ChatMessageHistory } from 'langchain/memory';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

@Injectable()
export class ConversationMemoryService {
  /**
   * Crea memoria conversazionale da cronologia
   */
  createMemoryFromHistory(history: Array<{ role: string; content: string }>) {
    const pastMessages = history.map((msg) => {
      return msg.role === 'assistant'
        ? new AIMessage(msg.content)
        : new HumanMessage(msg.content);
    });

    const chatHistory = new ChatMessageHistory(pastMessages);

    return new BufferMemory({
      chatHistory,
      returnMessages: true,
      inputKey: 'input',
      outputKey: 'output',
    });
  }

  /**
   * Salva conversazione nel database
   */
  async saveConversation(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    messages: Array<{ role: string; content: string }>;
  }) {
    await this.prisma.chatSession.update({
      where: { id: params.sessionId },
      data: {
        messages: params.messages,
        updatedAt: new Date(),
      },
    });
  }
}
```

### 5.2 Sliding Window Memory

Per conversazioni lunghe, usa una finestra scorrevole:

```typescript
const getRecentHistory = (
  messages: Array<{ role: string; content: string }>,
  maxMessages: number = 10,
) => {
  // Prendi solo gli ultimi N messaggi
  return messages.slice(-maxMessages);
};

// Usage
const recentHistory = getRecentHistory(fullHistory, 10);
const agent = createAgent({
  model: chatModel,
  tools: [/* ... */],
});

await agent.invoke({
  input: userPrompt,
  messages: recentHistory, // ← Sliding window
});
```

**Riferimenti:**
- **[LangChain Memory](https://js.langchain.com/docs/modules/memory/)** - Memory systems
- **[Message History](https://js.langchain.com/docs/modules/memory/chat_messages/)** - Chat history

---

## 6. RAG Implementation

### 6.1 Embeddings Service

**File:** `backend/src/modules/ai/services/embeddings.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Salva embedding nel database
   */
  async saveEmbedding(params: {
    tenantId: string;
    messageId?: string;
    documentName?: string;
    content: string;
    embedding: number[];
    model: string;
    metadata?: Record<string, any>;
  }) {
    return this.prisma.embedding.create({
      data: {
        tenantId: params.tenantId,
        messageId: params.messageId,
        documentName: params.documentName,
        content: params.content,
        vector: `[${params.embedding.join(',')}]`, // pgvector format
        embeddingModel: params.model,
        metadata: params.metadata,
      },
    });
  }

  /**
   * Ricerca similarity con pgvector
   */
  async findSimilarContent(
    tenantId: string,
    queryEmbedding: number[],
    limit: number = 5,
  ) {
    const vectorString = `[${queryEmbedding.join(',')}]`;

    // Query raw SQL per pgvector cosine similarity
    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        documentName: string | null;
        similarity: number;
      }>
    >`
      SELECT
        id,
        content,
        "documentName",
        1 - (vector <=> ${vectorString}::vector) as similarity
      FROM embeddings
      WHERE "tenantId" = ${tenantId}
      ORDER BY vector <=> ${vectorString}::vector
      LIMIT ${limit}
    `;

    this.logger.debug(
      `Found ${results.length} similar documents for tenant ${tenantId}`,
    );

    return results;
  }

  /**
   * Bulk save embeddings
   */
  async saveBulkEmbeddings(
    embeddings: Array<{
      tenantId: string;
      content: string;
      embedding: number[];
      model: string;
      documentName?: string;
      metadata?: Record<string, any>;
    }>,
  ) {
    return this.prisma.embedding.createMany({
      data: embeddings.map((e) => ({
        tenantId: e.tenantId,
        content: e.content,
        vector: `[${e.embedding.join(',')}]`,
        embeddingModel: e.model,
        documentName: e.documentName,
        metadata: e.metadata,
      })),
    });
  }
}
```

### 6.2 RAG Pipeline Completo

```typescript
@Injectable()
export class RAGService {
  constructor(
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Genera risposta RAG-enhanced
   */
  async generateRAGResponse(params: {
    tenantId: string;
    query: string;
    topK?: number;
  }): Promise<string> {
    // 1. Genera embedding della query
    const queryEmbedding = await this.mistralService.generateEmbedding(params.query);

    // 2. Cerca documenti simili
    const similarDocs = await this.embeddingsService.findSimilarContent(
      params.tenantId,
      queryEmbedding,
      params.topK ?? 5,
    );

    // 3. Costruisci context
    const context = similarDocs
      .map((doc, idx) => `[${idx + 1}] ${doc.documentName || 'Document'}:\n${doc.content}`)
      .join('\n\n');

    // 4. Genera risposta con context
    const systemPrompt = `You are a helpful assistant with access to the following context:

${context}

Use the context above to answer the user's question. If the context doesn't contain relevant information, say so.`;

    const response = await this.mistralService.completePrompt({
      systemPrompt,
      userPrompt: params.query,
    });

    return response;
  }
}
```

**Riferimenti:**
- **[pgvector Documentation](https://github.com/pgvector/pgvector)** - Vector database
- **[RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)** - Pinecone guide
- **[Advanced RAG](https://blog.llamaindex.ai/advanced-rag-techniques-an-illustrated-overview-04d193d8fec6)** - Techniques

---

## 7. Function Calling

### 7.1 Mistral Native Function Calling

```typescript
import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// Definisci functions
const functions = [
  {
    name: 'get_weather',
    description: 'Get the current weather in a location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and country, e.g. London, UK',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit',
        },
      },
      required: ['location'],
    },
  },
];

// Chat con function calling
const response = await client.chat.complete({
  model: 'mistral-large-latest',
  messages: [
    { role: 'user', content: 'What is the weather in Paris?' },
  ],
  tools: functions,
  tool_choice: 'auto',
});

// Se Mistral decide di chiamare una function
if (response.choices[0].message.tool_calls) {
  const toolCall = response.choices[0].message.tool_calls[0];
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  // Esegui function
  const result = await executeFunction(functionName, args);

  // Invia risultato a Mistral
  const finalResponse = await client.chat.complete({
    model: 'mistral-large-latest',
    messages: [
      { role: 'user', content: 'What is the weather in Paris?' },
      response.choices[0].message,
      {
        role: 'tool',
        name: functionName,
        content: JSON.stringify(result),
      },
    ],
    tools: functions,
  });

  console.log(finalResponse.choices[0].message.content);
}
```

**Riferimenti:**
- **[Mistral Function Calling](https://docs.mistral.ai/guides/function-calling/)** - Official guide
- **[OpenAI Function Format](https://platform.openai.com/docs/guides/function-calling)** - Compatible format

---

## 8. Best Practices

### 8.1 Error Handling

```typescript
async runAgentSafely(options: RunAgentOptions) {
  try {
    return await this.runAgent(options);
  } catch (error) {
    // Log dettagliato
    this.logger.error('Agent execution failed', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      options: {
        tenantId: options.tenantId,
        userId: options.userId,
        promptLength: options.prompt.length,
      },
    });

    // Fallback response
    if (error instanceof Error && error.message.includes('rate limit')) {
      throw new HttpException(
        'AI service is rate limited. Please try again in a moment.',
        429,
      );
    }

    if (error instanceof Error && error.message.includes('timeout')) {
      throw new HttpException(
        'AI request timeout. Please try a simpler query.',
        504,
      );
    }

    // Generic error
    throw new HttpException(
      'AI service unavailable. Please try again later.',
      503,
    );
  }
}
```

### 8.2 Timeout Management

```typescript
import { timeout } from 'rxjs/operators';

async runAgentWithTimeout(options: RunAgentOptions, timeoutMs: number = 30000) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Agent timeout')), timeoutMs),
  );

  const agentPromise = this.runAgent(options);

  return Promise.race([agentPromise, timeoutPromise]);
}
```

### 8.3 Caching Responses

```typescript
import { createHash } from 'crypto';

@Injectable()
export class CachedAgentService {
  constructor(
    private readonly agentService: AgentService,
    private readonly cacheManager: Cache,
  ) {}

  async runAgentCached(options: RunAgentOptions, ttl: number = 300) {
    // Genera cache key
    const cacheKey = this.generateCacheKey(options);

    // Check cache
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for agent request: ${cacheKey}`);
      return cached;
    }

    // Execute agent
    const result = await this.agentService.runAgent(options);

    // Save to cache
    await this.cacheManager.set(cacheKey, result, ttl);

    return result;
  }

  private generateCacheKey(options: RunAgentOptions): string {
    const data = {
      prompt: options.prompt,
      tenantId: options.tenantId,
      historyLength: options.history?.length ?? 0,
    };
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return `agent:${hash}`;
  }
}
```

### 8.4 Rate Limiting

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('ai')
export class AiController {
  @Post('agent')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min
  async runAgent(@Body() body: RunAgentDto) {
    return this.agentService.runAgent(body);
  }
}
```

**Riferimenti:**
- **[NestJS Error Handling](https://docs.nestjs.com/exception-filters)** - Exception filters
- **[NestJS Caching](https://docs.nestjs.com/techniques/caching)** - Cache manager
- **[Rate Limiting](https://docs.nestjs.com/security/rate-limiting)** - Throttler

---

## 9. Esempi Pratici

### 9.1 Email Smart Reply Agent

```typescript
@Injectable()
export class SmartReplyAgent {
  constructor(
    private readonly mistralService: MistralService,
    private readonly prisma: PrismaService,
  ) {}

  async generateSmartReply(emailId: string, tenantId: string): Promise<string[]> {
    // 1. Fetch email
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId },
    });

    if (!email) {
      throw new Error('Email not found');
    }

    // 2. Costruisci prompt
    const systemPrompt = `You are an email assistant. Generate 3 professional smart reply suggestions for the email below.
Each reply should be concise (1-2 sentences) and appropriate for the context.

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.bodyText || email.snippet}

Generate 3 replies:`;

    // 3. Chiama Mistral
    const response = await this.mistralService.completePrompt({
      systemPrompt,
      userPrompt: 'Generate 3 smart replies',
      temperature: 0.8,
      maxTokens: 512,
    });

    // 4. Parse risposte
    const suggestions = response
      .split('\n')
      .filter((line) => line.trim().match(/^\d+[\.\)]/))
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim());

    return suggestions.slice(0, 3);
  }
}
```

### 9.2 Calendar Scheduling con NLP

```typescript
@Injectable()
export class CalendarSchedulingAgent {
  async parseEventFromNaturalLanguage(
    input: string,
  ): Promise<{
    title: string;
    startTime: Date;
    endTime?: Date;
    attendees?: string[];
  }> {
    const systemPrompt = `Extract calendar event details from the user's natural language input.
Respond in JSON format:
{
  "title": "event title",
  "startTime": "ISO 8601 datetime",
  "endTime": "ISO 8601 datetime (optional)",
  "attendees": ["email1@example.com", "email2@example.com"]
}

Current date/time: ${new Date().toISOString()}`;

    const response = await this.mistralService.completePrompt({
      systemPrompt,
      userPrompt: input,
      temperature: 0.2,
    });

    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse event details');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      title: parsed.title,
      startTime: new Date(parsed.startTime),
      endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
      attendees: parsed.attendees,
    };
  }
}
```

### 9.3 Multi-Step Agent Workflow

```typescript
@Injectable()
export class MultiStepWorkflowAgent {
  async processComplexTask(input: string, tenantId: string) {
    const steps: Array<{ step: string; result: any }> = [];

    // Step 1: Classifica intent
    const intent = await this.classifyIntent(input);
    steps.push({ step: 'classify_intent', result: intent });

    // Step 2: Cerca context rilevante
    if (intent.requiresContext) {
      const context = await this.searchContext(input, tenantId);
      steps.push({ step: 'search_context', result: context });
    }

    // Step 3: Genera piano azioni
    const actionPlan = await this.generateActionPlan(input, intent, steps);
    steps.push({ step: 'generate_plan', result: actionPlan });

    // Step 4: Esegui azioni
    const results = [];
    for (const action of actionPlan.actions) {
      const result = await this.executeAction(action, tenantId);
      results.push(result);
      steps.push({ step: `execute_${action.type}`, result });
    }

    // Step 5: Genera summary
    const summary = await this.generateSummary(steps);

    return {
      summary,
      steps,
      results,
    };
  }
}
```

---

## 10. Troubleshooting

### 10.1 Problemi Comuni

#### Token Limit Exceeded
```typescript
// Problema: prompt troppo lungo
// Soluzione: Tronca context o usa sliding window

const truncateContext = (context: string, maxTokens: number = 2000) => {
  // Stima approssimativa: 1 token ≈ 4 caratteri
  const maxChars = maxTokens * 4;
  if (context.length > maxChars) {
    return context.slice(0, maxChars) + '...';
  }
  return context;
};
```

#### Rate Limiting
```typescript
// Implementa exponential backoff
async function mistralCallWithRetry(fn: () => Promise<any>, maxRetries: number = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.statusCode === 429 && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
}
```

#### Empty Responses
```typescript
// Fallback per risposte vuote
const response = await mistralService.completePrompt(options);
if (!response || response.trim().length === 0) {
  return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
}
```

### 10.2 Debugging con LangSmith

```typescript
// Abilita tracing
process.env.LANGCHAIN_TRACING_V2 = 'true';
process.env.LANGCHAIN_PROJECT = 'mailagent-debug';

// Ogni run dell'agent sarà tracciato su LangSmith
const result = await agent.invoke({ input: 'test' });

// Visualizza trace su: https://smith.langchain.com/
```

**Riferimenti:**
- **[LangSmith Docs](https://docs.smith.langchain.com/)** - Monitoring & debugging
- **[Mistral API Status](https://status.mistral.ai/)** - Service status

---

## 📚 Risorse Aggiuntive

### Tutorial & Guide
- **[LangChain Cookbook](https://github.com/langchain-ai/langchain/tree/master/cookbook)** - Recipes
- **[Mistral Cookbook](https://github.com/mistralai/cookbook)** - Examples
- **[RAG from Scratch](https://www.youtube.com/watch?v=sVcwVQRHIc8)** - Tutorial video

### Community
- **[LangChain Discord](https://discord.gg/langchain)** - Community support
- **[Mistral Discord](https://discord.gg/mistralai)** - Mistral community
- **[r/LangChain](https://www.reddit.com/r/LangChain/)** - Reddit community

---

**Versione:** 1.0.0
**Ultimo aggiornamento:** 2025-11-20
**Stack:** LangChain v0.1.30 + Mistral AI + NestJS

**Vedi anche:**
- [INDEX.md](./INDEX.md) - Hub documentazione
- [01_ROADMAP_DETTAGLIATA.md](./01_ROADMAP_DETTAGLIATA.md) - Piano implementazione
- [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) - Architettura sistema

## External References (planning)
- LangChain docs: https://python.langchain.com/
- LangChain agents: https://python.langchain.com/docs/modules/agents/
- Mistral function calling: https://docs.mistral.ai/guides/function-calling/
- Mistral embeddings: https://docs.mistral.ai/guides/embeddings/
- LangGraph multi-agent: https://blog.langchain.dev/langgraph-multi-agent-workflows/


- Proactive assistant patterns: https://blog.langchain.dev/plan-and-execute-agents/; https://python.langchain.com/docs/use_cases/agent_simulations/meeting_scheduler

- TypeScript/langchainjs: https://js.langchain.com/docs; https://github.com/langchain-ai/langchainjs
- NestJS + Prisma: https://docs.nestjs.com/recipes/prisma
