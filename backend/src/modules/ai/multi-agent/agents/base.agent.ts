import { Logger } from '@nestjs/common';
import {
  AgentContext,
  AgentCanHandleContext,
  AgentIntent,
} from '../interfaces/agent-context.interface';
import { AgentResult } from '../interfaces/agent-result.interface';
import { AgentAction, ActionSeverity, AgentActionType } from '../interfaces/agent-action.interface';

/**
 * Language mapping for supported locales.
 * Used to convert locale codes to full language names for LLM prompts.
 */
export const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  'en-US': 'English',
  'en-GB': 'English',
  it: 'Italian',
  'it-IT': 'Italian',
  es: 'Spanish',
  'es-ES': 'Spanish',
  fr: 'French',
  'fr-FR': 'French',
  de: 'German',
  'de-DE': 'German',
  pt: 'Portuguese',
  'pt-BR': 'Portuguese',
  'pt-PT': 'Portuguese',
};

/**
 * Localized error messages for when agents encounter errors.
 */
export const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  general: {
    en: "I'm sorry, I encountered an error. Please try again.",
    it: 'Mi dispiace, ho riscontrato un errore. Per favore riprova.',
    es: 'Lo siento, he encontrado un error. Por favor, inténtalo de nuevo.',
    fr: "Je suis désolé, j'ai rencontré une erreur. Veuillez réessayer.",
    de: 'Es tut mir leid, ich habe einen Fehler festgestellt. Bitte versuchen Sie es erneut.',
    pt: 'Desculpe, encontrei um erro. Por favor, tente novamente.',
  },
  email: {
    en: "I'm sorry, I had trouble understanding your email request. Could you please rephrase?",
    it: 'Mi dispiace, ho avuto difficoltà a capire la tua richiesta email. Potresti riformularla?',
    es: 'Lo siento, tuve problemas para entender tu solicitud de correo. ¿Podrías reformularla?',
    fr: "Je suis désolé, j'ai eu du mal à comprendre votre demande d'email. Pourriez-vous reformuler?",
    de: 'Es tut mir leid, ich hatte Schwierigkeiten, Ihre E-Mail-Anfrage zu verstehen. Könnten Sie sie umformulieren?',
    pt: 'Desculpe, tive dificuldade em entender seu pedido de email. Poderia reformular?',
  },
  calendar: {
    en: "I'm sorry, I had trouble understanding your calendar request. Could you please rephrase?",
    it: 'Mi dispiace, ho avuto difficoltà a capire la tua richiesta calendario. Potresti riformularla?',
    es: 'Lo siento, tuve problemas para entender tu solicitud de calendario. ¿Podrías reformularla?',
    fr: "Je suis désolé, j'ai eu du mal à comprendre votre demande de calendrier. Pourriez-vous reformuler?",
    de: 'Es tut mir leid, ich hatte Schwierigkeiten, Ihre Kalenderanfrage zu verstehen. Könnten Sie sie umformulieren?',
    pt: 'Desculpe, tive dificuldade em entender seu pedido de calendário. Poderia reformular?',
  },
  contacts: {
    en: "I'm sorry, I had trouble understanding your contact request. Could you please rephrase?",
    it: 'Mi dispiace, ho avuto difficoltà a capire la tua richiesta contatti. Potresti riformularla?',
    es: 'Lo siento, tuve problemas para entender tu solicitud de contactos. ¿Podrías reformularla?',
    fr: "Je suis désolé, j'ai eu du mal à comprendre votre demande de contacts. Pourriez-vous reformuler?",
    de: 'Es tut mir leid, ich hatte Schwierigkeiten, Ihre Kontaktanfrage zu verstehen. Könnten Sie sie umformulieren?',
    pt: 'Desculpe, tive dificuldade em entender seu pedido de contatos. Poderia reformular?',
  },
  clarification: {
    en: 'Could you please provide more details?',
    it: 'Potresti fornire più dettagli?',
    es: '¿Podrías proporcionar más detalles?',
    fr: 'Pourriez-vous fournir plus de détails?',
    de: 'Könnten Sie weitere Details angeben?',
    pt: 'Poderia fornecer mais detalhes?',
  },
};

/**
 * Abstract base class for all agents in the multi-agent system.
 * Implements common functionality and defines the contract for specialized agents.
 */
export abstract class BaseAgent {
  protected readonly logger: Logger;

  /** Unique name identifier for the agent */
  abstract readonly name: string;

  /** Human-readable description of the agent's capabilities */
  abstract readonly description: string;

  /** Intents this agent can handle */
  abstract readonly supportedIntents: AgentIntent[];

