import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSignatureDto, UpdateSignatureDto } from '../dto/signature.dto';

@Injectable()
export class EmailSignatureService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new signature
   * If isDefault=true, unsets other defaults for same provider scope
   */
  async create(tenantId: string, userId: string, dto: CreateSignatureDto) {
    // If setting as default, unset existing defaults for this provider scope
    if (dto.isDefault) {
      await this.prisma.emailSignature.updateMany({
        where: {
          tenantId,
          userId,
          providerId: dto.providerId ?? null,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailSignature.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        content: dto.content,
        providerId: dto.providerId ?? null,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  /**
   * Get all signatures for a user, optionally filtered by provider
   */
  async findAll(tenantId: string, userId: string, providerId?: string) {
    return this.prisma.emailSignature.findMany({
      where: {
        tenantId,
        userId,
        ...(providerId !== undefined && { providerId }),
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get a single signature by ID
   */
  async findOne(tenantId: string, userId: string, id: string) {
    const signature = await this.prisma.emailSignature.findFirst({
      where: { id, tenantId, userId },
    });

    if (!signature) {
      throw new NotFoundException('Signature not found');
    }

    return signature;
  }

  /**
   * Get the default signature for a provider (or global if no provider-specific default)
   * Falls back to first available signature if no default is set
   */
  async findDefault(tenantId: string, userId: string, providerId?: string) {
    // First try provider-specific default
    if (providerId) {
      const providerDefault = await this.prisma.emailSignature.findFirst({
        where: { tenantId, userId, providerId, isDefault: true },
      });
      if (providerDefault) return providerDefault;
    }

    // Try global default (providerId = null)
    const globalDefault = await this.prisma.emailSignature.findFirst({
      where: { tenantId, userId, providerId: null, isDefault: true },
    });
    if (globalDefault) return globalDefault;

    // Fall back to ANY default signature (in case user has one with isDefault=true but different providerId)
    const anyDefault = await this.prisma.emailSignature.findFirst({
      where: { tenantId, userId, isDefault: true },
    });
    if (anyDefault) return anyDefault;

    // Ultimate fallback: return the first signature if no default is set
    // This ensures signature shows even if user forgot to mark as default
    return this.prisma.emailSignature.findFirst({
      where: { tenantId, userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Update a signature
   */
  async update(tenantId: string, userId: string, id: string, dto: UpdateSignatureDto) {
    // Verify signature exists and belongs to user
    await this.findOne(tenantId, userId, id);

    // If setting as default, unset existing defaults
    if (dto.isDefault) {
      const current = await this.prisma.emailSignature.findUnique({ where: { id } });
      await this.prisma.emailSignature.updateMany({
        where: {
          tenantId,
          userId,
          providerId: dto.providerId ?? current?.providerId ?? null,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailSignature.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Delete a signature
   */
  async delete(tenantId: string, userId: string, id: string) {
    // Verify signature exists and belongs to user
    await this.findOne(tenantId, userId, id);

    await this.prisma.emailSignature.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Set a signature as the default (unsets other defaults in same scope)
   */
  async setDefault(tenantId: string, userId: string, id: string) {
    const signature = await this.findOne(tenantId, userId, id);

    // Unset other defaults for same provider scope
    await this.prisma.emailSignature.updateMany({
      where: {
        tenantId,
        userId,
        providerId: signature.providerId,
        isDefault: true,
        id: { not: id },
      },
      data: { isDefault: false },
    });

    // Set this one as default
    return this.prisma.emailSignature.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  /**
   * Get signature content for appending to email
   * Returns HTML content or null if no signature found
   */
  async getSignatureForSend(
    tenantId: string,
    userId: string,
    signatureId?: string | null,
    providerId?: string,
  ): Promise<string | null> {
    // If explicit signatureId provided
    if (signatureId) {
      const signature = await this.prisma.emailSignature.findFirst({
        where: { id: signatureId, tenantId, userId },
      });
      return signature?.content ?? null;
    }

    // If signatureId is explicitly null, no signature
    if (signatureId === null) {
      return null;
    }

    // Otherwise use default
    const defaultSig = await this.findDefault(tenantId, userId, providerId);
    return defaultSig?.content ?? null;
  }
}
