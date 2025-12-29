import { useMemo, useCallback } from 'react';
import type { FolderGroup } from '@/components/email';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFoldersStore } from '@/stores/folders-store';
import { getFolderIcon as getIconForFolderUtil } from '@/lib/utils/folder-normalization';
import { Mail as MailIcon, Clock, Calendar as CalendarIcon, Paperclip, Star, Inbox } from 'lucide-react';
import type { EmailListParams } from '@/lib/api/email';
import type { EmailStats } from '@/lib/api/email';
import type { Provider } from '@/lib/api/folders';
import type { Folder } from '@/lib/api/folders';

export interface FolderItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    count?: number;
    color?: string;
    aggregate?: boolean;
    providerId?: string;
    providerEmail?: string;
    filterFolder?: string;
    specialUse?: string;
    path?: string;
    folderData?: Folder;
    queryOverrides?: Partial<EmailListParams>;
}

export interface SmartFilter {
    id: string;
    label: string;
    icon: React.ReactNode;
    count?: number;
    color?: string;
}

interface UseFolderLogicProps {
    emailStats: EmailStats | null;
    providers: Provider[];
}

export function useFolderLogic({ emailStats, providers }: UseFolderLogicProps) {
    const t = useTranslations();

    const foldersByProvider = useFoldersStore((state) => state.foldersByProvider);
    const providersById = useFoldersStore((state) => state.providersById);
    const countsByFolderId = useFoldersStore((state) => state.countsByFolderId);

    // Smart Filters
    const smartFilters = useMemo<SmartFilter[]>(() => {
        return [
            {
                id: 'smart:unread',
                label: t.email.quickFilters.unread,
                icon: <MailIcon size={18} />,
                color: '#0B7EFF',
                count: emailStats?.unread && emailStats.unread > 0 ? emailStats.unread : undefined,
            },
            {
                id: 'smart:today',
                label: t.email.quickFilters.today,
                icon: <Clock size={18} />,
                color: '#00C853',
                count: emailStats?.today && emailStats.today > 0 ? emailStats.today : undefined,
            },
            {
                id: 'smart:this-week',
                label: t.email.quickFilters.thisWeek,
                icon: <CalendarIcon size={18} />,
                color: '#9C27B0',
                count: emailStats?.thisWeek && emailStats.thisWeek > 0 ? emailStats.thisWeek : undefined,
            },
            {
                id: 'smart:attachments',
                label: t.email.quickFilters.hasAttachments,
                icon: <Paperclip size={18} />,
                color: '#FF9800',
                count: emailStats?.attachments && emailStats.attachments > 0 ? emailStats.attachments : undefined,
            },
            {
                id: 'smart:important',
                label: t.email.quickFilters.important,
                icon: <Star size={18} />,
                color: '#FFB300',
                count: emailStats?.important && emailStats.important > 0 ? emailStats.important : undefined,
            },
        ];
    }, [t, emailStats]);

    // Aggregator folders
    const aggregatorFolders = useMemo<FolderItem[]>(
        () => [
            {
                id: 'all:inbox',
                label: t.folders.inbox,
                icon: <Inbox size={20} />,
                aggregate: true,
                specialUse: 'INBOX',
                queryOverrides: { specialUse: 'INBOX' },
            },
            {
                id: 'all:starred',
                label: t.email.starredFolderLabel || t.folders.starred,
                icon: <Star size={20} />,
                color: '#FFB300',
                aggregate: true,
                queryOverrides: { isStarred: true },
            },
        ],
        [t]
    );

    // Smart Filter Folders
    const smartFilterFolders = useMemo<FolderItem[]>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // SECURITY: All smart filters should only query INBOX to exclude spam/junk
        const baseQuery: Partial<EmailListParams> = { specialUse: 'INBOX' };

        return smartFilters.map((filter) => {
            let queryOverrides: Partial<EmailListParams> = { ...baseQuery };

            switch (filter.id) {
                case 'smart:unread':
                    // Unread filter shows ALL unread emails except SPAM/JUNK/TRASH
                    // This includes UPDATES, PROMOTIONS, SOCIAL, etc. (Gmail categories)
                    queryOverrides = { isRead: false, excludeTrashSpam: true };
                    break;
                case 'smart:today':
                    queryOverrides = {
                        ...baseQuery,
                        startDate: today.toISOString(),
                        endDate: endOfToday.toISOString(),
                    };
                    break;
                case 'smart:this-week':
                    queryOverrides = {
                        ...baseQuery,
                        startDate: startOfWeek.toISOString(),
                        endDate: endOfWeek.toISOString(),
                    };
                    break;
                case 'smart:attachments':
                    queryOverrides = { ...baseQuery, hasAttachments: true };
                    break;
                case 'smart:important':
                    queryOverrides = { ...baseQuery, isImportant: true };
                    break;
            }

            return {
                id: filter.id,
                label: filter.label,
                icon: filter.icon,
                count: filter.count,
                color: filter.color,
                aggregate: true,
                queryOverrides,
            };
        });
    }, [smartFilters]);

    // Remote Folders
    const remoteFolders = useMemo<FolderItem[]>(() => {
        const items: FolderItem[] = [];
        Object.entries(foldersByProvider).forEach(([providerId, folders]) => {
            const providerEmail = providersById[providerId]?.email || '';
            folders.forEach((folder) => {
                // SECURITY: Skip spam/junk folders - dangerous for users to interact with
                const specialType = folder.specialUse?.toUpperCase();
                if (specialType === 'SPAM' || specialType === 'JUNK') {
                    return; // Skip this folder
                }

                const IconComponent = getIconForFolderUtil(folder.specialUse);
                const countOverride = countsByFolderId[`${providerId}:${folder.id}`];
                const canonicalFolder = folder.specialUse?.toUpperCase() || folder.path || folder.name;

                let label = folder.name;
                if (folder.specialUse) {
                    const type = folder.specialUse.toUpperCase();
                    if (type === 'INBOX') label = t.folders.inbox;
                    else if (type === 'SENT') label = t.folders.sent;
                    else if (type === 'DRAFTS') label = t.folders.drafts;
                    else if (type === 'TRASH') label = t.folders.trash;
                    else if (type === 'ARCHIVE') label = t.folders.archive;
                    else if (type === 'IMPORTANT') label = t.folders.starred;
                    else if (type === 'STARRED') label = t.folders.starred;
                }

                items.push({
                    id: folder.id,
                    label,
                    icon: <IconComponent size={20} />,
                    count: countOverride?.unreadCount ?? folder.unreadCount,
                    providerId: folder.providerId,
                    providerEmail,
                    filterFolder: canonicalFolder,
                    specialUse: folder.specialUse,
                    path: folder.path,
                    folderData: folder as Folder,
                    queryOverrides: {
                        providerId: folder.providerId,
                        folder: canonicalFolder,
                    },
                });
            });
        });
        return items;
    }, [foldersByProvider, providersById, countsByFolderId, t.folders]);

    // Combined Folders
    const combinedFolders = useMemo(
        () => [...smartFilterFolders, ...aggregatorFolders, ...remoteFolders],
        [smartFilterFolders, aggregatorFolders, remoteFolders]
    );

    // Folder Groups
    const folderGroups = useMemo<FolderGroup[]>(() => {
        const groups: FolderGroup[] = [];

        if (aggregatorFolders.length) {
            groups.push({
                providerId: 'all',
                providerEmail: t.email.allAccountsLabel,
                folders: aggregatorFolders,
            });
        }

        const providerMap = new Map<
            string,
            { providerId: string; providerEmail: string; folders: FolderItem[] }
        >();

        remoteFolders.forEach((folder) => {
            if (!folder.providerId) return;
            if (!providerMap.has(folder.providerId)) {
                providerMap.set(folder.providerId, {
                    providerId: folder.providerId,
                    providerEmail: folder.providerEmail || t.email.noProviders,
                    folders: [],
                });
            }
            providerMap.get(folder.providerId)!.folders.push(folder);
        });

        groups.push(
            ...Array.from(providerMap.values()).sort((a, b) =>
                a.providerEmail.localeCompare(b.providerEmail)
            )
        );

        return groups;
    }, [aggregatorFolders, remoteFolders, t]);

    // Get Provider Icon
    const getProviderIcon = useCallback((providerId: string) => {
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) return null;

        if (provider.providerType === 'google') {
            return (
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
            );
        }

        if (provider.providerType === 'microsoft') {
            return (
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#f25022" d="M1 1h10v10H1z" />
                    <path fill="#00a4ef" d="M13 1h10v10H13z" />
                    <path fill="#7fba00" d="M1 13h10v10H1z" />
                    <path fill="#ffb900" d="M13 13h10v10H13z" />
                </svg>
            );
        }

        return null;
    }, [providers]);

    return {
        smartFilters,
        aggregatorFolders,
        smartFilterFolders,
        remoteFolders,
        combinedFolders,
        folderGroups,
        getProviderIcon
    };
}
