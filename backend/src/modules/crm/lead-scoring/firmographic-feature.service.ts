import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface FirmographicFeatures {
  hasAccount: boolean;
  companySize: number; // numeric encoding: 0=unknown, 1=1-10, 2=11-50, 3=51-200, 4=201-500, 5=500+
  hasIndustry: boolean;
  industryCategory: string | null;
  revenueRange: number; // 0=unknown, 1=<10k, 2=10k-100k, 3=100k-1M, 4=1M-10M, 5=10M+
  hasWebsite: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  accountDealCount: number; // deals linked to the account
  accountTotalValue: number; // sum of deal amounts on the account
}

const SIZE_MAP: Record<string, number> = {
  '1-10': 1,
  '11-50': 2,
  '51-200': 3,
  '201-500': 4,
  '500+': 5,
};

@Injectable()
export class FirmographicFeatureService {
  private readonly logger = new Logger(FirmographicFeatureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async extract(
    tenantId: string,
    contactId: string,
  ): Promise<FirmographicFeatures> {
    // Find accounts linked to this contact
    const accountLinks = await this.prisma.accountContact.findMany({
      where: { contactId, tenantId },
      select: { accountId: true },
      take: 5,
    });

    if (accountLinks.length === 0) {
      return this.emptyFeatures();
    }

    // Use the first (primary) linked account
    const accountId = accountLinks[0].accountId;
    const account = await this.prisma.crmAccount.findUnique({
      where: { id: accountId },
      select: {
        size: true,
        industry: true,
        revenue: true,
        website: true,
        phone: true,
        address: true,
        deals: {
          where: { tenantId, deletedAt: null },
          select: { amount: true },
        },
      },
    });

    if (!account) {
      return this.emptyFeatures();
    }

    const companySize = account.size ? (SIZE_MAP[account.size] ?? 0) : 0;
    const revenueRange = this.encodeRevenue(account.revenue);
    const hasAddress =
      account.address !== null && account.address !== undefined;

    const accountTotalValue = account.deals.reduce(
      (sum, d) => sum + (d.amount ? Number(d.amount) : 0),
      0,
    );

    return {
      hasAccount: true,
      companySize,
      hasIndustry: !!account.industry,
      industryCategory: account.industry,
      revenueRange,
      hasWebsite: !!account.website,
      hasPhone: !!account.phone,
      hasAddress,
      accountDealCount: account.deals.length,
      accountTotalValue,
    };
  }

  private encodeRevenue(revenue: unknown): number {
    if (revenue === null || revenue === undefined) return 0;
    const val = Number(revenue);
    if (isNaN(val) || val <= 0) return 0;
    if (val < 10_000) return 1;
    if (val < 100_000) return 2;
    if (val < 1_000_000) return 3;
    if (val < 10_000_000) return 4;
    return 5;
  }

  private emptyFeatures(): FirmographicFeatures {
    return {
      hasAccount: false,
      companySize: 0,
      hasIndustry: false,
      industryCategory: null,
      revenueRange: 0,
      hasWebsite: false,
      hasPhone: false,
      hasAddress: false,
      accountDealCount: 0,
      accountTotalValue: 0,
    };
  }
}
