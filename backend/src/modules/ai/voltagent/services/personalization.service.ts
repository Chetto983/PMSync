/**
 * Personalization Service for VoltAgent
 *
 * Manages user personalization profiles and semantic memories.
 * 2025 Best Practices: Treats personalization as first-class context.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';

/**
 * Job role types for personalization
 */
export enum JobRole {
  EXECUTIVE = 'EXECUTIVE',
  MANAGER = 'MANAGER',
  IC = 'IC', // Individual Contributor
  FREELANCER = 'FREELANCER',
  STUDENT = 'STUDENT',
  OTHER = 'OTHER',
}

/**
 * Communication style preferences
 */
export enum CommunicationStyle {
  FORMAL = 'FORMAL',
  CASUAL = 'CASUAL',
  TECHNICAL = 'TECHNICAL',
  CREATIVE = 'CREATIVE',
}

/**
 * Response length preferences
 */
export enum ResponseLength {
  BRIEF = 'BRIEF',
  MODERATE = 'MODERATE',
  DETAILED = 'DETAILED',
}

/**
 * Proactivity level for AI suggestions
 */
export enum ProactivityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * Memory types for user profile embeddings
 */
export enum MemoryType {
  PREFERENCE = 'PREFERENCE',
  FACT = 'FACT',
  PATTERN = 'PATTERN',
  INTERACTION = 'INTERACTION',
  CONTACT_NOTE = 'CONTACT_NOTE',
}

/**
 * Job role templates with default behaviors
 */
export const JOB_ROLE_TEMPLATES: Record<JobRole, {
  defaultStyle: CommunicationStyle;
  defaultLength: ResponseLength;
  priorities: string[];
  promptModifiers: string;
}> = {
  [JobRole.EXECUTIVE]: {
    defaultStyle: CommunicationStyle.FORMAL,
    defaultLength: ResponseLength.BRIEF,
    priorities: ['urgent', 'strategic', 'high-value'],
    promptModifiers: 'Focus on strategic insights, executive summaries, and actionable decisions. Prioritize time-sensitive matters.',
  },
  [JobRole.MANAGER]: {
    defaultStyle: CommunicationStyle.FORMAL,
    defaultLength: ResponseLength.MODERATE,
    priorities: ['team', 'deadlines', 'resources'],
    promptModifiers: 'Focus on team coordination, project status, and resource management. Balance detail with efficiency.',
  },
  [JobRole.IC]: {
    defaultStyle: CommunicationStyle.CASUAL,
    defaultLength: ResponseLength.MODERATE,
    priorities: ['tasks', 'technical', 'collaboration'],
    promptModifiers: 'Focus on task details, technical accuracy, and peer collaboration. Provide actionable next steps.',
  },
  [JobRole.FREELANCER]: {
    defaultStyle: CommunicationStyle.CASUAL,
    defaultLength: ResponseLength.MODERATE,
    priorities: ['clients', 'invoices', 'deadlines'],
    promptModifiers: 'Focus on client communication, project deliverables, and business development. Track billable activities.',
  },
  [JobRole.STUDENT]: {
    defaultStyle: CommunicationStyle.CASUAL,
    defaultLength: ResponseLength.DETAILED,
    priorities: ['assignments', 'deadlines', 'learning'],
    promptModifiers: 'Focus on academic deadlines, learning materials, and educational opportunities. Provide explanations when helpful.',
  },
  [JobRole.OTHER]: {
    defaultStyle: CommunicationStyle.CASUAL,
    defaultLength: ResponseLength.MODERATE,
    priorities: ['general'],
    promptModifiers: 'Adapt to the user\'s communication patterns and preferences.',
  },
};

/**
 * User personalization profile
 */
export interface UserPersonalizationProfile {
  jobRole: JobRole;
  jobTitle?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  communicationStyle: CommunicationStyle;
  responseLength: ResponseLength;
  proactivityLevel: ProactivityLevel;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  timezone: string;
  language: string;
}

/**
 * Context for AI personalization
 */
export interface PersonalizationContext {
  profile: UserPersonalizationProfile;
  promptModifiers: string;
  recentMemories: Array<{
    content: string;
    type: MemoryType;
    relevance: number;
  }>;
}

@Injectable()
export class PersonalizationService {
  private readonly logger = new Logger(PersonalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
  ) {}