  constructor() {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Check if this agent can handle the given context.
   * Used by the router to determine which agent to use.
   */
  canHandle(context: AgentCanHandleContext): boolean {
    if (!context.intent) {
      return false;
    }
    return this.supportedIntents.includes(context.intent);
  }

  /**
   * Process the user's request and return a result.
   * This is the main entry point for agent execution.
   */
  abstract process(context: AgentContext): Promise<AgentResult>;

  /**
   * Create a simple text response without any actions.
   */
  protected createTextResponse(message: string): AgentResult {
    return {
      messages: [message],
      actions: [],
    };
  }

  /**
   * Create a response with actions that need approval.
   */
  protected createActionResponse(
    message: string,
    actions: AgentAction[],
    metadata?: AgentResult['metadata'],
  ): AgentResult {
    return {
      messages: [message],
      actions,
      metadata: {
        ...metadata,
        agentUsed: this.name,
      },
    };
  }

  /**
   * Create a response asking for more information.
   */
  protected createClarificationResponse(
    message: string,
    questions: string[],
  ): AgentResult {
    return {
      messages: [message],
      actions: [],
      needsMoreInfo: true,
      clarifyingQuestions: questions,
    };
  }

  /**
   * Determine action severity based on action type and context.
   * Can be overridden by specialized agents.
   */
  protected determineSeverity(
    actionType: AgentActionType,
    _payload: Record<string, any>,
  ): ActionSeverity {
    // Default severity mapping
    const highSeverityActions: AgentActionType[] = [
      AgentActionType.SEND_EMAIL,
      AgentActionType.DELETE_EMAIL,
      AgentActionType.DELETE_EVENT,
      AgentActionType.DELETE_CONTACT,
    ];

    const lowSeverityActions: AgentActionType[] = [
      AgentActionType.MARK_READ,
      AgentActionType.MARK_UNREAD,
      AgentActionType.STAR_EMAIL,
      AgentActionType.UNSTAR_EMAIL,
      AgentActionType.SEARCH_EMAILS,
      AgentActionType.GET_EVENTS,
      AgentActionType.GET_CONTACT,
    ];

    if (highSeverityActions.includes(actionType)) {
      return ActionSeverity.HIGH;
    }
    if (lowSeverityActions.includes(actionType)) {
      return ActionSeverity.LOW;
    }
    return ActionSeverity.MEDIUM;
  }

  /**
   * Build an action with proper severity and metadata.
   */
  protected buildAction(
    type: AgentActionType,
    payload: Record<string, any>,
    confidence: number,
    reasoningSteps?: string,
  ): AgentAction {
    return {
      type,
      payload,
      confidence,
      severity: this.determineSeverity(type, payload),
      reasoningSteps,
    };
  }

  /**
   * Format conversation history for LLM context.
   */
  protected formatHistory(
    history?: AgentContext['history'],
    maxMessages = 10,
  ): string {
    if (!history || history.length === 0) {
      return '';
    }

    const recentHistory = history.slice(-maxMessages);
    return recentHistory
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Extract user preferences with defaults.
   */
  protected getPreferences(context: AgentContext): {
    language: string;
    timezone: string;
    autoApproveThreshold: number;
  } {
    return {
      language: context.preferences?.language || 'en',
      timezone: context.preferences?.timezone || 'UTC',
      autoApproveThreshold: context.preferences?.autoApproveThreshold || 0.9,
    };
  }

  /**
   * Convert a locale code to the full language name for LLM prompts.
   * @param locale - The locale code (e.g., 'en', 'it', 'es-ES')
   * @returns The full language name (e.g., 'English', 'Italian', 'Spanish')
   */
  protected getLanguageName(locale: string): string {
    return (
      LANGUAGE_MAP[locale] ||
      LANGUAGE_MAP[locale.split('-')[0]] ||
      'English'
    );
  }

  /**
   * Get a localized error message for a specific error type.
   * @param errorType - The type of error (e.g., 'general', 'email', 'calendar', 'contacts')
   * @param locale - The locale code (e.g., 'en', 'it')
   * @returns The localized error message
   */
  protected getLocalizedErrorMessage(errorType: string, locale: string): string {
    const messages = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.general;
    const baseLocale = locale.split('-')[0];
    return messages[locale] || messages[baseLocale] || messages.en;
  }

  /**
   * Get a localized clarification question.
   * @param locale - The locale code
   * @returns The localized clarification message
   */
  protected getLocalizedClarificationMessage(locale: string): string {
    return this.getLocalizedErrorMessage('clarification', locale);
  }
}
