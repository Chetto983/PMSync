/**
 * Dashboard Widget Registry
 * 
 * Central registry of all available dashboard widgets with their metadata,
 * configuration, and component references.
 */

import type { ComponentType } from 'react';

// ============================================================================
// Types
// ============================================================================

export type WidgetCategory = 'email' | 'calendar' | 'ai' | 'crm' | 'analytics' | 'actions' | 'communication' | 'productivity' | 'general';

export type WidgetSize = 'small' | 'medium' | 'large' | 'xlarge' | 'wide' | 'tall';

export interface WidgetDimensions {
    w: number; // Width in grid columns (12-column grid)
    h: number; // Height in grid rows
}

export interface WidgetSettings {
    [key: string]: {
        type: 'boolean' | 'number' | 'string' | 'select';
        label: string;
        default: unknown;
        options?: Array<{ label: string; value: unknown }>;
    };
}

export interface WidgetProps {
    id: string;
    settings?: Record<string, unknown>;
    editMode?: boolean;
}

export interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    category: WidgetCategory;
    icon: string; // Lucide icon name

    // Size configuration
    defaultSize: WidgetSize;
    minSize: WidgetDimensions;
    maxSize: WidgetDimensions;

    // Component
    component: ComponentType<WidgetProps>;

    // Optional features
    requiresData?: string[]; // API endpoints needed
    settings?: WidgetSettings;
    refreshInterval?: number; // Auto-refresh in ms

    // Metadata
    tags?: string[];
    isPremium?: boolean;
    isNew?: boolean;
}

// ============================================================================
// Widget Size Presets
// ============================================================================

export const WIDGET_SIZE_PRESETS: Record<WidgetSize, WidgetDimensions> = {
    small: { w: 2, h: 2 },    // 2x2 - Stat card
    medium: { w: 3, h: 2 },   // 3x2 - List widget
    large: { w: 4, h: 3 },    // 4x3 - Chart/detailed view
    xlarge: { w: 6, h: 4 },   // 6x4 - Hero widget
    wide: { w: 6, h: 2 },     // 6x2 - Banner/horizontal
    tall: { w: 2, h: 4 },     // 2x4 - Vertical list
};

// ============================================================================
// Widget Registry
// ============================================================================

/**
 * Central registry of all available widgets
 * 
 * To add a new widget:
 * 1. Create the widget component in components/dashboard/widgets/
 * 2. Add the widget definition here
 * 3. Export the widget component
 */
