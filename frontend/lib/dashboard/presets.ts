/**
 * Dashboard Layout Presets
 *
 * Predefined dashboard layouts for different use cases.
 * All widget IDs must match the real widget registry:
 *   briefing, events, emails, deadlines, followups,
 *   trends, contacts, triage
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
      { i: 'briefing-1', widgetId: 'briefing', x: 0, y: 0, w: 6, h: 3 },
      { i: 'trends-1', widgetId: 'trends', x: 6, y: 0, w: 3, h: 3 },
      { i: 'events-1', widgetId: 'events', x: 9, y: 0, w: 3, h: 3 },
      { i: 'deadlines-1', widgetId: 'deadlines', x: 0, y: 3, w: 4, h: 2 },
      { i: 'contacts-1', widgetId: 'contacts', x: 8, y: 3, w: 4, h: 2 },
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
      { i: 'triage-1', widgetId: 'triage', x: 0, y: 0, w: 4, h: 3 },
      { i: 'deadlines-1', widgetId: 'deadlines', x: 8, y: 0, w: 4, h: 3 },
      { i: 'followups-1', widgetId: 'followups', x: 0, y: 3, w: 4, h: 3 },
      { i: 'emails-1', widgetId: 'emails', x: 4, y: 3, w: 4, h: 3 },
      { i: 'events-1', widgetId: 'events', x: 8, y: 3, w: 4, h: 3 },
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
      { i: 'emails-1', widgetId: 'emails', x: 0, y: 0, w: 4, h: 4 },
      { i: 'followups-1', widgetId: 'followups', x: 4, y: 0, w: 4, h: 4 },
      { i: 'contacts-1', widgetId: 'contacts', x: 8, y: 0, w: 4, h: 4 },
      { i: 'triage-1', widgetId: 'triage', x: 0, y: 4, w: 6, h: 2 },
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
      { i: 'briefing-1', widgetId: 'briefing', x: 0, y: 0, w: 6, h: 3 },
      { i: 'emails-1', widgetId: 'emails', x: 6, y: 0, w: 3, h: 3 },
      { i: 'events-1', widgetId: 'events', x: 9, y: 0, w: 3, h: 3 },
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
      { i: 'trends-1', widgetId: 'trends', x: 0, y: 0, w: 6, h: 3 },
      { i: 'briefing-1', widgetId: 'briefing', x: 6, y: 0, w: 6, h: 3 },
      { i: 'deadlines-1', widgetId: 'deadlines', x: 0, y: 3, w: 4, h: 2 },
      { i: 'followups-1', widgetId: 'followups', x: 4, y: 3, w: 4, h: 2 },
      { i: 'contacts-1', widgetId: 'contacts', x: 8, y: 3, w: 4, h: 2 },
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
      { i: 'emails-1', widgetId: 'emails', x: 6, y: 0, w: 3, h: 3 },
      { i: 'events-1', widgetId: 'events', x: 9, y: 0, w: 3, h: 3 },
      // Row 2: Deadlines + Follow-ups + AI Triage
      { i: 'deadlines-1', widgetId: 'deadlines', x: 0, y: 3, w: 3, h: 2 },
      { i: 'followups-1', widgetId: 'followups', x: 3, y: 3, w: 4, h: 2 },
      { i: 'triage-1', widgetId: 'triage', x: 7, y: 3, w: 5, h: 2 },
      // Row 3: Trends + Stale Contacts
      { i: 'trends-1', widgetId: 'trends', x: 0, y: 5, w: 6, h: 2 },
      { i: 'contacts-1', widgetId: 'contacts', x: 6, y: 5, w: 6, h: 2 },
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

export function getPresetLayout(presetId: string): DashboardLayout | undefined {
  return LAYOUT_PRESETS[presetId];
}

export function getAllPresetIds(): string[] {
  return Object.keys(LAYOUT_PRESETS);
}

export function getRecommendedPresets(): PresetMetadata[] {
  return Object.values(PRESET_METADATA).filter((p) => p.recommended);
}

export function getPresetMetadata(presetId: string): PresetMetadata | undefined {
  return PRESET_METADATA[presetId];
}

export function getDefaultLayout(): DashboardLayout {
  return LAYOUT_PRESETS.default;
}
