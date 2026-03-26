import { PrismaService } from '../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';

type MemberLookupClient = Pick<PrismaService, 'member'>;

export interface ResolveSessionTenantInput {
  userId: string;
  userTenantId?: string | null;
  activeOrganizationId?: string | null;
}

export interface ResolveSessionTenantResult {
  tenantId: string | null;
  activeOrganizationId: string | null;
  fallbackReason: 'membership-missing' | 'organization-inactive' | null;
  rejectedActiveOrganizationId: string | null;
}

function normalizeTenantId(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export async function resolveSessionTenantContext(
  prisma: MemberLookupClient,
  input: ResolveSessionTenantInput,
): Promise<ResolveSessionTenantResult> {
  const userTenantId = normalizeTenantId(input.userTenantId);
  const activeOrganizationId = normalizeTenantId(input.activeOrganizationId);

  if (!activeOrganizationId) {
    return {
      tenantId: userTenantId,
      activeOrganizationId: null,
      fallbackReason: null,
      rejectedActiveOrganizationId: null,
    };
  }

  if (activeOrganizationId === userTenantId) {
    return {
      tenantId: activeOrganizationId,
      activeOrganizationId,
      fallbackReason: null,
      rejectedActiveOrganizationId: null,
    };
  }

  const membership = await withoutTenantScopingAsync(() =>
    prisma.member.findFirst({
      where: {
        userId: input.userId,
        organizationId: activeOrganizationId,
      },
      select: {
        organizationId: true,
        organization: {
          select: { isActive: true },
        },
      },
    }),
  );

  if (!membership) {
    return {
      tenantId: userTenantId,
      activeOrganizationId: null,
      fallbackReason: 'membership-missing',
      rejectedActiveOrganizationId: activeOrganizationId,
    };
  }

  if (!membership.organization.isActive) {
    return {
      tenantId: userTenantId,
      activeOrganizationId: null,
      fallbackReason: 'organization-inactive',
      rejectedActiveOrganizationId: activeOrganizationId,
    };
  }

  return {
    tenantId: membership.organizationId,
    activeOrganizationId: membership.organizationId,
    fallbackReason: null,
    rejectedActiveOrganizationId: null,
  };
}
