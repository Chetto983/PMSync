/**
 * WidgetLibrary - Slide-out drawer for adding widgets
 *
 * Features:
 * - Categorized widget list
 * - Search/Filter
 * - Click to add
 * - Modern MUI v6+ practices (slotProps)
 * - TanStack Query for layout management
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    TextField,
    Tabs,
    Tab,
    Card,
    CardContent,
    Button,
    Stack,
    InputAdornment,
} from '@mui/material';
import {
    X,
    Search,
    Plus,
    Sparkles,
    LayoutDashboard,
    Calendar,
    Mail,
    CheckSquare,
    Users,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDashboardPreferences, useSaveDashboardLayout } from '@/hooks/queries';
import { WIDGET_REGISTRY, type WidgetCategory, WIDGET_SIZE_PRESETS } from '@/lib/dashboard/widget-registry';
import { findNextAvailablePosition, type WidgetLayout } from '@/lib/dashboard/layout-engine';

// ============================================================================
// Types
// ============================================================================

interface WidgetLibraryProps {
    open: boolean;
    onClose: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_ICONS: Record<WidgetCategory, React.ReactNode> = {
    email: <Mail size={20} />,
    calendar: <Calendar size={20} />,
    ai: <Sparkles size={20} />,
    crm: <Users size={20} />,
    analytics: <LayoutDashboard size={20} />,
    actions: <CheckSquare size={20} />,
    general: <LayoutDashboard size={20} />,
    communication: <Mail size={20} />,
    productivity: <CheckSquare size={20} />,
};

// ============================================================================
// Component
// ============================================================================

export function WidgetLibrary({ open, onClose }: WidgetLibraryProps) {
    const t = useTranslations();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<WidgetCategory | 'all'>('all');

    // TanStack Query for layout
    const { data: dashboardLayout } = useDashboardPreferences();
    const saveLayout = useSaveDashboardLayout();

    const currentLayout = dashboardLayout?.widgets || [];
    const visibleWidgets = currentLayout.map((w) => w.i);

    // Memoized filtered widgets
    const filteredWidgets = useMemo(() => {
        return Object.values(WIDGET_REGISTRY).filter((widget) => {
            const matchesSearch =
                widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                widget.description.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === 'all' || widget.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    }, [searchQuery, selectedCategory]);

    // Handle adding a widget
    const handleAddWidget = useCallback(
        (widgetId: string) => {
            const widgetDef = WIDGET_REGISTRY[widgetId];
            if (!widgetDef) return;

            // Generate unique instance ID
            const instanceId = `${widgetId}-${Date.now()}`;

            // Get widget size from presets
            const size = WIDGET_SIZE_PRESETS[widgetDef.defaultSize] || { w: 3, h: 2 };

            // Find next available position
            const position = findNextAvailablePosition(currentLayout, size);

            // Create new widget layout
            const newWidget: WidgetLayout = {
                i: instanceId,
                widgetId,
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                minW: widgetDef.minSize.w,
                minH: widgetDef.minSize.h,
                maxW: widgetDef.maxSize.w,
                maxH: widgetDef.maxSize.h,
            };

            // Add to layout
            const newLayout = [...currentLayout, newWidget];
            saveLayout.mutate(newLayout);

            // Close drawer after adding
            onClose();
        },
        [currentLayout, saveLayout, onClose]
    );

    const categories: { value: WidgetCategory | 'all'; label: string }[] = [
        { value: 'all', label: t.dashboard?.widgets?.categories?.all || 'All' },
        { value: 'email', label: t.dashboard?.widgets?.categories?.email || 'Email' },
        { value: 'calendar', label: t.dashboard?.widgets?.categories?.calendar || 'Calendar' },
        { value: 'ai', label: t.dashboard?.widgets?.categories?.ai || 'AI' },
        { value: 'crm', label: t.dashboard?.widgets?.categories?.crm || 'CRM' },
        { value: 'analytics', label: t.dashboard?.widgets?.categories?.analytics || 'Analytics' },
        { value: 'actions', label: t.dashboard?.widgets?.categories?.actions || 'Actions' },
    ];

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: { width: { xs: '100%', sm: 400 } },
            }}
        >
            <Box
                sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Typography variant="h6">
                    {t.dashboard?.widgets?.addWidget || 'Add Widget'}
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <X size={20} />
                </IconButton>
            </Box>

            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <TextField
                    fullWidth
                    placeholder={t.dashboard?.widgets?.searchPlaceholder || 'Search widgets...'}
                    size="small"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search size={18} />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                    value={selectedCategory}
                    onChange={(_, v) => setSelectedCategory(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ minHeight: 48 }}
                >
                    {categories.map((cat) => (
                        <Tab
                            key={cat.value}
                            value={cat.value}
                            label={cat.label}
                            sx={{ minHeight: 48, textTransform: 'none' }}
                        />
                    ))}
                </Tabs>
            </Box>

            <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
                <Stack spacing={2}>
                    {filteredWidgets.map((widget) => {
                        // Check if widget is already added
                        const isAdded = visibleWidgets.some((id) => id.startsWith(widget.id));
                        const CategoryIcon = CATEGORY_ICONS[widget.category] || <LayoutDashboard size={20} />;

                        return (
                            <Card key={widget.id} variant="outlined">
                                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                    <Stack direction="row" spacing={2} alignItems="flex-start">
                                        <Box
                                            sx={{
                                                p: 1.5,
                                                borderRadius: 1,
                                                bgcolor: 'action.hover',
                                                color: 'primary.main',
                                                display: 'flex',
                                            }}
                                        >
                                            {CategoryIcon}
                                        </Box>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="subtitle1" component="div">
                                                {widget.name}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                                {widget.description}
                                            </Typography>
                                            <Button
                                                variant={isAdded ? 'outlined' : 'contained'}
                                                size="small"
                                                startIcon={<Plus size={16} />}
                                                onClick={() => handleAddWidget(widget.id)}
                                                fullWidth
                                                disabled={saveLayout.isPending}
                                            >
                                                {isAdded
                                                    ? (t.dashboard?.widgets?.addAnother || 'Add Another')
                                                    : (t.dashboard?.widgets?.addToDashboard || 'Add to Dashboard')}
                                            </Button>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {filteredWidgets.length === 0 && (
                        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                            <Typography>
                                {t.dashboard?.widgets?.noResults || 'No widgets found matching your search.'}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </Box>
        </Drawer>
    );
}

export default WidgetLibrary;
