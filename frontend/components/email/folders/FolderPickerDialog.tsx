/**
 * Folder Picker Dialog
 *
 * Dialog for moving emails to a folder.
 * Shows a list of available folders grouped by provider.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    CircularProgress,
    Alert,
    TextField,
    InputAdornment,
    Divider,
} from '@mui/material';
import { FolderInput, Search, Check, Folder } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useFolders, useBulkMoveEmails } from '@/hooks/queries';
import { useUserPreferences } from '@/hooks/queries/use-settings';
import type { Folder as IFolder } from '@/lib/api/folders';
import { getFolderTargetValue, matchesFolderValue } from '../utils/folder-targets';
import {
    canMoveToFolder,
    createFolderLabelGetter,
    getFolderDisplayName,
    sortFoldersByOrder,
    type FolderTranslations,
} from './folder-utils';

interface FolderPickerDialogProps {
    open: boolean;
    onClose: () => void;
    emailIds: string[];
    onSuccess?: () => void;
    onMove?: (params: { emailIds: string[]; targetFolder: string }) => Promise<void>;
    /** Current persisted folder value of the selected emails (optional) */
    currentFolderValue?: string;
    /** Provider ID to filter folders - only show folders from this provider */
    providerId?: string;
}

export function FolderPickerDialog({
    open,
    onClose,
    emailIds,
    onSuccess,
    onMove,
    currentFolderValue,
    providerId,
}: FolderPickerDialogProps) {
    const t = useTranslations();
    const getFolderLabel = useMemo(
        () => createFolderLabelGetter(t as FolderTranslations),
        [t]
    );

    // Fetch folders
    const { data, isLoading: isLoadingFolders } = useFolders();
    const { data: preferences } = useUserPreferences();
    const providers = data?.providers || [];

    const foldersByProvider = useMemo(() => data?.foldersByProvider || {}, [data]);

    // Selected folder to move to
    const [selectedFolderValue, setSelectedFolderValue] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Bulk mutation
    const moveEmails = useBulkMoveEmails();
    const isSubmitting = moveEmails.isPending;

    // Reset state when dialog opens
    const handleEnter = useCallback(() => {
        setSelectedFolderValue(null);
        setSearch('');
        setError(null);
    }, []);

    // Filter folders by:
    // 1. Provider ID (if specified) - only show folders from the same provider as selected emails
    // 2. Search term
    // 3. Exclude pseudo-destinations such as system categories/state labels.
    //    Keep only canonical system destinations (Inbox/Archive) plus user folders.
    const filteredFoldersByProvider = useMemo(() => {
        if (!foldersByProvider) return {};

        const searchLower = search.trim().toLowerCase();
        const result: Record<string, IFolder[]> = {};

        Object.entries(foldersByProvider).forEach(([provId, folders]) => {
            // Filter by provider if specified (emails can only move within same provider)
            if (providerId && provId !== providerId) {
                return; // Skip folders from other providers
            }

            const filtered = folders.filter((folder) => {
                if (!canMoveToFolder(folder)) {
                    return false;
                }
                // Apply search filter if provided
                const displayName = getFolderDisplayName(folder, getFolderLabel).toLowerCase();
                const folderPath = folder.path.toLowerCase();
                if (searchLower && !displayName.includes(searchLower) && !folderPath.includes(searchLower)) {
                    return false;
                }
                return true;
            });
            if (filtered.length > 0) {
                const orderIds = preferences?.folderOrders?.[provId];
                result[provId] = sortFoldersByOrder(filtered, orderIds);
            }
        });

        return result;
    }, [foldersByProvider, getFolderLabel, preferences?.folderOrders, search, providerId]);

    const visibleProviderIds = useMemo(
        () => Object.keys(filteredFoldersByProvider),
        [filteredFoldersByProvider]
    );

    // Handle folder selection
    const handleSelect = useCallback((targetFolder: string) => {
        setSelectedFolderValue(targetFolder);
    }, []);

    // Submit move
    const handleSubmit = useCallback(async () => {
        if (!selectedFolderValue) return;

        try {
            if (onMove) {
                await onMove({ emailIds, targetFolder: selectedFolderValue });
            } else {
                await moveEmails.mutateAsync({
                    emailIds,
                    targetFolder: selectedFolderValue,
                });
            }
            onSuccess?.();
            onClose();
        } catch {
            setError(t.email?.messages?.moveFailed || 'Failed to move emails');
        }
    }, [selectedFolderValue, emailIds, moveEmails, onMove, onSuccess, onClose, t]);

    const emailCount = emailIds.length;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
            slotProps={{
                transition: {
                    onEnter: handleEnter,
                },
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FolderInput size={20} />
                {t.emailList?.moveToFolder || 'Move to folder'}
            </DialogTitle>

            <DialogContent dividers>
                {/* Email count info */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {emailCount === 1
                        ? 'Move 1 email to...'
                        : `Move ${emailCount} emails to...`}
                </Typography>

                {/* Search */}
                <TextField
                    size="small"
                    fullWidth
                    placeholder={t.email?.labels?.searchLabels || 'Search folders...'} // Reusing label search placeholder or generic
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search size={18} />
                            </InputAdornment>
                        ),
                    }}
                    sx={{ mb: 2 }}
                />

                {/* Error */}
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {/* Loading */}
                {isLoadingFolders ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={32} />
                    </Box>
                ) : Object.keys(filteredFoldersByProvider).length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                            {t.emailList?.emptySearch || 'No folders found'}
                        </Typography>
                    </Box>
                ) : (
                    <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                        {providers.map((provider) => {
                            const providerFolders = filteredFoldersByProvider[provider.id];
                            if (!providerFolders?.length) return null;

                            return (
                                <React.Fragment key={provider.id}>
                                    {/* Provider Header (if multiple providers) */}
                                    {visibleProviderIds.length > 1 && (
                                        <ListItem sx={{ bgcolor: 'action.hover' }}>
                                            <Typography variant="caption" fontWeight="bold">
                                                {provider.email}
                                            </Typography>
                                        </ListItem>
                                    )}

                                    {providerFolders.map((folder) => {
                                        const targetFolderValue = getFolderTargetValue(folder);
                                        const isSelected = selectedFolderValue === targetFolderValue;
                                        const isCurrent = matchesFolderValue(folder, currentFolderValue);
                                        const displayName = getFolderDisplayName(folder, getFolderLabel);
                                        const secondaryText =
                                            isCurrent
                                                ? '(Current)'
                                                : !folder.isSystem && folder.path !== displayName
                                                    ? folder.path
                                                    : undefined;

                                        return (
                                            <ListItem
                                                key={folder.id}
                                                disablePadding
                                            >
                                                <ListItemButton
                                                    onClick={() => handleSelect(targetFolderValue)}
                                                    selected={isSelected}
                                                    disabled={isCurrent}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                                        <Folder size={20} />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={displayName}
                                                        secondary={secondaryText}
                                                    />
                                                    {isSelected && <Check size={16} />}
                                                </ListItemButton>
                                            </ListItem>
                                        );
                                    })}
                                    {visibleProviderIds.length > 1 && <Divider />}
                                </React.Fragment>
                            );
                        })}
                    </List>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={isSubmitting}>
                    {t.common.cancel}
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={isSubmitting || !selectedFolderValue}
                    startIcon={
                        isSubmitting ? (
                            <CircularProgress size={16} />
                        ) : (
                            <Check size={16} />
                        )
                    }
                >
                    {isSubmitting
                        ? t.common.processing || 'Moving...'
                        : t.email?.messages?.move || 'Move'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default FolderPickerDialog;
