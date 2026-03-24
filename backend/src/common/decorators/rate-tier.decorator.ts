import { SetMetadata } from '@nestjs/common';

export const RATE_TIER_KEY = 'rate-tier';
export type RateTier = 'read' | 'safe-write' | 'destructive-write' | 'send';
export const RateTierDecorator = (tier: RateTier) =>
  SetMetadata(RATE_TIER_KEY, tier);
