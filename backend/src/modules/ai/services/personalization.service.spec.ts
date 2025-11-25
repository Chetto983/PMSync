import {
  PersonalizationService,
  JobRole,
  CommunicationStyle,
  ResponseLength,
  ProactivityLevel,
  MemoryType,
  JOB_ROLE_TEMPLATES,
} from './personalization.service';

describe('PersonalizationService', () => {
  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';

  let prisma: any;
  let mistralService: any;
  let service: PersonalizationService;

  beforeEach(() => {
    prisma = {
      userPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      userProfileEmbedding: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    mistralService = {
      generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    service = new PersonalizationService(prisma, mistralService);
  });

  describe('getUserProfile', () => {
    it('returns null when no preferences exist', async () => {
      prisma.userPreferences.findUnique.mockResolvedValueOnce(null);

      const result = await service.getUserProfile(USER_ID);

      expect(result).toBeNull();
      expect(prisma.userPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('returns profile with defaults when preferences exist', async () => {
      prisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId: USER_ID,
        jobRole: 'EXECUTIVE',
        jobTitle: 'CEO',
        department: 'Executive',
        industry: 'Tech',
        companySize: 'ENTERPRISE',
        communicationStyle: 'FORMAL',
        responseLength: 'BRIEF',
        proactivityLevel: 'HIGH',
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        timezone: 'Europe/Rome',
        language: 'it',
      });

      const result = await service.getUserProfile(USER_ID);

      expect(result).toEqual({
        jobRole: JobRole.EXECUTIVE,
        jobTitle: 'CEO',
        department: 'Executive',
        industry: 'Tech',
        companySize: 'ENTERPRISE',
        communicationStyle: CommunicationStyle.FORMAL,
        responseLength: ResponseLength.BRIEF,
        proactivityLevel: ProactivityLevel.HIGH,
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        timezone: 'Europe/Rome',
        language: 'it',
      });
    });

    it('returns default values for missing fields', async () => {
      prisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId: USER_ID,
      });

      const result = await service.getUserProfile(USER_ID);

      expect(result).toEqual({
        jobRole: JobRole.OTHER,
        jobTitle: undefined,
        department: undefined,
        industry: undefined,
        companySize: undefined,
        communicationStyle: CommunicationStyle.CASUAL,
        responseLength: ResponseLength.MODERATE,
        proactivityLevel: ProactivityLevel.MEDIUM,
        workingHoursStart: undefined,
        workingHoursEnd: undefined,
        workingDays: undefined,
        timezone: 'UTC',
        language: 'en',
      });
    });
  });

  describe('updateUserProfile', () => {
    it('upserts user preferences with provided updates', async () => {
      const updates = {
        jobRole: JobRole.MANAGER,
        communicationStyle: CommunicationStyle.FORMAL,
      };

      prisma.userPreferences.upsert.mockResolvedValueOnce({});
      prisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId: USER_ID,
        jobRole: 'MANAGER',
        communicationStyle: 'FORMAL',
      });

      const result = await service.updateUserProfile(USER_ID, updates);

      expect(prisma.userPreferences.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: { userId: USER_ID, ...updates },
        update: updates,
      });
      expect(result.jobRole).toBe(JobRole.MANAGER);
    });
  });

  describe('getPersonalizationContext', () => {
    it('returns default context when no profile exists', async () => {
      prisma.userPreferences.findUnique.mockResolvedValueOnce(null);

      const result = await service.getPersonalizationContext(TENANT_ID, USER_ID);

      expect(result.profile.jobRole).toBe(JobRole.OTHER);
      expect(result.profile.communicationStyle).toBe(CommunicationStyle.CASUAL);
      expect(result.promptModifiers).toBe(JOB_ROLE_TEMPLATES[JobRole.OTHER].promptModifiers);
      expect(result.recentMemories).toEqual([]);
    });

    it('builds prompt modifiers based on profile', async () => {
      prisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId: USER_ID,
        jobRole: 'EXECUTIVE',
        communicationStyle: 'FORMAL',
        responseLength: 'BRIEF',
      });

      const result = await service.getPersonalizationContext(TENANT_ID, USER_ID);

      expect(result.promptModifiers).toContain('Focus on strategic insights');
      expect(result.promptModifiers).toContain('Use formal, professional language');
      expect(result.promptModifiers).toContain('Keep responses concise');
    });

    it('fetches relevant memories when query is provided', async () => {
      prisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId: USER_ID,
        jobRole: 'IC',
      });
      prisma.$queryRaw.mockResolvedValueOnce([
        { content: 'User prefers morning meetings', memoryType: 'PREFERENCE', similarity: 0.85 },
      ]);

      const result = await service.getPersonalizationContext(TENANT_ID, USER_ID, 'schedule meeting');

      expect(mistralService.generateEmbedding).toHaveBeenCalledWith('schedule meeting');
      expect(result.recentMemories).toHaveLength(1);
      expect(result.recentMemories[0].content).toBe('User prefers morning meetings');
    });
  });

  describe('storeMemory', () => {
    it('creates memory with embedding', async () => {
      const mockMemory = { id: 'memory-1' };
      prisma.userProfileEmbedding.create.mockResolvedValueOnce(mockMemory);
      prisma.$executeRaw.mockResolvedValueOnce(1);

      const result = await service.storeMemory(
        TENANT_ID,
        USER_ID,
        'User prefers morning meetings',
        MemoryType.PREFERENCE,
        { category: 'scheduling', source: 'EXPLICIT', confidence: 0.9 },
      );

      expect(prisma.userProfileEmbedding.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          content: 'User prefers morning meetings',
          memoryType: MemoryType.PREFERENCE,
          category: 'scheduling',
          source: 'EXPLICIT',
          confidence: 0.9,
          expiresAt: undefined,
        },
      });
      expect(mistralService.generateEmbedding).toHaveBeenCalledWith('User prefers morning meetings');
      expect(result).toBe('memory-1');
    });
  });

  describe('learnFromInteraction', () => {
    it('stores positive interaction as memory', async () => {
      prisma.userProfileEmbedding.create.mockResolvedValueOnce({ id: 'memory-1' });
      prisma.$executeRaw.mockResolvedValueOnce(1);

      await service.learnFromInteraction(TENANT_ID, USER_ID, {
        action: 'scheduled a meeting',
        context: 'calendar management',
        outcome: 'positive',
      });

      expect(prisma.userProfileEmbedding.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: expect.stringContaining('liked'),
          memoryType: MemoryType.INTERACTION,
          source: 'BEHAVIOR',
          confidence: 0.7,
        }),
      });
    });

    it('stores negative interaction with appropriate confidence', async () => {
      prisma.userProfileEmbedding.create.mockResolvedValueOnce({ id: 'memory-1' });
      prisma.$executeRaw.mockResolvedValueOnce(1);

      await service.learnFromInteraction(TENANT_ID, USER_ID, {
        action: 'auto-replied to email',
        context: 'email management',
        outcome: 'negative',
      });

      expect(prisma.userProfileEmbedding.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: expect.stringContaining('disliked'),
          confidence: 0.7,
        }),
      });
    });
  });

  describe('getMemoriesByType', () => {
    it('returns memories filtered by type', async () => {
      const memories = [
        { id: 'm1', content: 'Prefers morning meetings', createdAt: new Date() },
        { id: 'm2', content: 'Likes detailed emails', createdAt: new Date() },
      ];
      prisma.userProfileEmbedding.findMany.mockResolvedValueOnce(memories);

      const result = await service.getMemoriesByType(TENANT_ID, USER_ID, MemoryType.PREFERENCE);

      expect(prisma.userProfileEmbedding.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          memoryType: MemoryType.PREFERENCE,
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      expect(result).toEqual(memories);
    });
  });

  describe('deleteMemory', () => {
    it('returns true when memory is deleted', async () => {
      prisma.userProfileEmbedding.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.deleteMemory(TENANT_ID, USER_ID, 'memory-1');

      expect(result).toBe(true);
      expect(prisma.userProfileEmbedding.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'memory-1',
          tenantId: TENANT_ID,
          userId: USER_ID,
        },
      });
    });

    it('returns false when memory does not exist', async () => {
      prisma.userProfileEmbedding.deleteMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.deleteMemory(TENANT_ID, USER_ID, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('clearAllMemories', () => {
    it('deletes all memories for user and returns count', async () => {
      prisma.userProfileEmbedding.deleteMany.mockResolvedValueOnce({ count: 5 });

      const result = await service.clearAllMemories(TENANT_ID, USER_ID);

      expect(result).toBe(5);
      expect(prisma.userProfileEmbedding.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          userId: USER_ID,
        },
      });
    });
  });

  describe('isWithinWorkingHours', () => {
    it('returns true when no working hours are set', () => {
      const profile = {
        jobRole: JobRole.OTHER,
        communicationStyle: CommunicationStyle.CASUAL,
        responseLength: ResponseLength.MODERATE,
        proactivityLevel: ProactivityLevel.MEDIUM,
        timezone: 'UTC',
        language: 'en',
      };

      const result = service.isWithinWorkingHours(profile);

      expect(result).toBe(true);
    });
  });

  describe('buildPersonalizedSystemPrompt', () => {
    it('adds personalization modifiers to base prompt', () => {
      const basePrompt = 'You are an AI assistant.';
      const context = {
        profile: {
          jobRole: JobRole.EXECUTIVE,
          communicationStyle: CommunicationStyle.FORMAL,
          responseLength: ResponseLength.BRIEF,
          proactivityLevel: ProactivityLevel.HIGH,
          timezone: 'UTC',
          language: 'en',
        },
        promptModifiers: 'Focus on strategic insights.',
        recentMemories: [],
      };

      const result = service.buildPersonalizedSystemPrompt(basePrompt, context);

      expect(result).toContain('You are an AI assistant.');
      expect(result).toContain('## User Personalization');
      expect(result).toContain('Focus on strategic insights.');
      expect(result).toContain('Respond in English.');
    });

    it('includes relevant memories in prompt', () => {
      const basePrompt = 'You are an AI assistant.';
      const context = {
        profile: {
          jobRole: JobRole.IC,
          communicationStyle: CommunicationStyle.CASUAL,
          responseLength: ResponseLength.MODERATE,
          proactivityLevel: ProactivityLevel.MEDIUM,
          timezone: 'UTC',
          language: 'it',
        },
        promptModifiers: 'Focus on task details.',
        recentMemories: [
          { content: 'User prefers morning meetings', type: MemoryType.PREFERENCE, relevance: 0.8 },
          { content: 'Low relevance memory', type: MemoryType.FACT, relevance: 0.3 },
        ],
      };

      const result = service.buildPersonalizedSystemPrompt(basePrompt, context);

      expect(result).toContain('## Relevant User Context');
      expect(result).toContain('User prefers morning meetings');
      expect(result).not.toContain('Low relevance memory');
      expect(result).toContain('Respond in Italian.');
    });
  });

  describe('JOB_ROLE_TEMPLATES', () => {
    it('has templates for all job roles', () => {
      expect(JOB_ROLE_TEMPLATES[JobRole.EXECUTIVE]).toBeDefined();
      expect(JOB_ROLE_TEMPLATES[JobRole.MANAGER]).toBeDefined();
      expect(JOB_ROLE_TEMPLATES[JobRole.IC]).toBeDefined();
      expect(JOB_ROLE_TEMPLATES[JobRole.FREELANCER]).toBeDefined();
      expect(JOB_ROLE_TEMPLATES[JobRole.STUDENT]).toBeDefined();
      expect(JOB_ROLE_TEMPLATES[JobRole.OTHER]).toBeDefined();
    });

    it('EXECUTIVE template focuses on strategic decisions', () => {
      const template = JOB_ROLE_TEMPLATES[JobRole.EXECUTIVE];
      expect(template.defaultStyle).toBe(CommunicationStyle.FORMAL);
      expect(template.defaultLength).toBe(ResponseLength.BRIEF);
      expect(template.promptModifiers).toContain('strategic');
    });
  });
});
