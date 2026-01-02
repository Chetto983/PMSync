/**
 * Dashboard Layout Presets
 * 
 * Predefined dashboard layouts for different use cases.
 */

import type { DashboardLayout } from './layout-engine';
import { DEFAULT_GRID_COLS, DEFAULT_ROW_HEIGHT } from './layout-engine';

// ============================================================================
// Layout Presets
// ============================================================================

export const LAYOUT_PRESETS: Record<string, DashboardLayout> = {
    executive: {
        id: 'preset-executive',
        name: 'Executive View',
        isDefault: false,
        isPreset: true,
        cols: DEFAULT_GRID_COLS,
        rowHeight: DEFAULT_ROW_HEIGHT,
        widgets: [
            // Row 1: Briefing (hero) + Email Stats + Today's Events
            { i: 'briefing-1', widgetId: 'briefing', x: 0, y: 0, w: 6, h: 3 },
            { i: 'email-stats-1', widgetId: 'email-stats', x: 6, y: 0, w: 3, h: 3 },
            { i: 'today-events-1', widgetId: 'today-events', x: 9, y: 0, w: 3, h: 3 },

            // Row 2: Deadlines + AI Suggestions + Relationship Health
            { i: 'deadlines-1', widgetId: 'deadlines', x: 0, y: 3, w: 4, h: 2 },
            { i: 'ai-suggestions-1', widgetId: 'ai-suggestions', x: 4, y: 3, w: 4, h: 2 },
            { i: 'relationship-score-1', widgetId: 'relationship-score', x: 8, y: 3, w: 4, h: 2 },
        ],
    },

    productivity: {
        id: 'preset-productivity',
        name: 'Productivity Focus',
        isDefault: false,
        isPreset: true,
        cols: DEFAULT_GRID_COLS,
        rowHeight: DEFAULT_ROW_HEIGHT,
        widgets: [
            // Row 1: Focus Time + Action Items + Deadlines
            { i: 'focus-time-1', widgetId: 'focus-time', x: 0, y: 0, w: 4, h: 3 },
            { i: 'action-items-1', widgetId: 'action-items', x: 4, y: 0, w: 4, h: 3 },
            { i: 'deadlines-1', widgetId: 'deadlines', x: 8, y: 0, w: 4, h: 3 },

            // Row 2: Todo List + Unread Emails + Today's Events
            { i: 'todo-list-1', widgetId: 'todo-list', x: 0, y: 3, w: 3, h: 3 },
            { i: 'unread-emails-1', widgetId: 'unread-emails', x: 3, y: 3, w: 3, h: 3 },
            { i: 'today-events-1', widgetId: 'today-events', x: 6, y: 3, w: 3, h: 3 },
            { i: 'productivity-metrics-1', widgetId: 'productivity-metrics', x: 9, y: 3, w: 3, h: 3 },
        ],
    },

    communication: {
        id: 'preset-communication',
        name: 'Communication Hub',
        isDefault: false,
        isPreset: true,
        cols: DEFAULT_GRID_COLS,
        rowHeight: DEFAULT_ROW_HEIGHT,
        widgets: [
            // Row 1: Unread Emails + Follow-ups + Stale Contacts
            { i: 'unread-emails-1', widgetId: 'unread-emails', x: 0, y: 0, w: 4, h: 4 },
            { i: 'follow-up-tracker-1', widgetId: 'follow-up-tracker', x: 4, y: 0, w: 4, h: 4 },
            { i: 'stale-contacts-1', widgetId: 'stale-contacts', x: 8, y: 0, w: 4, h: 4 },

            // Row 2: Quick Compose + Recent Contacts + Smart Replies
            { i: 'quick-compose-1', widgetId: 'quick-compose', x: 0, y: 4, w: 6, h: 2 },
            { i: 'recent-contacts-1', widgetId: 'recent-contacts', x: 6, y: 4, w: 3, h: 2 },
            { i: 'smart-replies-1', widgetId: 'smart-replies', x: 9, y: 4, w: 3, h: 2 },
        ],
    },

    minimal: {
        id: 'preset-minimal',
        name: 'Minimal',
        isDefault: false,
        isPreset: true,
        cols: DEFAULT_GRID_COLS,
        rowHeight: DEFAULT_ROW_HEIGHT,
        widgets: [
            // Single row: Briefing + Unread + Events
            { i: 'briefing-1', widgetId: 'briefing', x: 0, y: 0, w: 6, h: 3 },
            { i: 'unread-emails-1', widgetId: 'unread-emails', x: 6, y: 0, w: 3, h: 3 },
            { i: 'today-events-1', widgetId: 'today-events', x: 9, y: 0, w: 3, h: 3 },
        ],
    },

    analytics: {
        id: 'preset-analytics',
        name: 'Analytics Dashboard',
        isDefault: false,
        isPreset: true,
        cols: DEFAULT_GRID_COLS,
        rowHeight: DEFAULT_ROW_HEIGHT,
        widgets: [
            // Row 1: Email Analytics + Productivity Metrics
            { i: 'email-analytics-1', widgetId: 'email-analytics', x: 0, y: 0, w: 6, h: 3 },
            { i: 'productivity-metrics-1', widgetId: 'productivity-metrics', x: 6, y: 0, w: 6, h: 3 },

            // Row 2: Response Time + Calendar Heatmap + Relationship Score
            { i: 'response-time-1', widgetId: 'response-time', x: 0, y: 3, w: 3, h: 2 },
            { i: 'calendar-heatmap-1', widgetId: 'calendar-heatmap', x: 3, y: 3, w: 6, h: 2 },
            { i: 'relationship-score-1', widgetId: 'relationship-score', x: 9, y: 3, w: 3, h: 2 },
        ],
    },

    default: {
        id: 'preset-default',
        name: 'Default Layout',
        isDefault: true,
        isPreset: true,
        cols: DEFAULT_GRID_COLS,
        rowHeight: DEFAULT_ROW_HEIGHT,
        widgets: [
            // Row 1: Briefing (large) + Unread Emails + Events
            { i: 'briefing-1', widgetId: 'briefing', x: 0, y: 0, w: 6, h: 3 },
            { i: 'unread-emails-1', widgetId: 'unread-emails', x: 6, y: 0, w: 3, h: 3 },
            { i: 'today-events-1', widgetId: 'today-events', x: 9, y: 0, w: 3, h: 3 },

            // Row 2: Deadlines + Follow-ups + Action Items
            { i: 'deadlines-1', widgetId: 'deadlines', x: 0, y: 3, w: 3, h: 2 },
            { i: 'follow-up-tracker-1', widgetId: 'follow-up-tracker', x: 3, y: 3, w: 4, h: 2 },
            { i: 'action-items-1', widgetId: 'action-items', x: 7, y: 3, w: 5, h: 2 },

            // Row 3: Focus Time + Stale Contacts
            { i: 'focus-time-1', widgetId: 'focus-time', x: 0, y: 5, w: 6, h: 2 },
            { i: 'stale-contacts-1', widgetId: 'stale-contacts', x: 6, y: 5, w: 6, h: 2 },
        ],
    },
};

