/**
 * Provider Error Interceptor - Centralized Error Handling
 *
 * Inspired by Zero's activeDriverProcedure middleware
 * Provides unified error handling across all provider operations.
 *
 * @see Repo_Esempio/Zero-main/Zero-main/apps/server/src/lib/driver/types.ts
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Observable, catchError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { isRateLimitError } from '../utils/error.utils';

/**
 * Standardized Provider Error extending base Error
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: any,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Token Expired Error - triggers auto cleanup and frontend redirect
 */
export class TokenExpiredError extends ProviderError {
  constructor(provider: string, originalError?: any) {
    super('Access token expired. Please reconnect.', 'TOKEN_EXPIRED', provider, originalError);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Insufficient Permissions Error
 */
export class InsufficientPermissionsError extends ProviderError {
  constructor(provider: string, requiredScopes: string[], originalError?: any) {
    super(
      `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`,
      'INSUFFICIENT_PERMISSIONS',
      provider,
      originalError,
    );
    this.name = 'InsufficientPermissionsError';
  }
}

/**
 * Rate Limit Exceeded Error
 */
export class RateLimitError extends ProviderError {
  constructor(
    provider: string,
    public retryAfter?: number,
    originalError?: any,
  ) {
    super('Rate limit exceeded. Please try again later.', 'RATE_LIMIT_EXCEEDED', provider, originalError);
    this.name = 'RateLimitError';
  }
}

/**
 * Provider Error Interceptor
 *
 * Centralized error handling for all provider operations.
 * Automatically handles token expiration, permissions, and rate limits.
 */
@Injectable()
export class ProviderErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ProviderErrorInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(async (error) => {
        const request = context.switchToHttp().getRequest();
        const { user, activeConnection } = request;
        const provider = request.params?.providerId || activeConnection?.provider;

        return this.handleProviderError(error, {
          providerId: activeConnection?.id,
          tenantId: user?.tenantId,
          provider: provider,
          userId: user?.id,
        });
      }),
    );
  }

  /**
   * Handle provider errors centralized
   */
  private async handleProviderError(
    error: any,
    context: {
      providerId?: string;
      tenantId?: string;
      provider?: string;
      userId?: string;
    },
  ): Promise<never> {
    const { providerId, tenantId, provider, userId } = context;

    // Log the original error with full context
    this.logger.error(`Provider error intercepted`, {
      error: error.message,
      code: error.code,
      provider: provider,
      userId: userId,
      tenantId: tenantId,
      providerId: providerId,
      stack: error.stack,
    });

    // Handle token expiration
    if (this.isTokenExpired(error)) {
      await this.handleTokenExpired(providerId, tenantId);
      throw this.createRedirectError(provider);
    }

    // Handle permission errors
    if (this.isPermissionError(error)) {
      throw new ForbiddenException(this.getPermissionMessage(error));
    }

    // Handle rate limit errors
    if (isRateLimitError(error)) {
      throw this.createRateLimitError(error);
    }

    // Handle quota exceeded errors
    if (this.isQuotaExceededError(error)) {
      throw new BadRequestException('API quota exceeded. Please try again later.');
    }

    // Handle network/connection errors
    if (this.isNetworkError(error)) {
      throw new BadRequestException('Connection failed. Please check your internet connection.');
    }

    // Handle malformed request errors
    if (this.isBadRequestError(error)) {
      throw new BadRequestException(`Invalid request: ${error.message}`);
    }

    // Default: re-throw with standardized format
    throw new BadRequestException(`Provider operation failed: ${error.message}`);
  }

  // ============================================================================
  // ERROR TYPE DETECTION METHODS
  // ============================================================================

  private isTokenExpired(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    return (
      message.includes('invalid_grant') ||
      message.includes('token expired') ||
      message.includes('unauthorized') ||
      message.includes('access denied') ||
      code === 'invalid_grant' ||
      code === 'access_denied' ||
      error.status === 401
    );
  }

  private isPermissionError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    return (
      message.includes('insufficient permission') ||
      message.includes('access denied') ||
      message.includes('forbidden') ||
      message.includes('scope') ||
      code === 'insufficient_scope' ||
      code === 'access_denied' ||
      error.status === 403
    );
  }

  // NOTE: isRateLimitError DELETED - use import from common/utils/error.utils
  // Consolidated in Phase 4 (2025-01-05)

  private isQuotaExceededError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';

    return (
      message.includes('quota exceeded') ||
      message.includes('usage limit') ||
      message.includes('daily limit exceeded')
    );
  }

  private isNetworkError(error: any): boolean {
    return (
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET'
    );
  }

  private isBadRequestError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';

    return (
      error.status === 400 ||
      message.includes('invalid') ||
      message.includes('malformed') ||
      message.includes('required parameter')
    );
  }

  // ============================================================================
  // ERROR HANDLING METHODS
  // ============================================================================

  private async handleTokenExpired(providerId?: string, _tenantId?: string): Promise<void> {
    if (!providerId) {
      this.logger.warn('Provider ID not available for token cleanup');
      return;
    }

    try {
      // Update provider status to inactive (token expired)
      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: {
          isActive: false,
          tokenExpiresAt: null,
          accessToken: null, // Clear encrypted token for security
          refreshToken: null, // Also clear refresh token for security
        },
      });

      this.logger.log(`Token expired cleanup completed for provider ${providerId}`);
    } catch (cleanupError) {
      this.logger.error(`Failed to cleanup expired token for provider ${providerId}`, cleanupError);
      // Don't throw here - we want to prioritize the original error to frontend
    }
  }

  private createRedirectError(provider?: string): UnauthorizedException {
    // Create custom header for frontend redirect (Zero-inspired pattern)
    const response = {
      message: 'Authentication required. Please reconnect your account.',
      code: 'TOKEN_EXPIRED',
      provider: provider || 'unknown',
      redirect: true,
    };

    // Note: Frontend should watch for 'X-PMSync-Redirect' header
    // and redirect to connection settings page

    return new UnauthorizedException(response);
  }

  private createRateLimitError(error: any): BadRequestException {
    const retryAfter = error.headers?.['retry-after'] || error.retryAfter;
    const message = retryAfter
      ? `Rate limit exceeded. Please try again in ${retryAfter} seconds.`
      : 'Rate limit exceeded. Please try again later.';

    return new BadRequestException({
      message,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: retryAfter,
    });
  }

  private getPermissionMessage(error: any): string {
    const message = error.message?.toLowerCase() || '';

    // Try to provide helpful permission messages
    if (message.includes('calendar')) {
      return 'Calendar access permission denied. Please reconnect and grant calendar permissions.';
    }

    if (message.includes('contact') || message.includes('people')) {
      return 'Contacts access permission denied. Please reconnect and grant contacts permissions.';
    }

    if (message.includes('mail') || message.includes('email')) {
      return 'Email access permission denied. Please reconnect and grant email permissions.';
    }

    return 'Insufficient permissions. Please reconnect and grant all required permissions.';
  }
}
