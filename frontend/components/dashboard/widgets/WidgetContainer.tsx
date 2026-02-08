/**
 * WidgetContainer - Wrapper for widgets with glassmorphism styling
 *
 * Features:
 * - Glassmorphism design with backdrop blur
 * - Drag handle (edit mode only)
 * - Remove button (edit mode only)
 * - Integrates with react-grid-layout
 * - Uses MUI theme colors
 * - Subtle hover lift animation (framer-motion)
 */

import { ReactNode } from 'react';
import { Box, IconButton, alpha, useTheme } from '@mui/material';
import { GripVertical, X } from 'lucide-react';
import { motion } from 'framer-motion';

export interface WidgetContainerProps {
    /** Widget ID */
    id: string;

    /** Widget content */
    children: ReactNode;

    /** Edit mode active */
    editMode?: boolean;

    /** Remove handler */
    onRemove?: () => void;
}

export function WidgetContainer({
    id: _id,
    children,
    editMode = false,
    onRemove,
}: WidgetContainerProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Box
            component={motion.div}
            whileHover={!editMode ? { y: -2, boxShadow: isDark ? `0 12px 40px ${alpha('#000', 0.4)}` : `0 12px 40px ${alpha(theme.palette.primary.main, 0.15)}` } : undefined}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            sx={{
                position: 'relative',
                height: '100%',
                width: '100%',
                // Glassmorphism base
                bgcolor: alpha(theme.palette.background.paper, isDark ? 0.7 : 0.85),
                backdropFilter: 'blur(12px)',
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                boxShadow: isDark
                    ? `0 8px 32px ${alpha('#000', 0.3)}`
                    : `0 8px 32px ${alpha(theme.palette.primary.main, 0.1)}`,
                overflow: 'hidden',
                // Edit mode styling
                ...(editMode && {
                    border: `2px dashed ${alpha(theme.palette.primary.main, 0.4)}`,
                    '&:hover': {
                        border: `2px dashed ${theme.palette.primary.main}`,
                        boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.2)}`,
                    },
                }),
            }}
        >
            {/* Drag Handle (Edit Mode Only) */}
            {editMode && (
                <Box
                    className="widget-drag-handle"
                    sx={{
                        position: 'absolute',
                        top: -8,
                        left: -8,
                        zIndex: 20,
                        cursor: 'grab',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.4)}`,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            bgcolor: 'primary.dark',
                            transform: 'scale(1.15)',
                        },
                        '&:active': {
                            cursor: 'grabbing',
                            transform: 'scale(0.95)',
                        },
                    }}
                >
                    <GripVertical size={14} />
                </Box>
            )}

            {/* Remove Button (Edit Mode Only) */}
            {editMode && onRemove && (
                <IconButton
                    size="small"
                    onClick={onRemove}
                    sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        zIndex: 20,
                        width: 28,
                        height: 28,
                        bgcolor: 'error.main',
                        color: 'error.contrastText',
                        boxShadow: `0 4px 12px ${alpha(theme.palette.error.main, 0.4)}`,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            bgcolor: 'error.dark',
                            transform: 'scale(1.15)',
                        },
                    }}
                    aria-label="Remove widget"
                >
                    <X size={14} />
                </IconButton>
            )}

            {/* Widget Content */}
            <Box sx={{ height: '100%', width: '100%' }}>
                {children}
            </Box>
        </Box>
    );
}
