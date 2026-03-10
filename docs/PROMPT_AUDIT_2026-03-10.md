# PMSync Prompt System Audit

Date: 2026-03-10
Baseline: 29 industry system prompts (Claude Code, Cursor, Windsurf, Devin, Manus, Replit, Lovable, v0, Kiro, Cline, Bolt, VSCode Agent, Augment Code, Junie, Trae, Warp.dev, Qoder, Google Antigravity, Emergent, Same.dev, Codex CLI, Gemini CLI, Traycer AI, Poke)

## Executive Summary

PMSync currently ships **6 prompt/context files** totaling ~2,260 lines. The main CLAUDE.md is 1,042 lines — bloated, redundant, and mixing project-specific rules with generic claude-flow marketing copy. Several files overlap or contradict each other. Compared to the best industry prompts, PMSync's prompt system is strong on some behavioral rules but weak on structure, focus, and signal-to-noise ratio.

**Verdict: needs a significant rewrite, not a patch.**

---

## 1. File Inventory and Overlap Analysis

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `CLAUDE.md` | 1,042 | Main Claude Code instructions | **Bloated, needs rewrite** |
| `claude_old_part1.md` | 200 | Old version of CLAUDE.md | **DELETE — dead weight** |
| `AI_PROMPT.md` | 82 | Generic AI agent setup (ai-memory npm) | **DELETE — superseded by CLAUDE.md** |
| `AGENTS.md` | 173 | Dev guidelines, tech stack | **MERGE into CLAUDE.md** |
| `technical_overview.md` | 238 | Architecture overview | **KEEP — reference doc** |
| `AUDIT.md` | 525 | Architecture/security audit | **KEEP — reference doc** |

### Critical Problems

1. **AI_PROMPT.md references a "3-file memory system" (AGENTS.md + technical_overview.md + PROGRESS.md)** that predates CLAUDE.md. It's from the `@vibedevid/ai-memory` npm package and is completely superseded. It confuses any AI agent that reads it.

2. **claude_old_part1.md** is an earlier draft of CLAUDE.md still sitting in root. Any agent that picks it up gets conflicting instructions.

