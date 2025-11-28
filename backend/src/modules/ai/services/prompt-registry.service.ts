import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface PromptConfig {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ResolvedPrompt {
  id: string;
  name: string;
  version: number;
  locale: string;
  bucket: string | null;
  body: string;
  variables: Record<string, string> | null;
  config: PromptConfig;
  isDefault: boolean;
}

export interface GetPromptParams {
  tenantId?: string | null;
  name: string;
  locale?: string;
  bucket?: string;
  version?: number;
}

@Injectable()
export class PromptRegistryService {
  private readonly logger = new Logger(PromptRegistryService.name);
  private cache = new Map<string, { prompt: ResolvedPrompt; expiresAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the best matching prompt template.
   * Priority: tenant+locale+bucket > tenant+locale > tenant+en > system+locale > system+en
   */
  async getPrompt(params: GetPromptParams): Promise<ResolvedPrompt> {
    const { tenantId, name, locale = 'en', bucket, version } = params;

    // Check cache first
    const cacheKey = this.buildCacheKey(params);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.prompt;
    }

    // Build query conditions
    const whereConditions: Prisma.PromptTemplateWhereInput = {
      name,
      isActive: true,
    };

    // If specific version requested
    if (version) {
      whereConditions.version = version;
    }

    // Fetch candidates (tenant-specific and system defaults)
    const candidates = await this.prisma.promptTemplate.findMany({
      where: {
        AND: [
          whereConditions,
          {
            OR: [
              { tenantId: tenantId ?? undefined },
              { tenantId: null },
            ],
          },
        ],
      },
      orderBy: [
        { version: 'desc' },
      ],
    });

    if (candidates.length === 0) {
      throw new NotFoundException(`No prompt template found for: ${name}`);
    }

    // Score and select best match
    const scored = candidates.map((c) => ({
      prompt: c,
      score: this.scorePrompt(c, tenantId, locale, bucket),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].prompt;

    const resolved: ResolvedPrompt = {
      id: best.id,
      name: best.name,
      version: best.version,
      locale: best.locale,
      bucket: best.bucket,
      body: best.body,
      variables: best.variables as Record<string, string> | null,
      config: (best.metadata as PromptConfig) || {},
      isDefault: best.isDefault,
    };

    // Cache result
    this.cache.set(cacheKey, {
      prompt: resolved,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    this.logger.debug(
      `Resolved prompt "${name}" v${best.version} locale=${best.locale} tenant=${best.tenantId || 'system'}`,
    );

    return resolved;
  }

  /**
   * Render a prompt template with variables.
   */
  renderPrompt(template: string, variables: Record<string, string | undefined>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      rendered = rendered.replace(placeholder, value ?? '');
    }
    return rendered;
  }

  /**
   * Get prompt and render it in one step.
   */
  async getAndRender(
    params: GetPromptParams,
    variables: Record<string, string | undefined>,
  ): Promise<{ prompt: ResolvedPrompt; rendered: string }> {
    const prompt = await this.getPrompt(params);
    const rendered = this.renderPrompt(prompt.body, variables);
    return { prompt, rendered };
  }

  /**
   * Create or update a prompt template.
   */
  async upsertPrompt(data: {
    tenantId?: string | null;
    name: string;
    version?: number;
    locale?: string;
    bucket?: string;
    body: string;
    variables?: Record<string, string>;
    metadata?: PromptConfig;
    isDefault?: boolean;
    createdBy?: string;
  }): Promise<ResolvedPrompt> {
    const {
      tenantId = null,
      name,
      version = 1,
      locale = 'en',
      bucket = null,
      body,
      variables = null,
      metadata = null,
      isDefault = false,
      createdBy = null,
    } = data;

    const result = await this.prisma.promptTemplate.upsert({
      where: {
        tenantId_name_version_locale_bucket: {
          tenantId: tenantId as string,
          name,
          version,
          locale,
          bucket: bucket as string,
        },
      },
      update: {
        body,
        variables: variables as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
        isDefault,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        name,
        version,
        locale,
        bucket,
        body,
        variables: variables as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
        isDefault,
        createdBy,
      },
    });

    // Invalidate cache for this prompt
    this.invalidateCache(name);

    return {
      id: result.id,
      name: result.name,
      version: result.version,
      locale: result.locale,
      bucket: result.bucket,
      body: result.body,
      variables: result.variables as Record<string, string> | null,
      config: (result.metadata as PromptConfig) || {},
      isDefault: result.isDefault,
    };
  }

  /**
   * List all prompts for a tenant (or system defaults).
   */
  async listPrompts(params: {
    tenantId?: string | null;
    name?: string;
    locale?: string;
    includeSystem?: boolean;
  }): Promise<ResolvedPrompt[]> {
    const { tenantId, name, locale, includeSystem = true } = params;

    const where: Prisma.PromptTemplateWhereInput = {
      isActive: true,
    };

    if (name) {
      where.name = name;
    }
    if (locale) {
      where.locale = locale;
    }

    const tenantConditions: Prisma.PromptTemplateWhereInput[] = [];
    if (tenantId) {
      tenantConditions.push({ tenantId });
    }
    if (includeSystem) {
      tenantConditions.push({ tenantId: null });
    }

    if (tenantConditions.length > 0) {
      where.OR = tenantConditions;
    }

    const prompts = await this.prisma.promptTemplate.findMany({
      where,
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });

    return prompts.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      locale: p.locale,
      bucket: p.bucket,
      body: p.body,
      variables: p.variables as Record<string, string> | null,
      config: (p.metadata as PromptConfig) || {},
      isDefault: p.isDefault,
    }));
  }

  /**
   * Seed default system prompts.
   */
  async seedDefaults(): Promise<number> {
    const defaults = this.getDefaultPrompts();
    let seeded = 0;

    for (const prompt of defaults) {
      try {
        await this.upsertPrompt({
          tenantId: null,
          ...prompt,
          isDefault: true,
          createdBy: 'system',
        });
        seeded++;
      } catch (error) {
        this.logger.warn(`Failed to seed prompt ${prompt.name}: ${error}`);
      }
    }

    this.logger.log(`Seeded ${seeded} default prompts`);
    return seeded;
  }

  /**
   * Invalidate cache entries for a prompt name.
   */
  private invalidateCache(name: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(name)) {
        this.cache.delete(key);
      }
    }
  }

  private buildCacheKey(params: GetPromptParams): string {
    return `${params.tenantId || 'system'}:${params.name}:${params.locale || 'en'}:${params.bucket || 'default'}:${params.version || 'latest'}`;
  }

  private scorePrompt(
    prompt: { tenantId: string | null; locale: string; bucket: string | null; isDefault: boolean },
    targetTenantId: string | null | undefined,
    targetLocale: string,
    targetBucket: string | undefined,
  ): number {
    let score = 0;

    // Tenant match is highest priority
    if (prompt.tenantId === targetTenantId && targetTenantId) {
      score += 1000;
    } else if (prompt.tenantId === null) {
      score += 100; // System default
    }

    // Exact locale match
    if (prompt.locale === targetLocale) {
      score += 50;
    } else if (prompt.locale === 'en') {
      score += 10; // English fallback
    }

    // Bucket match
    if (targetBucket && prompt.bucket === targetBucket) {
      score += 25;
    } else if (!prompt.bucket) {
      score += 5; // No bucket = universal
    }

    // Default flag bonus
    if (prompt.isDefault) {
      score += 1;
    }

    return score;
  }

  /**
   * Default system prompts.
   */
  private getDefaultPrompts(): Array<{
    name: string;
    locale: string;
    body: string;
    variables?: Record<string, string>;
    metadata?: PromptConfig;
  }> {
    return [
      // Router Agent - English
      {
        name: 'router.classify',
        locale: 'en',
        body: `You are an intent classifier for a personal assistant managing email, calendar, and contacts.

Analyze the user's message and determine the primary intent.

Available intents:
- EMAIL: Sending, reading, searching, organizing emails
- CALENDAR: Events, meetings, scheduling, availability
- CONTACTS: Contact management, finding people, address book
- KNOWLEDGE: Questions about past emails/events, searching history
- GENERAL: Greetings, help, general questions, chitchat

User message: {userMessage}

Respond with ONLY a JSON object (no markdown):
{
  "intent": "EMAIL|CALENDAR|CONTACTS|KNOWLEDGE|GENERAL",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`,
        variables: { userMessage: 'string' },
        metadata: { temperature: 0.1, maxTokens: 200 },
      },
      // Router Agent - Italian
      {
        name: 'router.classify',
        locale: 'it',
        body: `Sei un classificatore di intenti per un assistente personale che gestisce email, calendario e contatti.

Analizza il messaggio dell'utente e determina l'intento principale.

Intenti disponibili:
- EMAIL: Invio, lettura, ricerca, organizzazione email
- CALENDAR: Eventi, riunioni, programmazione, disponibilita
- CONTACTS: Gestione contatti, ricerca persone, rubrica
- KNOWLEDGE: Domande su email/eventi passati, ricerca nella cronologia
- GENERAL: Saluti, aiuto, domande generali, conversazione

Messaggio utente: {userMessage}

Rispondi SOLO con un oggetto JSON (senza markdown):
{
  "intent": "EMAIL|CALENDAR|CONTACTS|KNOWLEDGE|GENERAL",
  "confidence": 0.0-1.0,
  "reasoning": "Breve spiegazione"
}`,
        variables: { userMessage: 'string' },
        metadata: { temperature: 0.1, maxTokens: 200 },
      },
      // Email Compose - English
      {
        name: 'email.compose',
        locale: 'en',
        body: `You are a professional email assistant. Compose an email based on the user's request.

{styleSection}

Recipients: {recipients}
Subject: {subject}
{threadContext}

User request: {userRequest}

Tone: {tone}

Write ONLY the email body. Do not include subject line, greeting separately, or any markdown formatting.
Keep the response professional and concise.`,
        variables: {
          styleSection: 'string',
          recipients: 'string',
          subject: 'string',
          threadContext: 'string',
          userRequest: 'string',
          tone: 'string',
        },
        metadata: { temperature: 0.4, maxTokens: 1000 },
      },
      // Email Compose - Italian
      {
        name: 'email.compose',
        locale: 'it',
        body: `Sei un assistente professionale per email. Componi un'email in base alla richiesta dell'utente.

{styleSection}

Destinatari: {recipients}
Oggetto: {subject}
{threadContext}

Richiesta utente: {userRequest}

Tono: {tone}

Scrivi SOLO il corpo dell'email. Non includere oggetto, saluti separati o formattazione markdown.
Mantieni la risposta professionale e concisa.`,
        variables: {
          styleSection: 'string',
          recipients: 'string',
          subject: 'string',
          threadContext: 'string',
          userRequest: 'string',
          tone: 'string',
        },
        metadata: { temperature: 0.4, maxTokens: 1000 },
      },
      // Email Summary - English
      {
        name: 'email.summarize',
        locale: 'en',
        body: `You are an assistant who summarizes business emails. Reply with a short summary in PLAIN TEXT (max 5 sentences).
Highlight intent, requests, and next steps. DO NOT use markdown, asterisks, bold, or special formatting.
Write complete, readable sentences.

Email:
Subject: {subject}
From: {from}
To: {to}

Body:
{body}`,
        variables: { subject: 'string', from: 'string', to: 'string', body: 'string' },
        metadata: { temperature: 0.2, maxTokens: 400 },
      },
      // Email Summary - Italian
      {
        name: 'email.summarize',
        locale: 'it',
        body: `Sei un assistente che riassume email di lavoro. Rispondi con un breve riassunto in TESTO SEMPLICE (massimo 5 frasi).
Evidenzia intento, richieste e prossimi passi. NON usare markdown, asterischi, grassetto o formattazione speciale.
Scrivi frasi complete e leggibili.

Email:
Oggetto: {subject}
Da: {from}
A: {to}

Testo:
{body}`,
        variables: { subject: 'string', from: 'string', to: 'string', body: 'string' },
        metadata: { temperature: 0.2, maxTokens: 400 },
      },
      // Smart Reply - English
      {
        name: 'email.smart_reply',
        locale: 'en',
        body: `Generate 2-3 concise replies to the email. {toneInstructions}
Respond in JSON format {{"replies":["..."]}}.

Email:
Subject: {subject}
From: {from}
To: {to}

Body:
{body}`,
        variables: {
          toneInstructions: 'string',
          subject: 'string',
          from: 'string',
          to: 'string',
          body: 'string',
        },
        metadata: { temperature: 0.4, maxTokens: 500 },
      },
      // Smart Reply - Italian
      {
        name: 'email.smart_reply',
        locale: 'it',
        body: `Genera da 2 a 3 possibili risposte brevi all'email. {toneInstructions}
Rispondi in JSON nel formato {{"replies":["..."]}}.

Email:
Oggetto: {subject}
Da: {from}
A: {to}

Testo:
{body}`,
        variables: {
          toneInstructions: 'string',
          subject: 'string',
          from: 'string',
          to: 'string',
          body: 'string',
        },
        metadata: { temperature: 0.4, maxTokens: 500 },
      },
    ];
  }
}