  /**
   * Get the complete personalization profile for a user
   */
  async getUserProfile(
    tenantId: string,
    userId: string,
  ): Promise<UserPersonalizationProfile | null> {
    const preferences = await this.prisma.userPreferences.findFirst({
      where: { userId, user: { tenantId } },
    });

    if (!preferences) {
      return null;
    }

    return {
      jobRole: (preferences.jobRole as JobRole) || JobRole.OTHER,
      jobTitle: preferences.jobTitle || undefined,
      department: preferences.department || undefined,
      industry: preferences.industry || undefined,
      companySize: preferences.companySize || undefined,
      communicationStyle: (preferences.communicationStyle as CommunicationStyle) || CommunicationStyle.CASUAL,
      responseLength: (preferences.responseLength as ResponseLength) || ResponseLength.MODERATE,
      proactivityLevel: (preferences.proactivityLevel as ProactivityLevel) || ProactivityLevel.MEDIUM,
      workingHoursStart: preferences.workingHoursStart || undefined,
      workingHoursEnd: preferences.workingHoursEnd || undefined,
      workingDays: preferences.workingDays || undefined,
      timezone: preferences.timezone || 'UTC',
      language: preferences.language || 'en',
    };
  }

  /**
   * Update user personalization profile
   */
  async updateUserProfile(
    tenantId: string,
    userId: string,
    updates: Partial<UserPersonalizationProfile>,
  ): Promise<UserPersonalizationProfile> {
    const data: Record<string, unknown> = {};

    if (updates.jobRole !== undefined) data.jobRole = updates.jobRole;
    if (updates.jobTitle !== undefined) data.jobTitle = updates.jobTitle;
    if (updates.department !== undefined) data.department = updates.department;
    if (updates.industry !== undefined) data.industry = updates.industry;
    if (updates.companySize !== undefined) data.companySize = updates.companySize;
    if (updates.communicationStyle !== undefined) data.communicationStyle = updates.communicationStyle;
    if (updates.responseLength !== undefined) data.responseLength = updates.responseLength;
    if (updates.proactivityLevel !== undefined) data.proactivityLevel = updates.proactivityLevel;
    if (updates.workingHoursStart !== undefined) data.workingHoursStart = updates.workingHoursStart;
    if (updates.workingHoursEnd !== undefined) data.workingHoursEnd = updates.workingHoursEnd;
    if (updates.workingDays !== undefined) data.workingDays = updates.workingDays;
    if (updates.timezone !== undefined) data.timezone = updates.timezone;
    if (updates.language !== undefined) data.language = updates.language;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const profile = await this.getUserProfile(tenantId, userId);
    return profile!;
  }

  /**
   * Get personalization context for AI interactions
   */
  async getPersonalizationContext(
    tenantId: string,
    userId: string,
    query?: string,
  ): Promise<PersonalizationContext> {
    const profile = await this.getUserProfile(tenantId, userId);

    if (!profile) {
      // Return default context
      return {
        profile: {
          jobRole: JobRole.OTHER,
          communicationStyle: CommunicationStyle.CASUAL,
          responseLength: ResponseLength.MODERATE,
          proactivityLevel: ProactivityLevel.MEDIUM,
          timezone: 'UTC',
          language: 'en',
        },
        promptModifiers: JOB_ROLE_TEMPLATES[JobRole.OTHER].promptModifiers,
        recentMemories: [],
      };
    }

    // Get job role template
    const template = JOB_ROLE_TEMPLATES[profile.jobRole] || JOB_ROLE_TEMPLATES[JobRole.OTHER];

    // Build prompt modifiers based on profile
    let promptModifiers = template.promptModifiers;

    // Add communication style modifier
    switch (profile.communicationStyle) {
      case CommunicationStyle.FORMAL:
        promptModifiers += ' Use formal, professional language.';
        break;
      case CommunicationStyle.TECHNICAL:
        promptModifiers += ' Use technical terminology when appropriate.';
        break;
      case CommunicationStyle.CREATIVE:
        promptModifiers += ' Be creative and engaging in responses.';
        break;
      default:
        promptModifiers += ' Use a friendly, conversational tone.';
    }

    // Add response length modifier
    switch (profile.responseLength) {
      case ResponseLength.BRIEF:
        promptModifiers += ' Keep responses concise and to the point.';
        break;
      case ResponseLength.DETAILED:
        promptModifiers += ' Provide detailed explanations when helpful.';
        break;
      default:
        promptModifiers += ' Balance detail with brevity.';
    }

    // Get relevant memories if query provided
    let recentMemories: PersonalizationContext['recentMemories'] = [];
    if (query) {
      recentMemories = await this.getRelevantMemories(tenantId, userId, query);
    }

    return {
      profile,
      promptModifiers,
      recentMemories,
    };
  }

  /**
   * Get relevant memories for a query using semantic search
   */
  async getRelevantMemories(
    tenantId: string,
    userId: string,
    query: string,
    limit = 5,
  ): Promise<Array<{ content: string; type: MemoryType; relevance: number }>> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.mistralService.generateEmbedding(query);

      // Search for similar memories using pgvector
      const memories = await this.prisma.$queryRaw<
        Array<{ content: string; memoryType: string; similarity: number }>
      >`
        SELECT
          content,
          "memoryType",
          1 - (vector <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM user_profile_embeddings
        WHERE "tenantId" = ${tenantId}
          AND "userId" = ${userId}
          AND vector IS NOT NULL
        ORDER BY vector <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `;

