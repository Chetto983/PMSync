import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Post,
  Req,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';
import { provisionWorkspaceForUser } from './better-auth.instance';

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    sessionId?: string;
  };
}

interface ProvisionWorkspaceBody {
  workspaceName?: string;
}

function getRequestIpFromExpress(request: Request): string | undefined {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || undefined;
  }

  return request.socket.remoteAddress || undefined;
}

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('complete')
  async completeOnboarding(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    await withoutTenantScopingAsync(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { onboardingComplete: true },
        select: { id: true },
      }),
    );

    return { success: true };
  }

  @Post('provision-workspace')
  async provisionWorkspace(
    @Req() request: AuthenticatedRequest,
    @Body() body: ProvisionWorkspaceBody,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const workspaceName = body.workspaceName?.trim();
    if (workspaceName && workspaceName.length < 2) {
      throw new BadRequestException('Workspace name must be at least 2 characters');
    }

    const user = await withoutTenantScopingAsync(() =>
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          tenantId: true,
        },
      }),
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.tenantId) {
      const userAgentHeader = request.headers['user-agent'];
      await provisionWorkspaceForUser(this.prisma, user, {
        agreedToTerms: false,
        ipAddress: getRequestIpFromExpress(request),
        userAgent: Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader,
        workspaceName,
      });
    }

    const updatedUser = await withoutTenantScopingAsync(() =>
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { tenantId: true },
      }),
    );

    if (!updatedUser?.tenantId) {
      throw new InternalServerErrorException('Failed to provision workspace');
    }

    if (request.user?.sessionId) {
      await withoutTenantScopingAsync(async () => {
        try {
          await this.prisma.session.update({
            where: { id: request.user!.sessionId! },
            data: { activeOrganizationId: updatedUser.tenantId },
          });
        } catch {
          // Session refresh is best-effort. The guard will still fall back to user.tenantId.
        }
      });
    }

    return {
      tenantId: updatedUser.tenantId,
      created: !user.tenantId,
    };
  }
}
