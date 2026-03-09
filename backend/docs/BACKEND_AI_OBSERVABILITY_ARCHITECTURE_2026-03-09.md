# Backend AI Observability Architecture

Date: 2026-03-09
Scope: Current backend AI telemetry, metrics, and reporting surfaces
Status: Current reference

## Summary

The backend has a real AI observability layer, not just generic infrastructure logging.

Current AI observability components:

- `AiRunLedger` database records
- Prometheus counters for AI requests, tokens, and cost
- admin-facing AI observability REST endpoints
- audit logging around AI chat and tool execution

This is a solid foundation. The current weakness is not absence of telemetry, but incompleteness of telemetry around tool approval and execution.

## Core Components

### 1. AI Run Ledger

`AiRunLedgerService` records per-run telemetry including:

- tenant
- user
- run type
- model
- prompt tokens
- completion tokens
- total tokens
- estimated cost
- latency
- tool-call count
- HITL required flag
- request correlation ID
- status and error fields

This is the main structured application-layer telemetry surface for AI usage.

### 2. Prometheus AI Metrics

The metrics module exports:

- `ai_tokens_total`
- `ai_cost_usd_total`
- `ai_requests_total`

This gives the platform an infrastructure-friendly time-series view of AI activity.

### 3. AI Observability API

`AiObservabilityController` exposes tenant-scoped admin endpoints:

- `GET /api/v1/ai/runs`
- `GET /api/v1/ai/runs/cost-summary`

These provide paginated run inspection and aggregate cost/token views.

### 4. Audit Logging

The AI chat path emits audit records for:

- chat usage
- tool execution attempts

This complements the run ledger but does not replace it.

## Current Coverage

Observed run types include:

- `chat`
- `chat-summary`
- `briefing`
- `draft-generation`
- `follow-up-detection`
- prompt-specific Mistral completion paths

That means the observability model already spans multiple AI product surfaces, not just chat.

## Strong Points

### Telemetry Is Tenant-Aware

AI usage is linked to tenant and user context, which is essential for SaaS governance and cost control.

### Cost Is First-Class

Estimated cost is tracked alongside token counts and latency, which is the right operating model for AI features.

### AI Has Its Own Admin Surface

The platform already exposes AI run records as a domain-level admin capability rather than burying everything in infrastructure logs.

## Current Gaps

### Chat Tool Telemetry Is Under-Reported

The chat path currently records `toolCallCount: 0` even when tools were used.

That makes the AI run ledger materially incomplete for the most complex AI flow in the system.

### Approval Lifecycle Is Not Fully Captured

The current telemetry model does not fully capture:

- approval requested
- approval granted
- approval rejected
- approved action executed
- approved action failed

This is the biggest missing observability dimension in the AI control plane.

### Tool Outcome Semantics Are Thin

Audit logging exists for tool calls, but the structured ledger is not yet expressing enough about actual action outcomes.

### No Unified Narrative Across Ledger, Metrics, and HITL

The pieces exist, but the platform still lacks a single AI execution story that ties together:

- prompt and model usage
- tool calls
- approval state
- final execution outcome

## Guidance for Contributors

1. Treat the AI run ledger as the canonical application-level telemetry surface for AI.
2. Treat Prometheus counters as aggregate operational metrics, not the full source of truth.
3. When adding new AI features, define run types and telemetry expectations up front.
4. Any approval-gated tool action should emit observable state transitions.

## Recommended Next Improvements

1. Fix chat `toolCallCount` accounting.
2. Record approval lifecycle outcomes in ledger records.
3. Link action IDs and tool names into AI telemetry consistently.
4. Add explicit signals for blocked, failed, and approved mutating actions.
5. Add dashboards or reports focused on AI safety events, not only token and cost totals.

## Current Assessment

AI observability maturity: good foundation, incomplete control-plane visibility.

The platform already knows how much AI it is using and roughly what it costs. The next step is to know exactly what AI actions were attempted, approved, blocked, and executed.
