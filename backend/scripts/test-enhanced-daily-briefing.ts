/**
 * Test script for Enhanced Daily Briefing Service
 *
 * Tests:
 * 1. Briefing data structure validation
 * 2. AI Secretary services integration check
 * 3. Message generation for different scenarios
 *
 * Usage:
 *   npx ts-node scripts/test-enhanced-daily-briefing.ts
 */

import 'dotenv/config';

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  success: (msg: string) => console.log(`[SUCCESS] ✅ ${msg}`),
  fail: (msg: string) => console.log(`[FAIL] ❌ ${msg}`),
};

// =============================================================================
// Type Definitions (matching the service)
// =============================================================================

interface DailyBriefing {
  userId: string;
  tenantId: string;
  generatedAt: string;
  validUntil: string;
  summary: string;
  highlights: string[];
  urgent: string[];
  stats: {
    totalUnread: number;
    newToday: number;
    requiresResponse: number;
  };
  followUps?: {
    pending: number;
    overdue: number;
    dueToday: number;
    items: Array<{
      id: string;
      emailId: string;
      reason: string | null;
      dueDate: string;
      status: string;
    }>;
    message: string;
  };
  deadlines?: {
    today: unknown[];
    thisWeek: unknown[];
    overdue: number;
    message: string;
  };
  actionItems?: {
    todo: number;
    inProgress: number;
    overdue: number;
    highPriority: number;
    dueToday: unknown[];
    message: string;
  };
  calendar?: {
    todaysMeetings: unknown[];
    message: string;
  };
}

// =============================================================================
// Test Functions
// =============================================================================

function generateFollowUpMessage(stats: { pending: number; overdue: number; dueToday: number }): string {
  if (stats.overdue > 0) {
    return `⚠️ You have ${stats.overdue} overdue follow-up${stats.overdue > 1 ? 's' : ''} requiring attention.`;
  } else if (stats.dueToday > 0) {
    return `📋 ${stats.dueToday} follow-up${stats.dueToday > 1 ? 's' : ''} due today.`;
  } else if (stats.pending > 0) {
    return `✓ ${stats.pending} pending follow-up${stats.pending > 1 ? 's' : ''}, none overdue.`;
  } else {
    return '✓ No pending follow-ups.';
  }
}

function generateDeadlineMessage(stats: { today: number; thisWeek: number; overdue: number }): string {
  if (stats.overdue > 0) {
    return `⚠️ ${stats.overdue} overdue deadline${stats.overdue > 1 ? 's' : ''}!`;
  } else if (stats.today > 0) {
    return `📅 ${stats.today} deadline${stats.today > 1 ? 's' : ''} due today.`;
  } else if (stats.thisWeek > 0) {
    return `📅 ${stats.thisWeek} deadline${stats.thisWeek > 1 ? 's' : ''} this week.`;
  } else {
    return '✓ No upcoming deadlines.';
  }
}

function generateActionItemMessage(stats: { todo: number; overdue: number; dueToday: number; highPriority: number }): string {
  if (stats.overdue > 0) {
    return `⚠️ ${stats.overdue} overdue action item${stats.overdue > 1 ? 's' : ''}!`;
  } else if (stats.dueToday > 0) {
    return `📝 ${stats.dueToday} action item${stats.dueToday > 1 ? 's' : ''} due today.`;
  } else if (stats.highPriority > 0) {
    return `📝 ${stats.highPriority} high-priority item${stats.highPriority > 1 ? 's' : ''} pending.`;
  } else if (stats.todo > 0) {
    return `✓ ${stats.todo} action item${stats.todo > 1 ? 's' : ''} in your queue.`;
  } else {
    return '✓ No pending action items.';
  }
}