// ============================================================================
// Preset Metadata
// ============================================================================

export interface PresetMetadata {
    id: string;
    name: string;
    description: string;
    icon: string;
    tags: string[];
    recommended: boolean;
}

export const PRESET_METADATA: Record<string, PresetMetadata> = {
    default: {
        id: 'default',
        name: 'Default Layout',
        description: 'Balanced view with all essential widgets',
        icon: 'LayoutDashboard',
        tags: ['balanced', 'general'],
        recommended: true,
    },
    executive: {
        id: 'executive',
        name: 'Executive View',
        description: 'High-level overview for decision makers',
        icon: 'Briefcase',
        tags: ['leadership', 'overview'],
        recommended: true,
    },
    productivity: {
        id: 'productivity',
        name: 'Productivity Focus',
        description: 'Optimize your workflow and get things done',
        icon: 'Zap',
        tags: ['productivity', 'tasks'],
        recommended: true,
    },
    communication: {
        id: 'communication',
        name: 'Communication Hub',
        description: 'Stay connected with your network',
        icon: 'MessageSquare',
        tags: ['email', 'contacts', 'networking'],
        recommended: false,
    },
    minimal: {
        id: 'minimal',
        name: 'Minimal',
        description: 'Clean and focused with just the essentials',
        icon: 'Minimize2',
        tags: ['simple', 'clean'],
        recommended: false,
    },
    analytics: {
        id: 'analytics',
        name: 'Analytics Dashboard',
        description: 'Track your productivity and performance',
        icon: 'BarChart3',
        tags: ['analytics', 'metrics', 'insights'],
        recommended: false,
    },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get preset layout by ID
 */
export function getPresetLayout(presetId: string): DashboardLayout | undefined {
    return LAYOUT_PRESETS[presetId];
}

/**
 * Get all preset IDs
 */
export function getAllPresetIds(): string[] {
    return Object.keys(LAYOUT_PRESETS);
}

/**
 * Get recommended presets
 */
export function getRecommendedPresets(): PresetMetadata[] {
    return Object.values(PRESET_METADATA).filter(p => p.recommended);
}

/**
 * Get preset metadata
 */
export function getPresetMetadata(presetId: string): PresetMetadata | undefined {
    return PRESET_METADATA[presetId];
}

/**
 * Get default layout
 */
export function getDefaultLayout(): DashboardLayout {
    return LAYOUT_PRESETS.default;
}