3. **AGENTS.md** duplicates content already in CLAUDE.md (tech stack, commands, patterns) but with slightly different details (e.g., AGENTS.md says "Tailwind CSS + MUI" for frontend UI, while CLAUDE.md's memory says Tailwind was removed).

4. **AGENTS.md says "Read AGENTS.md → technical_overview.md → PROGRESS.md"** as mandatory workflow. CLAUDE.md says nothing about this. Contradiction.

5. **All files violate CLAUDE.md's own rule**: "NEVER save working files, text/mds to the root folder." Yet AI_PROMPT.md, AGENTS.md, AUDIT.md, claude_old_part1.md, and technical_overview.md are ALL in root.

---

## 2. CLAUDE.md Deep Audit

### 2.1 What's Good (keep these)

| Rule | Industry Validation |
|------|-------------------|
| NEVER SUPPOSE — stop and ask | Matches Devin, Kiro, CLAUDE.md best practice |
| READ BEFORE EDIT + staleness guard | Matches Devin, Augment Code, Cursor |
| 3-STRIKE RULE | Matches Devin, Same.dev, Cline |
| NEVER MODIFY TESTS TO MAKE THEM PASS | Unique and valuable — no industry prompt has this |
| THINK BEFORE TRANSITION | Matches Devin's `<think>` scratchpad |
| TRACE THE CHAIN | Unique and valuable for NestJS DI |
| INFORMATION TRUST HIERARCHY | Unique and valuable |
| File size limit (500 lines) | Matches Qoder (600), Emergent (300-400) |
| MUI theme only, no hardcoded CSS | Matches Lovable, v0 design token enforcement |
| Frontend procedure (translations → queries → component) | Well-structured, no industry equivalent this detailed |
| JSONB anti-pattern warning | Unique, technically excellent |
| Multi-tenant tenantId rule | Critical for this project |

### 2.2 What's Bad

#### A. Bloat: ~400 lines of claude-flow/MCP marketing copy

Lines ~100-165 (agent lists), ~230-350 (MCP tool categories), ~370-490 (coordination protocol examples) are essentially README content for the `claude-flow` npm package. They don't belong in a project-specific CLAUDE.md.

**Industry comparison**: Cursor's prompt is ~230 lines. Windsurf is ~126 lines. Claude Code's own system prompt is ~192 lines. The best prompts are under 300 lines of actual instructions. PMSync's CLAUDE.md has ~600 lines of noise.

#### B. Missing: Post-Edit Validation Mandate

The single most consistent rule across ALL industry prompts (VSCode, Qoder, Cursor, Devin) is: **run lint/type-check after EVERY edit**. CLAUDE.md mentions `npm run type-check` and `npm run lint` but never mandates them after every edit. They're just listed as "available commands."

**This is the #1 gap.**

#### C. Missing: Memory-First Mandate

Google Antigravity's Knowledge Items pattern: "MANDATORY first step before any research: check existing memory." CLAUDE.md has a memory system but never says "check it first." Memory is reactive (store after fixing), not proactive (check before starting).

#### D. Missing: Discussion-First for Ambiguous Requests

Lovable defaults to DISCUSSION mode unless explicit action verbs appear. CLAUDE.md is implementation-biased — it assumes every request means "write code now." This causes premature implementation.

#### E. Missing: End-of-Turn Summary Spec

Cursor mandates a high-signal summary at turn end. VSCode claude-sonnet-4 requires progress checkpoints every 3-5 tool calls. CLAUDE.md has no equivalent — turns end abruptly or with random verbosity.

#### F. Contradictions

1. CLAUDE.md says "RESEARCH FIRST: ALWAYS search online for best 2026 practices" — but Claude Code has no web search in most contexts and this creates confusion about when to actually do this.
2. CLAUDE.md says "Test-First: Write tests before implementation" but then the Email Backend section says "No Mocks, No Jest" and lists only integration scripts. These are philosophically opposed TDD approaches with no reconciliation.
3. The "Available Agents (54 Total)" section lists agents like `ml-developer`, `cicd-engineer`, `api-docs` that don't exist in the actual Agent tool's agent types. This is misleading.

#### G. Wrong Audience

CLAUDE.md mixes instructions for three different audiences:
1. **Claude Code** (the actual consumer) — behavioral rules, code patterns
2. **Human developers** (reading AGENTS.md) — tech stack, commands
3. **MCP tool marketing** (claude-flow README) — setup instructions, feature lists

Industry prompts are ruthlessly single-audience. Every line speaks to the AI agent. Human docs go elsewhere.

#### H. Emoji Overload

CLAUDE.md uses 40+ emojis. The best industry prompts use zero. Emojis waste tokens and add zero signal. Cursor, Windsurf, Devin, VSCode Agent — none use emojis in system prompts.

---

## 3. Missing Patterns from Industry Best Practices

### 3.1 HIGH PRIORITY — Add to CLAUDE.md

| Pattern | Source | What It Does |
|---------|--------|-------------|
| **Post-edit validation** | VSCode, Qoder, Cursor | `get_errors`/lint after EVERY file edit, no exceptions |
| **Memory-first mandate** | Google Antigravity | Check memory/past solutions BEFORE starting any research |
| **Discussion-first default** | Lovable | If request has no action verb, discuss approach before coding |
| **Progress checkpoints** | VSCode claude-sonnet-4 | Brief status every 3-5 tool calls or multi-file bursts |
| **git log as knowledge base** | Augment Code | `git log -S "keyword"` before implementing — check how similar changes were done |
| **Non-interactive flags** | Gemini CLI | Always use `--yes`, `--no-input`, `--non-interactive` flags |
| **Scope creep prevention** | Augment Code | "Never do more than user asked" — explicit rule |
| **`[-]` blocked/skipped state** | Google Antigravity | Record WHY something was abandoned, not just that it's undone |

### 3.2 MEDIUM PRIORITY — Consider

| Pattern | Source | What It Does |
|---------|--------|-------------|
| **contracts.md** | Emergent | Living doc mapping frontend hooks to backend endpoints |
| **Migration file markdown headers** | Bolt | Every .sql migration starts with plain-language summary |
| **EARS format for requirements** | Kiro | `WHEN [event] THEN [system] SHALL [behavior]` — testable specs |
| **20-minute subtask granularity** | Augment Code | Each todo = ~20 min of professional dev work |
| **Todo word limits** | Cursor 2.0 | Verb-led, max 14 words, min 5 min of work |
| **`is_dangerous` flag equivalent** | Replit | Explicit dangerous-command confirmation |

### 3.3 LOW PRIORITY — Nice to have

| Pattern | Source |
|---------|--------|
| Walkthrough doc after verification | Google Antigravity |
| Frontend-first with screenshot verification | Emergent |
| `find_and_edit` bulk regex refactor | Devin |

---

## 4. Root File Cleanup Plan

### DELETE (move to docs/ or delete entirely)

| File | Action | Reason |
|------|--------|--------|
| `AI_PROMPT.md` | DELETE | Superseded by CLAUDE.md, from npm boilerplate |
| `claude_old_part1.md` | DELETE | Old draft, causes conflicts |
| `AGENTS.md` | MERGE useful parts into CLAUDE.md, then DELETE | Duplicates CLAUDE.md content |
| `AUDIT.md` | MOVE to `docs/AUDIT.md` | Reference doc, shouldn't be in root |
| `technical_overview.md` | MOVE to `docs/technical_overview.md` | Reference doc, shouldn't be in root |

### KEEP

| File | Location | Notes |
|------|----------|-------|
| `CLAUDE.md` | Root (required by Claude Code) | Rewrite needed |
| `README.md` | Root (standard) | Fine |

---

## 5. CLAUDE.md Rewrite Specification

### Target: Under 400 lines

The rewritten CLAUDE.md should have these sections in this order:

```
1. BEHAVIORAL RULES (~60 lines)
   - Senior dev protocol (keep existing, tighten)
   - 3-strike rule
   - Read before edit + staleness guard
   - Think before transition
   - Never modify tests
   - Post-edit validation mandate (NEW)
   - Discussion-first for ambiguous requests (NEW)
   - Scope creep prevention (NEW)

2. CODE QUALITY (~40 lines)
   - File size limits
   - MUI theme enforcement
   - Multi-tenant tenantId rule
   - JSONB anti-pattern
   - No hardcoded secrets
   - Follow existing patterns

3. FRONTEND PROCEDURE (~80 lines)
   - Keep existing: translations → queries → component
   - Keep existing: anti-patterns, loading states
   - Keep existing: API modules + TanStack Query
   - Keep existing: code splitting priorities
   - Remove: lengthy code examples (move to docs/)

4. BACKEND PROCEDURE (~50 lines)
   - Keep: email consolidation entry point
   - Keep: Prisma retry patterns
   - Keep: race condition awareness
   - Remove: detailed phase tables (move to docs/)

5. MEMORY PROTOCOL (~30 lines)
   - Memory-first mandate (NEW)
   - When to store
   - Namespace table
   - git log as knowledge base (NEW)

6. TECH STACK REFERENCE (~30 lines)
   - Merge from AGENTS.md: framework versions, commands
   - Keep concise — no code examples

7. FILE ORGANIZATION (~15 lines)
   - Directory structure
   - Never-root rule
```

### What Gets CUT from CLAUDE.md

| Section | Lines | Reason |
|---------|-------|--------|
| Available Agents (54 Total) | ~30 | Claude Code knows its own agents |
| Claude Code vs MCP Tools | ~25 | Irrelevant to task execution |
| MCP Quick Setup | ~10 | One-time setup, not per-task |
| MCP Tool Categories | ~20 | Claude Code has tool discovery |
| Agent Coordination Protocol | ~30 | claude-flow README content |
| Concurrent Execution Examples | ~60 | claude-flow README content |
| Performance Benefits | ~5 | Marketing copy |
| Hooks Integration | ~25 | claude-flow README content |
| Advanced Features | ~10 | Marketing copy |
| Integration Tips | ~10 | Generic advice |
| Support links | ~5 | Not needed in system prompt |
| SPARC Commands | ~25 | Rarely used, move to docs/ |
| Modern UI Design Patterns | ~80 | Move to docs/ reference |
| Playwright debugging | ~40 | Move to docs/ reference |
| RAG & Embeddings Architecture | ~50 | Move to docs/ reference |

**Total cut: ~425 lines of noise**

---

## 6. Scorecard: PMSync vs Industry Best

| Dimension | PMSync Now | Industry Best | Gap |
|-----------|-----------|---------------|-----|
| Signal-to-noise ratio | 4/10 | 9/10 (Cursor) | **Critical** |
| Behavioral rules | 8/10 | 9/10 (Devin) | Minor |
| Post-edit validation | 2/10 | 10/10 (all tools) | **Critical** |
| Memory utilization | 5/10 | 8/10 (Google) | Medium |
| Scope control | 4/10 | 8/10 (Lovable) | High |
| File organization | 3/10 | 7/10 (Bolt) | High |
| Code quality rules | 7/10 | 8/10 (Qoder) | Minor |
| Frontend procedure | 9/10 | 7/10 (v0) | PMSync ahead |
| Security awareness | 6/10 | 8/10 (Bolt) | Medium |
| Prompt length efficiency | 3/10 | 8/10 (Windsurf) | **Critical** |

**Overall: 5.1/10 → target 8/10 after rewrite**

---

## 7. Immediate Actions

### Priority 1: Delete dead files
- `rm AI_PROMPT.md claude_old_part1.md`
- `mv AUDIT.md docs/`
- `mv technical_overview.md docs/`
- Merge AGENTS.md useful content into CLAUDE.md, then `rm AGENTS.md`

### Priority 2: Add missing critical rules to CLAUDE.md
1. Post-edit validation: "After EVERY file edit, run type-check and lint. No exceptions."
2. Memory-first: "Before starting any task, check memory and git history for prior solutions."
3. Discussion-first: "If request contains no explicit action verb (implement, create, fix, add, remove, refactor), discuss approach first."
4. Scope prevention: "Do exactly what was asked. Never add unrequested features, refactors, or improvements."

### Priority 3: Cut CLAUDE.md from 1,042 to ~400 lines
- Remove all claude-flow/MCP marketing content
- Remove agent lists (Claude Code knows its own agents)
- Move detailed code examples and reference material to docs/
- Keep only rules that directly affect task execution quality

---

## Appendix: Industry Prompt Techniques Not Relevant to PMSync

These patterns exist in industry prompts but don't apply here:

- **boltArtifact XML containers** (Bolt) — Claude Code doesn't use this format
- **LSP commands** (Devin) — Claude Code uses Grep/Glob instead
- **`waitForPreviousTools` boolean** (Google) — Claude Code manages parallelism differently
- **`proposed_workspace_tool_nudge`** (Replit) — Replit-specific redirect pattern
- **`generate_image`** (Google) — not applicable to PMSync
- **Browser subagent spawning** (Google) — Claude Code uses Playwright MCP instead
