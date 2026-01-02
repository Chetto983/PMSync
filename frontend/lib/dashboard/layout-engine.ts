/**
 * Dashboard Layout Engine
 * 
 * Handles layout calculations, validation, and transformations for the
 * dashboard grid system.
 */

import type { WidgetDimensions } from './widget-registry';

// ============================================================================
// Types
// ============================================================================

export interface WidgetLayout {
    /** Unique identifier for this widget instance */
    i: string; // react-grid-layout uses 'i' for id

    /** Widget type ID from registry */
    widgetId: string;

    /** Grid position */
    x: number;
    y: number;

    /** Grid dimensions */
    w: number;
    h: number;

    /** Constraints */
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;

    /** Behavior */
    static?: boolean; // Cannot be moved/resized
    isDraggable?: boolean;
    isResizable?: boolean;

    /** Widget-specific settings */
    settings?: Record<string, unknown>;
}

export interface DashboardLayout {
    /** Unique layout ID */
    id: string;

    /** Layout name */
    name: string;

    /** User ID (for personal layouts) */
    userId?: string;

    /** Is this the default layout? */
    isDefault: boolean;

    /** Is this a preset layout? */
    isPreset: boolean;

    /** Widget configurations */
    widgets: WidgetLayout[];

    /** Grid configuration */
    cols: number; // Number of columns (default: 12)
    rowHeight: number; // Height of one row in pixels

    /** Responsive breakpoints */
    breakpoints?: {
        lg: number; // 1200px
        md: number; // 996px
        sm: number; // 768px
        xs: number; // 480px
    };

    /** Metadata */
    createdAt?: string;
    updatedAt?: string;
}

export interface GridBreakpoint {
    breakpoint: 'lg' | 'md' | 'sm' | 'xs';
    cols: number;
    width: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_GRID_COLS = 12;
export const DEFAULT_ROW_HEIGHT = 60; // pixels
export const DEFAULT_MARGIN: [number, number] = [16, 16]; // [x, y] in pixels
export const DEFAULT_CONTAINER_PADDING: [number, number] = [16, 16];

export const GRID_BREAKPOINTS: GridBreakpoint[] = [
    { breakpoint: 'lg', cols: 12, width: 1200 },
    { breakpoint: 'md', cols: 8, width: 996 },
    { breakpoint: 'sm', cols: 6, width: 768 },
    { breakpoint: 'xs', cols: 4, width: 480 },
];

// ============================================================================
// Layout Validation
// ============================================================================

/**
 * Validate a widget layout configuration
 */
export function validateWidgetLayout(layout: WidgetLayout): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Check required fields
    if (!layout.i) errors.push('Widget ID (i) is required');
    if (!layout.widgetId) errors.push('Widget type ID is required');
    if (typeof layout.x !== 'number') errors.push('X position must be a number');
    if (typeof layout.y !== 'number') errors.push('Y position must be a number');
    if (typeof layout.w !== 'number' || layout.w <= 0) errors.push('Width must be a positive number');
    if (typeof layout.h !== 'number' || layout.h <= 0) errors.push('Height must be a positive number');

