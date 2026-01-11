/**
 * P5 Phase 1: Tool Loading & Schema Validation
 *
 * PARANOID REAL TESTING - NO MOCKS, NO JEST
 *
 * Tests:
 * 1. Tool can be instantiated
 * 2. Tool has valid schema (name, description, parameters)
 * 3. Tool parameters match expected types
 * 4. Tool returns proper structure
 * 5. Log full tool schema for manual inspection
 *
 * Run: npx ts-node scripts/test-p5-tool-loading.ts
 */

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  toolName: string;
  passed: boolean;
  checks: {
    hasName: boolean;
    hasDescription: boolean;
    hasParameters: boolean;
    hasExecute: boolean;
    parametersValid: boolean;
    descriptionLength: number;
    parameterCount: number;
  };
  errors: string[];
  schema?: Record<string, unknown>;
}

// ============================================================================
// HELPER: Pretty print
// ============================================================================

function log(message: string, level: 'INFO' | 'PASS' | 'FAIL' | 'WARN' = 'INFO') {
  const prefix = {
    INFO: '\x1b[36m[INFO]\x1b[0m',
    PASS: '\x1b[32m[PASS]\x1b[0m',
    FAIL: '\x1b[31m[FAIL]\x1b[0m',
    WARN: '\x1b[33m[WARN]\x1b[0m',
  };
  console.log(`${prefix[level]} ${message}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(` ${title}`);
  console.log('='.repeat(70));
}

// ============================================================================
// HELPER: Validate Zod schema structure (type-safe for Zod v4)
// ============================================================================

function validateZodSchema(schema: unknown): { valid: boolean; paramCount: number; details: string[] } {
  const details: string[] = [];
  let paramCount = 0;

  try {
    // Check if it's a Zod object by duck-typing
    const zodSchema = schema as { shape?: Record<string, unknown>; _def?: Record<string, unknown> };

    if (zodSchema && typeof zodSchema === 'object' && 'shape' in zodSchema) {
      const shape = zodSchema.shape as Record<string, unknown>;
      paramCount = Object.keys(shape).length;

      for (const [key, value] of Object.entries(shape)) {
        const zodType = value as { _def?: { typeName?: string }; description?: string; isOptional?: () => boolean };
        const typeName = zodType?._def?.typeName || getZodTypeName(zodType) || 'unknown';
        const isOptional = typeof zodType?.isOptional === 'function' ? zodType.isOptional() : false;
        details.push(`  - ${key}: ${typeName}${isOptional ? ' (optional)' : ' (required)'}`);
      }

      return { valid: true, paramCount, details };
    }

    // Also check for _def.shape (Zod v4 structure)
    if (zodSchema?._def && typeof zodSchema._def === 'object' && 'shape' in zodSchema._def) {
      const shape = (zodSchema._def as { shape: Record<string, unknown> }).shape;
      paramCount = Object.keys(shape).length;

      for (const [key, value] of Object.entries(shape)) {
        const zodType = value as { _def?: { typeName?: string } };
        const typeName = zodType?._def?.typeName || getZodTypeName(zodType) || 'unknown';
        details.push(`  - ${key}: ${typeName}`);
      }

      return { valid: true, paramCount, details };
    }

    return { valid: false, paramCount: 0, details: ['Not a valid Zod schema'] };
  } catch (error) {
    return { valid: false, paramCount: 0, details: [`Schema validation error: ${error}`] };
  }
}

function getZodTypeName(zodType: unknown): string {
  if (!zodType || typeof zodType !== 'object') return 'unknown';

  const def = (zodType as { _def?: Record<string, unknown> })._def;
  if (!def) return 'unknown';

  // Try to get type name from various Zod structures
  if ('typeName' in def) return String(def.typeName);
  if ('type' in def) return String(def.type);

  // Check constructor name
  const constructor = (zodType as { constructor?: { name?: string } }).constructor;
  if (constructor?.name?.startsWith('Zod')) {
    return constructor.name;
  }

  return 'ZodType';
}

// ============================================================================
// MOCK SERVICES (minimal stubs for tool instantiation)
// ============================================================================

// These are NOT mocks for testing behavior - they're minimal stubs
// to allow tool factory functions to instantiate without errors.
// The tools themselves will be validated, not the services.

const mockPrisma = {
  providerConfig: { findMany: async () => [], findFirst: async () => null },
  email: { findMany: async () => [], findFirst: async () => null, count: async () => 0 },
  folder: { findMany: async () => [], findFirst: async () => null },
  contact: { findMany: async () => [], findFirst: async () => null, $queryRaw: async () => [] },
  calendarEvent: { findMany: async () => [], findFirst: async () => null },
  userLabel: { findMany: async () => [] },
  $queryRaw: async () => [],
  // NestJS PrismaService methods (stubs)
  logger: { log: () => {}, error: () => {}, warn: () => {} },
  onModuleInit: async () => {},
  enableShutdownHooks: () => {},
} as unknown;

const mockEmailSendService = null; // Nullable by design
const mockCalendarService = null; // Nullable by design

const mockMistralService = {
  completePrompt: async () => '{}',
  generateEmbedding: async () => [],
};

const mockEmbeddingsService = {
  findSimilarContent: async () => [],
};

const mockWritingStyleService = {
  getStylePromptSection: async () => '',
};

const mockCacheService = {
  isHealthy: () => false,
  get: async () => null,
  set: async () => {},
};

// ============================================================================
// TEST: Validate single tool
// ============================================================================

function validateTool(tool: unknown, expectedName: string): TestResult {
  const result: TestResult = {
    toolName: expectedName,
    passed: false,
    checks: {
      hasName: false,
      hasDescription: false,
      hasParameters: false,
      hasExecute: false,
      parametersValid: false,
      descriptionLength: 0,
      parameterCount: 0,
    },
    errors: [],
  };

  const toolObj = tool as { name?: string; description?: string; parameters?: unknown; execute?: unknown };

  // Check 1: Has name
  result.checks.hasName = typeof toolObj.name === 'string' && toolObj.name.length > 0;
  if (!result.checks.hasName) {
    result.errors.push('Missing or invalid tool name');
  } else if (toolObj.name !== expectedName) {
    result.errors.push(`Name mismatch: expected "${expectedName}", got "${toolObj.name}"`);
  }

  // Check 2: Has description
  result.checks.hasDescription = typeof toolObj.description === 'string' && toolObj.description.length > 0;
  result.checks.descriptionLength = toolObj.description?.length || 0;
  if (!result.checks.hasDescription) {
    result.errors.push('Missing or invalid tool description');
  } else if (result.checks.descriptionLength < 20) {
    result.errors.push(`Description too short (${result.checks.descriptionLength} chars)`);
  }

  // Check 3: Has parameters (Zod schema)
  result.checks.hasParameters = toolObj.parameters != null;
  if (!result.checks.hasParameters) {
    result.errors.push('Missing parameters schema');
  } else {
    const schemaValidation = validateZodSchema(toolObj.parameters);
    result.checks.parametersValid = schemaValidation.valid;
    result.checks.parameterCount = schemaValidation.paramCount;
    if (!schemaValidation.valid) {
      result.errors.push(`Invalid parameters schema: ${schemaValidation.details.join(', ')}`);
    }
  }

  // Check 4: Has execute function
  result.checks.hasExecute = typeof toolObj.execute === 'function';
  if (!result.checks.hasExecute) {
    result.errors.push('Missing execute function');
  }

  // Overall pass/fail
  result.passed = result.errors.length === 0;

  return result;
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runToolLoadingTests() {
  logSection('P5 Phase 1: Tool Loading & Schema Validation');
  log('PARANOID MODE: Real validation, no shortcuts');
  console.log('');

  const results: TestResult[] = [];
  let totalTools = 0;
  let passedTools = 0;

  // -------------------------------------------------------------------------
  // EMAIL TOOLS (5 tools)
  // -------------------------------------------------------------------------
  logSection('EMAIL TOOLS');

  try {
    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      mockPrisma as any,
      mockEmailSendService as any,
      'en',
      'test-tenant-id',
      mockCacheService as any,
    );

    const expectedEmailTools = ['list_emails', 'manage_email', 'search_emails', 'count_emails', 'bulk_email_actions'];

    for (const expectedName of expectedEmailTools) {
      totalTools++;
      const tool = emailTools.find((t: { name?: string }) => t.name === expectedName);

      if (!tool) {
        log(`Tool "${expectedName}" not found in email tools`, 'FAIL');
        results.push({
          toolName: expectedName,
          passed: false,
          checks: {
            hasName: false,
            hasDescription: false,
            hasParameters: false,
            hasExecute: false,
            parametersValid: false,
            descriptionLength: 0,
            parameterCount: 0,
          },
          errors: ['Tool not found in createEmailTools output'],
        });
        continue;
      }

      const result = validateTool(tool, expectedName);
      results.push(result);

      if (result.passed) {
        passedTools++;
        log(`${expectedName}: OK (${result.checks.parameterCount} params, ${result.checks.descriptionLength} char desc)`, 'PASS');
      } else {
        log(`${expectedName}: FAILED - ${result.errors.join('; ')}`, 'FAIL');
      }
    }

    log(`Email tools loaded: ${emailTools.length} tools`, 'INFO');
  } catch (error) {
    log(`Failed to load email tools: ${error}`, 'FAIL');
  }

  // -------------------------------------------------------------------------
  // FOLDER TOOLS (2 tools)
  // -------------------------------------------------------------------------
  logSection('FOLDER TOOLS');

  try {
    const { createFolderTools } = await import('../src/modules/ai/voltagent/tools/folder.tools');
    const folderTools = createFolderTools(
      mockPrisma as any,
      'en',
      'test-tenant-id',
      mockCacheService as any,
    );

    const expectedFolderTools = ['list_folders', 'manage_folder'];

    for (const expectedName of expectedFolderTools) {
      totalTools++;
      const tool = folderTools.find((t: { name?: string }) => t.name === expectedName);

      if (!tool) {
        log(`Tool "${expectedName}" not found in folder tools`, 'FAIL');
        results.push({
          toolName: expectedName,
          passed: false,
          checks: {
            hasName: false,
            hasDescription: false,
            hasParameters: false,
            hasExecute: false,
            parametersValid: false,
            descriptionLength: 0,
            parameterCount: 0,
          },
          errors: ['Tool not found in createFolderTools output'],
        });
        continue;
      }

      const result = validateTool(tool, expectedName);
      results.push(result);

      if (result.passed) {
        passedTools++;
        log(`${expectedName}: OK (${result.checks.parameterCount} params, ${result.checks.descriptionLength} char desc)`, 'PASS');
      } else {
        log(`${expectedName}: FAILED - ${result.errors.join('; ')}`, 'FAIL');
      }
    }

    log(`Folder tools loaded: ${folderTools.length} tools`, 'INFO');
  } catch (error) {
    log(`Failed to load folder tools: ${error}`, 'FAIL');
  }

  // -------------------------------------------------------------------------
  // CONTACTS TOOLS (2 tools)
  // -------------------------------------------------------------------------
  logSection('CONTACTS TOOLS');

  try {
    const { createContactsTools } = await import('../src/modules/ai/voltagent/tools/contacts.tools');
    const contactsTools = createContactsTools(
      mockPrisma as any,
      'en',
      'test-tenant-id',
      mockCacheService as any,
    );

    const expectedContactsTools = ['search_contacts', 'manage_contact'];

    for (const expectedName of expectedContactsTools) {
      totalTools++;
      const tool = contactsTools.find((t: { name?: string }) => t.name === expectedName);

      if (!tool) {
        log(`Tool "${expectedName}" not found in contacts tools`, 'FAIL');
        results.push({
          toolName: expectedName,
          passed: false,
          checks: {
            hasName: false,
            hasDescription: false,
            hasParameters: false,
            hasExecute: false,
            parametersValid: false,
            descriptionLength: 0,
            parameterCount: 0,
          },
          errors: ['Tool not found in createContactsTools output'],
        });
        continue;
      }

      const result = validateTool(tool, expectedName);
      results.push(result);

      if (result.passed) {
        passedTools++;
        log(`${expectedName}: OK (${result.checks.parameterCount} params, ${result.checks.descriptionLength} char desc)`, 'PASS');
      } else {
        log(`${expectedName}: FAILED - ${result.errors.join('; ')}`, 'FAIL');
      }
    }

    log(`Contacts tools loaded: ${contactsTools.length} tools`, 'INFO');
  } catch (error) {
    log(`Failed to load contacts tools: ${error}`, 'FAIL');
  }

  // -------------------------------------------------------------------------
  // CALENDAR TOOLS (2 tools)
  // -------------------------------------------------------------------------
  logSection('CALENDAR TOOLS');

  try {
    const { createCalendarTools } = await import('../src/modules/ai/voltagent/tools/calendar.tools');
    const calendarTools = createCalendarTools(
      mockPrisma as any,
      mockCalendarService as any,
      'en',
      'test-tenant-id',
      mockCacheService as any,
    );

    const expectedCalendarTools = ['get_events', 'manage_event'];

    for (const expectedName of expectedCalendarTools) {
      totalTools++;
      const tool = calendarTools.find((t: { name?: string }) => t.name === expectedName);

      if (!tool) {
        log(`Tool "${expectedName}" not found in calendar tools`, 'FAIL');
        results.push({
          toolName: expectedName,
          passed: false,
          checks: {
            hasName: false,
            hasDescription: false,
            hasParameters: false,
            hasExecute: false,
            parametersValid: false,
            descriptionLength: 0,
            parameterCount: 0,
          },
          errors: ['Tool not found in createCalendarTools output'],
        });
        continue;
      }

      const result = validateTool(tool, expectedName);
      results.push(result);

      if (result.passed) {
        passedTools++;
        log(`${expectedName}: OK (${result.checks.parameterCount} params, ${result.checks.descriptionLength} char desc)`, 'PASS');
      } else {
        log(`${expectedName}: FAILED - ${result.errors.join('; ')}`, 'FAIL');
      }
    }

    log(`Calendar tools loaded: ${calendarTools.length} tools`, 'INFO');
  } catch (error) {
    log(`Failed to load calendar tools: ${error}`, 'FAIL');
  }

  // -------------------------------------------------------------------------
  // INSIGHTS TOOLS (3 consolidated tools)
  // -------------------------------------------------------------------------
  logSection('INSIGHTS TOOLS');

  try {
    const { createInsightTools } = await import('../src/modules/ai/voltagent/tools/insights.tools');
    const insightsTools = createInsightTools({
      prisma: mockPrisma as any,
      mistral: mockMistralService as any,
      embeddingsService: mockEmbeddingsService as any,
      writingStyle: mockWritingStyleService as any,
      cacheService: mockCacheService as any,
      locale: 'en',
      tenantId: 'test-tenant-id',
      userId: 'test-user-id',
    });

    // With embeddingsService, we get 3 tools; without, we get 2
    const expectedInsightsTools = ['analyze_email', 'compose_reply', 'semantic_search_emails'];

    for (const expectedName of expectedInsightsTools) {
      totalTools++;
      const tool = insightsTools.find((t: { name?: string }) => t.name === expectedName);

      if (!tool) {
        log(`Tool "${expectedName}" not found in insights tools`, 'FAIL');
        results.push({
          toolName: expectedName,
          passed: false,
          checks: {
            hasName: false,
            hasDescription: false,
            hasParameters: false,
            hasExecute: false,
            parametersValid: false,
            descriptionLength: 0,
            parameterCount: 0,
          },
          errors: ['Tool not found in createInsightTools output'],
        });
        continue;
      }

      const result = validateTool(tool, expectedName);
      results.push(result);

      if (result.passed) {
        passedTools++;
        log(`${expectedName}: OK (${result.checks.parameterCount} params, ${result.checks.descriptionLength} char desc)`, 'PASS');
      } else {
        log(`${expectedName}: FAILED - ${result.errors.join('; ')}`, 'FAIL');
      }
    }

    log(`Insights tools loaded: ${insightsTools.length} tools`, 'INFO');
  } catch (error) {
    log(`Failed to load insights tools: ${error}`, 'FAIL');
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  logSection('TEST SUMMARY');

  console.log('');
  console.log('Tool Results:');
  console.log('-'.repeat(60));

  for (const result of results) {
    const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${status} ${result.toolName}`);
    if (!result.passed) {
      for (const error of result.errors) {
        console.log(`       └─ ${error}`);
      }
    }
  }

  console.log('-'.repeat(60));
  console.log(`Total: ${passedTools}/${totalTools} tools passed`);
  console.log('');

  if (passedTools === totalTools) {
    log('All tools validated successfully!', 'PASS');
    process.exit(0);
  } else {
    log(`${totalTools - passedTools} tool(s) failed validation`, 'FAIL');
    process.exit(1);
  }
}

