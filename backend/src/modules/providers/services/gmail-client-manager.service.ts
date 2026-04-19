/**
 * Gmail Client Manager Service
 *
 * Manages Gmail API client instances with:
 * - Singleton clients per provider (avoid recreation)
 * - Redis-backed token caching (50min TTL)
 * - Idle client cleanup (>10min unused)
 * - Memory-efficient client pooling
 *
 * Target: <200MB per tenant @ 1000 users
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { gmail as gmailFactory, gmail_v1 } from '@googleapis/gmail';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

interface CachedClient {
  client: gmail_v1.Gmail;
  auth: OAuth2Client;
  lastUsed: number;
  providerId: string;
}

/** Token cache entry in Redis */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class GmailClientManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(GmailClientManagerService.name);

  /** In-memory client pool - max 50 clients to limit RAM */
  private readonly clients = new Map<string, CachedClient>();
  private readonly MAX_CLIENTS = 50;
  private readonly IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  /** Redis cache TTLs */
  private readonly TOKEN_CACHE_TTL = 50 * 60; // 50 min (before 1h expiry)
  private readonly METADATA_CACHE_TTL = 60 * 60; // 1 hour

  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly cacheService: CacheService) {
    // Start idle client cleanup every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanupIdleClients(), 2 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clients.clear();
  }

  /**
   * Get or create Gmail client for provider
   * Uses Redis-cached tokens when available
   */
  async getClient(
    providerId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<gmail_v1.Gmail> {
    const cacheKey = `gmail:${providerId}`;
    const now = Date.now();

    // Check if we have a cached client
    const cached = this.clients.get(cacheKey);
    if (cached && now - cached.lastUsed < this.IDLE_TIMEOUT_MS) {
      cached.lastUsed = now;
      return cached.client;
    }

    // Evict oldest clients if at capacity
    if (this.clients.size >= this.MAX_CLIENTS) {
      this.evictOldestClient();
    }

    // Create new client
    const auth = new OAuth2Client();
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const client = gmailFactory({ version: 'v1', auth });

    // Cache the client
    this.clients.set(cacheKey, {
      client,
      auth,
      lastUsed: now,
      providerId,
    });

    this.logger.debug(`Created Gmail client for provider ${providerId}, pool size: ${this.clients.size}`);

    return client;
  }

  /**
   * Cache access token in Redis (50min TTL)
   */
  async cacheToken(providerId: string, accessToken: string, expiresAt: Date): Promise<void> {
    const cacheKey = `token:${providerId}`;
    const data: CachedToken = {
      accessToken,
      expiresAt: expiresAt.getTime(),
    };

    await this.cacheService.set(cacheKey, data, {
      namespace: CacheNamespace.PROVIDER_TOKEN,
      ttl: this.TOKEN_CACHE_TTL,
    });
  }

  /**
   * Get cached token from Redis
   */
  async getCachedToken(providerId: string): Promise<CachedToken | null> {
    const cacheKey = `token:${providerId}`;
    const cached = await this.cacheService.get<CachedToken>(cacheKey, {
      namespace: CacheNamespace.PROVIDER_TOKEN,
    });

    // Validate token hasn't expired
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached;
    }

    return null;
  }

  /**
   * Cache Gmail metadata (labels, folders) in Redis
   */
  async cacheMetadata<T>(
    providerId: string,
    key: string,
    data: T,
  ): Promise<void> {
    const cacheKey = `meta:${providerId}:${key}`;
    await this.cacheService.set(cacheKey, data, {
      namespace: CacheNamespace.PROVIDER_METADATA,
      ttl: this.METADATA_CACHE_TTL,
    });
  }

  /**
   * Get cached metadata from Redis
   */
  async getCachedMetadata<T>(providerId: string, key: string): Promise<T | null> {
    const cacheKey = `meta:${providerId}:${key}`;
    return this.cacheService.get<T>(cacheKey, {
      namespace: CacheNamespace.PROVIDER_METADATA,
    });
  }

  /**
   * Invalidate all cache for a provider
   */
  async invalidateProvider(providerId: string): Promise<void> {
    // Remove from in-memory pool
    const cacheKey = `gmail:${providerId}`;
    this.clients.delete(cacheKey);

    // Remove token from Redis
    await this.cacheService.del(`token:${providerId}`, {
      namespace: CacheNamespace.PROVIDER_TOKEN,
    });

    this.logger.log(`Invalidated cache for provider ${providerId}`);
  }

  /**
   * Get pool statistics for monitoring
   */
  getPoolStats(): { size: number; maxSize: number; providers: string[] } {
    return {
      size: this.clients.size,
      maxSize: this.MAX_CLIENTS,
      providers: Array.from(this.clients.values()).map((c) => c.providerId),
    };
  }

  /**
   * Clean up idle clients (>10min unused)
   */
  private cleanupIdleClients(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.clients.entries()) {
      if (now - cached.lastUsed > this.IDLE_TIMEOUT_MS) {
        this.clients.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} idle Gmail clients, pool size: ${this.clients.size}`);
    }
  }

  /**
   * Evict the oldest client when at capacity
   */
  private evictOldestClient(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, cached] of this.clients.entries()) {
      if (cached.lastUsed < oldestTime) {
        oldestTime = cached.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.clients.delete(oldestKey);
      this.logger.debug(`Evicted oldest Gmail client, pool size: ${this.clients.size}`);
    }
  }
}