    // Check constraints
    if (layout.minW && layout.w < layout.minW) {
        errors.push(`Width ${layout.w} is less than minimum ${layout.minW}`);
    }
    if (layout.minH && layout.h < layout.minH) {
        errors.push(`Height ${layout.h} is less than minimum ${layout.minH}`);
    }
    if (layout.maxW && layout.w > layout.maxW) {
        errors.push(`Width ${layout.w} exceeds maximum ${layout.maxW}`);
    }
    if (layout.maxH && layout.h > layout.maxH) {
        errors.push(`Height ${layout.h} exceeds maximum ${layout.maxH}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validate entire dashboard layout
 */
export function validateDashboardLayout(layout: DashboardLayout): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Check required fields
    if (!layout.id) errors.push('Layout ID is required');
    if (!layout.name) errors.push('Layout name is required');
    if (!Array.isArray(layout.widgets)) errors.push('Widgets must be an array');

    // Validate each widget
    layout.widgets?.forEach((widget, index) => {
        const validation = validateWidgetLayout(widget);
        if (!validation.valid) {
            errors.push(`Widget ${index} (${widget.i}): ${validation.errors.join(', ')}`);
        }
    });

    // Check for duplicate widget IDs
    const widgetIds = layout.widgets?.map(w => w.i) || [];
    const duplicates = widgetIds.filter((id, index) => widgetIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
        errors.push(`Duplicate widget IDs: ${duplicates.join(', ')}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============================================================================
// Layout Transformations
// ============================================================================

/**
 * Compact layout by removing gaps
 */
export function compactLayout(layout: WidgetLayout[], cols: number = DEFAULT_GRID_COLS): WidgetLayout[] {
    const sorted = [...layout].sort((a, b) => {
        if (a.y === b.y) return a.x - b.x;
        return a.y - b.y;
    });

    const compacted: WidgetLayout[] = [];
    const occupied: boolean[][] = [];

    for (const widget of sorted) {
        // Find the first available position
        let placed = false;
        for (let y = 0; y < 1000 && !placed; y++) {
            for (let x = 0; x <= cols - widget.w && !placed; x++) {
                if (canPlaceWidget(widget, x, y, occupied)) {
                    compacted.push({ ...widget, x, y });
                    markOccupied(widget, x, y, occupied);
                    placed = true;
                }
            }
        }
    }

    return compacted;
}

function canPlaceWidget(
    widget: WidgetLayout,
    x: number,
    y: number,
    occupied: boolean[][]
): boolean {
    for (let dy = 0; dy < widget.h; dy++) {
        for (let dx = 0; dx < widget.w; dx++) {
            if (occupied[y + dy]?.[x + dx]) return false;
        }
    }
    return true;
}

function markOccupied(
    widget: WidgetLayout,
    x: number,
    y: number,
    occupied: boolean[][]
): void {
    for (let dy = 0; dy < widget.h; dy++) {
        if (!occupied[y + dy]) occupied[y + dy] = [];
        for (let dx = 0; dx < widget.w; dx++) {
            occupied[y + dy][x + dx] = true;
        }
    }
}

/**
 * Calculate layout bounds
 */
export function getLayoutBounds(layout: WidgetLayout[]): {
    width: number;
    height: number;
    maxX: number;
    maxY: number;
} {
    if (layout.length === 0) {
        return { width: 0, height: 0, maxX: 0, maxY: 0 };
    }

    let maxX = 0;
    let maxY = 0;

    for (const widget of layout) {
        maxX = Math.max(maxX, widget.x + widget.w);
        maxY = Math.max(maxY, widget.y + widget.h);
    }

    return {
        width: maxX,
        height: maxY,
        maxX,
        maxY,
    };
}

/**
 * Resize layout for different breakpoint
 */
export function resizeLayoutForBreakpoint(
    layout: WidgetLayout[],
    fromCols: number,
    toCols: number
): WidgetLayout[] {
    if (fromCols === toCols) return layout;

    const scale = toCols / fromCols;

    return layout.map(widget => ({
        ...widget,
        x: Math.floor(widget.x * scale),
        w: Math.max(1, Math.floor(widget.w * scale)),
        // Keep y and h the same
    }));
}

// ============================================================================
// Layout Utilities
// ============================================================================

/**
 * Generate unique widget instance ID
 */
export function generateWidgetId(widgetType: string): string {
    return `${widgetType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create widget layout from widget type
 */
export function createWidgetLayout(
    widgetId: string,
    position: { x: number; y: number },
    size: WidgetDimensions,
    constraints?: { minW?: number; minH?: number; maxW?: number; maxH?: number }
): WidgetLayout {
    return {
        i: generateWidgetId(widgetId),
        widgetId,
        x: position.x,
        y: position.y,
        w: size.w,
        h: size.h,
        ...constraints,
    };
}

/**
 * Find next available position in layout
 */
export function findNextAvailablePosition(
    layout: WidgetLayout[],
    widgetSize: WidgetDimensions,
    cols: number = DEFAULT_GRID_COLS
): { x: number; y: number } {
    const occupied: boolean[][] = [];

    // Mark occupied cells
    for (const widget of layout) {
        markOccupied(widget, widget.x, widget.y, occupied);
    }

    // Find first available position
    for (let y = 0; y < 1000; y++) {
        for (let x = 0; x <= cols - widgetSize.w; x++) {
            if (canPlaceWidget({ w: widgetSize.w, h: widgetSize.h } as WidgetLayout, x, y, occupied)) {
                return { x, y };
            }
        }
    }

    // Fallback to bottom
    const bounds = getLayoutBounds(layout);
    return { x: 0, y: bounds.maxY };
}

/**
 * Clone layout
 */
export function cloneLayout(layout: DashboardLayout): DashboardLayout {
    return {
        ...layout,
        id: `${layout.id}-copy-${Date.now()}`,
        name: `${layout.name} (Copy)`,
        widgets: layout.widgets.map(w => ({ ...w })),
        isDefault: false,
        isPreset: false,
    };
}

/**
 * Merge layouts (useful for applying presets)
 */
export function mergeLayouts(
    base: DashboardLayout,
    override: Partial<DashboardLayout>
): DashboardLayout {
    return {
        ...base,
        ...override,
        widgets: override.widgets || base.widgets,
    };
}

/**
 * Calculate grid height in pixels
 */
export function calculateGridHeight(
    layout: WidgetLayout[],
    rowHeight: number = DEFAULT_ROW_HEIGHT,
    margin: [number, number] = DEFAULT_MARGIN
): number {
    const bounds = getLayoutBounds(layout);
    return bounds.maxY * rowHeight + (bounds.maxY - 1) * margin[1];
}
