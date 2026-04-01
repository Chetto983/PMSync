import {
  Home,
  Mail,
  Calendar,
  Users,
  Sparkles,
  PenSquare,
  Search,
  Reply,
  Bell,
  Clock,
  AlertTriangle,
  Settings,
  BarChart3,
  LogOut,
  Wand2,
  Workflow,
  Handshake,
  Ticket,
  Building2,
  BookOpen,
  TrendingUp,
  UserMinus,
  Shield,
  ShieldCheck,
  PlusCircle,
} from 'lucide-react';
import type { CommandItem } from './types';
import type { AppTranslations } from '@/locales';

interface PushRouter {
  push: (url: string) => void;
}

export const GROUP_ORDER = [
  'navigation',
  'crm',
  'actions',
  'ai',
  'productivity',
  'system',
] as const;

export const GROUP_LABELS: Record<string, (t: AppTranslations) => string> = {
  navigation: (t) => t.commandPalette.navigation,
  crm: (t) => t.commandPalette.crmNavigation,
  actions: (t) => t.commandPalette.actions,
  ai: (t) => t.commandPalette.ai,
  productivity: (t) => t.commandPalette.productivity,
  system: (t) => t.commandPalette.system,
};

export function buildCommands(
  router: PushRouter,
  t: AppTranslations,
  handleLogout: () => void,
): CommandItem[] {
  return [
    // Navigation
    { id: 'home', name: t.commandPalette.commands.goToDashboard, shortcut: '\u23181', icon: Home, action: () => router.push('/dashboard'), group: 'navigation', keywords: ['home', 'dashboard', 'main'] },
    { id: 'inbox', name: t.commandPalette.commands.goToInbox, shortcut: '\u23182', icon: Mail, action: () => router.push('/dashboard/email'), group: 'navigation', keywords: ['email', 'inbox', 'mail'] },
    { id: 'calendar', name: t.commandPalette.commands.goToCalendar, shortcut: '\u23183', icon: Calendar, action: () => router.push('/dashboard/calendar'), group: 'navigation', keywords: ['calendar', 'events', 'schedule'] },
    { id: 'contacts', name: t.commandPalette.commands.goToContacts, shortcut: '\u23184', icon: Users, action: () => router.push('/dashboard/contacts'), group: 'navigation', keywords: ['contacts', 'people', 'address'] },
    { id: 'ai', name: t.commandPalette.commands.goToAiAssistant, shortcut: '\u23185', icon: Sparkles, action: () => router.push('/dashboard/ai'), group: 'navigation', keywords: ['ai', 'assistant', 'smart'] },
    { id: 'analytics', name: t.commandPalette.commands.goToAnalytics, icon: BarChart3, action: () => router.push('/dashboard/analytics'), group: 'navigation', keywords: ['analytics', 'stats', 'metrics'] },
    { id: 'settings', name: t.commandPalette.commands.goToSettings, shortcut: '\u2318,', icon: Settings, action: () => router.push('/dashboard/settings'), group: 'navigation', keywords: ['settings', 'preferences', 'config'] },

    // CRM
    { id: 'crm-pipelines', name: t.commandPalette.commands.goToPipelines, icon: Workflow, action: () => router.push('/dashboard/crm/pipelines'), group: 'crm', keywords: ['pipelines', 'crm', 'sales', 'funnel'] },
    { id: 'crm-deals', name: t.commandPalette.commands.goToDeals, icon: Handshake, action: () => router.push('/dashboard/crm/deals'), group: 'crm', keywords: ['deals', 'crm', 'sales', 'opportunities'] },
    { id: 'crm-tickets', name: t.commandPalette.commands.goToTickets, icon: Ticket, action: () => router.push('/dashboard/crm/tickets'), group: 'crm', keywords: ['tickets', 'support', 'issues', 'help'] },
    { id: 'crm-accounts', name: t.commandPalette.commands.goToAccounts, icon: Building2, action: () => router.push('/dashboard/crm/accounts'), group: 'crm', keywords: ['accounts', 'companies', 'organizations'] },
    { id: 'crm-kb', name: t.commandPalette.commands.goToKB, icon: BookOpen, action: () => router.push('/dashboard/crm/kb'), group: 'crm', keywords: ['knowledge', 'kb', 'articles', 'docs', 'help'] },
    { id: 'crm-forecast', name: t.commandPalette.commands.goToForecast, icon: TrendingUp, action: () => router.push('/dashboard/crm/forecast'), group: 'crm', keywords: ['forecast', 'prediction', 'revenue'] },
    { id: 'crm-churn', name: t.commandPalette.commands.goToChurn, icon: UserMinus, action: () => router.push('/dashboard/crm/churn'), group: 'crm', keywords: ['churn', 'attrition', 'retention'] },
    { id: 'crm-service-analytics', name: t.commandPalette.commands.goToServiceAnalytics, icon: BarChart3, action: () => router.push('/dashboard/crm/service-analytics'), group: 'crm', keywords: ['service', 'analytics', 'metrics', 'support'] },
    { id: 'crm-ai-governance', name: t.commandPalette.commands.goToAiGovernance, icon: Shield, action: () => router.push('/dashboard/crm/ai-governance'), group: 'crm', keywords: ['governance', 'ai', 'rules', 'policies'] },
    { id: 'reminders', name: t.commandPalette.commands.goToReminders, icon: Bell, action: () => router.push('/dashboard/reminders'), group: 'crm', keywords: ['reminders', 'alerts', 'notifications'] },
    { id: 'admin', name: t.commandPalette.commands.goToAdmin, icon: ShieldCheck, action: () => router.push('/dashboard/admin'), group: 'crm', keywords: ['admin', 'administration', 'manage'] },

    // Actions
    { id: 'compose', name: t.commandPalette.commands.composeEmail, shortcut: '\u2318N', icon: PenSquare, action: () => router.push('/dashboard/email?compose=true'), group: 'actions', keywords: ['compose', 'new', 'write', 'email'] },
    { id: 'search', name: t.commandPalette.commands.searchEmails, shortcut: '/', icon: Search, action: () => router.push('/dashboard/email?focus=search'), group: 'actions', keywords: ['search', 'find', 'look'] },
    { id: 'create-deal', name: t.commandPalette.commands.createDeal, icon: PlusCircle, action: () => router.push('/dashboard/crm/deals?action=create'), group: 'actions', keywords: ['new deal', 'create deal', 'add deal'] },
    { id: 'create-task', name: t.commandPalette.commands.createTask, icon: PlusCircle, action: () => router.push('/dashboard/tasks?action=create'), group: 'actions', keywords: ['new task', 'create task', 'add task', 'todo'] },
    { id: 'create-ticket', name: t.commandPalette.commands.createTicket, icon: PlusCircle, action: () => router.push('/dashboard/crm/tickets?action=create'), group: 'actions', keywords: ['new ticket', 'create ticket', 'support'] },
    { id: 'create-contact', name: t.commandPalette.commands.createContact, icon: PlusCircle, action: () => router.push('/dashboard/contacts?action=create'), group: 'actions', keywords: ['new contact', 'create contact', 'add person'] },

    // AI
    { id: 'ai-summarize', name: t.commandPalette.commands.aiSummarize, shortcut: '\u21E7S', icon: Sparkles, action: () => { window.dispatchEvent(new CustomEvent('command:ai-summarize')); }, group: 'ai', keywords: ['summarize', 'summary', 'ai', 'tldr'] },
    { id: 'ai-reply', name: t.commandPalette.commands.aiQuickReply, shortcut: '\u21E7R', icon: Reply, action: () => { window.dispatchEvent(new CustomEvent('command:ai-reply')); }, group: 'ai', keywords: ['reply', 'respond', 'ai', 'quick'] },
    { id: 'ai-compose', name: t.commandPalette.commands.aiComposeContext, shortcut: '\u2318J', icon: Wand2, action: () => { window.dispatchEvent(new CustomEvent('command:ai-compose')); }, group: 'ai', keywords: ['compose', 'write', 'ai', 'context'] },

    // Productivity
    { id: 'followups', name: t.commandPalette.commands.viewFollowups, icon: Bell, action: () => router.push('/dashboard?view=followups'), group: 'productivity', keywords: ['followup', 'pending', 'waiting'] },
    { id: 'deadlines', name: t.commandPalette.commands.viewDeadlines, icon: Clock, action: () => router.push('/dashboard?view=deadlines'), group: 'productivity', keywords: ['deadline', 'due', 'urgent'] },
    { id: 'stale-contacts', name: t.commandPalette.commands.viewStaleContacts, icon: AlertTriangle, action: () => router.push('/dashboard/contacts?filter=stale'), group: 'productivity', keywords: ['stale', 'inactive', 'reconnect'] },

    // System
    { id: 'logout', name: t.commandPalette.commands.logout, icon: LogOut, action: handleLogout, group: 'system', keywords: ['logout', 'signout', 'exit'] },
  ];
}