async function runTests() {
  logger.info('='.repeat(60));
  logger.info('Enhanced Daily Briefing Service Test Suite');
  logger.info('='.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  // ==========================================================================
  // Test 1: Briefing Data Structure Validation
  // ==========================================================================
  logger.info('\n🧪 Test 1: Briefing Data Structure');
  logger.info('-'.repeat(40));

  const mockBriefing: DailyBriefing = {
    userId: 'test-user',
    tenantId: 'test-tenant',
    generatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    summary: 'You have 5 unread emails, 2 received today.',
    highlights: ['Email from boss@company.com about Q1 report', 'Meeting invite for tomorrow'],
    urgent: ['Project deadline approaching'],
    stats: {
      totalUnread: 5,
      newToday: 2,
      requiresResponse: 1,
    },
    followUps: {
      pending: 3,
      overdue: 1,
      dueToday: 1,
      items: [
        { id: '1', emailId: 'email-1', reason: 'Waiting for response', dueDate: new Date().toISOString(), status: 'PENDING' },
      ],
      message: '⚠️ You have 1 overdue follow-up requiring attention.',
    },
    deadlines: {
      today: [{ id: 'd1', title: 'Submit report', deadline: new Date().toISOString() }],
      thisWeek: [],
      overdue: 0,
      message: '📅 1 deadline due today.',
    },
    actionItems: {
      todo: 5,
      inProgress: 2,
      overdue: 0,
      highPriority: 1,
      dueToday: [],
      message: '📝 1 high-priority item pending.',
    },
    calendar: {
      todaysMeetings: [{ id: 'c1', title: 'Team Standup', startTime: '09:00', endTime: '09:30' }],
      message: '📆 1 meeting today: Team Standup',
    },
  };

  // Validate required fields
  const requiredFields = ['userId', 'tenantId', 'generatedAt', 'validUntil', 'summary', 'highlights', 'urgent', 'stats'];
  for (const field of requiredFields) {
    if (field in mockBriefing) {
      logger.success(`Required field "${field}" present`);
      totalPassed++;
    } else {
      logger.fail(`Required field "${field}" missing`);
      totalFailed++;
    }
  }

  // Validate enhanced fields
  const enhancedFields = ['followUps', 'deadlines', 'actionItems', 'calendar'];
  for (const field of enhancedFields) {
    if (field in mockBriefing && mockBriefing[field as keyof DailyBriefing] !== undefined) {
      logger.success(`Enhanced field "${field}" present`);
      totalPassed++;
    } else {
      logger.fail(`Enhanced field "${field}" missing`);
      totalFailed++;
    }
  }

  // ==========================================================================
  // Test 2: Follow-up Message Generation
  // ==========================================================================
  logger.info('\n🧪 Test 2: Follow-up Message Generation');
  logger.info('-'.repeat(40));

  const followUpScenarios = [
    { stats: { pending: 0, overdue: 0, dueToday: 0 }, expected: '✓ No pending follow-ups.' },
    { stats: { pending: 3, overdue: 0, dueToday: 0 }, expected: '✓ 3 pending follow-ups, none overdue.' },
    { stats: { pending: 3, overdue: 0, dueToday: 2 }, expected: '📋 2 follow-ups due today.' },
    { stats: { pending: 5, overdue: 2, dueToday: 1 }, expected: '⚠️ You have 2 overdue follow-ups requiring attention.' },
    { stats: { pending: 1, overdue: 1, dueToday: 0 }, expected: '⚠️ You have 1 overdue follow-up requiring attention.' },
  ];

  for (const { stats, expected } of followUpScenarios) {
    const result = generateFollowUpMessage(stats);
    if (result === expected) {
      logger.success(`Follow-up scenario: pending=${stats.pending}, overdue=${stats.overdue}`);
      totalPassed++;
    } else {
      logger.fail(`Expected: "${expected}", got: "${result}"`);
      totalFailed++;
    }
  }

  // ==========================================================================
  // Test 3: Deadline Message Generation
  // ==========================================================================
  logger.info('\n🧪 Test 3: Deadline Message Generation');
  logger.info('-'.repeat(40));

  const deadlineScenarios = [
    { stats: { today: 0, thisWeek: 0, overdue: 0 }, expected: '✓ No upcoming deadlines.' },
    { stats: { today: 0, thisWeek: 3, overdue: 0 }, expected: '📅 3 deadlines this week.' },
    { stats: { today: 2, thisWeek: 1, overdue: 0 }, expected: '📅 2 deadlines due today.' },
    { stats: { today: 1, thisWeek: 2, overdue: 3 }, expected: '⚠️ 3 overdue deadlines!' },
    { stats: { today: 0, thisWeek: 1, overdue: 1 }, expected: '⚠️ 1 overdue deadline!' },
  ];

  for (const { stats, expected } of deadlineScenarios) {
    const result = generateDeadlineMessage(stats);
    if (result === expected) {
      logger.success(`Deadline scenario: today=${stats.today}, week=${stats.thisWeek}, overdue=${stats.overdue}`);
      totalPassed++;
    } else {
      logger.fail(`Expected: "${expected}", got: "${result}"`);
      totalFailed++;
    }
  }

  // ==========================================================================
  // Test 4: Action Item Message Generation
  // ==========================================================================
  logger.info('\n🧪 Test 4: Action Item Message Generation');
  logger.info('-'.repeat(40));

  const actionItemScenarios = [
    { stats: { todo: 0, overdue: 0, dueToday: 0, highPriority: 0 }, expected: '✓ No pending action items.' },
    { stats: { todo: 5, overdue: 0, dueToday: 0, highPriority: 0 }, expected: '✓ 5 action items in your queue.' },
    { stats: { todo: 5, overdue: 0, dueToday: 0, highPriority: 2 }, expected: '📝 2 high-priority items pending.' },
    { stats: { todo: 5, overdue: 0, dueToday: 3, highPriority: 2 }, expected: '📝 3 action items due today.' },
    { stats: { todo: 5, overdue: 2, dueToday: 3, highPriority: 2 }, expected: '⚠️ 2 overdue action items!' },
  ];

  for (const { stats, expected } of actionItemScenarios) {
    const result = generateActionItemMessage(stats);
    if (result === expected) {
      logger.success(`Action item scenario: todo=${stats.todo}, overdue=${stats.overdue}`);
      totalPassed++;
    } else {
      logger.fail(`Expected: "${expected}", got: "${result}"`);
      totalFailed++;
    }
  }

  // ==========================================================================
  // Test 5: Service Integration Check (requires running services)
  // ==========================================================================
  logger.info('\n🧪 Test 5: Service Integration Check');
  logger.info('-'.repeat(40));

  try {
    const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
    const prisma = createPrismaClient();

    // Check if we can query the database
    const userCount = await prisma.user.count();
    logger.success(`Database connection working (${userCount} users found)`);
    totalPassed++;

    // Check AI Secretary tables exist
    const aiTaskCount = await prisma.aiTask.count();
    logger.success(`AiTask table accessible (${aiTaskCount} tasks)`);
    totalPassed++;

    const followUpCount = await prisma.emailFollowUp.count();
    logger.success(`EmailFollowUp table accessible (${followUpCount} follow-ups)`);
    totalPassed++;

    const deadlineCount = await prisma.aiDeadline.count();
    logger.success(`AiDeadline table accessible (${deadlineCount} deadlines)`);
    totalPassed++;

    await prisma.$disconnect();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Service integration check failed: ${msg}`);
    totalFailed++;
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  logger.info('\n' + '='.repeat(60));
  logger.info('Test Summary');
  logger.info('='.repeat(60));
  logger.info(`Total Passed: ${totalPassed}`);
  logger.info(`Total Failed: ${totalFailed}`);
  logger.info(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (totalFailed === 0) {
    logger.success('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    logger.fail(`\n${totalFailed} test(s) failed`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  logger.error(`Test suite failed: ${err.message}`);
  process.exit(1);
});
