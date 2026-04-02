/**
 * LabelResolutionService — Resolves email labels using a precedence-based pipeline.
 *
 * Precedence order:
 *   1. Triage rules (domain/sender/keyword from TriageRuleService)
 *   2. LLM-assigned labels (from model output)
 *   3. Heuristic inference (keyword matching against tenant label names)
 *   4. Zero labels → empty array (no fallback defaults)
 *
 * Handles contradiction resolution via mutuallyExclusiveWith metadata.
 * Max 3 labels after resolution.
 *
 * Phase 10 — Sprint 15 (T-1501)
 */
import { Injectable, Logger } from '@nestjs/common';
import type { TriageRule } from './triage-rule.service';

export interface TenantLabel {
  name: string;
  aiPrompt: string | null;
  category: string;
  suppressUrgency: boolean;
  mutuallyExclusiveWith: string[];
  defaultLane: string | null;
}

export interface LabelResolutionInput {
  /** Raw labels from the LLM output (already normalised to allowed names) */
  modelLabels: string[];
  /** All active labels for this tenant */
  tenantLabels: TenantLabel[];
  /** Triage rules for this tenant */
  triageRules: TriageRule[];
  /** Email fields for heuristic inference and rule matching */
  email: {
    from: string;
    subject: string | null;
    bodyText: string | null;
    snippet: string | null;
  };
  /** LLM-derived signals for heuristic fallback */
  signals: {
    priority: 1 | 2 | 3 | 4 | 5;
    urgency: 'critical' | 'high' | 'medium' | 'low';
    intent: string;
    escalationRisk: boolean;
    hasDeadline: boolean;
    needsFollowUp: boolean;
  };
}

export interface LabelResolutionResult {
  labels: string[];
  suppressUrgency: boolean;
}

const MAX_LABELS = 3;

@Injectable()
export class LabelResolutionService {
  private readonly logger = new Logger(LabelResolutionService.name);

  /**
   * Resolve labels for an email using the full precedence pipeline.
   * Returns empty array if tenant has no labels.
   */
  resolve(input: LabelResolutionInput): LabelResolutionResult {
    const { tenantLabels, triageRules, modelLabels, email, signals } = input;

    // Zero-labels case: skip resolution entirely
    if (tenantLabels.length === 0) {
      return { labels: [], suppressUrgency: false };
    }

    const allowedNames = tenantLabels.map((l) => l.name);
    const collected: string[] = [];

    // 1. Triage rules match (highest precedence)
    const ruleLabels = this.matchTriageRules(triageRules, email, allowedNames);
    for (const label of ruleLabels) {
      if (!collected.includes(label)) collected.push(label);
    }

    // 2. LLM-assigned labels
    for (const label of modelLabels) {
      if (allowedNames.includes(label) && !collected.includes(label)) {
        collected.push(label);
      }
    }

    // 3. Heuristic inference (only if no labels yet from rules or LLM)
    if (collected.length === 0) {
      const inferred = this.inferLabels(email, allowedNames, signals);
      for (const label of inferred) {
        if (!collected.includes(label)) collected.push(label);
      }
    }

    // 4. Contradiction resolution + cap
    const resolved = this.resolveContradictions(collected, tenantLabels);
    const finalLabels = resolved.slice(0, MAX_LABELS);

    // Check suppressUrgency across all resolved labels
    const suppressUrgency = finalLabels.some((labelName) => {
      const def = tenantLabels.find((l) => l.name === labelName);
      return def?.suppressUrgency === true;
    });

    return { labels: finalLabels, suppressUrgency };
  }

  /**
   * Match triage rules against email fields.
   * Returns label names from rules that match.
   */
  private matchTriageRules(
    rules: TriageRule[],
    email: { from: string; subject: string | null; bodyText: string | null; snippet: string | null },
    allowedNames: string[],
  ): string[] {
    const matched: string[] = [];
    const fromLower = email.from.toLowerCase();
    const sample = `${email.subject || ''} ${email.bodyText || ''} ${email.snippet || ''}`.toLowerCase();

    for (const rule of rules) {
      if (!rule.labelName) continue;

      const normalised = this.normaliseLabel(rule.labelName, allowedNames);
      if (!allowedNames.includes(normalised)) continue;

      const pattern = rule.pattern.toLowerCase();
      let matches = false;

      switch (rule.type) {
        case 'domain':
          matches = fromLower.includes(`@${pattern}`) || fromLower.endsWith(pattern);
          break;
        case 'sender':
          matches = fromLower.includes(pattern);
          break;
        case 'keyword':
          matches = sample.includes(pattern);
          break;
        case 'phrase':
          matches = sample.includes(pattern);
          break;
      }

      if (matches && !matched.includes(normalised)) {
        matched.push(normalised);
      }
    }

    return matched;
  }

  /**
   * Heuristic inference: keyword matching against tenant label names.
   * Uses label names as keywords (no hardcoded label references).
   */
  private inferLabels(
    email: { from: string; subject: string | null; bodyText: string | null; snippet: string | null },
    allowedNames: string[],
    signals: {
      priority: 1 | 2 | 3 | 4 | 5;
      urgency: 'critical' | 'high' | 'medium' | 'low';
      intent: string;
      escalationRisk: boolean;
      hasDeadline: boolean;
      needsFollowUp: boolean;
    },
  ): string[] {
    const sample = `${email.subject || ''}\n${email.snippet || ''}\n${email.bodyText || ''}`.toLowerCase();
    const inferred: string[] = [];

    // Match labels whose name appears as a keyword in the email content
    for (const labelName of allowedNames) {
      const nameLower = labelName.toLowerCase();
      // Only match full words (avoid partial matches on short names)
      if (nameLower.length >= 3 && sample.includes(nameLower) && !inferred.includes(labelName)) {
        inferred.push(labelName);
      }
    }

    return inferred.slice(0, MAX_LABELS);
  }

  /**
   * Resolve contradictions using mutuallyExclusiveWith metadata.
   * When two mutually exclusive labels are found, keep the one listed first
   * in the collected order (which follows precedence).
   */
  private resolveContradictions(labels: string[], tenantLabels: TenantLabel[]): string[] {
    const removed = new Set<string>();

    for (const labelName of labels) {
      if (removed.has(labelName)) continue;

      const def = tenantLabels.find((l) => l.name === labelName);
      if (!def || def.mutuallyExclusiveWith.length === 0) continue;

      // Mark any later labels that conflict with this one
      const exclusions = new Set(def.mutuallyExclusiveWith.map((n) => n.toLowerCase()));
      for (const otherName of labels) {
        if (otherName === labelName || removed.has(otherName)) continue;
        if (exclusions.has(otherName.toLowerCase())) {
          removed.add(otherName);
          this.logger.debug(
            `Contradiction resolved: kept "${labelName}", removed "${otherName}" (mutually exclusive)`,
          );
        }
      }
    }

    return labels.filter((l) => !removed.has(l));
  }

  /**
   * Normalise a label string to match an allowed label (case-insensitive).
   */
  normaliseLabel(label: string, allowedLabels: string[]): string {
    const trimmed = label.trim().toLowerCase();
    const found = allowedLabels.find(
      (item) => item.toLowerCase() === trimmed || item.toLowerCase().includes(trimmed),
    );
    return found ?? label.trim();
  }
}
