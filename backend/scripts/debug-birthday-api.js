/**
 * Debug script to call Microsoft Graph API directly and see the raw response
 * for birthday calendar events
 * Run with: node scripts/debug-birthday-api.js
 */
const { createPrismaClient } = require('./prisma-client');
require('dotenv').config();

const prisma = createPrismaClient();
const https = require('https');

const BIRTHDAY_CALENDAR_ID = 'AQMkADAwATZiZmYAZC05OQA1OC1hOTU4LTAwAi0wMAoARgAAAy-C9ENemOxGr89M1eAcy7cHAI1NL3PokGhJv1Sa8fsDFc8AAAIBBgAAAI1NL3PokGhJv1Sa8fsDFc8AAAJvCAAAAA==';

function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
    });
}

async function main() {
    console.log('🔍 Starting birthday API debug script...\n');

    // Find a Microsoft provider with valid tokens
    const msProvider = await prisma.providerConfig.findFirst({
        where: { providerType: 'microsoft' }
    });

    if (!msProvider) {
        console.log('❌ No Microsoft provider found');
        return;
    }

    console.log('✅ Found Microsoft provider:', msProvider.email);
    console.log('✅ Access token available:', !!msProvider.accessToken);

    if (!msProvider.accessToken) {
        console.log('❌ No access token available');
        return;
    }

    // Call the Graph API directly to get birthday calendar events
    const graphUrl = `https://graph.microsoft.com/v1.0/me/calendars/${BIRTHDAY_CALENDAR_ID}/events?$top=5`;

    console.log('\n=== Calling Graph API ===');
    console.log('URL:', graphUrl.substring(0, 80) + '...');

    const response = await httpsGet(graphUrl, {
        'Authorization': `Bearer ${msProvider.accessToken}`,
        'Content-Type': 'application/json'
    });

    console.log('\n=== RAW API RESPONSE ===');
    console.log('Status:', response.status);

    if (response.status === 401) {
        console.log('\n⚠️ Token expired. Trigger a sync from the UI first to refresh tokens.');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        return;
    }

    if (response.status !== 200) {
        console.log('❌ Error response:', JSON.stringify(response.data, null, 2));
        return;
    }

    console.log('Number of events:', response.data.value?.length || 0);

    if (response.data.value && response.data.value.length > 0) {
        response.data.value.forEach((event, index) => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`=== EVENT ${index + 1} ===`);
            console.log(`${'='.repeat(60)}`);

            console.log('\n📋 KEY FIELDS:');
            console.log('  id:', event.id?.substring(0, 50) + '...');
            console.log('  subject:', JSON.stringify(event.subject));
            console.log('  bodyPreview:', JSON.stringify(event.bodyPreview));
            console.log('  organizer:', JSON.stringify(event.organizer));
            console.log('  attendees:', JSON.stringify(event.attendees));
            console.log('  categories:', JSON.stringify(event.categories));
            console.log('  showAs:', event.showAs);
            console.log('  sensitivity:', event.sensitivity);
            console.log('  isAllDay:', event.isAllDay);
            console.log('  start:', JSON.stringify(event.start));

            console.log('\n📑 ALL FIELDS:');
            console.log('  ' + Object.keys(event).join(', '));

            console.log('\n📜 FULL EVENT JSON:');
            console.log(JSON.stringify(event, null, 2));
        });
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
