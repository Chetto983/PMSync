/**
 * Action Item Extraction Service
 *
 * AI Secretary feature to extract action items from emails.
 * Uses Mistral AI for intelligent extraction + regex patterns for detection.
 *
 * Features:
 * - Pattern-based detection for common action item formats
 * - Mistral AI for intelligent extraction with context understanding
 * - Owner detection (who should do it)
 * - Priority inference from urgency language
 * - Deadline extraction integration
 * - BullMQ queue for background processing
 * - Redis caching for fast retrieval
 *
 * Architecture:
 * - PostgreSQL (Prisma AiTask model) for persistent storage
 * - BullMQ for async extraction jobs
 * - Redis for pending action items cache
 *
 * Reference:
 * - docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md Phase 1
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { MistralService } from '../../services/mistral.service';
import { Queue, Worker, Job } from 'bullmq';
import { AiTask, AiTaskStatus, AiTaskSource } from '@prisma/client';
import { getConfiguration } from '../../../../config/configuration';

// =============================================================================
// PATTERN DETECTION
// =============================================================================

/**
 * Patterns that indicate action items in email text
 */
const ACTION_PATTERNS = [
  // Direct requests
  /^(can|could|would) you (please )?(.*)\?/im,
  /^please (.*)/im,
  /^kindly (.*)/im,
  // Commitments
  /^(i('ll| will)|we('ll| will)) (.*)/im,
  /^(i|we) (need|have) to (.*)/im,
  // Task markers
  /(action item|todo|task|to-do):?\s*(.*)/i,
  /(action required|action needed):?\s*(.*)/i,
  // Reminders
  /(don't forget|remember) to (.*)/i,
  // Requests with deadlines
  /please (send|provide|complete|submit|review|update|confirm) .* by/i,
  // Assignments
  /(you|we) (should|must|need to) (.*)/i,
  /make sure (to|you) (.*)/i,
  // Follow-up tasks
  /follow up (on|with|about) (.*)/i,
  /get back to .* (on|about|regarding) (.*)/i,
  // Approvals/Reviews
  /(please |kindly )?(review|approve|sign|confirm) (.*)/i,
  // Scheduling
  /(schedule|set up|arrange) (a |an )?(meeting|call|appointment)/i,
];

/**
 * Patterns that indicate low priority / informational content
 */
const INFORMATIONAL_PATTERNS = [
  /fyi|for your information/i,
  /no action (required|needed)/i,
  /just (wanted to )?let you know/i,
  /for reference/i,
  /as discussed/i,
];

/**
 * Patterns that indicate high priority / urgency
 */
const URGENCY_PATTERNS = [
  /urgent|asap|immediately|right away/i,
  /critical|crucial|essential/i,
  /deadline|due (today|tomorrow|soon)/i,
  /high priority|top priority/i,
  /time[- ]?sensitive/i,
];

/**
 * Patterns to identify owner of action item
 */
const OWNER_PATTERNS = {
  recipient: [
    /^(can|could|would) you/i,
    /^please (you |)/i,
    /you (should|must|need to)/i,
    /\bwill you\b/i,
  ],
  sender: [
    /^(i('ll| will)|we('ll| will))/i,
    /^i (will|shall|am going to)/i,
    /let me/i,
    /i('ll| will) (send|provide|do|complete)/i,
  ],
};

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Result from pattern-based detection
 */
export interface DetectedActionItem {
  text: string;
  pattern: string;
  isUrgent: boolean;
  owner: 'sender' | 'recipient' | 'unknown';
  confidence: number;
}

/**
 * AI-extracted action item with full context
 */
export interface ExtractedActionItem {
  description: string;
  owner: string; // "sender", "recipient", or specific name
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  context?: string;
}

/**
 * Input for creating an action item
 */
export interface CreateActionItemInput {
  tenantId: string;
  userId: string;
  title: string;
  description?: string;
  sourceType: AiTaskSource;
  sourceId?: string;
  priority?: number; // 1-10 (1 = highest)
  dueDate?: Date;
  aiExtracted?: boolean;
  confidence?: number;
}

/**
 * Options for listing action items
 */
export interface ListActionItemsOptions {
  status?: AiTaskStatus | AiTaskStatus[];
  sourceType?: AiTaskSource;
  limit?: number;
  offset?: number;
  orderBy?: 'dueDate' | 'createdAt' | 'priority';
  orderDir?: 'asc' | 'desc';
}

/**
 * Action item statistics
 */
export interface ActionItemStats {
  total: number;
  todo: number;
  inProgress: number;
  waiting: number;
  done: number;
  cancelled: number;
  dueToday: number;
  overdue: number;
  highPriority: number;
}

/**
 * BullMQ job data
 */
export interface ActionItemJobData {
  type: 'extract' | 'batch-extract' | 'check-overdue';
  tenantId: string;
  userId?: string;
  emailId?: string;
  emailIds?: string[];
}

/**
 * BullMQ job result
 */
export interface ActionItemJobResult {
  processed: number;
  extracted: number;
  errors: number;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class ActionItemService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActionItemService.name);
  private queue!: Queue<ActionItemJobData>;
  private worker!: Worker<ActionItemJobData, ActionItemJobResult>;

  // Configuration
  private readonly ENABLED: boolean;
  private readonly BATCH_SIZE: number;
  private readonly MIN_CONFIDENCE: number;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'action-items:pending';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly mistralService: MistralService,
  ) {
    this.ENABLED =
      (this.configService.get<string>('ACTION_ITEM_EXTRACTION_ENABLED') || 'true').toLowerCase() !== 'false';
    this.BATCH_SIZE = parseInt(
      this.configService.get<string>('ACTION_ITEM_BATCH_SIZE', '50'),
      10,
    );
    this.MIN_CONFIDENCE = parseFloat(
      this.configService.get<string>('ACTION_ITEM_MIN_CONFIDENCE', '0.5'),
    );
  }

  async onModuleInit() {
    if (!this.ENABLED) {
      this.logger.warn('ActionItemService disabled via ACTION_ITEM_EXTRACTION_ENABLED=false');
      return;
    }

    const redisConfig = getConfiguration().redis;
    const connection = {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
    };

    // Create BullMQ queue
    this.queue = new Queue<ActionItemJobData>('ai-action-items', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100, age: 3600 },
        removeOnFail: { count: 500 },
      },
    });

    // Create worker
    this.worker = new Worker<ActionItemJobData, ActionItemJobResult>(
      'ai-action-items',
      async (job) => this.processJob(job),
      {
        connection,
        concurrency: 3, // Lower concurrency due to AI API calls
        limiter: {
          max: 30, // Max 30 jobs per minute (AI rate limits)
          duration: 60000,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Action item job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Action item job ${job?.id} failed: ${err.message}`);
    });

    // Schedule recurring job to check for overdue action items every hour
    await this.queue.add(
      'check-overdue',
      { type: 'check-overdue', tenantId: '*' },
      {
        repeat: { pattern: '0 * * * *' }, // Every hour
        jobId: 'action-item-overdue-check',
      },
    );

    this.logger.log('✅ ActionItemService initialized with BullMQ');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.ENABLED;
  }

  // ==========================================================================
  // PATTERN DETECTION (Fast, no AI)
  // ==========================================================================

  /**
   * Detect action items using regex patterns (fast, no AI call)
   */
  detectActionPatterns(text: string): DetectedActionItem[] {
    if (!text || text.length < 10) return [];

    const detected: DetectedActionItem[] = [];
    const lines = text.split(/[\n.!]+/).map((l) => l.trim()).filter((l) => l.length > 5);

    for (const line of lines) {
      // Skip informational content
      if (INFORMATIONAL_PATTERNS.some((p) => p.test(line))) {
        continue;
      }

      // Check action patterns
      for (const pattern of ACTION_PATTERNS) {
        if (pattern.test(line)) {
          const isUrgent = URGENCY_PATTERNS.some((p) => p.test(line));
          const owner = this.detectOwner(line);
          const confidence = this.calculatePatternConfidence(line, isUrgent);

          detected.push({
            text: line.slice(0, 200), // Limit length
            pattern: pattern.source.slice(0, 50),
            isUrgent,
            owner,
            confidence,
          });
          break; // One match per line
        }
      }
    }

    return detected;
  }

  /**
   * Detect owner of action item from text
   */
  private detectOwner(text: string): 'sender' | 'recipient' | 'unknown' {
    for (const pattern of OWNER_PATTERNS.recipient) {
      if (pattern.test(text)) return 'recipient';
    }
    for (const pattern of OWNER_PATTERNS.sender) {
      if (pattern.test(text)) return 'sender';
    }
    return 'unknown';
  }

  /**
   * Calculate confidence score for pattern-detected action item
   */
  private calculatePatternConfidence(text: string, isUrgent: boolean): number {
    let confidence = 0.4; // Base confidence for pattern match

    // Boost for urgency
    if (isUrgent) confidence += 0.15;

    // Boost for explicit task markers
    if (/action item|todo|task/i.test(text)) confidence += 0.2;

    // Boost for deadline mention
    if (/by (friday|monday|tomorrow|end of)/i.test(text)) confidence += 0.15;

    // Penalty for very short text
    if (text.length < 20) confidence -= 0.1;

    // Penalty for very long text (might be paragraph, not task)
    if (text.length > 150) confidence -= 0.1;

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Check if email text likely contains action items (quick check)
   */
  needsExtraction(text: string): boolean {
    if (!text || text.length < 20) return false;

    // Quick check: does it match any action pattern?
    return ACTION_PATTERNS.some((p) => p.test(text));
  }

  // ==========================================================================
  // AI EXTRACTION (Intelligent, uses Mistral)
  // ==========================================================================

  /**
   * Extract action items using Mistral AI for intelligent understanding
   */
  async extractWithAI(
    tenantId: string,
    userId: string,
    emailSubject: string,
    emailBody: string,
    senderEmail?: string,
  ): Promise<ExtractedActionItem[]> {
    // First check if there are likely action items
    const fullText = `${emailSubject}\n\n${emailBody}`;
    if (!this.needsExtraction(fullText)) {
      return [];
    }

    const prompt = `Extract action items from this email. For each action item, identify:
- description: What needs to be done (concise, actionable)
- owner: Who should do it ("sender", "recipient", or specific name if mentioned)
- deadline: When it's due (if mentioned, use ISO format or relative like "tomorrow")
- priority: "high", "medium", or "low" based on urgency language

Only include clear, actionable items. Skip FYI information.

Email Subject: ${emailSubject}
${senderEmail ? `From: ${senderEmail}` : ''}

Email Body:
${emailBody.slice(0, 3000)}

Return as JSON array only, no explanation:
[{ "description": "...", "owner": "...", "deadline": "...", "priority": "..." }]

If no action items found, return: []`;

    try {
      const response = await this.mistralService.completePrompt({
        systemPrompt: 'You are an AI assistant that extracts action items from emails. Return valid JSON only.',
        userPrompt: prompt,
        temperature: 0.1, // Low temperature for consistent extraction
        maxTokens: 1000,
        timeoutMs: 20000,
        telemetryContext: { tenantId, userId, promptName: 'action-item-extraction' },
        modelTier: 'fast', // Use small model for cost efficiency
      });

      // Parse JSON response
      const parsed = this.parseAIResponse(response);
      return parsed.map((item) => ({
        ...item,
        confidence: 0.8, // AI extraction has good confidence
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI extraction failed: ${msg}`);

      // Fallback to pattern detection
      const patterns = this.detectActionPatterns(fullText);
      return patterns.map((p) => ({
        description: p.text,
        owner: p.owner,
        priority: p.isUrgent ? 'high' as const : 'medium' as const,
        confidence: p.confidence,
      }));
    }
  }

  /**
   * Parse AI response JSON safely
   */
  private parseAIResponse(response: string): Array<{
    description: string;
    owner: string;
    deadline?: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    try {
      // Clean response (remove markdown code blocks if present)
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item) =>
        item &&
        typeof item.description === 'string' &&
        item.description.length > 0
      );
    } catch {
      this.logger.debug('Failed to parse AI response as JSON');
      return [];
    }
  }

  // ==========================================================================
  // DATABASE OPERATIONS
  // ==========================================================================

  /**
   * Extract action items from email and store in database
   */
  async extractFromEmail(
    tenantId: string,
    userId: string,
    emailId: string,
    subject: string,
    body: string,
    senderEmail?: string,
  ): Promise<string[]> {
    const extracted = await this.extractWithAI(tenantId, userId, subject, body, senderEmail);
    const createdIds: string[] = [];

    for (const item of extracted) {
      if (item.confidence < this.MIN_CONFIDENCE) continue;

      try {
        const priority = this.priorityToNumber(item.priority);
        const dueDate = item.deadline ? this.parseDeadline(item.deadline) : undefined;

        const created = await this.prisma.aiTask.create({
          data: {
            tenantId,
            userId,
            title: item.description.slice(0, 200),
            description: item.context || item.description,
            sourceType: 'EMAIL',
            sourceId: emailId,
            status: 'TODO',
            priority,
            dueDate,
            confidence: item.confidence,
            aiExtracted: true,
          },
        });

        createdIds.push(created.id);
        this.logger.debug(`Extracted action item: "${created.title}" from email ${emailId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to create action item: ${msg}`);
      }
    }

    // Invalidate cache
    if (createdIds.length > 0) {
      await this.invalidateCache(tenantId, userId);
    }

    return createdIds;
  }

  /**
   * Convert priority string to number (1-10)
   */
  private priorityToNumber(priority: string): number {
    switch (priority) {
      case 'high': return 2;
      case 'medium': return 5;
      case 'low': return 8;
      default: return 5;
    }
  }

  /**
   * Parse deadline string to Date
   */
  private parseDeadline(deadline: string): Date | undefined {
    try {
      // Try ISO format first
      const date = new Date(deadline);
      if (!isNaN(date.getTime())) return date;

      // Try relative formats
      const lower = deadline.toLowerCase();
      const now = new Date();

      if (lower.includes('today')) {
        now.setHours(23, 59, 59, 999);
        return now;
      }
      if (lower.includes('tomorrow')) {
        now.setDate(now.getDate() + 1);
        now.setHours(23, 59, 59, 999);
        return now;
      }
      if (lower.includes('this week') || lower.includes('end of week')) {
        const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
        now.setDate(now.getDate() + daysUntilFriday);
        now.setHours(17, 0, 0, 0);
        return now;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Create action item manually
   */
  async create(input: CreateActionItemInput): Promise<AiTask> {
    const task = await this.prisma.aiTask.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        title: input.title,
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: 'TODO',
        priority: input.priority ?? 5,
        dueDate: input.dueDate,
        confidence: input.confidence,
        aiExtracted: input.aiExtracted ?? false,
      },
    });

    await this.invalidateCache(input.tenantId, input.userId);
    return task;
  }

  /**
   * Get action item by ID
   */
  async getById(tenantId: string, userId: string, id: string): Promise<AiTask | null> {
    return this.prisma.aiTask.findFirst({
      where: { id, tenantId, userId },
    });
  }

  /**
   * List action items with filters
   */
  async list(
    tenantId: string,
    userId: string,
    options: ListActionItemsOptions = {},
  ): Promise<AiTask[]> {
    const { status, sourceType, limit = 50, offset = 0, orderBy = 'createdAt', orderDir = 'desc' } = options;

    const where: Record<string, unknown> = { tenantId, userId };

    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    if (sourceType) {
      where.sourceType = sourceType;
    }

    return this.prisma.aiTask.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get pending action items (cached)
   */
  async getPending(tenantId: string, userId: string): Promise<AiTask[]> {
    const cacheKey = `${this.CACHE_PREFIX}:${tenantId}:${userId}`;

    // Try cache first
    const cached = await this.cacheService.get<AiTask[]>(cacheKey);
    if (cached) return cached;

    // Fetch from database
    const items = await this.prisma.aiTask.findMany({
      where: {
        tenantId,
        userId,
        status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      take: 100,
    });

    // Cache result
    await this.cacheService.set(cacheKey, items, { ttl: this.CACHE_TTL });
    return items;
  }

  /**
   * Get overdue action items
   */
  async getOverdue(tenantId: string, userId: string): Promise<AiTask[]> {
    return this.prisma.aiTask.findMany({
      where: {
        tenantId,
        userId,
        status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Update action item status
   */
  async updateStatus(
    tenantId: string,
    userId: string,
    id: string,
    status: AiTaskStatus,
  ): Promise<AiTask> {
    const data: Record<string, unknown> = { status };
    if (status === 'DONE') {
      data.completedAt = new Date();
    }

    const task = await this.prisma.aiTask.update({
      where: { id, tenantId, userId },
      data,
    });

    await this.invalidateCache(tenantId, userId);
    return task;
  }

  /**
   * Update action item priority
   */
  async updatePriority(
    tenantId: string,
    userId: string,
    id: string,
    priority: number,
  ): Promise<AiTask> {
    const task = await this.prisma.aiTask.update({
      where: { id, tenantId, userId },
      data: { priority: Math.min(10, Math.max(1, priority)) },
    });

    await this.invalidateCache(tenantId, userId);
    return task;
  }

  /**
   * Update action item due date
   */
  async updateDueDate(
    tenantId: string,
    userId: string,
    id: string,
    dueDate: Date | null,
  ): Promise<AiTask> {
    const task = await this.prisma.aiTask.update({
      where: { id, tenantId, userId },
      data: { dueDate },
    });

    await this.invalidateCache(tenantId, userId);
    return task;
  }

  /**
   * Delete action item
   */
  async delete(tenantId: string, userId: string, id: string): Promise<void> {
    await this.prisma.aiTask.delete({
      where: { id, tenantId, userId },
    });

    await this.invalidateCache(tenantId, userId);
  }

  /**
   * Get action item statistics
   */
  async getStats(tenantId: string, userId: string): Promise<ActionItemStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [total, todo, inProgress, waiting, done, cancelled, dueToday, overdue, highPriority] = await Promise.all([
      this.prisma.aiTask.count({ where: { tenantId, userId } }),
      this.prisma.aiTask.count({ where: { tenantId, userId, status: 'TODO' } }),
      this.prisma.aiTask.count({ where: { tenantId, userId, status: 'IN_PROGRESS' } }),
      this.prisma.aiTask.count({ where: { tenantId, userId, status: 'WAITING' } }),
      this.prisma.aiTask.count({ where: { tenantId, userId, status: 'DONE' } }),
      this.prisma.aiTask.count({ where: { tenantId, userId, status: 'CANCELLED' } }),
      this.prisma.aiTask.count({
        where: {
          tenantId,
          userId,
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
          dueDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.aiTask.count({
        where: {
          tenantId,
          userId,
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
          dueDate: { lt: todayStart },
        },
      }),
      this.prisma.aiTask.count({
        where: {
          tenantId,
          userId,
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
          priority: { lte: 3 },
        },
      }),
    ]);

    return { total, todo, inProgress, waiting, done, cancelled, dueToday, overdue, highPriority };
  }

  /**
   * Invalidate cache for user
   */
  private async invalidateCache(tenantId: string, userId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}:${tenantId}:${userId}`;
    await this.cacheService.del(cacheKey);
  }

  // ==========================================================================
  // BULLMQ JOB PROCESSING
  // ==========================================================================

  /**
   * Process BullMQ job
   */
  private async processJob(job: Job<ActionItemJobData>): Promise<ActionItemJobResult> {
    const { type, tenantId, userId, emailId, emailIds } = job.data;

    switch (type) {
      case 'extract':
        return this.processExtractJob(tenantId, userId!, emailId!);

      case 'batch-extract':
        return this.processBatchExtractJob(tenantId, userId!, emailIds!);

      case 'check-overdue':
        return this.processOverdueCheck(tenantId);

      default:
        this.logger.warn(`Unknown job type: ${type}`);
        return { processed: 0, extracted: 0, errors: 1 };
    }
  }

  /**
   * Process single email extraction job
   */
  private async processExtractJob(
    tenantId: string,
    userId: string,
    emailId: string,
  ): Promise<ActionItemJobResult> {
    try {
      const email = await this.prisma.email.findFirst({
        where: { id: emailId, tenantId },
        select: { subject: true, bodyText: true, from: true },
      });

      if (!email) {
        return { processed: 1, extracted: 0, errors: 0 };
      }

      const createdIds = await this.extractFromEmail(
        tenantId,
        userId,
        emailId,
        email.subject ?? '',
        email.bodyText ?? '',
        email.from ?? undefined,
      );

      return { processed: 1, extracted: createdIds.length, errors: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to extract from email ${emailId}: ${msg}`);
      return { processed: 1, extracted: 0, errors: 1 };
    }
  }

  /**
   * Process batch email extraction job
   */
  private async processBatchExtractJob(
    tenantId: string,
    userId: string,
    emailIds: string[],
  ): Promise<ActionItemJobResult> {
    let processed = 0;
    let extracted = 0;
    let errors = 0;

    for (const emailId of emailIds) {
      const result = await this.processExtractJob(tenantId, userId, emailId);
      processed += result.processed;
      extracted += result.extracted;
      errors += result.errors;

      // Small delay between AI calls to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { processed, extracted, errors };
  }

  /**
   * Process overdue check job
   */
  private async processOverdueCheck(tenantId: string): Promise<ActionItemJobResult> {
    try {
      // This could emit notifications for overdue items
      // For now, just log the count
      const where: Record<string, unknown> = {
        status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
        dueDate: { lt: new Date() },
      };

      if (tenantId !== '*') {
        where.tenantId = tenantId;
      }

      const overdueCount = await this.prisma.aiTask.count({ where });
      this.logger.log(`Found ${overdueCount} overdue action items`);

      return { processed: 1, extracted: 0, errors: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to check overdue items: ${msg}`);
      return { processed: 0, extracted: 0, errors: 1 };
    }
  }

  // ==========================================================================
  // QUEUE MANAGEMENT
  // ==========================================================================

  /**
   * Queue action item extraction for an email
   */
  async queueExtraction(
    tenantId: string,
    userId: string,
    emailId: string,
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('ActionItemService not initialized');
    }

    const job = await this.queue.add(
      'extract',
      { type: 'extract', tenantId, userId, emailId },
      { priority: 2 },
    );

    return job.id ?? 'unknown';
  }

  /**
   * Queue batch action item extraction
   */
  async queueBatchExtraction(
    tenantId: string,
    userId: string,
    emailIds: string[],
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('ActionItemService not initialized');
    }

    const job = await this.queue.add(
      'batch-extract',
      { type: 'batch-extract', tenantId, userId, emailIds },
      { priority: 3 },
    );

    return job.id ?? 'unknown';
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    if (!this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