      return memories.map((m) => ({
        content: m.content,
        type: m.memoryType as MemoryType,
        relevance: m.similarity,
      }));
    } catch (error) {
      this.logger.warn(`Failed to get relevant memories: ${error}`);
      return [];
    }
  }

  /**
   * Store a memory for a user
   */
  async storeMemory(
    tenantId: string,
    userId: string,
    content: string,
    type: MemoryType,
    options?: {
      category?: string;
      source?: 'EXPLICIT' | 'INFERRED' | 'BEHAVIOR';
      confidence?: number;
      expiresAt?: Date;
    },
  ): Promise<string> {
    try {
      // Generate embedding for the content
      const embedding = await this.mistralService.generateEmbedding(content);

      const memory = await this.prisma.userProfileEmbedding.create({
        data: {
          tenantId,
          userId,
          content,
          memoryType: type,
          category: options?.category,
          source: options?.source || 'INFERRED',
          confidence: options?.confidence || 0.5,
          expiresAt: options?.expiresAt,
        },
      });

      // Update vector separately using raw query (pgvector)
      await this.prisma.$executeRaw`
        UPDATE user_profile_embeddings
        SET vector = ${JSON.stringify(embedding)}::vector
        WHERE id = ${memory.id}
      `;

      this.logger.debug(`Stored memory for user ${userId}: ${type}`);
      return memory.id;
    } catch (error) {
      this.logger.error(`Failed to store memory: ${error}`);
      throw error;
    }
  }

  /**
   * Learn from user interaction
   */
  async learnFromInteraction(
    tenantId: string,
    userId: string,
    interaction: {
      action: string;
      context: string;
      outcome: 'positive' | 'negative' | 'neutral';
    },
  ): Promise<void> {
    // Store interaction as a memory
    const content = `User ${interaction.outcome === 'positive' ? 'liked' : interaction.outcome === 'negative' ? 'disliked' : 'performed'} ${interaction.action} in context: ${interaction.context}`;

    await this.storeMemory(tenantId, userId, content, MemoryType.INTERACTION, {
      source: 'BEHAVIOR',
      confidence: interaction.outcome === 'neutral' ? 0.3 : 0.7,
    });
  }

  /**
   * Get user's memories by type
   */
  async getMemoriesByType(
    tenantId: string,
    userId: string,
    type: MemoryType,
    limit = 20,
  ): Promise<Array<{ id: string; content: string; createdAt: Date }>> {
    const memories = await this.prisma.userProfileEmbedding.findMany({
      where: {
        tenantId,
        userId,
        memoryType: type,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return memories;
  }

  /**
   * Delete a specific memory
   */
  async deleteMemory(tenantId: string, userId: string, memoryId: string): Promise<boolean> {
    const result = await this.prisma.userProfileEmbedding.deleteMany({
      where: {
        id: memoryId,
        tenantId,
        userId,
      },
    });

    return result.count > 0;
  }

  /**
   * Clear all memories for a user
   */
  async clearAllMemories(tenantId: string, userId: string): Promise<number> {
    const result = await this.prisma.userProfileEmbedding.deleteMany({
      where: {
        tenantId,
        userId,
      },
    });

    this.logger.log(`Cleared ${result.count} memories for user ${userId}`);
    return result.count;
  }

  /**
   * Check if it's within user's working hours
   */
  isWithinWorkingHours(profile: UserPersonalizationProfile): boolean {
    if (!profile.workingHoursStart || !profile.workingHoursEnd) {
      return true; // No working hours set, assume always available
    }

    const now = new Date();
    const currentDay = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];

    // Check if today is a working day
    if (profile.workingDays && !profile.workingDays.includes(currentDay)) {
      return false;
    }

    // Parse working hours
    const [startHour, startMin] = profile.workingHoursStart.split(':').map(Number);
    const [endHour, endMin] = profile.workingHoursEnd.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Build system prompt with personalization
   */
  buildPersonalizedSystemPrompt(
    basePrompt: string,
    context: PersonalizationContext,
  ): string {
    let prompt = basePrompt;

    // Add personalization modifiers
    prompt += `\n\n## User Personalization\n${context.promptModifiers}`;

    // Add relevant memories if available
    if (context.recentMemories.length > 0) {
      prompt += '\n\n## Relevant User Context\n';
      for (const memory of context.recentMemories) {
        if (memory.relevance > 0.5) {
          prompt += `- ${memory.content}\n`;
        }
      }
    }

    // Add language preference
    prompt += `\n\nRespond in ${context.profile.language === 'it' ? 'Italian' : 'English'}.`;

    return prompt;
  }
}
