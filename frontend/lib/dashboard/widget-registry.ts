/**
 * Dashboard Widget Registry
 *
 * Metadata for all implemented dashboard widgets.
 * Used by WidgetLibrary drawer for browsing/search/add.
 *
 * RULE: Only add entries here for widgets that have real components
 * registered in components/dashboard/dashboard/widget-registry.ts.
 */

import type { ComponentType } from 'react';

// ============================================================================
// Types
// ============================================================================

export type WidgetCategory = 'email' | 'calendar' | 'ai' | 'crm' | 'analytics' | 'actions' | 'communication' | 'productivity' | 'general';

export type WidgetSize = 'small' | 'medium' | 'large' | 'xlarge' | 'wide' | 'tall';

export interface WidgetDimensions {
  w: number;
  h: number;
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
  icon: string;
  defaultSize: WidgetSize;
  minSize: WidgetDimensions;
  maxSize: WidgetDimensions;
  component: ComponentType<WidgetProps>;
  requiresData?: string[];
  settings?: WidgetSettings;
  refreshInterval?: number;
  tags?: string[];
  isPremium?: boolean;
  isNew?: boolean;
}

// ============================================================================
// Widget Size Presets
// ============================================================================

export const WIDGET_SIZE_PRESETS: Record<WidgetSize, WidgetDimensions> = {
  small: { w: 2, h: 2 },
  medium: { w: 3, h: 2 },
  large: { w: 4, h: 3 },
  xlarge: { w: 6, h: 4 },
  wide: { w: 6, h: 2 },
  tall: { w: 2, h: 4 },
};

// ============================================================================
// Widget Registry — only implemented widgets
// ============================================================================

// Placeholder component for registry entries (actual rendering uses lazy-loaded
// components from components/dashboard/dashboard/widget-registry.ts)
const placeholder = (() => null) as ComponentType<WidgetProps>;

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  // ========== EMAIL WIDGETS ==========

  'emails': {
    id: 'emails',
    name: 'Unread Emails',
    description: 'Quick view of your unread messages',
    category: 'email',
    icon: 'Mail',
    defaultSize: 'medium',
    minSize: { w: 2, h: 2 },
    maxSize: { w: 4, h: 4 },
    component: placeholder,
    refreshInterval: 60000,
    tags: ['inbox', 'messages'],
  },

  'priority': {
    id: 'priority',
    name: 'Priority Inbox',
    description: 'Starred and flagged important emails',
    category: 'email',
    icon: 'Star',
    defaultSize: 'medium',
    minSize: { w: 2, h: 2 },
    maxSize: { w: 4, h: 4 },
    component: placeholder,
    tags: ['important', 'starred'],
  },

  'triage': {
    id: 'triage',
    name: 'AI Triage',
    description: 'AI-prioritized email inbox with smart labels',
    category: 'email',
    icon: 'Shield',
    defaultSize: 'large',
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 4 },
    component: placeholder,
    tags: ['ai', 'priority', 'labels'],
    isNew: true,
  },

  // ========== CALENDAR WIDGETS ==========

  'events': {
    id: 'events',
    name: "Today's Events",
    description: 'Your schedule for today',
    category: 'calendar',
    icon: 'Calendar',
    defaultSize: 'medium',
    minSize: { w: 2, h: 2 },
    maxSize: { w: 4, h: 4 },
    component: placeholder,
    refreshInterval: 300000,
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
    component: placeholder,
    refreshInterval: 3600000,
    tags: ['ai', 'summary'],
  },

  'insights': {
    id: 'insights',
    name: 'AI Insights',
    description: 'Proactive action items and alerts',
    category: 'ai',
    icon: 'Sparkles',
    defaultSize: 'large',
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 4 },
    component: placeholder,
    tags: ['ai', 'alerts'],
  },

  // ========== CRM WIDGETS ==========

  'contacts': {
    id: 'contacts',
    name: 'CRM Alerts',
    description: 'Contacts needing reconnection with relationship scores',
    category: 'crm',
    icon: 'Users',
    defaultSize: 'medium',
    minSize: { w: 2, h: 2 },
    maxSize: { w: 4, h: 4 },
    component: placeholder,
    tags: ['relationships', 'networking'],
  },

  // ========== ANALYTICS WIDGETS ==========

  'trends': {
    id: 'trends',
    name: 'Email Trends',
    description: 'Sent/received email activity over 7 days',
    category: 'analytics',
    icon: 'TrendingUp',
    defaultSize: 'large',
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 4 },
    component: placeholder,
    tags: ['charts', 'analytics'],
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
    component: placeholder,
    refreshInterval: 300000,
  },

  'followups': {
    id: 'followups',
    name: 'Follow-ups',
    description: 'Pending follow-ups with snooze controls',
    category: 'actions',
    icon: 'Bell',
    defaultSize: 'large',
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 4 },
    component: placeholder,
    tags: ['productivity', 'email'],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getWidgetDefinition(widgetId: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[widgetId];
}

export function getWidgetsByCategory(category: WidgetCategory): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY).filter((w) => w.category === category);
}

export function getAllCategories(): WidgetCategory[] {
  const cats = new Set(Object.values(WIDGET_REGISTRY).map((w) => w.category));
  return Array.from(cats) as WidgetCategory[];
}

export function searchWidgets(query: string): WidgetDefinition[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(WIDGET_REGISTRY).filter(
    (widget) =>
      widget.name.toLowerCase().includes(lowerQuery) ||
      widget.description.toLowerCase().includes(lowerQuery) ||
      widget.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)),
  );
}

export function getAllWidgetIds(): string[] {
  return Object.keys(WIDGET_REGISTRY);
}
