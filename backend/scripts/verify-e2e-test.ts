
import { NestFactory } from '@nestjs/core';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
    ],
})
class VerifyModule { }

async function main() {
    const logger = new Logger('VerifyE2E');
    const app = await NestFactory.createApplicationContext(VerifyModule);
    const prisma = app.get(PrismaService);

    // 1. Find the test email
    const email = await prisma.email.findFirst({
        where: {
            subject: { contains: '[ATTACHMENT-TEST]' }
        },
        orderBy: { receivedAt: 'desc' },
        include: {
            attachments: true,
            embeddings: true
        }
    });

    if (!email) {
        logger.error('No test email found!');
        await app.close();
        process.exit(1);
    }

    logger.log(`Found Email: ${email.id}`);
    logger.log(`Subject: ${email.subject}`);
    logger.log(`Received At: ${email.receivedAt}`);

    if (email.attachments.length === 0) {
        logger.error('No attachments found on the email!');
    } else {
        logger.log(`Attachments: ${email.attachments.length}`);
        email.attachments.forEach(att => {
            logger.log(` - ${att.filename} (${att.mimeType}) Size: ${att.size}`);
        });
    }

    if (email.embeddings.length === 0) {
        logger.warn('No embeddings found YET. The queue might be processing.');
    } else {
        logger.log(`Embeddings: ${email.embeddings.length}`);
        email.embeddings.forEach(emb => {
            logger.log(` - Embedding ID: ${emb.id}`);
            logger.log(` - Content Preview: ${emb.content.substring(0, 200)}...`);

            if (emb.content.includes('Promt-best-pratice.pdf')) {
                logger.log('✅ SUCCESS: PDF filename found in embedding content');
            } else {
                logger.error('❌ FAILURE: PDF filename NOT found in embedding content');
            }

            if (emb.content.includes('File: Promt-best-pratice.pdf')) {
                logger.log('✅ SUCCESS: "File:" marker found, indicating extraction attempted');
            }
        });
    }

    await app.close();
}

main().catch(console.error);
