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
 * EmailAgent handles all email-related tasks for PMS (PMSync):
 * - Composing and sending emails
 * - Searching and reading emails
 * - Organizing emails (archive, delete, label)
 * - Replying and forwarding
 *
 * Multi-language support: Responds in user's preferred language.
 */
@Injectable()
export class EmailAgent extends BaseAgent {
  readonly name = 'EmailAgent';
  readonly description = 'PMS Email Agent - Handles email composition, search, and management';
  readonly supportedIntents = [AgentIntent.EMAIL];

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
        temperature: 0.3, // Lower temperature for structured output
      });
    }
    return this.model;
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.debug(`EmailAgent processing for tenant ${context.tenantId}`);

    try {
      // Analyze the request
      const analysis = await this.analyzeEmailRequest(context);
      const { language } = this.getPreferences(context);

      // Handle parse failures - use localized fallback message
      if (!analysis.message) {
        analysis.message = this.getLocalizedErrorMessage('email', language);
      }

      if (analysis.needsMoreInfo) {
        return this.createClarificationResponse(
          analysis.message,
          analysis.questions,
        );
      }

      // Build actions based on analysis
      const actions = this.buildEmailActions(analysis);

      const executionTime = Date.now() - startTime;
      this.logger.log(`EmailAgent created ${actions.length} actions in ${executionTime}ms`);

      return this.createActionResponse(
        analysis.message,
        actions,
        { executionTimeMs: executionTime },
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`EmailAgent error: ${err.message}`, err.stack);

      // Return localized error message
      const { language } = this.getPreferences(context);
      return this.createTextResponse(
        this.getLocalizedErrorMessage('email', language),
      );
    }
  }

  /**
   * Analyze the email request to determine what action is needed.
   */
  private async analyzeEmailRequest(context: AgentContext): Promise<{
    action: string;
    confidence: number;
    message: string;
    needsMoreInfo: boolean;
    questions: string[];
    params: Record<string, any>;
  }> {
    const model = this.getModel();
    const { language } = this.getPreferences(context);

    // Include relevant emails from enriched context
    const emailContext = this.formatRelevantEmails(context.enrichedContext?.relevantEmails);

    const languageName = this.getLanguageName(language);

    const prompt = PromptTemplate.fromTemplate(`
You are PMS (PMSync) Email Assistant - a helpful AI that manages email operations.

CRITICAL: You MUST respond ONLY in {languageName}. Never respond in a different language.

Available email actions:
- SEND_EMAIL: Send a new email (requires: to, subject, body)
- REPLY_EMAIL: Reply to an email (requires: emailId or context, body)
- FORWARD_EMAIL: Forward an email (requires: emailId, to)
- SEARCH_EMAILS: Search emails (requires: query)
- DELETE_EMAIL: Delete an email (requires: emailId)
- ARCHIVE_EMAIL: Archive an email (requires: emailId)
- MARK_READ: Mark email as read (requires: emailId)
- MARK_UNREAD: Mark email as unread (requires: emailId)
- STAR_EMAIL: Star/flag an email (requires: emailId)
- GET_UNREAD: Get unread emails count/list

Available folder actions:
- CREATE_FOLDER: Create a new email folder (requires: name, providerId; optional: parentPath)
- RENAME_FOLDER: Rename an existing folder (requires: folderPath, newName, providerId)
- DELETE_FOLDER: Delete a folder (requires: folderPath, providerId)

Conversation history:
{history}

Relevant emails from context:
{emailContext}

User's request:
{userMessage}

Analyze and respond with ONLY a JSON object (no markdown):
{{
  "action": "SEND_EMAIL|REPLY_EMAIL|FORWARD_EMAIL|SEARCH_EMAILS|DELETE_EMAIL|ARCHIVE_EMAIL|MARK_READ|MARK_UNREAD|STAR_EMAIL|GET_UNREAD|CREATE_FOLDER|RENAME_FOLDER|DELETE_FOLDER|UNKNOWN",
  "confidence": 0.0-1.0,
  "message": "Brief message to show user (MUST be in {languageName})",
  "needsMoreInfo": true|false,
  "questions": ["Questions if more info needed (MUST be in {languageName})"],
  "params": {{
    "to": "recipient@email.com",
    "cc": "cc@email.com",
    "subject": "email subject",
    "body": "email body",
    "emailId": "id of email to act on",
    "query": "search query",
    "folderName": "name for new folder or new name when renaming",
    "folderPath": "path of folder to rename or delete",
    "parentPath": "parent folder path for nested folders",
    "providerId": "email provider/account id"
  }}
}}
`);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const result = await chain.invoke({
      userMessage: context.userMessage,
      history: this.formatHistory(context.history) || 'No previous messages',
      emailContext: emailContext || 'No recent emails in context',
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
      this.logger.warn(`Failed to parse email analysis: ${result}`);
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
   * Build email actions from analysis result.
   */
  private buildEmailActions(analysis: {
    action: string;
    confidence: number;
    params: Record<string, any>;
  }): AgentAction[] {
    const actions: AgentAction[] = [];

    switch (analysis.action) {
      case 'SEND_EMAIL':
        if (analysis.params.to) {
          actions.push(this.buildAction(
            AgentActionType.SEND_EMAIL,
            {
              to: analysis.params.to,
              cc: analysis.params.cc,
              subject: analysis.params.subject,
              body: analysis.params.body,
            },
            analysis.confidence,
            'User requested to send a new email',
          ));
        }
        break;

      case 'REPLY_EMAIL':
        actions.push(this.buildAction(
          AgentActionType.REPLY_EMAIL,
          {
            emailId: analysis.params.emailId,
            body: analysis.params.body,
          },
          analysis.confidence,
          'User requested to reply to an email',
        ));
        break;

      case 'FORWARD_EMAIL':
        if (analysis.params.to) {
          actions.push(this.buildAction(
            AgentActionType.FORWARD_EMAIL,
            {
              emailId: analysis.params.emailId,
              to: analysis.params.to,
            },
            analysis.confidence,
            'User requested to forward an email',
          ));
        }
        break;

      case 'SEARCH_EMAILS':
        actions.push(this.buildAction(
          AgentActionType.SEARCH_EMAILS,
          { query: analysis.params.query },
          analysis.confidence,
          'User requested to search emails',
        ));
        break;

      case 'DELETE_EMAIL':
        if (analysis.params.emailId) {
          actions.push(this.buildAction(
            AgentActionType.DELETE_EMAIL,
            { emailId: analysis.params.emailId },
            analysis.confidence,
            'User requested to delete an email',
          ));
        }
        break;

      case 'ARCHIVE_EMAIL':
        if (analysis.params.emailId) {
          actions.push(this.buildAction(
            AgentActionType.ARCHIVE_EMAIL,
            { emailId: analysis.params.emailId },
            analysis.confidence,
            'User requested to archive an email',
          ));
        }
        break;

      case 'MARK_READ':
      case 'MARK_UNREAD':
        if (analysis.params.emailId) {
          actions.push(this.buildAction(
            analysis.action === 'MARK_READ'
              ? AgentActionType.MARK_READ
              : AgentActionType.MARK_UNREAD,
            { emailId: analysis.params.emailId },
            analysis.confidence,
            `User requested to mark email as ${analysis.action === 'MARK_READ' ? 'read' : 'unread'}`,
          ));
        }
        break;

      case 'STAR_EMAIL':
        if (analysis.params.emailId) {
          actions.push(this.buildAction(
            AgentActionType.STAR_EMAIL,
            { emailId: analysis.params.emailId },
            analysis.confidence,
            'User requested to star an email',
          ));
        }
        break;

      case 'GET_UNREAD':
        actions.push(this.buildAction(
          AgentActionType.GET_UNREAD,
          {},
          analysis.confidence,
          'User requested unread emails',
        ));
        break;

      case 'CREATE_FOLDER':
        if (analysis.params.folderName && analysis.params.providerId) {
          actions.push(this.buildAction(
            AgentActionType.CREATE_FOLDER,
            {
              name: analysis.params.folderName,
              providerId: analysis.params.providerId,
              parentPath: analysis.params.parentPath,
            },
            analysis.confidence,
            'User requested to create a new folder',
          ));
        }
        break;

      case 'RENAME_FOLDER':
        if (analysis.params.folderPath && analysis.params.folderName && analysis.params.providerId) {
          actions.push(this.buildAction(
            AgentActionType.RENAME_FOLDER,
            {
              folderPath: analysis.params.folderPath,
              newName: analysis.params.folderName,
              providerId: analysis.params.providerId,
            },
            analysis.confidence,
            'User requested to rename a folder',
          ));
        }
        break;

      case 'DELETE_FOLDER':
        if (analysis.params.folderPath && analysis.params.providerId) {
          actions.push(this.buildAction(
            AgentActionType.DELETE_FOLDER,
            {
              folderPath: analysis.params.folderPath,
              providerId: analysis.params.providerId,
            },
            analysis.confidence,
            'User requested to delete a folder',
          ));
        }
        break;
    }

    return actions;
  }

  /**
   * Override severity for email and folder actions.
   */
  protected determineSeverity(
    actionType: string,
    _payload: Record<string, any>,
  ): ActionSeverity {
    // High severity for sending/deleting emails and deleting folders
    if (['SEND_EMAIL', 'DELETE_EMAIL', 'FORWARD_EMAIL', 'DELETE_FOLDER'].includes(actionType)) {
      return ActionSeverity.HIGH;
    }

    // Medium for replies, archives, creating and renaming folders
    if (['REPLY_EMAIL', 'ARCHIVE_EMAIL', 'CREATE_FOLDER', 'RENAME_FOLDER'].includes(actionType)) {
      return ActionSeverity.MEDIUM;
    }

    // Low for read operations
    return ActionSeverity.LOW;
  }

  /**
   * Format relevant emails for context.
   */
  private formatRelevantEmails(
    emails?: Array<{
      id: string;
      subject: string;
      from: string;
      snippet: string;
      receivedAt: Date;
    }>,
  ): string {
    if (!emails || emails.length === 0) {
      return '';
    }

    return emails
      .slice(0, 5)
      .map(
        (e) =>
          `- From: ${e.from}\n  Subject: ${e.subject}\n  Snippet: ${e.snippet}\n  ID: ${e.id}`,
      )
      .join('\n\n');
  }
}