export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
    // ========== EMAIL WIDGETS ==========

    'unread-emails': {
        id: 'unread-emails',
        name: 'Unread Emails',
        description: 'Quick view of your unread messages',
        category: 'email',
        icon: 'Mail',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/emails/stats'],
        refreshInterval: 60000, // 1 minute
        tags: ['inbox', 'messages'],
    },

    'recent-emails': {
        id: 'recent-emails',
        name: 'Recent Emails',
        description: 'Latest emails in your inbox',
        category: 'email',
        icon: 'Inbox',
        defaultSize: 'large',
        minSize: { w: 3, h: 3 },
        maxSize: { w: 6, h: 6 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/emails'],
        settings: {
            limit: {
                type: 'number',
                label: 'Number of emails',
                default: 5,
            },
            showPreview: {
                type: 'boolean',
                label: 'Show email preview',
                default: true,
            },
        },
    },

    'important-emails': {
        id: 'important-emails',
        name: 'Important Emails',
        description: 'Starred and flagged messages',
        category: 'email',
        icon: 'Star',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/emails'],
    },

    'email-stats': {
        id: 'email-stats',
        name: 'Email Statistics',
        description: 'Charts and metrics for your inbox',
        category: 'email',
        icon: 'BarChart3',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/emails/stats'],
    },

    'quick-compose': {
        id: 'quick-compose',
        name: 'Quick Compose',
        description: 'Send emails without leaving the dashboard',
        category: 'email',
        icon: 'PenSquare',
        defaultSize: 'wide',
        minSize: { w: 4, h: 2 },
        maxSize: { w: 6, h: 3 },
        component: (() => null) as ComponentType<WidgetProps>,
    },

    // ========== CALENDAR WIDGETS ==========

    'today-events': {
        id: 'today-events',
        name: "Today's Events",
        description: 'Your schedule for today',
        category: 'calendar',
        icon: 'Calendar',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/calendar/events'],
        refreshInterval: 300000, // 5 minutes
    },

    'upcoming-events': {
        id: 'upcoming-events',
        name: 'Upcoming Events',
        description: 'Events for the next 7 days',
        category: 'calendar',
        icon: 'CalendarDays',
        defaultSize: 'large',
        minSize: { w: 3, h: 3 },
        maxSize: { w: 6, h: 6 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/calendar/events'],
    },

    'calendar-heatmap': {
        id: 'calendar-heatmap',
        name: 'Calendar Heatmap',
        description: 'Visual overview of your schedule',
        category: 'calendar',
        icon: 'Grid3x3',
        defaultSize: 'wide',
        minSize: { w: 4, h: 2 },
        maxSize: { w: 6, h: 3 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/calendar/events'],
    },

    'meeting-prep': {
        id: 'meeting-prep',
        name: 'Meeting Prep',
        description: 'AI-powered meeting preparation',
        category: 'calendar',
        icon: 'Users',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/scheduling/meeting-prep'],
        tags: ['ai', 'meetings'],
    },

    // ========== AI WIDGETS ==========

    'briefing': {
        id: 'briefing',
        name: 'Daily Briefing',
        description: 'AI-generated summary of your day',
        category: 'ai',
        icon: 'Sparkles',
        defaultSize: 'xlarge',
        minSize: { w: 4, h: 3 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/briefing'],
        refreshInterval: 3600000, // 1 hour
        tags: ['ai', 'summary'],
    },

    'ai-suggestions': {
        id: 'ai-suggestions',
        name: 'AI Suggestions',
        description: 'Smart recommendations for your workflow',
        category: 'ai',
        icon: 'Lightbulb',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/chat'],
        tags: ['ai', 'productivity'],
    },

    'focus-time': {
        id: 'focus-time',
        name: 'Focus Time',
        description: 'Optimal work blocks for deep focus',
        category: 'ai',
        icon: 'Brain',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/scheduling/focus-time/optimal'],
        tags: ['ai', 'productivity'],
    },

    'smart-replies': {
        id: 'smart-replies',
        name: 'Smart Replies',
        description: 'AI-generated email responses',
        category: 'ai',
        icon: 'MessageSquare',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/ai/smart-reply'],
        tags: ['ai', 'email'],
    },

    // ========== CRM WIDGETS ==========

    'stale-contacts': {
        id: 'stale-contacts',
        name: 'Stale Contacts',
        description: 'Contacts you haven\'t reached out to recently',
        category: 'crm',
        icon: 'UserX',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/crm/stale-contacts'],
        tags: ['relationships', 'networking'],
    },

    'recent-contacts': {
        id: 'recent-contacts',
        name: 'Recent Contacts',
        description: 'People you\'ve interacted with recently',
        category: 'crm',
        icon: 'Users',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/contacts'],
    },

    'relationship-score': {
        id: 'relationship-score',
        name: 'Relationship Health',
        description: 'Overall health of your professional network',
        category: 'crm',
        icon: 'Heart',
        defaultSize: 'small',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 3, h: 3 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/crm/relationship-stats'],
    },

    'follow-up-tracker': {
        id: 'follow-up-tracker',
        name: 'Follow-up Tracker',
        description: 'Emails that need your response',
        category: 'crm',
        icon: 'Reply',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/follow-ups/pending'],
        tags: ['productivity', 'email'],
    },

    // ========== ANALYTICS WIDGETS ==========

    'email-analytics': {
        id: 'email-analytics',
        name: 'Email Analytics',
        description: 'Insights into your email patterns',
        category: 'analytics',
        icon: 'TrendingUp',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/analytics/email'],
    },

    'response-time': {
        id: 'response-time',
        name: 'Response Time',
        description: 'How quickly you respond to emails',
        category: 'analytics',
        icon: 'Clock',
        defaultSize: 'small',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 3, h: 3 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/analytics/email'],
    },

    'productivity-metrics': {
        id: 'productivity-metrics',
        name: 'Productivity Metrics',
        description: 'Track your productivity over time',
        category: 'analytics',
        icon: 'Activity',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/stats/performance'],
    },

    // ========== ACTION WIDGETS ==========

    'deadlines': {
        id: 'deadlines',
        name: 'Deadlines',
        description: 'Upcoming deadlines and due dates',
        category: 'actions',
        icon: 'AlertCircle',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/deadlines'],
        refreshInterval: 300000, // 5 minutes
    },

    'action-items': {
        id: 'action-items',
        name: 'Action Items',
        description: 'Tasks extracted from your emails',
        category: 'actions',
        icon: 'CheckSquare',
        defaultSize: 'large',
        minSize: { w: 3, h: 2 },
        maxSize: { w: 6, h: 4 },
        component: (() => null) as ComponentType<WidgetProps>,
        requiresData: ['/api/v1/ai/action-items/pending'],
    },

    'todo-list': {
        id: 'todo-list',
        name: 'Todo List',
        description: 'Your personal task list',
        category: 'actions',
        icon: 'ListTodo',
        defaultSize: 'medium',
        minSize: { w: 2, h: 2 },
        maxSize: { w: 4, h: 6 },
        component: (() => null) as ComponentType<WidgetProps>,
        settings: {
            showCompleted: {
                type: 'boolean',
                label: 'Show completed tasks',
                default: false,
            },
        },
    },

    'quick-actions': {
        id: 'quick-actions',
        name: 'Quick Actions',
        description: 'Shortcuts to common tasks',
        category: 'actions',
        icon: 'Zap',
        defaultSize: 'wide',
        minSize: { w: 4, h: 1 },
        maxSize: { w: 6, h: 2 },
        component: (() => null) as ComponentType<WidgetProps>,
    },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get widget definition by ID
 */
export function getWidgetDefinition(widgetId: string): WidgetDefinition | undefined {
    return WIDGET_REGISTRY[widgetId];
}

/**
 * Get all widgets in a category
 */
export function getWidgetsByCategory(category: WidgetCategory): WidgetDefinition[] {
    return Object.values(WIDGET_REGISTRY).filter(w => w.category === category);
}

/**
 * Get all widget categories
 */
export function getAllCategories(): WidgetCategory[] {
    return ['email', 'calendar', 'ai', 'crm', 'analytics', 'actions'];
}

/**
 * Search widgets by name or tags
 */
export function searchWidgets(query: string): WidgetDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Object.values(WIDGET_REGISTRY).filter(widget =>
        widget.name.toLowerCase().includes(lowerQuery) ||
        widget.description.toLowerCase().includes(lowerQuery) ||
        widget.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
}

/**
 * Get widget IDs
 */
export function getAllWidgetIds(): string[] {
    return Object.keys(WIDGET_REGISTRY);
}
