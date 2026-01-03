/**
 * Analytics Service
 *
 * Provides AI-powered analytics and visualization for the AI Secretary.
 * Uses Mistral's Agents API with code_interpreter tool for data analysis.
 *
 * Features:
 * - Email analytics (volume trends, response times, sender analysis)
 * - Memory system analytics (usage, performance)
 * - Cache performance analytics
 * - AI-generated insights via code_interpreter
 *
 * Architecture (following WebSearch pattern):
 * - Uses pooled Mistral Agents with code_interpreter tool
 * - Redis + memory fallback caching (1 hour agents, 30 min results)
 * - BullMQ for background analytics jobs
 *
 * @see https://docs.mistral.ai/agents/tools/built-in/code_interpreter
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { EXCLUDE_JUNK_FOLDERS, excludeJunkFolders } from '../../../email/email.helpers';

// =============================================================================
// Types
// =============================================================================

export interface ChartDataPoint {
  label: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
  category?: string;
}

export interface AnalyticsResult {
  type: 'chart' | 'insight' | 'statistics';
  title: string;
  description?: string;
  data: ChartDataPoint[] | TimeSeriesDataPoint[] | Record<string, unknown>;
  chartType?: 'line' | 'bar' | 'pie' | 'doughnut' | 'area';
  insights?: string[];
  codeExecuted?: string;
  visualization?: string;
  generatedAt: string;
  fromCache?: boolean;
}

export interface EmailAnalytics {
  volumeTrends: AnalyticsResult;
  topSenders: AnalyticsResult;
  hourlyDistribution: AnalyticsResult;
  insights: string[];
  generatedAt: string;
}

export interface DashboardAnalytics {
  email: EmailAnalytics;
  summary: {
    totalEmails: number;
    unreadEmails: number;
    sentToday: number;
    receivedToday: number;
  };
  aiInsights: string[];
  generatedAt: string;
}

// =============================================================================
// Constants
// =============================================================================

/** TTL for analytics results: 30 minutes */
const ANALYTICS_CACHE_TTL_SEC = 30 * 60;
/** TTL for Mistral agents: 1 hour */
const AGENT_TTL_SEC = 60 * 60;

