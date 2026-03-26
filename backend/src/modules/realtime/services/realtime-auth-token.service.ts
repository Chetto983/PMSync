import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { resolveSessionTenantContext } from '../../../common/auth/session-tenant-resolver';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

const REALTIME_AUTH_TOKEN_PREFIX = 'pmsync.ws';
const REALTIME_AUTH_TOKEN_VERSION = 1;
const DEFAULT_REALTIME_AUTH_TOKEN_TTL_SECONDS = 120;

interface RealtimeAuthTokenPayload {
  v: number;
  sub: string;
  sid: string;
  tid: string;
  iat: number;
  exp: number;
}

interface IssueRealtimeAuthTokenInput {
  userId: string;
  sessionId: string;
  tenantId: string;
  ttlSeconds?: number;
}

export interface RealtimeAuthSessionResult {
  session: {
    id: string;
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    email: string;
    tenantId?: string | null;
    isActive?: boolean | null;
  };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

@Injectable()
export class RealtimeAuthTokenService {
  private readonly logger = new Logger(RealtimeAuthTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getSigningSecret(): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
      throw new InternalServerErrorException(
        'BETTER_AUTH_SECRET is required for realtime auth tokens',
      );
    }

    return secret;
  }

  private signPayload(payloadSegment: string): string {
    return createHmac('sha256', this.getSigningSecret())
      .update(payloadSegment)
      .digest('base64url');
  }

  isRealtimeAuthToken(token: string): boolean {
    return token.startsWith(`${REALTIME_AUTH_TOKEN_PREFIX}.`);
  }

  issueToken(input: IssueRealtimeAuthTokenInput): {
    token: string;
    expiresAt: string;
  } {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(
      30,
      Math.min(
        input.ttlSeconds ?? DEFAULT_REALTIME_AUTH_TOKEN_TTL_SECONDS,
        10 * 60,
      ),
    );
    const payload: RealtimeAuthTokenPayload = {
      v: REALTIME_AUTH_TOKEN_VERSION,
      sub: input.userId,
      sid: input.sessionId,
      tid: input.tenantId,
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
    };

    const payloadSegment = encodeBase64Url(JSON.stringify(payload));
    const signature = this.signPayload(payloadSegment);

    return {
      token: `${REALTIME_AUTH_TOKEN_PREFIX}.${payloadSegment}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  async verifyToken(token: string): Promise<RealtimeAuthSessionResult> {
    const segments = token.split('.');
    if (
      segments.length !== 4 ||
      segments[0] !== 'pmsync' ||
      segments[1] !== 'ws'
    ) {
      throw new UnauthorizedException('Invalid realtime auth token');
    }

    const payloadSegment = segments[2];
    const signatureSegment = segments[3];
    const expectedSignature = this.signPayload(payloadSegment);

    const providedBuffer = Buffer.from(signatureSegment, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid realtime auth token');
    }

    let payload: RealtimeAuthTokenPayload;
    try {
      payload = JSON.parse(
        decodeBase64Url(payloadSegment),
      ) as RealtimeAuthTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid realtime auth token');
    }

    if (
      payload.v !== REALTIME_AUTH_TOKEN_VERSION ||
      !payload.sub ||
      !payload.sid ||
      !payload.tid ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Realtime auth token expired');
    }

    const persistedSession = await withoutTenantScopingAsync(() =>
      this.prisma.session.findUnique({
        where: { id: payload.sid },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          activeOrganizationId: true,
          user: {
            select: {
              id: true,
              email: true,
              tenantId: true,
              isActive: true,
            },
          },
        },
      }),
    );

    if (!persistedSession || persistedSession.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid realtime auth token');
    }

    if (persistedSession.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Realtime auth token expired');
    }

    const tenantContext = await resolveSessionTenantContext(this.prisma, {
      userId: persistedSession.userId,
      userTenantId: persistedSession.user.tenantId,
      activeOrganizationId: persistedSession.activeOrganizationId,
    });
    const currentTenantId = tenantContext.tenantId;

    if (tenantContext.rejectedActiveOrganizationId) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_token_invalid_active_org_fallback',
          userId: persistedSession.userId,
          sessionId: persistedSession.id,
          rejectedActiveOrganizationId: tenantContext.rejectedActiveOrganizationId,
          fallbackTenantId: currentTenantId,
          reason: tenantContext.fallbackReason,
        }),
      );
    }

    if (!currentTenantId || currentTenantId !== payload.tid) {
      throw new UnauthorizedException('Realtime auth token no longer matches session context');
    }

    return {
      session: {
        id: persistedSession.id,
        activeOrganizationId: tenantContext.activeOrganizationId,
      },
      user: {
        id: persistedSession.user.id,
        email: persistedSession.user.email,
        tenantId: persistedSession.user.tenantId,
        isActive: persistedSession.user.isActive,
      },
    };
  }
}
