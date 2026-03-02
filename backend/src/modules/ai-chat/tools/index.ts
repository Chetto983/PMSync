import { z } from 'zod';

/**
 * Tool schemas for Phase 24 HITL testing.
 * Real tool implementations added in Phase 25.
 *
 * IMPORTANT: Do NOT export a getToolSet() function here.
 * Tools are instantiated in AiChatService.createToolSet() which provides
 * PII resolution via closure. A static export would bypass PII detokenization.
 */

export const sendEmailSchema = z.object({
  to: z.string().describe('Recipient email address'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content'),
});

export const searchEmailsSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().describe('Max results to return'),
});
