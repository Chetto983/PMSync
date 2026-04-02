# Research Summary: Email Triage & Classification Competitor Analysis

**Domain:** AI email triage, label onboarding, email classification systems
**Researched:** 2026-04-02
**Overall confidence:** MEDIUM (mix of official help docs, blog posts, and review articles; no hands-on testing)

## Executive Summary

The email triage/classification market has converged on two distinct camps: **AI-first classifiers** (Superhuman, Shortwave, Spark) that use LLMs and ML to auto-label emails with zero user effort, and **behavior-driven organizers** (SaneBox, HEY, Clean Email) that rely on user actions (drag-to-train, sender screening, rule creation) as the primary classification signal. The winners are converging on a hybrid model: preset smart categories as a zero-config starting point, with AI-powered custom labels for personalization.

Superhuman's "Auto Labels" feature (launched Feb 2025, expanded through early 2026) is the closest competitor to PMSync's existing label triage system. They offer 4 built-in labels (Marketing, Pitch, Social, News) plus AI-prompt-driven custom labels -- strikingly similar to PMSync's `aiPrompt` field on labels. Shortwave's "Magic Labels" take a different approach: remember sender-to-label mappings and auto-apply them, inspired directly by Google Inbox's bundles. HEY takes the most opinionated stance with "The Screener" -- a binary gate (yes/no per sender) combined with 3-way routing (Imbox/Feed/Paper Trail).

The key differentiator across all products is **onboarding friction vs. classification accuracy**. SaneBox achieves 98%+ accuracy in 1-2 weeks by scanning 4-6 weeks of email headers with zero user configuration. Superhuman requires users to write AI prompts for custom labels (high friction, high precision). HEY forces a sender-by-sender screening process (high friction, perfect recall). The sweet spot -- and where PMSync should aim -- is a wizard-driven onboarding that generates AI prompts automatically from user context (domains, senders, topics), which is exactly what the existing `TriageOnboardingRules` contract already does. The research validates this approach.

PMSync's existing implementation is architecturally ahead of most competitors in one critical way: **per-label AI prompts with a taxonomy system** (family, mutual exclusivity, urgency suppression, default lanes). No competitor exposes this level of label metadata publicly. However, the onboarding UX and the "learning from corrections" feedback loop are underdeveloped compared to SaneBox and Shortwave.

## Key Findings

**Stack:** LLM-based classification is now standard. Superhuman uses OpenAI, Shortwave uses Claude. PMSync's Mistral-based approach is viable but needs strong prompt engineering.
**Architecture:** Two-tier label system (built-in presets + user-customizable AI labels) is the proven pattern across Superhuman, Shortwave, and Spark.
**Critical pitfall:** Over-classifying on first run destroys user trust. SaneBox's approach of scanning historical headers before applying any labels is the gold standard for bootstrap accuracy.

## Implications for Roadmap

Based on research, suggested phase structure for the Smart Views & Task Customization work:

1. **Smart Views Foundation** - Build the UI layer that makes label triage visible and actionable
   - Addresses: TASK-04, TASK-05 (named smart views, pinned views)
   - Avoids: Building more classification without a place to surface results

2. **Onboarding Wizard UX** - Surface the existing `TriageOnboardingRules` contract as a guided setup flow
   - Addresses: The gap between the backend triage contract and user-facing configuration
   - Avoids: Superhuman's mistake of requiring users to write raw AI prompts

3. **Classification Feedback Loop** - Add "correct this label" actions that refine per-label prompts
   - Addresses: SaneBox-style drag-to-correct and Shortwave's "Magic Labels" sender memory
   - Avoids: Static prompts that never improve with use

4. **Auto-Apply on Ingest** - Run classification in the background on new email arrival
   - Addresses: AI-03 requirement (auto-categorizes emails by type)
   - Avoids: Batch-only processing that misses real-time urgency signals

**Phase ordering rationale:**
- Smart Views first because classification results need a visible home before investing in accuracy
- Onboarding wizard before feedback loop because initial accuracy determines whether users trust the system enough to keep using it
- Auto-apply last because it requires confidence in classification quality and has cost/latency implications

**Research flags for phases:**
- Phase 2 (wizard): Needs UI/UX research on wizard step count and field types -- competitors use 0-3 setup steps
- Phase 3 (feedback): Needs deeper research on how to mutate `aiPrompt` text from user corrections without regression
- Phase 4 (auto-apply): Needs cost modeling for per-email LLM classification at the user's email volume

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Superhuman Auto Labels | HIGH | Multiple official help pages, TechCrunch coverage, X changelog |
| Shortwave Magic Labels | HIGH | Official blog post + docs pages |
| HEY onboarding | HIGH | Official how-it-works pages + multiple onboarding teardowns |
| SaneBox training | MEDIUM | Help pages + review articles; exact ML internals are proprietary |
| Spark Smart Inbox | MEDIUM | Feature pages and review articles; less technical depth available |
| Clean Email | MEDIUM | Feature pages; ML approach undocumented |
| Google Inbox (historical) | LOW | Product sunset in 2019; details from old articles and memory |
| Triage (the app) | LOW | App appears defunct; no substantive details found on its specific approach |

## Gaps to Address

- Exact LLM models and prompt templates used by Superhuman and Shortwave are proprietary -- cannot verify prompt engineering approaches
- Cost-per-classification economics at scale (how much does per-email LLM triage cost for a 200-email/day user?)
- How competitors handle multi-label assignment vs. single-label (PMSync already supports multi-label via taxonomy rules)
- How competitors handle label drift over time -- do they re-evaluate old emails when prompts change?
- Mobile-specific onboarding flows (most research focused on desktop experiences)
