const axios = require('axios');
require('dotenv').config();

async function main() {
    console.log('🔄 Manually triggering Microsoft calendar sync...\n');

    try {
        // Get auth token (you'll need to be logged in)
        const response = await axios.post('http://localhost:3000/api/calendar/sync/manual', {
            providerType: 'microsoft',
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        console.log('✅ Sync triggered successfully');
        console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);

        // Try alternative endpoint
        console.log('\nTrying alternative approach - check backend logs for sync activity...');
    }
}

main();
