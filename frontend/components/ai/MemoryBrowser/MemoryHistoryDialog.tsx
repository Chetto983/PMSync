'use client';

import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    CircularProgress,
    List,
    ListItem,
    Chip,
    useTheme,
    alpha,
    Divider,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useMemoryHistory } from '@/hooks/queries/use-memories';
import { Clock, ArrowRight } from 'lucide-react';

interface MemoryHistoryDialogProps {
    memoryId: string | null;
    open: boolean;
    onClose: () => void;
}

export function MemoryHistoryDialog({ memoryId, open, onClose }: MemoryHistoryDialogProps) {
    const theme = useTheme();
    const t = useTranslations();
    const { data: history, isPending } = useMemoryHistory(memoryId || '', open);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString(t.locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'CREATE': return t.ai.memoryBrowser.history.action.CREATE;
            case 'UPDATE': return t.ai.memoryBrowser.history.action.UPDATE;
            case 'DELETE': return t.ai.memoryBrowser.history.action.DELETE;
            default: return action;
        }
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATE': return 'success';
            case 'UPDATE': return 'info';
            case 'DELETE': return 'error';
            default: return 'default';
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Clock size={20} />
                {t.ai.memoryBrowser.history.title}
            </DialogTitle>

            <DialogContent dividers>
                {isPending ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : !history || history.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        <Typography variant="body2">{t.ai.memoryBrowser.history.noHistory}</Typography>
                    </Box>
                ) : (
                    <List disablePadding>
                        {history.map((item, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && <Divider component="li" />}
                                <ListItem sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                                        <Chip
                                            label={getActionLabel(item.action)}
                                            size="small"
                                            color={getActionColor(item.action) as any}
                                            variant="outlined"
                                        />
                                        <Typography variant="caption" color="text.secondary">
                                            {formatDate(item.createdAt)}
                                        </Typography>
                                    </Box>

                                    {item.action === 'UPDATE' && item.previousValue && (
                                        <Box sx={{ width: '100%', mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                {t.ai.memoryBrowser.history.previousValue}
                                            </Typography>
                                            <Box sx={{
                                                p: 1.5,
                                                bgcolor: alpha(theme.palette.error.main, 0.05),
                                                borderRadius: 1,
                                                color: 'text.secondary',
                                                typography: 'body2',
                                                textDecoration: 'line-through'
                                            }}>
                                                {item.previousValue}
                                            </Box>

                                            <Box sx={{ display: 'flex', justifyContent: 'center', my: 1, opacity: 0.5 }}>
                                                <ArrowRight size={16} />
                                            </Box>

                                            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                                {t.ai.memoryBrowser.history.newValue}
                                            </Typography>
                                            <Box sx={{
                                                p: 1.5,
                                                bgcolor: alpha(theme.palette.success.main, 0.05),
                                                borderRadius: 1,
                                                typography: 'body2'
                                            }}>
                                                {item.newValue}
                                            </Box>
                                        </Box>
                                    )}

                                    {item.action === 'CREATE' && (
                                        <Typography variant="body2" sx={{ mt: 1 }}>
                                            {item.newValue || item.previousValue}
                                        </Typography>
                                    )}
                                </ListItem>
                            </React.Fragment>
                        ))}
                    </List>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>{t.ai.mentions?.close || 'Close'}</Button>
            </DialogActions>
        </Dialog>
    );
}
