/**
 * Cleanup Script for Orphaned Mistral Agents
 *
 * This script removes orphaned Mistral agents that were created by the MailAgent
 * system but are no longer needed (duplicates, expired cache entries, etc.)
 *
 * Usage:
 *   npx ts-node backend/scripts/cleanup-mistral-agents.ts [--dry-run] [--max-age-hours=24]
 *
 * Options:
 *   --dry-run         Show what would be deleted without actually deleting
 *   --max-age-hours   Delete agents older than this (default: 24 hours)
 *   --keep-latest     Keep the most recent agent per locale:tenant pattern
 *
 * Example:
 *   npx ts-node backend/scripts/cleanup-mistral-agents.ts --dry-run
 *   npx ts-node backend/scripts/cleanup-mistral-agents.ts --max-age-hours=12
 */

import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

interface AgentInfo {
  id: string;
  name: string;
  createdAt: Date;
  model: string;
}

interface CleanupOptions {
  dryRun: boolean;
  maxAgeHours: number;
  keepLatest: boolean;
}

const MAILAGENT_PREFIXES = [
  'MailAgent Web Search',
  'MailAgent Analytics',
  'MailAgent',
];

/**
 * Parse command line arguments
 */
function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    maxAgeHours: parseInt(
      args.find((a) => a.startsWith('--max-age-hours='))?.split('=')[1] || '24',
      10,
    ),
    keepLatest: args.includes('--keep-latest'),
  };
}

/**
 * Check if agent is a MailAgent agent
 */
function isMailAgentAgent(name: string): boolean {
  return MAILAGENT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Extract locale from agent name (e.g., "MailAgent Web Search (en)" -> "en")
 */
function extractLocale(name: string): string | null {
  const match = name.match(/\(([a-z]{2})\)$/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Get agent type from name
 */
function getAgentType(name: string): string {
  if (name.includes('Web Search')) return 'web-search';
  if (name.includes('Analytics')) return 'analytics';
  return 'unknown';
}

/**
 * List all Mistral agents
 */
async function listAgents(client: Mistral): Promise<AgentInfo[]> {
  const agents: AgentInfo[] = [];

  try {
    // The Mistral SDK may return paginated results
    const response = await client.beta.agents.list();

    // Handle different response formats
    const data = response?.data || response;
    if (Array.isArray(data)) {
      for (const agent of data) {
        agents.push({
          id: agent.id,
          name: agent.name || 'Unknown',
          createdAt: new Date(agent.created_at || agent.createdAt || Date.now()),
          model: agent.model || 'unknown',
        });
      }
    }
  } catch (error) {
    // If list() is not supported, we can't enumerate agents
    console.error('Failed to list agents:', error instanceof Error ? error.message : error);
    throw error;
  }

  return agents;
}

/**
 * Delete an agent
 */
async function deleteAgent(client: Mistral, agentId: string): Promise<boolean> {
  try {
    await client.beta.agents.delete({ agentId });
    return true;
  } catch (error) {
    console.error(`Failed to delete agent ${agentId}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Main cleanup function
 */
async function cleanup(options: CleanupOptions): Promise<void> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('❌ MISTRAL_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('🔍 Mistral Agent Cleanup Script');
  console.log('================================');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no deletions)' : 'LIVE (will delete)'}`);
  console.log(`Max age: ${options.maxAgeHours} hours`);
  console.log(`Keep latest per type: ${options.keepLatest}`);
  console.log('');

  const client = new Mistral({ apiKey });
  const cutoffTime = new Date(Date.now() - options.maxAgeHours * 60 * 60 * 1000);

  console.log('📋 Fetching all agents...');
  const allAgents = await listAgents(client);
  console.log(`   Found ${allAgents.length} total agents`);

  // Filter to MailAgent agents
  const mailAgents = allAgents.filter((a) => isMailAgentAgent(a.name));
  console.log(`   Found ${mailAgents.length} MailAgent agents`);
  console.log('');

  if (mailAgents.length === 0) {
    console.log('✅ No MailAgent agents found. Nothing to clean up.');
    return;
  }

  // Group by type and locale for analysis
  const grouped = new Map<string, AgentInfo[]>();
  for (const agent of mailAgents) {
    const type = getAgentType(agent.name);
    const locale = extractLocale(agent.name) || 'unknown';
    const key = `${type}:${locale}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(agent);
  }

  console.log('📊 Agent Distribution:');
  for (const [key, agents] of grouped) {
    const sortedAgents = agents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    console.log(`   ${key}: ${agents.length} agents`);
    for (const agent of sortedAgents) {
      const age = Math.round((Date.now() - agent.createdAt.getTime()) / (1000 * 60 * 60));
      console.log(`      - ${agent.id} (${age}h old) - ${agent.name}`);
    }
  }
  console.log('');

  // Determine which agents to delete
  const toDelete: AgentInfo[] = [];

  for (const [key, agents] of grouped) {
    // Sort by creation time (newest first)
    const sortedAgents = agents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    for (let i = 0; i < sortedAgents.length; i++) {
      const agent = sortedAgents[i];

      // Keep the latest if option is set
      if (options.keepLatest && i === 0) {
        continue;
      }

      // Delete if older than max age
      if (agent.createdAt < cutoffTime) {
        toDelete.push(agent);
        continue;
      }

      // Delete duplicates (all except the first/newest)
      if (i > 0) {
        toDelete.push(agent);
      }
    }
  }

  console.log(`🗑️  Agents to delete: ${toDelete.length}`);
  if (toDelete.length === 0) {
    console.log('✅ No agents need cleanup.');
    return;
  }

  console.log('');
  for (const agent of toDelete) {
    const age = Math.round((Date.now() - agent.createdAt.getTime()) / (1000 * 60 * 60));
    console.log(`   - ${agent.id} (${age}h old) - ${agent.name}`);
  }
  console.log('');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN: No agents were deleted.');
    console.log('   Run without --dry-run to actually delete these agents.');
    return;
  }

  // Confirm deletion
  console.log('🚀 Deleting agents...');
  let deleted = 0;
  let failed = 0;

  for (const agent of toDelete) {
    process.stdout.write(`   Deleting ${agent.id}... `);
    const success = await deleteAgent(client, agent.id);
    if (success) {
      console.log('✅');
      deleted++;
    } else {
      console.log('❌');
      failed++;
    }
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Remaining: ${mailAgents.length - deleted}`);
}

// Run the script
cleanup(parseArgs()).catch((error) => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});
