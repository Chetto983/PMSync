/**
 * DashboardGrid - Responsive drag-and-drop grid using react-grid-layout
 *
 * Features:
 * - Drag-and-drop widget reordering
 * - Resize widgets
 * - Responsive breakpoints
 * - Edit mode toggle
 *
 * @see https://github.com/react-grid-layout/react-grid-layout
 * @see https://www.antstack.com/blog/building-customizable-dashboard-widgets-using-react-grid-layout/
 */

'use client';

import { ReactNode, useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RGL = require('react-grid-layout');
const WidthProvider = RGL.WidthProvider;
const ResponsiveGridLayout = WidthProvider(RGL.ResponsiveGridLayout);
import type { WidgetLayout } from '@/lib/dashboard/layout-engine';

// Import react-grid-layout styles
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Layout item type matching react-grid-layout
interface GridLayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    static?: boolean;
    isDraggable?: boolean;
    isResizable?: boolean;
}

type Layouts = { [breakpoint: string]: GridLayoutItem[] };

// ============================================================================
// Types
// ============================================================================

export interface DashboardGridProps {
    /** Grid layout configuration */
    layout: WidgetLayout[];

    /** Layout change handler - called on drag/resize */
    onLayoutChange: (layout: WidgetLayout[]) => void;

    /** Edit mode - enables drag and resize */
    editMode?: boolean;

    /** Children (widgets) - must have matching keys */
    children: ReactNode;

    /** Row height in pixels */
    rowHeight?: number;

    /** Number of columns */
    cols?: number;
}

// ============================================================================
// Constants
// ============================================================================

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const MARGIN: [number, number] = [16, 16];
const CONTAINER_PADDING: [number, number] = [0, 0];

// ============================================================================
// Component
// ============================================================================

export function DashboardGrid({
    layout,
    onLayoutChange,
    editMode = false,
    children,
    rowHeight = 80,
}: DashboardGridProps) {
    // Convert WidgetLayout[] to react-grid-layout Layout format
    const gridLayouts = useMemo((): Layouts => {
        const lgLayout: GridLayoutItem[] = layout.map((item) => ({
            i: item.i,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            minW: item.minW,
            minH: item.minH,
            maxW: item.maxW,
            maxH: item.maxH,
            static: item.static || !editMode,
            isDraggable: editMode && item.isDraggable !== false,
            isResizable: editMode && item.isResizable !== false,
        }));

        // Generate responsive layouts
        return {
            lg: lgLayout,
            md: lgLayout.map((item) => ({
                ...item,
                w: Math.min(item.w, 10),
                x: Math.min(item.x, 10 - item.w),
            })),
            sm: lgLayout.map((item) => ({
                ...item,
                w: Math.min(item.w, 6),
                x: 0, // Stack on small screens
            })),
            xs: lgLayout.map((item) => ({
                ...item,
                w: 4, // Full width on mobile
                x: 0,
            })),
            xxs: lgLayout.map((item) => ({
                ...item,
                w: 2, // Full width on tiny screens
                x: 0,
            })),
        };
    }, [layout, editMode]);

    // Handle layout change from react-grid-layout
    const handleLayoutChange = useCallback(
        (currentLayout: GridLayoutItem[], allLayouts: Layouts) => {
            // Only update on lg breakpoint to avoid responsive layout overwriting user changes
            const lgLayout = allLayouts.lg || currentLayout;

            const updatedLayout: WidgetLayout[] = lgLayout.map((item) => {
                // Find original widget to preserve metadata
                const original = layout.find((w) => w.i === item.i);
                return {
                    i: item.i,
                    widgetId: original?.widgetId || item.i.split('-')[0],
                    x: item.x,
                    y: item.y,
                    w: item.w,
                    h: item.h,
                    minW: original?.minW || item.minW,
                    minH: original?.minH || item.minH,
                    maxW: original?.maxW || item.maxW,
                    maxH: original?.maxH || item.maxH,
                    static: original?.static,
                    isDraggable: original?.isDraggable,
                    isResizable: original?.isResizable,
                    settings: original?.settings,
                };
            });

            onLayoutChange(updatedLayout);
        },
        [layout, onLayoutChange]
    );

    return (
        <Box
            sx={{
                width: '100%',
                // Edit mode visual feedback
                '& .react-grid-item': {
                    transition: editMode ? 'none' : 'all 200ms ease',
                    borderRadius: 2,
                    overflow: 'hidden',
                },
                // Placeholder styling during drag
                '& .react-grid-placeholder': {
                    bgcolor: 'primary.main',
                    opacity: 0.2,
                    borderRadius: 2,
                },
                // Resize handle styling
                '& .react-resizable-handle': {
                    display: editMode ? 'block' : 'none',
                    opacity: 0.5,
                    '&:hover': {
                        opacity: 1,
                    },
                },
                // Drag cursor
                '& .react-grid-item.react-draggable-dragging': {
                    zIndex: 100,
                    boxShadow: 6,
                    cursor: 'grabbing',
                },
                // Edit mode indicator
                ...(editMode && {
                    '& .react-grid-item': {
                        cursor: 'grab',
                        border: '2px dashed',
                        borderColor: 'divider',
                        '&:hover': {
                            borderColor: 'primary.main',
                        },
                    },
                }),
            }}
        >
            <ResponsiveGridLayout
                className="dashboard-grid"
                layouts={gridLayouts}
                breakpoints={BREAKPOINTS}
                cols={COLS}
                rowHeight={rowHeight}
                margin={MARGIN}
                containerPadding={CONTAINER_PADDING}
                onLayoutChange={handleLayoutChange}
                isDraggable={editMode}
                isResizable={editMode}
                draggableHandle=".widget-drag-handle"
                useCSSTransforms
                compactType="vertical"
                preventCollision={false}
            >
                {children}
            </ResponsiveGridLayout>
        </Box>
    );
}

export default DashboardGrid;