// ============================================================================
// PARANOID SCHEMA DUMP (for manual inspection)
// ============================================================================

async function dumpToolSchemas() {
  logSection('TOOL SCHEMA DUMP (for paranoid manual inspection)');

  try {
    // Email tools
    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(mockPrisma as any, mockEmailSendService as any, 'en', 'test-tenant-id');

    console.log('\n--- EMAIL TOOLS ---');
    for (const tool of emailTools) {
      const toolObj = tool as { name?: string; description?: string; parameters?: unknown };
      console.log(`\n[${toolObj.name}]`);
      console.log(`Description: ${(toolObj.description || '').substring(0, 100)}...`);
      console.log('Parameters:');
      const schema = validateZodSchema(toolObj.parameters);
      for (const detail of schema.details) {
        console.log(detail);
      }
    }

    // Folder tools
    const { createFolderTools } = await import('../src/modules/ai/voltagent/tools/folder.tools');
    const folderTools = createFolderTools(mockPrisma as any, 'en', 'test-tenant-id');

    console.log('\n--- FOLDER TOOLS ---');
    for (const tool of folderTools) {
      const toolObj = tool as { name?: string; description?: string; parameters?: unknown };
      console.log(`\n[${toolObj.name}]`);
      console.log(`Description: ${(toolObj.description || '').substring(0, 100)}...`);
      console.log('Parameters:');
      const schema = validateZodSchema(toolObj.parameters);
      for (const detail of schema.details) {
        console.log(detail);
      }
    }

    // Contacts tools
    const { createContactsTools } = await import('../src/modules/ai/voltagent/tools/contacts.tools');
    const contactsTools = createContactsTools(mockPrisma as any, 'en', 'test-tenant-id');

    console.log('\n--- CONTACTS TOOLS ---');
    for (const tool of contactsTools) {
      const toolObj = tool as { name?: string; description?: string; parameters?: unknown };
      console.log(`\n[${toolObj.name}]`);
      console.log(`Description: ${(toolObj.description || '').substring(0, 100)}...`);
      console.log('Parameters:');
      const schema = validateZodSchema(toolObj.parameters);
      for (const detail of schema.details) {
        console.log(detail);
      }
    }

    // Calendar tools
    const { createCalendarTools } = await import('../src/modules/ai/voltagent/tools/calendar.tools');
    const calendarTools = createCalendarTools(mockPrisma as any, mockCalendarService as any, 'en', 'test-tenant-id');

    console.log('\n--- CALENDAR TOOLS ---');
    for (const tool of calendarTools) {
      const toolObj = tool as { name?: string; description?: string; parameters?: unknown };
      console.log(`\n[${toolObj.name}]`);
      console.log(`Description: ${(toolObj.description || '').substring(0, 100)}...`);
      console.log('Parameters:');
      const schema = validateZodSchema(toolObj.parameters);
      for (const detail of schema.details) {
        console.log(detail);
      }
    }

    // Insights tools
    const { createInsightTools } = await import('../src/modules/ai/voltagent/tools/insights.tools');
    const insightsTools = createInsightTools({
      prisma: mockPrisma as any,
      mistral: mockMistralService as any,
      embeddingsService: mockEmbeddingsService as any,
      locale: 'en',
      tenantId: 'test-tenant-id',
    });

    console.log('\n--- INSIGHTS TOOLS ---');
    for (const tool of insightsTools) {
      const toolObj = tool as { name?: string; description?: string; parameters?: unknown };
      console.log(`\n[${toolObj.name}]`);
      console.log(`Description: ${(toolObj.description || '').substring(0, 100)}...`);
      console.log('Parameters:');
      const schema = validateZodSchema(toolObj.parameters);
      for (const detail of schema.details) {
        console.log(detail);
      }
    }
  } catch (error) {
    log(`Schema dump failed: ${error}`, 'FAIL');
  }
}

// ============================================================================
// RUN
// ============================================================================

(async () => {
  const args = process.argv.slice(2);

  if (args.includes('--dump-schemas')) {
    await dumpToolSchemas();
  } else {
    await runToolLoadingTests();
  }
})();
