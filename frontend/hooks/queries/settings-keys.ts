/**
 * Query keys for Settings-related queries
 * Follows the factory pattern for type-safe, consistent query keys
 */

export const settingsKeys = {
  all: ['settings'] as const,

  // User preferences
  preferences: () => [...settingsKeys.all, 'preferences'] as const,

  // AI personalization profile
  aiProfile: () => [...settingsKeys.all, 'aiProfile'] as const,

  // Email providers
  providers: () => [...settingsKeys.all, 'providers'] as const,
  provider: (id: string) => [...settingsKeys.providers(), id] as const,
};
