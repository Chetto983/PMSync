import type React from 'react';

export interface CommandItem {
  id: string;
  name: string;
  shortcut?: string;
  icon: React.ComponentType<{ size?: number }>;
  action: () => void;
  group: 'navigation' | 'crm' | 'actions' | 'ai' | 'productivity' | 'system';
  keywords?: string[];
}

export interface SearchResult {
  id: string;
  type: 'email' | 'contact' | 'event' | 'deal' | 'ticket' | 'kb';
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number }>;
  action: () => void;
}

export interface SearchResultGroup {
  type: SearchResult['type'];
  label: string;
  results: SearchResult[];
}