// =============================================================================
// Service Implementation
// =============================================================================

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_PREFIX = 'analytics';

  // In-memory fallback caches (when Redis unavailable)
  private readonly fallbackAgentPool = new Map<string, { agentId: string; createdAt: number }>();
  private readonly fallbackResultCache = new Map<string, { result: AnalyticsResult; timestamp: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) { }

  // ===========================================================================
  // Mistral Client & Agent Management
  // ===========================================================================

  /**
   * Create Mistral client
   */
  private createMistralClient(): Mistral {
    const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }
    return new Mistral({ apiKey });
  }

  /**
   * Get or create a reusable Mistral analytics agent.
   * Agents are cached for 1 hour (Redis + memory fallback).
   */
  private async getOrCreateAgent(locale: string = 'en'): Promise<string> {
    const cacheKey = `${this.CACHE_PREFIX}:agent:${locale}`;
    const now = Date.now();

    // Try Redis first
    if (this.cacheService.isHealthy()) {
      const cached = await this.cacheService.get<{ agentId: string }>(cacheKey, {
        namespace: CacheNamespace.AI_ANALYTICS,
      });
      if (cached) {
        this.logger.debug(`Redis cache hit for analytics agent: ${locale}`);
        return cached.agentId;
      }
    }

    // Try memory fallback
    const memCached = this.fallbackAgentPool.get(locale);
    if (memCached && now - memCached.createdAt < AGENT_TTL_SEC * 1000) {
      this.logger.debug(`Memory cache hit for analytics agent: ${locale}`);
      return memCached.agentId;
    }

    // Create new agent
    this.logger.log(`Creating new analytics agent for locale: ${locale}`);
    const startTime = Date.now();
    const client = this.createMistralClient();

    const model = this.configService.get<string>('AI_MODEL_MEDIUM') || 'mistral-small-latest';

    const agent = await client.beta.agents.create({
      model,
      name: `MailAgent Analytics (${locale})`,
      description: 'Agent for data analysis and visualization generation',
      instructions: `You are a data analytics assistant for an email management application. When asked to analyze data:
1. Use the code_interpreter tool to write and execute Python code
2. Use pandas for data manipulation
3. Use matplotlib or seaborn for visualizations when helpful
4. Generate clear, actionable insights
5. Respond in ${locale === 'it' ? 'Italian' : 'English'}

Available data types:
- Email statistics (volume, senders, response times)
- Time-based trends (hourly, daily, weekly patterns)
- Category distributions

Always provide both numerical analysis and natural language insights.`,
      tools: [{ type: 'code_interpreter' }],
      completionArgs: {
        temperature: 0.2,
        topP: 0.95,
      },
    });

    const createTime = Date.now() - startTime;
    this.logger.log(`Analytics agent created in ${createTime}ms for locale: ${locale}`);

    // Cache in Redis
    if (this.cacheService.isHealthy()) {
      await this.cacheService.set(cacheKey, { agentId: agent.id }, {
        ttl: AGENT_TTL_SEC,
        namespace: CacheNamespace.AI_ANALYTICS,
      });
    }

    // Cache in memory fallback
    this.fallbackAgentPool.set(locale, {
      agentId: agent.id,
      createdAt: now,
    });

    return agent.id;
  }

  /**
   * Clear agent from cache
   */
  private async clearAgentCache(locale: string = 'en'): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}:agent:${locale}`;
    this.fallbackAgentPool.delete(locale);
    if (this.cacheService.isHealthy()) {
      await this.cacheService.del(cacheKey, { namespace: CacheNamespace.AI_ANALYTICS });
    }
  }

  // ===========================================================================
  // AI-Powered Analytics (Code Interpreter)
  // ===========================================================================

  /**
   * Run AI-powered analytics using Mistral code_interpreter.
   * This executes Python code to analyze data and generate visualizations.
   */
  async runAiAnalytics(
    tenantId: string,
    userId: string,
    query: string,
    data: Record<string, unknown>,
    locale: string = 'en',
  ): Promise<AnalyticsResult> {
    const dataHash = this.hashData(data);
    const cacheKey = `${this.CACHE_PREFIX}:result:${tenantId}:${userId}:${query.slice(0, 50)}:${dataHash}`;

    // Check cache first
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    try {
      const client = this.createMistralClient();
      const agentId = await this.getOrCreateAgent(locale);

      // Build prompt with data context
      const dataContext = JSON.stringify(data, null, 2);
      const prompt = `Analyze the following data and ${query}

