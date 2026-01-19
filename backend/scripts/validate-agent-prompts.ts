#!/usr/bin/env npx ts-node
/**
 * REAL Agent Prompt Validation Script
 *
 * Tests that the agent prompts are correctly configured and don't contain
 * anti-patterns that cause stupid behavior.
 *
 * Run: npx ts-node backend/scripts/validate-agent-prompts.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let warnings = 0;

function log(msg: string) {
  console.log(msg);
}

function pass(test: string, detail?: string) {
  passed++;
  log(`  ${GREEN}✓${RESET} ${test}${detail ? ` - ${detail}` : ''}`);
}

function fail(test: string, detail?: string) {
  failed++;
  log(`  ${RED}✗${RESET} ${test}${detail ? ` - ${detail}` : ''}`);
}

function warn(test: string, detail?: string) {
  warnings++;
  log(`  ${YELLOW}⚠${RESET} ${test}${detail ? ` - ${detail}` : ''}`);
}

function header(title: string) {
  log(`\n${CYAN}${BOLD}═══ ${title} ═══${RESET}`);
}

// =============================================================================
// Load actual prompts from the source files
// =============================================================================

const PROMPTS_DIR = path.join(__dirname, '../src/modules/ai/voltagent/prompts');
const LOCALES_DIR = path.join(__dirname, '../src/modules/ai/voltagent/locales');

function readFile(filepath: string): string {
  try {
    return fs.readFileSync(filepath, 'utf-8');
  } catch (e) {
    return '';
  }
}

// =============================================================================
// TEST 1: Prompt Files Exist
// =============================================================================

function testPromptFilesExist() {
  header('TEST 1: Prompt Files Exist');

  const expectedFiles = [
    'supervisor.prompt.ts',
    'actions.prompt.ts',
    'intelligence.prompt.ts',
    'memory.prompt.ts',
    'index.ts',
  ];

  for (const file of expectedFiles) {
    const filepath = path.join(PROMPTS_DIR, file);
    if (fs.existsSync(filepath)) {
      pass(`${file} exists`);
    } else {
      fail(`${file} MISSING`);
    }
  }
}

// =============================================================================
// TEST 2: Supervisor Prompt - No Contact Verification for Email
// =============================================================================

function testSupervisorNoContactVerification() {
  header('TEST 2: Supervisor Prompt - Email Send Flow');

  const supervisorPath = path.join(PROMPTS_DIR, 'supervisor.prompt.ts');
  const content = readFile(supervisorPath);

  if (!content) {
    fail('Could not read supervisor.prompt.ts');
    return;
  }

  // MUST contain: Direct delegation to ActionsAgent
  if (content.includes('DELEGATE DIRECTLY TO ActionsAgent')) {
    pass('Contains "DELEGATE DIRECTLY TO ActionsAgent"');
  } else {
    fail('Missing "DELEGATE DIRECTLY TO ActionsAgent" instruction');
  }

  // MUST contain: No contact verification
  if (content.includes('do NOT pre-verify contacts') || content.includes('DO NOT verify contacts')) {
    pass('Contains "do NOT verify contacts" instruction');
  } else {
    fail('Missing "do NOT verify contacts" instruction');
  }

  // MUST contain: No over-engineering section
  if (content.includes('CRITICAL_NO_OVER_ENGINEERING')) {
    pass('Contains CRITICAL_NO_OVER_ENGINEERING section');
  } else {
    fail('Missing CRITICAL_NO_OVER_ENGINEERING section');
  }

  // MUST contain: Anti-pattern examples
  if (content.includes('vuoi che controlli se ci sono email urgenti')) {
    pass('Contains anti-pattern example (urgent emails)');
  } else {
    warn('Missing anti-pattern example for urgent emails');
  }

  // MUST NOT contain: Old verification flow
  const badPatterns = [
    'Step 1 - Verify contact:',
    'Search if john@example.com exists in contacts',
    'Contact john@example.com not found',
  ];

  for (const pattern of badPatterns) {
    if (content.includes(pattern)) {
      fail(`Contains BAD pattern: "${pattern.substring(0, 40)}..."`);
    } else {
      pass(`No bad pattern: "${pattern.substring(0, 40)}..."`);
    }
  }

  // Check EMAIL_SEND_FLOW section is correct
  const emailFlowMatch = content.match(/<EMAIL_SEND_FLOW>([\s\S]*?)<\/EMAIL_SEND_FLOW>/);
  if (emailFlowMatch) {
    const emailFlow = emailFlowMatch[1];

    if (emailFlow.includes('DO NOT verify contacts')) {
      pass('EMAIL_SEND_FLOW: Contains "DO NOT verify contacts"');
    } else {
      fail('EMAIL_SEND_FLOW: Missing "DO NOT verify contacts"');
    }

    if (emailFlow.includes('ActionsAgent')) {
      pass('EMAIL_SEND_FLOW: Delegates to ActionsAgent');
    } else {
      fail('EMAIL_SEND_FLOW: Does not delegate to ActionsAgent');
    }

    if (emailFlow.includes('IntelligenceAgent') && emailFlow.includes('Verify')) {
      fail('EMAIL_SEND_FLOW: Still verifies contacts with IntelligenceAgent!');
    } else {
      pass('EMAIL_SEND_FLOW: No contact verification step');
    }

    if (emailFlow.includes('WRONG') && emailFlow.includes('❌')) {
      pass('EMAIL_SEND_FLOW: Contains WRONG examples');
    } else {
      warn('EMAIL_SEND_FLOW: Missing explicit WRONG examples');
    }
  } else {
    fail('Could not find EMAIL_SEND_FLOW section');
  }

  // Check PSYCHOLOGICAL_ANCHOR
  const anchorMatch = content.match(/<PSYCHOLOGICAL_ANCHOR>([\s\S]*?)<\/PSYCHOLOGICAL_ANCHOR>/);
  if (anchorMatch) {
    const anchor = anchorMatch[1];

    if (anchor.includes('I do NOT verify contacts first')) {
      pass('PSYCHOLOGICAL_ANCHOR: Says "do NOT verify contacts"');
    } else if (anchor.includes('ALWAYS delegate to IntelligenceAgent to verify')) {
      fail('PSYCHOLOGICAL_ANCHOR: Still says to verify contacts!');
    } else {
      warn('PSYCHOLOGICAL_ANCHOR: Unclear about contact verification');
    }
  } else {
    fail('Could not find PSYCHOLOGICAL_ANCHOR section');
  }
}

// =============================================================================
// TEST 3: Actions Prompt - Smart Account Detection
// =============================================================================

function testActionsSmartAccountDetection() {
  header('TEST 3: Actions Prompt - Smart Account Detection');

  const actionsPath = path.join(PROMPTS_DIR, 'actions.prompt.ts');
  const content = readFile(actionsPath);

  if (!content) {
    fail('Could not read actions.prompt.ts');
    return;
  }

  // MUST contain: Smart account detection
  if (content.includes('SMART ACCOUNT DETECTION')) {
    pass('Contains SMART ACCOUNT DETECTION section');
  } else {
    fail('Missing SMART ACCOUNT DETECTION section');
  }

  // MUST contain: Pattern matching examples
  const patterns = [
    'dvdmarchetto@gmail.com',
    'da [email]',
    'using my gmail',
  ];

  for (const pattern of patterns) {
    if (content.includes(pattern)) {
      pass(`Contains pattern: "${pattern}"`);
    } else {
      warn(`Missing pattern example: "${pattern}"`);
    }
  }

  // MUST contain: Key rule
  if (content.includes('NEVER ask for account if user already specified')) {
    pass('Contains "NEVER ask for account if user already specified"');
  } else {
    fail('Missing key rule about not asking for account');
  }

  // MUST contain: USE IT DIRECTLY
  if (content.includes('USE IT DIRECTLY') || content.includes('use that account immediately')) {
    pass('Contains "USE IT DIRECTLY" instruction');
  } else {
    fail('Missing "USE IT DIRECTLY" instruction');
  }

  // Check MANDATORY_EMAIL_SEND_WORKFLOW
  const workflowMatch = content.match(/<MANDATORY_EMAIL_SEND_WORKFLOW>([\s\S]*?)<\/MANDATORY_EMAIL_SEND_WORKFLOW>/);
  if (workflowMatch) {
    const workflow = workflowMatch[1];

    if (workflow.includes('SMART ACCOUNT DETECTION')) {
      pass('MANDATORY_EMAIL_SEND_WORKFLOW: Has smart detection');
    } else {
      fail('MANDATORY_EMAIL_SEND_WORKFLOW: Missing smart detection');
    }

    if (workflow.includes('ALWAYS ask which account')) {
      fail('MANDATORY_EMAIL_SEND_WORKFLOW: Still says ALWAYS ask!');
    } else {
      pass('MANDATORY_EMAIL_SEND_WORKFLOW: No "ALWAYS ask" pattern');
    }
  } else {
    fail('Could not find MANDATORY_EMAIL_SEND_WORKFLOW section');
  }
}

// =============================================================================
// TEST 4: Intelligence Prompt - Read-Only Operations
// =============================================================================

function testIntelligenceReadOnly() {
  header('TEST 4: Intelligence Prompt - Read-Only Operations');

  const intelligencePath = path.join(PROMPTS_DIR, 'intelligence.prompt.ts');
  const content = readFile(intelligencePath);

  if (!content) {
    fail('Could not read intelligence.prompt.ts');
    return;
  }

  // MUST contain: Core identity as READ specialist
  if (content.includes('READ and ANALYSIS specialist')) {
    pass('Contains READ and ANALYSIS specialist identity');
  } else {
    fail('Missing READ and ANALYSIS specialist identity');
  }

  // MUST contain: Non-destructive
  if (content.includes('non-destructive') || content.includes('do not require HITL')) {
    pass('Contains non-destructive/no HITL statement');
  } else {
    warn('Missing explicit non-destructive statement');
  }

  // MUST NOT contain: Write operations
  const writeOps = ['send_email', 'delete_email', 'manage_email'];
  for (const op of writeOps) {
    if (content.includes(`- ${op}:`) || content.includes(`${op}(`)) {
      fail(`Contains write operation: ${op}`);
    } else {
      pass(`No write operation: ${op}`);
    }
  }
}

// =============================================================================
// TEST 5: Locales/en.ts Uses Imported Prompts
// =============================================================================

function testLocalesUseImports() {
  header('TEST 5: Locales Uses Imported Prompts');

  const localesPath = path.join(LOCALES_DIR, 'en.ts');
  const content = readFile(localesPath);

  if (!content) {
    fail('Could not read locales/en.ts');
    return;
  }

  // MUST import from prompts
  if (content.includes("from '../prompts'")) {
    pass('Imports from ../prompts');
  } else {
    fail('Does not import from ../prompts');
  }

  // MUST use SUPERVISOR_PROMPT
  if (content.includes('instructions: SUPERVISOR_PROMPT')) {
    pass('Uses SUPERVISOR_PROMPT constant');
  } else if (content.includes('supervisor:') && content.includes('instructions: `')) {
    fail('Still has inline supervisor prompt!');
  } else {
    warn('Unclear supervisor prompt usage');
  }

  // MUST use ACTIONS_PROMPT
  if (content.includes('instructions: ACTIONS_PROMPT')) {
    pass('Uses ACTIONS_PROMPT constant');
  } else if (content.match(/actions:\s*\{[\s\S]*?instructions:\s*`/)) {
    fail('Still has inline actions prompt!');
  } else {
    warn('Unclear actions prompt usage');
  }

  // MUST use INTELLIGENCE_PROMPT
  if (content.includes('instructions: INTELLIGENCE_PROMPT')) {
    pass('Uses INTELLIGENCE_PROMPT constant');
  } else if (content.match(/intelligence:\s*\{[\s\S]*?instructions:\s*`/)) {
    fail('Still has inline intelligence prompt!');
  } else {
    warn('Unclear intelligence prompt usage');
  }

  // Check that inline prompts are NOT present (looking for long template literals in agents section)
  const agentsSectionMatch = content.match(/agents:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\/ Action response/);
  if (agentsSectionMatch) {
    const agentsSection = agentsSectionMatch[1];

    // Count template literal starts
    const templateLiterals = (agentsSection.match(/instructions:\s*`/g) || []).length;
    const importedPrompts = (agentsSection.match(/instructions:\s*(SUPERVISOR_PROMPT|ACTIONS_PROMPT|INTELLIGENCE_PROMPT)/g) || []).length;

    if (templateLiterals === 0) {
      pass(`No inline template prompts in agents section`);
    } else {
      warn(`Found ${templateLiterals} inline template prompts (some agents may still have inline prompts)`);
    }

    if (importedPrompts >= 3) {
      pass(`Uses ${importedPrompts} imported prompt constants`);
    } else {
      warn(`Only ${importedPrompts} imported prompt constants found`);
    }
  }
}

// =============================================================================
// TEST 6: Memory Prompts Exist and Are Exported
// =============================================================================

function testMemoryPrompts() {
  header('TEST 6: Memory Prompts');

  const memoryPath = path.join(PROMPTS_DIR, 'memory.prompt.ts');
  const content = readFile(memoryPath);

  if (!content) {
    fail('Could not read memory.prompt.ts');
    return;
  }

  const expectedExports = [
    'FACT_RETRIEVAL_PROMPT',
    'MEMORY_DEDUCTION_PROMPT',
    'MEMORY_SEARCH_PROMPT',
    'MEMORY_SUMMARY_PROMPT',
    'inferMemoryType',
  ];

  for (const exp of expectedExports) {
    if (content.includes(`export const ${exp}`) || content.includes(`export function ${exp}`)) {
      pass(`Exports ${exp}`);
    } else {
      fail(`Missing export: ${exp}`);
    }
  }

  // Check index.ts re-exports memory prompts
  const indexPath = path.join(PROMPTS_DIR, 'index.ts');
  const indexContent = readFile(indexPath);

  if (indexContent.includes("from './memory.prompt'")) {
    pass('index.ts re-exports from memory.prompt');
  } else {
    fail('index.ts does not re-export memory prompts');
  }
}

// =============================================================================
// TEST 7: No Conflicting Instructions
// =============================================================================

function testNoConflictingInstructions() {
  header('TEST 7: No Conflicting Instructions');

  const supervisorPath = path.join(PROMPTS_DIR, 'supervisor.prompt.ts');
  const content = readFile(supervisorPath);

  if (!content) {
    fail('Could not read supervisor.prompt.ts');
    return;
  }

  // Check that MANDATORY_DELEGATION and EMAIL_SEND_FLOW are consistent
  const mandatoryMatch = content.match(/<MANDATORY_DELEGATION>([\s\S]*?)<\/MANDATORY_DELEGATION>/);
  const emailFlowMatch = content.match(/<EMAIL_SEND_FLOW>([\s\S]*?)<\/EMAIL_SEND_FLOW>/);

  if (mandatoryMatch && emailFlowMatch) {
    const mandatory = mandatoryMatch[1];
    const emailFlow = emailFlowMatch[1];

    // Both should say ActionsAgent for email send
    const mandatoryActionsAgent = mandatory.includes('ActionsAgent');
    const emailFlowActionsAgent = emailFlow.includes('ActionsAgent');

    if (mandatoryActionsAgent && emailFlowActionsAgent) {
      pass('Both sections agree: ActionsAgent for email send');
    } else {
      fail('Sections disagree about email send target');
    }

    // Neither should require contact verification for email
    const mandatoryNoVerify = mandatory.includes('do NOT pre-verify contacts');
    const emailFlowNoVerify = emailFlow.includes('DO NOT verify contacts');

    if (mandatoryNoVerify || emailFlowNoVerify) {
      pass('At least one section says no contact verification');
    } else {
      warn('Neither section explicitly prohibits contact verification');
    }

    // Check for contradictions (allow calendar attendee verification, block email send verification)
    // Extract just the email sending section
    const emailSendSection = mandatory.match(/For SENDING email[^]*?(?=\nFor |$)/)?.[0] || '';
    if (emailSendSection.includes('IntelligenceAgent') && emailSendSection.includes('verify')) {
      fail('EMAIL SEND section still mentions verifying with IntelligenceAgent');
    } else {
      pass('EMAIL SEND section has no verification contradiction');
    }
  } else {
    if (!mandatoryMatch) fail('Could not find MANDATORY_DELEGATION section');
    if (!emailFlowMatch) fail('Could not find EMAIL_SEND_FLOW section');
  }
}

// =============================================================================
// TEST 8: Real Runtime Import Test
// =============================================================================

async function testRuntimeImports() {
  header('TEST 8: Runtime Import Test');

  try {
    // Dynamically import the prompts module
    const promptsModule = await import('../src/modules/ai/voltagent/prompts');

    if (promptsModule.SUPERVISOR_PROMPT) {
      pass('SUPERVISOR_PROMPT exports successfully');

      if (typeof promptsModule.SUPERVISOR_PROMPT === 'string' && promptsModule.SUPERVISOR_PROMPT.length > 1000) {
        pass(`SUPERVISOR_PROMPT is string with ${promptsModule.SUPERVISOR_PROMPT.length} chars`);
      } else {
        fail('SUPERVISOR_PROMPT is not a valid string');
      }
    } else {
      fail('SUPERVISOR_PROMPT not exported');
    }

    if (promptsModule.ACTIONS_PROMPT) {
      pass('ACTIONS_PROMPT exports successfully');

      if (promptsModule.ACTIONS_PROMPT.includes('SMART ACCOUNT DETECTION')) {
        pass('ACTIONS_PROMPT contains SMART ACCOUNT DETECTION');
      } else {
        fail('ACTIONS_PROMPT missing SMART ACCOUNT DETECTION');
      }
    } else {
      fail('ACTIONS_PROMPT not exported');
    }

    if (promptsModule.INTELLIGENCE_PROMPT) {
      pass('INTELLIGENCE_PROMPT exports successfully');
    } else {
      fail('INTELLIGENCE_PROMPT not exported');
    }

    if (promptsModule.SUPERVISOR_MESSAGES) {
      pass('SUPERVISOR_MESSAGES exports successfully');
    } else {
      fail('SUPERVISOR_MESSAGES not exported');
    }

    if (promptsModule.inferMemoryType) {
      pass('inferMemoryType function exports successfully');

      // Test it works
      const result = promptsModule.inferMemoryType('User prefers brief emails');
      if (result === 'PREFERENCE') {
        pass('inferMemoryType("User prefers...") returns PREFERENCE');
      } else {
        warn(`inferMemoryType returned ${result} instead of PREFERENCE`);
      }
    } else {
      fail('inferMemoryType not exported');
    }

  } catch (err) {
    fail(`Runtime import failed: ${err}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log(`\n${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}${CYAN}║         REAL AGENT PROMPT VALIDATION                          ║${RESET}`);
  log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════╝${RESET}`);

  testPromptFilesExist();
  testSupervisorNoContactVerification();
  testActionsSmartAccountDetection();
  testIntelligenceReadOnly();
  testLocalesUseImports();
  testMemoryPrompts();
  testNoConflictingInstructions();
  await testRuntimeImports();

  // Summary
  log(`\n${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  log(`${BOLD}SUMMARY${RESET}`);
  log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);

  const total = passed + failed + warnings;
  const passRate = ((passed / total) * 100).toFixed(1);

  log(`  ${GREEN}✓ Passed:${RESET}   ${passed}`);
  log(`  ${RED}✗ Failed:${RESET}   ${failed}`);
  log(`  ${YELLOW}⚠ Warnings:${RESET} ${warnings}`);
  log(`  Total:     ${total}`);
  log(`  Pass rate: ${passRate}%`);

  if (failed === 0) {
    log(`\n${GREEN}${BOLD}✅ ALL CRITICAL TESTS PASSED!${RESET}`);
    log(`${GREEN}Agent prompts are correctly configured.${RESET}`);
    process.exit(0);
  } else {
    log(`\n${RED}${BOLD}❌ ${failed} CRITICAL FAILURES!${RESET}`);
    log(`${RED}Agent prompts have issues that will cause bad behavior.${RESET}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Validation failed: ${err.message}${RESET}`);
  console.error(err.stack);
  process.exit(1);
});
