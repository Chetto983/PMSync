import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const prisma = app.get(PrismaService);

    const profiles = await prisma.writingStyleProfile.findMany();
    console.log(`Found ${profiles.length} profiles.`);

    if (profiles.length > 0) {
        console.log('Sample Profile:', JSON.stringify(profiles[0], null, 2));
    } else {
        console.log('No profiles found. Backfill likely failed or persisted nothing.');
    }

    // Also check email count to be sure
    const sentCount = await prisma.email.count({
        where: { folder: 'SENT', bodyText: { not: null } }
    });
    console.log(`Total SENT emails in DB: ${sentCount}`);

    await app.close();
}

bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
