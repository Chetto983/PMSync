import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * ProviderValidationService - Shared provider validation logic
 *
 * Consolidates duplicate provider validation code from multiple services:
 * - email-send.service.ts
 * - emails.controller.ts
 * - email-sync-back.service.ts
 *
 * @see EMAIL_MODULE_ROADMAP.md DUP-3
 */
@Injectable()
export class ProviderValidationService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Ensure provider exists, belongs to tenant, is active, and supports email.
     *
     * @param tenantId - The tenant's unique identifier
     * @param providerId - The provider configuration ID
     * @returns The validated provider configuration
     * @throws NotFoundException if provider is not found, inactive, or doesn't support email
     *
     * @example
     * ```typescript
     * const provider = await validationService.getActiveEmailProvider(tenantId, providerId);
     * // Send email using provider.email, provider.providerType
     * ```
     */
    async getActiveEmailProvider(tenantId: string, providerId: string) {
        const provider = await this.prisma.providerConfig.findFirst({
            where: {
                id: providerId,
                tenantId,
                isActive: true,
                supportsEmail: true,
            },
        });

        if (!provider) {
            throw new NotFoundException(
                `Email provider ${providerId} not found, inactive, or not configured for email`,
            );
        }

        return provider;
    }

    /**
     * Get provider without email requirement (for calendar-only operations)
     */
    async getActiveProvider(tenantId: string, providerId: string) {
        const provider = await this.prisma.providerConfig.findFirst({
            where: {
                id: providerId,
                tenantId,
                isActive: true,
            },
        });

        if (!provider) {
            throw new NotFoundException('Provider not found or inactive for tenant');
        }

        return provider;
    }

    /**
     * Ensure multiple providers are active
     */
    async ensureProvidersActive(tenantId: string, providerIds: string[]): Promise<void> {
        if (!providerIds.length) return;

        const unique = [...new Set(providerIds)];
        const providers = await this.prisma.providerConfig.findMany({
            where: {
                id: { in: unique },
                tenantId,
                isActive: true,
            },
            select: { id: true },
        });

        if (providers.length !== unique.length) {
            const foundIds = new Set(providers.map((p) => p.id));
            const missing = unique.filter((id) => !foundIds.has(id));
            throw new BadRequestException(`Inactive or missing providers: ${missing.join(', ')}`);
        }
    }

    /**
     * Validate provider exists and belongs to tenant (without active check)
     * Used for internal operations where inactive providers might still need processing
     */
    async getProviderForTenant(tenantId: string, providerId: string) {
        const provider = await this.prisma.providerConfig.findFirst({
            where: { id: providerId, tenantId },
        });

        if (!provider) {
            throw new NotFoundException(`Provider ${providerId} not found for tenant`);
        }

        return provider;
    }
}
