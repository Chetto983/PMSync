import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * RFC 6154 special-use folder types
 */
export type SpecialUse = 'INBOX' | 'SENT' | 'DRAFTS' | 'TRASH' | 'SPAM' | 'ARCHIVE' | 'JUNK';

/**
 * FolderLookupService - Shared folder lookup logic
 *
 * Consolidates duplicate folder lookup code from multiple services:
 * - email-sync-back.service.ts (getImapFolderPath, getMicrosoftFolderId)
 * - email-send.service.ts (getSentFolderName)
 * - emails.service.ts (getTrashFolderPath)
 *
 * Uses RFC 6154 specialUse attribute for cross-provider folder normalization.
 *
 * @see EMAIL_MODULE_ROADMAP.md DUP-4
 */
@Injectable()
export class FolderLookupService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Find folder by RFC 6154 specialUse attribute
     */
    async findBySpecialUse(
        providerId: string,
        specialUse: SpecialUse,
    ): Promise<{ id: string; path: string; name: string } | null> {
        return this.prisma.folder.findFirst({
            where: {
                providerId,
                specialUse: { equals: specialUse, mode: 'insensitive' },
            },
            select: { id: true, path: true, name: true },
        });
    }

    /**
     * Get folder path by specialUse, with fallback
     */
    async getFolderPath(
        providerId: string,
        specialUse: SpecialUse,
        fallback: string,
    ): Promise<string> {
        const folder = await this.findBySpecialUse(providerId, specialUse);
        return folder?.path || fallback;
    }

    /**
     * Get trash folder path for provider
     */
    async getTrashFolderPath(providerId: string): Promise<string> {
        return this.getFolderPath(providerId, 'TRASH', 'Trash');
    }

    /**
     * Get sent folder path for provider
     */
    async getSentFolderPath(providerId: string): Promise<string> {
        return this.getFolderPath(providerId, 'SENT', 'Sent');
    }

    /**
     * Get drafts folder path for provider
     */
    async getDraftsFolderPath(providerId: string): Promise<string> {
        return this.getFolderPath(providerId, 'DRAFTS', 'Drafts');
    }

    /**
     * Get inbox folder path for provider
     */
    async getInboxFolderPath(providerId: string): Promise<string> {
        return this.getFolderPath(providerId, 'INBOX', 'INBOX');
    }

    /**
     * Get multiple folder paths by specialUse types
     */
    async getFolderPathsBySpecialUse(
        tenantId: string,
        specialUses: SpecialUse[],
        providerId?: string,
    ): Promise<string[]> {
        const folders = await this.prisma.folder.findMany({
            where: {
                provider: { tenantId, ...(providerId && { id: providerId }) },
                specialUse: { in: specialUses, mode: 'insensitive' },
            },
            select: { path: true },
        });
        return folders.map((f) => f.path);
    }

    /**
     * Find folder by path, name, or specialUse (for flexible matching)
     */
    async findFolder(
        providerId: string,
        folderIdentifier: string,
    ): Promise<{ id: string; path: string; name: string; specialUse: string | null } | null> {
        return this.prisma.folder.findFirst({
            where: {
                providerId,
                OR: [
                    { path: { equals: folderIdentifier, mode: 'insensitive' } },
                    { specialUse: { equals: folderIdentifier, mode: 'insensitive' } },
                    { name: { equals: folderIdentifier, mode: 'insensitive' } },
                ],
            },
            select: { id: true, path: true, name: true, specialUse: true },
        });
    }
}
