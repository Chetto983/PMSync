/**
 * SuggestedPromptsService - Context-aware prompt suggestions
 * Phase 02-02: CHAT-02 requirement - Dynamic prompts based on user's current view
 *
 * Generates view-specific prompt suggestions that change based on where the user
 * is in the app (inbox, thread, calendar, contacts, compose, etc.)
 */
import { Injectable } from '@nestjs/common';

/**
 * Context describing the user's current view in the app.
 * Used to generate relevant prompt suggestions.
 */
export interface ViewContext {
  currentView: 'inbox' | 'thread' | 'calendar' | 'contacts' | 'compose' | 'dashboard' | 'ai';
  selectedEmailId?: string;
  selectedFolderId?: string;
  selectedContactId?: string;
}

/**
 * A single prompt suggestion to display in QuickActions.
 */
export interface PromptSuggestion {
  label: string;
  prompt: string;
  icon: string; // lucide icon name
}

@Injectable()
export class SuggestedPromptsService {
  /**
   * Get prompts appropriate for the user's current view.
   *
   * @param viewContext - The user's current location/view in the app
   * @param locale - User's locale for future i18n support
   * @returns Array of prompt suggestions tailored to the view
   */
  getPromptsForView(viewContext: ViewContext, locale: string = 'en'): PromptSuggestion[] {
    switch (viewContext.currentView) {
      case 'inbox':
        return this.getInboxPrompts(viewContext, locale);
      case 'thread':
        return this.getThreadPrompts(viewContext, locale);
      case 'calendar':
        return this.getCalendarPrompts(viewContext, locale);
      case 'contacts':
        return this.getContactsPrompts(viewContext, locale);
      case 'compose':
        return this.getComposePrompts(viewContext, locale);
      default:
        return this.getDefaultPrompts(locale);
    }
  }

  private getInboxPrompts(_ctx: ViewContext, _locale: string): PromptSuggestion[] {
    return [
      { label: 'Summarize unread', prompt: 'Summarize my unread emails', icon: 'Mail' },
      { label: 'Urgent messages', prompt: 'Show me urgent messages that need my attention', icon: 'AlertCircle' },
      { label: 'Pending replies', prompt: 'Which emails need a reply?', icon: 'Reply' },
    ];
  }

  private getThreadPrompts(ctx: ViewContext, _locale: string): PromptSuggestion[] {
    const emailId = ctx.selectedEmailId ? ` for email ${ctx.selectedEmailId}` : '';
    return [
      { label: 'Summarize thread', prompt: `Summarize this email thread${emailId}`, icon: 'FileText' },
      { label: 'Draft reply', prompt: `Draft a professional reply to this email${emailId}`, icon: 'PenLine' },
      { label: 'Extract actions', prompt: `What action items are in this thread${emailId}?`, icon: 'CheckSquare' },
    ];
  }

  private getCalendarPrompts(_ctx: ViewContext, _locale: string): PromptSuggestion[] {
    return [
      { label: "Today's schedule", prompt: "What's on my agenda today?", icon: 'Calendar' },
      { label: 'Find conflicts', prompt: 'Do I have any scheduling conflicts this week?', icon: 'AlertTriangle' },
      { label: 'Schedule focus time', prompt: 'Find me 2 hours for focused work this week', icon: 'Clock' },
    ];
  }

  private getContactsPrompts(_ctx: ViewContext, _locale: string): PromptSuggestion[] {
    return [
      { label: 'Stale contacts', prompt: 'Which contacts have I not reached out to recently?', icon: 'Users' },
      { label: 'Top connections', prompt: 'Who are my most active contacts this month?', icon: 'TrendingUp' },
      { label: 'Follow-up due', prompt: 'Which contacts need follow-up?', icon: 'Bell' },
    ];
  }

  private getComposePrompts(_ctx: ViewContext, _locale: string): PromptSuggestion[] {
    return [
      { label: 'Improve tone', prompt: 'Make this email sound more professional', icon: 'Sparkles' },
      { label: 'Shorten', prompt: 'Make this email more concise', icon: 'Minimize2' },
      { label: 'Check grammar', prompt: 'Check this email for grammar and clarity', icon: 'Check' },
    ];
  }

  private getDefaultPrompts(_locale: string): PromptSuggestion[] {
    return [
      { label: 'Summarize inbox', prompt: 'Summarize my unread emails', icon: 'Mail' },
      { label: "Today's schedule", prompt: "What's on my agenda today?", icon: 'Calendar' },
      { label: 'AI suggestions', prompt: 'What actions do you suggest today?', icon: 'Sparkles' },
    ];
  }
}
