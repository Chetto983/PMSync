import type { ComponentType } from 'react';

export type CommandGroup = 'navigation' | 'crm' | 'actions' | 'ai' | 'productivity' | 'system';
export type SearchResultType = 'email' | 'contact' | 'deal' | 'ticket' | 'kb';

export interface CommandItem {
  id: string;
  name: string;
  shortcut?: string;
  icon: ComponentType<{ size?: number }>;
  action: () => void;
  group: CommandGroup;
  keywords?: string[];
}

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  icon: ComponentType<{ size?: number }>;
  action: () => void;
}

export interface SearchResultGroup {
  type: SearchResultType;
  label: string;
  results: SearchResult[];
}
