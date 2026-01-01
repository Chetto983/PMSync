'use client';

import React from 'react';
import { Box, Typography, List, ListItem, ListItemText, LinearProgress } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { usePatterns } from '@/hooks/queries/use-memories';

export function PatternsTab() {
    const t = useTranslations();
    const { data: patterns, isPending } = usePatterns();

    if (isPending) {
        return <LinearProgress />;
    }

    if (!patterns || patterns.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">
                    {t.ai.memoryBrowser.patterns.noPatterns}
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Typography variant="h6">{t.ai.memoryBrowser.patterns.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {t.ai.memoryBrowser.patterns.subtitle}
                </Typography>
            </Box>

            <List>
                {patterns.map((p, index) => (
                    <ListItem key={p.id || index} sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}>
                        <ListItemText
                            primary={p.trigger}
                            secondary={`${p.taskType} - Success: ${Math.round(p.successRate * 100)}%`}
                        />
                    </ListItem>
                ))}
            </List>
        </Box>
    );
}
