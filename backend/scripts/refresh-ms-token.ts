
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CalendarService } from '../src/modules/calendar/services/calendar.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
    console.log('🚀 Starting NestJS application context to refresh token...\n');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'], // Enable logs to see sync progress
    });

    try {
        const prisma = app.get(PrismaService);
        const calendarService = app.get(CalendarService);

        // Find Microsoft provider
        const msProvider = await prisma.providerConfig.findFirst({
            where: {
                providerType: 'microsoft',
            },
        });

        if (!msProvider) {
            console.error('❌ No Microsoft provider found.');
            return;
        }

        console.log(`✅ Found Microsoft provider: ${msProvider.email} (ID: ${msProvider.id})`);
        console.log(`Current token expires at: ${msProvider.tokenExpiresAt}`);

        console.log('\n🔄 Triggering calendar sync causing token refresh...');

        // Trigger sync
        await calendarService.syncProvider(msProvider.tenantId, msProvider.id);

        console.log('✅ Sync initiated. Waiting 5 seconds for potential token refresh...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Check new token
        const updatedProvider = await prisma.providerConfig.findUnique({
            where: { id: msProvider.id },
        });

        console.log(`\nNew token expires at: ${updatedProvider?.tokenExpiresAt}`);

        if (updatedProvider?.tokenExpiresAt?.getTime() !== msProvider.tokenExpiresAt?.getTime()) {
            console.log('🎉 Token successfully refreshed!');
        } else {
            console.log('⚠️ Token expiration did not change. It might still be valid or refresh failed.');
        }

    } catch (error) {
        console.error('❌ Error refreshing token:', error);
    } finally {
        await app.close();
    }
}

main().catch(console.error);
