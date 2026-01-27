/**
 * Quick script to clear the agent cache.
 * Run: cd backend && TEST_AUTH_TOKEN="your-token" npx ts-node scripts/clear-agent-cache.ts
 */
import axios from 'axios';

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const token = process.env.TEST_AUTH_TOKEN;

async function main() {
  if (!token) {
    console.log('❌ TEST_AUTH_TOKEN environment variable required');
    console.log('   Get it from browser localStorage: localStorage.getItem("auth-storage")');
    process.exit(1);
  }

  try {
    console.log('🔄 Clearing agent cache...');

    const response = await axios.post(
      `${API_BASE}/api/v1/voltagent/cache/clear-agents`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    console.log('✅ Cache cleared successfully!');
    console.log(`   Response: ${JSON.stringify(response.data)}`);
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
    console.log(`❌ Failed to clear cache: ${axiosErr.response?.status || axiosErr.message}`);
    if (axiosErr.response?.data) {
      console.log(`   Data: ${JSON.stringify(axiosErr.response.data)}`);
    }
    process.exit(1);
  }
}

main();
