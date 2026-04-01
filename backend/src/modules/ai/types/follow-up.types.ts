/**
 * Follow-up detection shared types.
 * Zod schema + inferred TypeScript type for follow-up detection output.
 * Consumed by: follow-up-detection.service.ts, frontend API types.
 */
import { z } from 'zod';

export const followUpDetectionSchema = z.object({
  detectedFollowUps: z.array(z.object({
    emailId: z.string().describe('ID of the email needing follow-up'),
    reason: z.string().describe('Why this email needs follow-up'),
    suggestedDueDate: z.string().nullable().default(null).describe('ISO date string for suggested due date'),
    urgency: z.enum(['high', 'medium', 'low']).default('medium').describe('Follow-up urgency level'),
    confidence: z.number().default(0.5).describe('Confidence score 0-1'),
  })).default([]).describe('Emails detected as needing follow-up'),

  batchSummary: z.object({
    totalAnalyzed: z.number().default(0).describe('Number of emails analyzed in this batch'),
    totalDetected: z.number().default(0).describe('Number of follow-ups detected'),
    highUrgencyCount: z.number().default(0).describe('Number of high-urgency follow-ups'),
  }).default({ totalAnalyzed: 0, totalDetected: 0, highUrgencyCount: 0 }).describe('Summary of the batch analysis'),
});

export type FollowUpDetectionOutput = z.infer<typeof followUpDetectionSchema>;
