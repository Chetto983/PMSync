import { Injectable, OnModuleInit } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { Redis } from 'ioredis';
import { RedisConnectionService } from '../services/redis-connection.service';

/**
 * Redis-backed ThrottlerStorage for distributed rate limiting.
 *
 * Replaces the default in-memory storage so rate limits work correctly
 * across multiple replicas and survive restarts.
 *
 * Uses atomic Lua script for INCR + EXPIRE + TTL in a single round-trip.
 */
const INCREMENT_LUA = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockKey = KEYS[2]
local blockDuration = tonumber(ARGV[3])

-- Check if blocked
local blocked = redis.call('GET', blockKey)
if blocked then
  local blockTtl = redis.call('TTL', blockKey)
  return {tonumber(blocked), blockTtl, 1, blockTtl}
end

-- Increment counter
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, ttl)
end
local remaining = redis.call('TTL', key)

-- Block if over limit and blockDuration > 0
if count > limit and blockDuration > 0 then
  redis.call('SETEX', blockKey, blockDuration, tostring(count))
  return {count, blockDuration, 1, blockDuration}
end

return {count, remaining, 0, 0}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleInit {
  private redis!: Redis;

  constructor(private readonly redisConnection: RedisConnectionService) {}

  onModuleInit() {
    this.redis = this.redisConnection.client;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;
    // ttl comes in as milliseconds from NestJS throttler, convert to seconds for Redis
    const ttlSeconds = Math.ceil(ttl / 1000);
    const blockSeconds = Math.ceil(blockDuration / 1000);

    try {
      const result = (await this.redis.eval(
        INCREMENT_LUA,
        2,
        storageKey,
        blockKey,
        ttlSeconds.toString(),
        limit.toString(),
        blockSeconds.toString(),
      )) as [number, number, number, number];

      const [totalHits, timeRemaining, isBlockedNum, blockTimeRemaining] =
        result;

      return {
        totalHits,
        timeToExpire: timeRemaining * 1000, // back to ms
        isBlocked: isBlockedNum === 1,
        timeToBlockExpire: blockTimeRemaining * 1000,
      };
    } catch {
      // Fail open on Redis errors — don't block users if Redis is down
      return {
        totalHits: 0,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
