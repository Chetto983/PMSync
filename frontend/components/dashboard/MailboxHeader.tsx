import React from 'react';
import {
    Stack,
    IconButton,
    Box,
    Typography,
    Button,
    Tooltip,
    CircularProgress,
    Paper,
    Alert,
} from '@mui/material';
import {
    Menu,
    Filter,
    MessageSquare,
    Mail as MailListIcon,
    RefreshCcw
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { type EmailStats } from '@/lib/api/email';

interface MailboxHeaderProps {
    isMobile: boolean;
    setMobileSidebarOpen: (open: boolean) => void;
    isConnected: boolean;
    emailStats: EmailStats | undefined;
    setAdvancedSearchOpen: (open: boolean) => void;
    isConversationView: boolean;
    toggleConversationView: () => void;
    handleSyncProviders: () => void;
    syncLoading: boolean;
}

export function MailboxHeader({
    isMobile,
    setMobileSidebarOpen,
    isConnected,
    emailStats,
    setAdvancedSearchOpen,
    isConversationView,
    toggleConversationView,
    handleSyncProviders,
    syncLoading
}: MailboxHeaderProps) {
    const t = useTranslations();

    return (
        <Paper
            elevation={0}
            sx={{
                px: { xs: 1, sm: 2 },
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                flexShrink: 0,
                overflow: 'hidden',
            }}
        >
            {/* Compact header: Row 1 - Status + Stats + Actions */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                {/* Hamburger Menu - Mobile Only */}
                {isMobile && (
                    <IconButton
                        size="small"
                        onClick={() => setMobileSidebarOpen(true)}
                        aria-label={t.email.list.openSidebar}
                    >
                        <Menu size={18} />
                    </IconButton>
                )}
                {/* Connection Status - Compact */}
                <Box
                    component="span"
                    sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: isConnected ? 'success.main' : 'warning.main',
                        flexShrink: 0,
                    }}
                    aria-label={isConnected ? t.email.realtime.live : t.email.realtime.reconnecting}
                />
                {/* Stats - Desktop only, compact */}
                {!isMobile && emailStats && (
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {emailStats.unread > 0 ? `${emailStats.unread} unread` : `${emailStats.total} emails`}
                    </Typography>
                )}

                {/* Action buttons - icons only on mobile */}
                <IconButton
                    size="small"
                    onClick={() => setAdvancedSearchOpen(true)}
                    sx={{ display: { xs: 'flex', sm: 'none' } }}
                    aria-label={t.email.advancedSearch.title}
                >
                    <Filter size={18} />
                </IconButton>
                <Button
                    size="small"
                    variant="text"
                    onClick={() => setAdvancedSearchOpen(true)}
                    startIcon={<Filter size={14} />}
                    sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0, px: 1 }}
                >
                    {t.email.advancedSearch.title}
                </Button>
                {/* Conversation/Email View Toggle */}
                <Tooltip title={isConversationView ? 'Switch to Email List' : 'Switch to Conversation View'}>
                    <IconButton
                        size="small"
                        onClick={toggleConversationView}
                        color={isConversationView ? 'primary' : 'default'}
                        aria-label={isConversationView ? 'Conversation view active' : 'Email list view active'}
                        sx={{
                            border: 1,
                            borderColor: isConversationView ? 'primary.main' : 'divider',
                            borderRadius: 1,
                        }}
                    >
                        {isConversationView ? <MessageSquare size={16} /> : <MailListIcon size={16} />}
                    </IconButton>
                </Tooltip>
                <IconButton
                    size="small"
                    onClick={handleSyncProviders}
                    disabled={syncLoading}
                    aria-label={t.email.actions.syncNow}
                >
                    {syncLoading ? <CircularProgress size={16} /> : <RefreshCcw size={18} />}
                </IconButton>
            </Stack>
            {/* Connection warning - only when disconnected */}
            {!isConnected && (
                <Alert severity="warning" variant="outlined" sx={{ mt: 1, py: 0.5 }}>
                    {t.email.realtime.disconnectedNotice}
                </Alert>
            )}
        </Paper>
    );
}
