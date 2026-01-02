/**
 * LayoutPresets - Layout selector component
 *
 * Features:
 * - Preset selection
 * - Preview thumbnails with icons
 * - Uses TanStack Query for persistence
 */

'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Card,
    CardActionArea,
    CardContent,
    Typography,
    Box,
} from '@mui/material';
import { LAYOUT_PRESETS, PRESET_METADATA, PresetMetadata } from '@/lib/dashboard/presets';
import { Layout, CheckSquare, Mail, Zap, BarChart3 } from 'lucide-react';
import { useSaveDashboardLayout } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';

interface LayoutPresetsProps {
    open: boolean;
    onClose: () => void;
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
    default: <Layout size={24} />,
    executive: <BarChart3 size={24} />,
    productivity: <CheckSquare size={24} />,
    communication: <Mail size={24} />,
    minimal: <Zap size={24} />,
    analytics: <BarChart3 size={24} />,
};

export function LayoutPresets({ open, onClose }: LayoutPresetsProps) {
    const t = useTranslations();
    const saveLayout = useSaveDashboardLayout();

    const handleApplyPreset = (presetMeta: PresetMetadata) => {
        const layoutConfig = LAYOUT_PRESETS[presetMeta.id];
        if (layoutConfig) {
            saveLayout.mutate(layoutConfig.widgets, {
                onSuccess: () => {
                    onClose();
                },
            });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{t.dashboard?.actions?.layouts || 'Choose a Layout'}</DialogTitle>
            <DialogContent dividers>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                        gap: 2,
                    }}
                >
                    {Object.values(PRESET_METADATA).map((preset) => (
                        <Card key={preset.id} variant="outlined" sx={{ height: '100%' }}>
                            <CardActionArea
                                onClick={() => handleApplyPreset(preset)}
                                disabled={saveLayout.isPending}
                                sx={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    justifyContent: 'flex-start',
                                }}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                                        <Box sx={{ color: 'primary.main' }}>
                                            {PRESET_ICONS[preset.id] || <Layout size={24} />}
                                        </Box>
                                        <Typography variant="h6" component="div">
                                            {preset.name}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        {preset.description}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    ))}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t.common?.cancel || 'Cancel'}</Button>
            </DialogActions>
        </Dialog>
    );
}

export default LayoutPresets;