Data:
\`\`\`json
${dataContext}
\`\`\`

Please:
1. Analyze the data thoroughly
2. Create appropriate visualizations if helpful
3. Provide key insights (3-5 bullet points)`;

      // Start conversation with the reusable agent
      const response = await client.beta.conversations.start({
        agentId,
        inputs: prompt,
      });

      // Parse response
      const result = this.parseAnalyticsResponse(response);

      // Cache result
      await this.setCachedResult(cacheKey, result);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`AI analytics failed: ${errorMsg}`);

      // If agent expired, clear cache
      if (errorMsg.includes('agent') && errorMsg.includes('not found')) {
        await this.clearAgentCache(locale);
      }

      throw error;
    }
  }

  /**
   * Parse Mistral conversation response
   */
  private parseAnalyticsResponse(response: unknown): AnalyticsResult {
    const insights: string[] = [];
    let answer = '';
    let codeExecuted: string | undefined;
    let visualization: string | undefined;

    if (!response || typeof response !== 'object') {
      return {
        type: 'insight',
        title: 'Analysis Result',
        data: {},
        insights: ['No response received'],
        generatedAt: new Date().toISOString(),
      };
    }

    const resp = response as Record<string, unknown>;

    if ('outputs' in resp && Array.isArray(resp.outputs)) {
      for (const output of resp.outputs) {
        if (output && typeof output === 'object') {
          const entry = output as Record<string, unknown>;

          if (entry.type === 'message.output' && 'content' in entry) {
            const content = entry.content;
            if (Array.isArray(content)) {
              for (const chunk of content) {
                if (chunk && typeof chunk === 'object') {
                  const c = chunk as Record<string, unknown>;
                  if (c.type === 'text' && typeof c.text === 'string') {
                    answer += c.text;
                  } else if (c.type === 'image' && typeof c.data === 'string') {
                    visualization = c.data;
                  }
                }
              }
            } else if (typeof content === 'string') {
              answer = content;
            }
          }

          if (entry.type === 'tool.execution') {
            if (typeof entry.code === 'string') {
              codeExecuted = entry.code;
            }
          }
        }
      }
    }

    // Extract insights from answer
    if (answer) {
      const lines = answer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^[\d\-\*•]/.test(trimmed) && trimmed.length > 10) {
          insights.push(trimmed.replace(/^[\d\.\-\*•\s]+/, ''));
        }
      }
    }

    return {
      type: visualization ? 'chart' : 'insight',
      title: 'Analysis Result',
      description: answer || 'Analysis complete',
      data: {},
      codeExecuted,
      visualization,
      insights: insights.length > 0 ? insights : ['Analysis completed successfully'],
      generatedAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // Pre-computed Analytics (Fast, No AI)
  // ===========================================================================

  /**
   * Get email analytics for dashboard (fast, no AI).
   */
  async getEmailAnalytics(
    tenantId: string,
    userId: string,
    period: 'day' | 'week' | 'month' = 'week',
  ): Promise<EmailAnalytics> {
    const cacheKey = `${this.CACHE_PREFIX}:email:${tenantId}:${userId}:${period}`;

    // Try cache first
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return cached as unknown as EmailAnalytics;
    }

    const now = new Date();
    const startDate = this.getStartDate(now, period);

    // Fetch email data (emails are tenant-scoped, not user-scoped)
    // Exclude SPAM and TRASH folders - they're junk and shouldn't affect analytics
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        receivedAt: { gte: startDate },
        folder: EXCLUDE_JUNK_FOLDERS,
      },
      select: {
        id: true,
        from: true,
        folder: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: 'asc' },
    });

    // Calculate analytics
    const volumeTrends = this.calculateVolumeTrends(emails, period);
    const topSenders = this.calculateTopSenders(emails);
    const hourlyDistribution = this.calculateHourlyDistribution(emails);

    // Generate basic insights
    const insights = this.generateBasicInsights(emails, period);

    const result: EmailAnalytics = {
      volumeTrends,
      topSenders,
      hourlyDistribution,
      insights,
      generatedAt: new Date().toISOString(),
    };

    // Cache the result
    await this.setCachedResult(cacheKey, result as unknown as AnalyticsResult);

    return result;
  }

  /**
   * Get dashboard analytics summary.
   */
  async getDashboardAnalytics(
    tenantId: string,
    userId: string,
  ): Promise<DashboardAnalytics> {
    const cacheKey = `${this.CACHE_PREFIX}:dashboard:${tenantId}:${userId}`;

    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return cached as unknown as DashboardAnalytics;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch summary stats (emails are tenant-scoped, not user-scoped)
    // Exclude SPAM and TRASH from all counts - they're junk
    const [totalEmails, unreadEmails, sentToday, receivedToday] = await Promise.all([
      this.prisma.email.count({ where: { tenantId, folder: EXCLUDE_JUNK_FOLDERS } }),
      this.prisma.email.count({ where: { tenantId, isRead: false, folder: EXCLUDE_JUNK_FOLDERS } }),
      this.prisma.email.count({
        where: { tenantId, folder: 'SENT', receivedAt: { gte: todayStart } },
      }),
      this.prisma.email.count({
        where: { tenantId, folder: excludeJunkFolders('SENT'), receivedAt: { gte: todayStart } },
      }),
    ]);

    // Get email analytics
    const emailAnalytics = await this.getEmailAnalytics(tenantId, userId, 'week');

    const result: DashboardAnalytics = {
      email: emailAnalytics,
      summary: {
        totalEmails,
        unreadEmails,
        sentToday,
        receivedToday,
      },
      aiInsights: emailAnalytics.insights,
      generatedAt: new Date().toISOString(),
    };

    await this.setCachedResult(cacheKey, result as unknown as AnalyticsResult);

    return result;
  }

  // ===========================================================================
  // Analytics Calculations
  // ===========================================================================

  private calculateVolumeTrends(
    emails: Array<{ receivedAt: Date | null; folder: string }>,
    period: 'day' | 'week' | 'month',
  ): AnalyticsResult {
    const buckets = new Map<string, { sent: number; received: number }>();
    const bucketFormat = period === 'day' ? 'hour' : period === 'week' ? 'day' : 'week';

    for (const email of emails) {
      if (!email.receivedAt) continue;

      const bucketKey = this.getBucketKey(email.receivedAt, bucketFormat);
      const bucket = buckets.get(bucketKey) || { sent: 0, received: 0 };

      if (email.folder === 'SENT') {
        bucket.sent++;
      } else {
        bucket.received++;
      }

      buckets.set(bucketKey, bucket);
    }

    const data: TimeSeriesDataPoint[] = [];
    for (const [timestamp, counts] of buckets.entries()) {
      data.push({ timestamp, value: counts.received, category: 'received' });
      data.push({ timestamp, value: counts.sent, category: 'sent' });
    }

    return {
      type: 'chart',
      title: 'Email Volume Trends',
      description: `Email volume over the past ${period}`,
      data: data.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      chartType: 'area',
      generatedAt: new Date().toISOString(),
    };
  }

  private calculateTopSenders(
    emails: Array<{ from: string | null; folder: string }>,
  ): AnalyticsResult {
    const senderCounts = new Map<string, number>();

    for (const email of emails) {
      if (email.folder === 'SENT' || !email.from) continue;

      const sender = email.from;
      senderCounts.set(sender, (senderCounts.get(sender) || 0) + 1);
    }

    const sorted = Array.from(senderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const data: ChartDataPoint[] = sorted.map(([sender, count]) => ({
      label: this.truncateEmail(sender),
      value: count,
      metadata: { fullEmail: sender },
    }));

    return {
      type: 'chart',
      title: 'Top Senders',
      description: 'Most frequent email senders',
      data,
      chartType: 'bar',
      generatedAt: new Date().toISOString(),
    };
  }

  private calculateHourlyDistribution(
    emails: Array<{ receivedAt: Date | null }>,
  ): AnalyticsResult {
    const hourCounts = new Array(24).fill(0);

    for (const email of emails) {
      if (!email.receivedAt) continue;
      const hour = email.receivedAt.getHours();
      hourCounts[hour]++;
    }

    const data: ChartDataPoint[] = hourCounts.map((count, hour) => ({
      label: `${hour.toString().padStart(2, '0')}:00`,
      value: count,
    }));

    return {
      type: 'chart',
      title: 'Email Activity by Hour',
      description: 'Email volume distribution throughout the day',
      data,
      chartType: 'line',
      generatedAt: new Date().toISOString(),
    };
  }

  private generateBasicInsights(
    emails: Array<{ folder: string; receivedAt: Date | null }>,
    period: string,
  ): string[] {
    const insights: string[] = [];
    const sent = emails.filter(e => e.folder === 'SENT').length;
    const received = emails.filter(e => e.folder !== 'SENT').length;

    if (emails.length === 0) {
      insights.push(`No emails in the past ${period}.`);
      return insights;
    }

    insights.push(`${emails.length} total emails in the past ${period} (${received} received, ${sent} sent).`);

    const ratio = sent / (received || 1);
    if (ratio < 0.3) {
      insights.push('You receive significantly more emails than you send. Consider batching responses.');
    } else if (ratio > 1.5) {
      insights.push('You send more emails than you receive. Great proactive communication!');
    }

    // Find peak hours
    const hourCounts = new Array(24).fill(0);
    for (const email of emails) {
      if (email.receivedAt) {
        hourCounts[email.receivedAt.getHours()]++;
      }
    }
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    insights.push(`Peak email activity at ${peakHour}:00.`);

    return insights;
  }

  // ===========================================================================
  // Caching Utilities
  // ===========================================================================

  private async getCachedResult(key: string): Promise<AnalyticsResult | null> {
    // Try Redis
    if (this.cacheService.isHealthy()) {
      const cached = await this.cacheService.get<AnalyticsResult>(key, {
        namespace: CacheNamespace.AI_ANALYTICS,
      });
      if (cached) {
        this.logger.debug(`Redis cache hit: ${key.slice(0, 50)}`);
        return cached;
      }
    }

    // Try memory
    const memCached = this.fallbackResultCache.get(key);
    if (memCached && Date.now() - memCached.timestamp < ANALYTICS_CACHE_TTL_SEC * 1000) {
      this.logger.debug(`Memory cache hit: ${key.slice(0, 50)}`);
      return memCached.result;
    }
    this.fallbackResultCache.delete(key);
    return null;
  }

  private async setCachedResult(key: string, result: AnalyticsResult): Promise<void> {
    // Store in Redis
    if (this.cacheService.isHealthy()) {
      await this.cacheService.set(key, result, {
        ttl: ANALYTICS_CACHE_TTL_SEC,
        namespace: CacheNamespace.AI_ANALYTICS,
      });
    }

    // Store in memory (LRU eviction)
    if (this.fallbackResultCache.size > 50) {
      const entries = Array.from(this.fallbackResultCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 10; i++) {
        this.fallbackResultCache.delete(entries[i][0]);
      }
    }
    this.fallbackResultCache.set(key, { result, timestamp: Date.now() });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  private getStartDate(now: Date, period: 'day' | 'week' | 'month'): Date {
    const start = new Date(now);
    switch (period) {
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
    }
    return start;
  }

  private getBucketKey(date: Date, format: 'hour' | 'day' | 'week'): string {
    switch (format) {
      case 'hour':
        return date.toISOString().slice(0, 13) + ':00';
      case 'day':
        return date.toISOString().split('T')[0];
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `Week of ${weekStart.toISOString().split('T')[0]}`;
    }
  }

  private truncateEmail(email: string): string {
    if (email.length <= 25) return email;
    const [local, domain] = email.split('@');
    if (!domain) return email.slice(0, 25) + '...';
    return `${local.slice(0, 10)}...@${domain.slice(0, 10)}`;
  }

  private hashData(data: Record<string, unknown>): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Invalidate analytics cache for a tenant/user.
   */
  async invalidateCache(tenantId: string, userId?: string): Promise<void> {
    // Clear from Redis (pattern-based deletion would need SCAN)
    // For simplicity, just clear the specific user's cache
    if (userId && this.cacheService.isHealthy()) {
      for (const period of ['day', 'week', 'month']) {
        await this.cacheService.del(`${this.CACHE_PREFIX}:email:${tenantId}:${userId}:${period}`, {
          namespace: CacheNamespace.AI_ANALYTICS,
        });
      }
      await this.cacheService.del(`${this.CACHE_PREFIX}:dashboard:${tenantId}:${userId}`, {
        namespace: CacheNamespace.AI_ANALYTICS,
      });
    }

    this.logger.debug(`Invalidated analytics cache for tenant ${tenantId}`);
  }

  /**
   * Check if analytics service is enabled.
   */
  isEnabled(): boolean {
    return !!this.configService.get('MISTRAL_API_KEY');
  }
}
