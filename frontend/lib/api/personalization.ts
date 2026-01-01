import { apiClient } from '../api-client';

// Types - JobRole is now a free-form string to allow any job title
export type JobRole = string;

export type CommunicationStyle = 'FORMAL' | 'CASUAL' | 'TECHNICAL' | 'CREATIVE';
export type ResponseLength = 'BRIEF' | 'MODERATE' | 'DETAILED';
export type ProactivityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type UserProfile = {
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
};

export type MemoryType = 'PREFERENCE' | 'FACT' | 'PATTERN' | 'INTERACTION' | 'CONTACT_NOTE';
export type MemorySource = 'EXPLICIT' | 'INFERRED' | 'BEHAVIOR';

export type Memory = {
  id: string;
  tenantId: string;
  userId: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type StoreMemoryPayload = {
  type: MemoryType;
  content: string;
  category?: string;
  source?: MemorySource;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type LearnInteractionPayload = {
  action: string;
  context: string;
  outcome: 'positive' | 'negative' | 'neutral';
};

export type WorkingHoursResponse = {
  success: boolean;
  withinWorkingHours: boolean;
  reason?: string;
  workingHours?: {
    start?: string;
    end?: string;
    days?: string[];
  };
};

// API
export const personalizationApi = {
  // Get user profile
  getProfile() {
    return apiClient.get<{ success: boolean; profile: UserProfile }>(
      '/ai/personalization/profile'
    );
  },

  // Update user profile
  updateProfile(profile: Partial<UserProfile>) {
    return apiClient.patch<{ success: boolean; profile: UserProfile }>(
      '/ai/personalization/profile',
      profile
    );
  },

  // Get personalization context for AI interactions
  getContext(body?: { query?: string }) {
    return apiClient.post<{ success: boolean; context: unknown }>(
      '/ai/personalization/context',
      body ?? {},
    );
  },

  // Get memories by type
  getMemories(params: { type: MemoryType; limit?: number }) {
    const { type, ...query } = params;
    return apiClient.get<{ success: boolean; memories: Memory[] }>(
      `/ai/personalization/memories/${encodeURIComponent(type)}`,
      { params: query },
    );
  },

  // Search memories using semantic similarity
  searchMemories(payload: { query: string; limit?: number }) {
    return apiClient.post<{ success: boolean; memories: Memory[] }>(
      '/ai/personalization/memories/search',
      payload,
    );
  },

  // Store a memory (with full backend DTO support)
  storeMemory(memory: StoreMemoryPayload) {
    return apiClient.post<{ success: boolean; memoryId: string }>(
      '/ai/personalization/memories',
      memory
    );
  },

  // Delete a memory
  deleteMemory(memoryId: string) {
    return apiClient.delete<{ success: boolean }>(
      `/ai/personalization/memories/${memoryId}`
    );
  },

  // Clear all memories
  clearAllMemories() {
    return apiClient.delete<{ success: boolean; deletedCount: number }>(
      '/ai/personalization/memories'
    );
  },

  // Learn from user interaction
  learnFromInteraction(payload: LearnInteractionPayload) {
    return apiClient.post<{ success: boolean }>(
      '/ai/personalization/learn',
      payload
    );
  },

  // Check if user is within working hours
  getWorkingHours() {
    return apiClient.get<WorkingHoursResponse>(
      '/ai/personalization/working-hours'
    );
  },

  // Get memory history
  getMemoryHistory(memoryId: string) {
    return apiClient.get<{
      success: boolean;
      history: Array<{
        action: string;
        previousValue?: string;
        newValue?: string;
        createdAt: string;
      }>;
    }>(`/ai/personalization/memories/${memoryId}/history`);
  },

  // Get procedural patterns
  getPatterns() {
    return apiClient.get<{
      success: boolean;
      patterns: Array<{
        id: string;
        taskType: string;
        trigger: string;
        steps: unknown;
        successRate: number;
        lastUsedAt: string;
      }>;
    }>('/ai/personalization/patterns');
  },
};
