import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMistralAI } from '@langchain/mistralai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { BaseAgent } from './base.agent';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentResult } from '../interfaces/agent-result.interface';
import { AgentAction, AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';

/**
 * ContactsAgent handles all contact-related tasks for PMS (PMSync):
 * - Finding and searching contacts
 * - Creating new contacts
 * - Updating contact information
 * - Merging duplicate contacts
 *
 * Multi-language support: Responds in user's preferred language.
 */
@Injectable()
export class ContactsAgent extends BaseAgent {
  readonly name = 'ContactsAgent';
  readonly description = 'PMS Contacts Agent - Handles contact search, creation, and management';
  readonly supportedIntents = [AgentIntent.CONTACTS];

  private model: ChatMistralAI | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private getModel(): ChatMistralAI {
    if (!this.model) {
      const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is not configured');
      }

      this.model = new ChatMistralAI({
        apiKey,
        model: 'mistral-small-latest',
        temperature: 0.3,
      });
    }
    return this.model;
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.debug(`ContactsAgent processing for tenant ${context.tenantId}`);

    try {
      const analysis = await this.analyzeContactRequest(context);
      const { language } = this.getPreferences(context);

      // Handle parse failures - use localized fallback message
      if (!analysis.message) {
        analysis.message = this.getLocalizedErrorMessage('contacts', language);
      }

      if (analysis.needsMoreInfo) {
        return this.createClarificationResponse(
          analysis.message,
          analysis.questions,
        );
      }

      const actions = this.buildContactActions(analysis);

      const executionTime = Date.now() - startTime;
      this.logger.log(`ContactsAgent created ${actions.length} actions in ${executionTime}ms`);

      return this.createActionResponse(
        analysis.message,
        actions,
        { executionTimeMs: executionTime },
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`ContactsAgent error: ${err.message}`, err.stack);

      // Return localized error message
      const { language } = this.getPreferences(context);
      return this.createTextResponse(
        this.getLocalizedErrorMessage('contacts', language),
      );
    }
  }

  /**
   * Analyze the contact request.
   */
  private async analyzeContactRequest(context: AgentContext): Promise<{
    action: string;
    confidence: number;
    message: string;
    needsMoreInfo: boolean;
    questions: string[];
    params: Record<string, any>;
  }> {
    const model = this.getModel();
    const { language } = this.getPreferences(context);

    const contactContext = this.formatRelevantContacts(context.enrichedContext?.relevantContacts);
    const languageName = this.getLanguageName(language);

    const prompt = PromptTemplate.fromTemplate(`
You are PMS (PMSync) Contacts Assistant - a helpful AI that manages contacts and address book.

CRITICAL: You MUST respond ONLY in {languageName}. Never respond in a different language.

Available contact actions:
- SEARCH_CONTACTS: Search for contacts (requires: query)
- GET_CONTACT: Get contact details (requires: contactId or name/email)
- CREATE_CONTACT: Create a new contact (requires: at least name or email)
- UPDATE_CONTACT: Update contact info (requires: contactId + fields to update)
- DELETE_CONTACT: Delete a contact (requires: contactId)
- MERGE_CONTACTS: Merge duplicate contacts (requires: contactIds array)

Conversation history:
{history}

Relevant contacts from context:
{contactContext}

User's request:
{userMessage}

Analyze and respond with ONLY a JSON object (no markdown):
{{
  "action": "SEARCH_CONTACTS|GET_CONTACT|CREATE_CONTACT|UPDATE_CONTACT|DELETE_CONTACT|MERGE_CONTACTS|UNKNOWN",
  "confidence": 0.0-1.0,
  "message": "Brief message to show user (MUST be in {languageName})",
  "needsMoreInfo": true|false,
  "questions": ["Questions if more info needed (MUST be in {languageName})"],
  "params": {{
    "query": "search query",
    "contactId": "contact id",
    "contactIds": ["id1", "id2"],
    "name": "contact name",
    "firstName": "first name",
    "lastName": "last name",
    "email": "email@example.com",
    "phone": "phone number",
    "company": "company name",
    "jobTitle": "job title",
    "notes": "notes about contact"
  }}
}}
`);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const result = await chain.invoke({
      userMessage: context.userMessage,
      history: this.formatHistory(context.history) || 'No previous messages',
      contactContext: contactContext || 'No contacts in context',
      languageName,
    });

    return this.parseAnalysisResult(result);
  }

  /**
   * Parse the LLM analysis result.
   */
  private parseAnalysisResult(result: string): {
    action: string;
    confidence: number;
    message: string;
    needsMoreInfo: boolean;
    questions: string[];
    params: Record<string, any>;
  } {
    try {
      let cleaned = result.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      return {
        action: parsed.action || 'UNKNOWN',
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        message: parsed.message || '',
        needsMoreInfo: Boolean(parsed.needsMoreInfo),
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        params: parsed.params || {},
      };
    } catch {
      this.logger.warn(`Failed to parse contact analysis: ${result}`);
      return {
        action: 'UNKNOWN',
        confidence: 0.3,
        message: '', // Will be replaced with localized message in process()
        needsMoreInfo: true,
        questions: [],
        params: {},
      };
    }
  }

  /**
   * Build contact actions from analysis result.
   */
  private buildContactActions(analysis: {
    action: string;
    confidence: number;
    params: Record<string, any>;
  }): AgentAction[] {
    const actions: AgentAction[] = [];

    switch (analysis.action) {
      case 'SEARCH_CONTACTS':
        if (analysis.params.query) {
          actions.push(this.buildAction(
            AgentActionType.SEARCH_CONTACTS,
            { query: analysis.params.query },
            analysis.confidence,
            'User requested to search contacts',
          ));
        }
        break;

      case 'GET_CONTACT':
        actions.push(this.buildAction(
          AgentActionType.GET_CONTACT,
          {
            contactId: analysis.params.contactId,
            name: analysis.params.name,
            email: analysis.params.email,
          },
          analysis.confidence,
          'User requested contact details',
        ));
        break;

      case 'CREATE_CONTACT':
        if (analysis.params.name || analysis.params.email) {
          actions.push(this.buildAction(
            AgentActionType.CREATE_CONTACT,
            {
              name: analysis.params.name,
              firstName: analysis.params.firstName,
              lastName: analysis.params.lastName,
              email: analysis.params.email,
              phone: analysis.params.phone,
              company: analysis.params.company,
              jobTitle: analysis.params.jobTitle,
              notes: analysis.params.notes,
            },
            analysis.confidence,
            'User requested to create a new contact',
          ));
        }
        break;

      case 'UPDATE_CONTACT':
        if (analysis.params.contactId) {
          actions.push(this.buildAction(
            AgentActionType.UPDATE_CONTACT,
            {
              contactId: analysis.params.contactId,
              name: analysis.params.name,
              firstName: analysis.params.firstName,
              lastName: analysis.params.lastName,
              email: analysis.params.email,
              phone: analysis.params.phone,
              company: analysis.params.company,
              jobTitle: analysis.params.jobTitle,
              notes: analysis.params.notes,
            },
            analysis.confidence,
            'User requested to update a contact',
          ));
        }
        break;

      case 'DELETE_CONTACT':
        if (analysis.params.contactId) {
          actions.push(this.buildAction(
            AgentActionType.DELETE_CONTACT,
            { contactId: analysis.params.contactId },
            analysis.confidence,
            'User requested to delete a contact',
          ));
        }
        break;

      case 'MERGE_CONTACTS':
        if (analysis.params.contactIds && analysis.params.contactIds.length >= 2) {
          actions.push(this.buildAction(
            AgentActionType.MERGE_CONTACTS,
            { contactIds: analysis.params.contactIds },
            analysis.confidence,
            'User requested to merge duplicate contacts',
          ));
        }
        break;
    }

    return actions;
  }

  /**
   * Override severity for contact actions.
   */
  protected determineSeverity(
    actionType: string,
    _payload: Record<string, any>,
  ): ActionSeverity {
    // High severity for deleting/merging
    if (['DELETE_CONTACT', 'MERGE_CONTACTS'].includes(actionType)) {
      return ActionSeverity.HIGH;
    }

    // Medium for create/update
    if (['CREATE_CONTACT', 'UPDATE_CONTACT'].includes(actionType)) {
      return ActionSeverity.MEDIUM;
    }

    // Low for read operations
    return ActionSeverity.LOW;
  }

  /**
   * Format relevant contacts for context.
   */
  private formatRelevantContacts(
    contacts?: Array<{
      id: string;
      name: string;
      email: string;
      company?: string;
    }>,
  ): string {
    if (!contacts || contacts.length === 0) {
      return '';
    }

    return contacts
      .slice(0, 5)
      .map(
        (c) =>
          `- Name: ${c.name}\n  Email: ${c.email}${c.company ? `\n  Company: ${c.company}` : ''}\n  ID: ${c.id}`,
      )
      .join('\n\n');
  }
}
