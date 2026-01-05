
import { NestFactory } from '@nestjs/core';
import { Module, Logger, Injectable } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Readable, PassThrough } from 'stream';
import { IMAPDriver } from '../src/modules/email-sync/drivers/imap/imap.driver';
import { ImapAttachmentHandler } from '../src/modules/email-sync/services/imap/imap-attachment-handler';
import { AttachmentStorageService } from '../src/modules/email/services/attachment.storage';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisLockService } from '../src/common/services/redis-lock.service';
import { IcsParserService } from '../src/modules/calendar/services/ics-parser.service';
import { AttachmentMeta } from '../src/modules/email-sync/drivers/interfaces/canonical.types';
import { AttachmentProviderType } from '../src/modules/email-sync/services/base-attachment-handler';

// --- Mocks ---

@Injectable()
class MockAttachmentStorageService {
    uploadAttachmentCalled = false;
    receivedStream = false;

    getProcessingStrategy(metadata: any) {
        return 'embeddings'; // Force download & upload
    }

    storeAttachmentMetadata(providerId: string, metadata: any) {
        return { ...metadata, storageType: 's3', storagePath: 'mock/path', isInline: false };
    }

    async uploadAttachment(tenantId: string, providerId: string, data: any) {
        this.uploadAttachmentCalled = true;

        // VERIFICATION POINT: Check if data.content is a Stream
        if (data.content && typeof data.content.pipe === 'function') {
            console.log('✅ AttachmentStorageService received a STREAM!');
            this.receivedStream = true;

            // Consume the stream to simulate upload
            const chunks: any[] = [];
            for await (const chunk of data.content) {
                chunks.push(chunk);
            }
            console.log('Stream consumed. Total bytes:', chunks.reduce((acc, c) => acc + c.length, 0));
        } else if (Buffer.isBuffer(data.content)) {
            console.error('❌ AttachmentStorageService received a BUFFER (Expected Stream)!');
        } else {
            console.error('❌ AttachmentStorageService received unknown type:', typeof data.content);
        }

        return {
            filename: data.filename,
            mimeType: data.contentType,
            size: 100, // Dummy
            storageType: 's3',
            storagePath: 'mock/path',
            contentHash: 'hash',
            isInline: false
        };
    }
}

@Injectable()
class MockIcsParserService {
    isCalendarAttachment() { return false; }
}

@Injectable()
class MockPrismaService {
    email = {
        findUnique: jest.fn().mockResolvedValue({ id: 'email-1' }),
        update: jest.fn(),
    };
    emailAttachment = {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
    };
    $transaction(cb: any) { return cb(this); }
}

@Injectable()
class MockRedisLockService {
    async withLock(key: any, ttl: any, cb: any) { return cb(); }
}

// --- Test Driver Subclass ---

class TestIMAPDriver extends IMAPDriver {
    // Override acquireConnection to return our Mock ImapFlow Client
    // @ts-ignore - Accessing private method via inheritance for test
    protected async acquireConnection(skipCheck = false) {
        console.log('TestIMAPDriver: acquireConnection called');
        return {
            usable: true,
            getMailboxLock: async (path: string) => ({
                release: () => console.log('✅ Lock released'),
            }),
            download: async (uid: string, range: any, options: any) => {
                console.log('TestIMAPDriver: download called for UID', uid);

                // Simulate IMAP stream
                const stream = new PassThrough();
                setTimeout(() => {
                    stream.write(Buffer.from('Hello Streaming World!'));
                    stream.on('end', () => console.log('TestIMAPDriver: Stream ended from source'));
                    stream.end();
                }, 10);

                return {
                    meta: { contentType: 'text/plain', expectedSize: 22 },
                    content: stream
                };
            }
        } as any;
    }

    // Override release to just log
    protected async releaseConnection(client: any) {
        console.log('✅ Connection released back to pool');
    }
}

// --- Module Setup ---

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true })],
    providers: [
        ImapAttachmentHandler,
        { provide: PrismaService, useClass: MockPrismaService },
        { provide: AttachmentStorageService, useClass: MockAttachmentStorageService }, // Ensure Mock is used
        { provide: IcsParserService, useClass: MockIcsParserService },
        { provide: RedisLockService, useClass: MockRedisLockService },
    ],
})
class TestModule { }

async function main() {
    console.log('Starting Streaming Verification...');

    const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    const handler = app.get(ImapAttachmentHandler);
    const storage = app.get(AttachmentStorageService) as MockAttachmentStorageService;

    // Inject Mock Redis
    handler.setRedisLockService(new MockRedisLockService() as any);

    // IMAPDriver has no constructor arguments
    const driver = new TestIMAPDriver();

    const attachment: AttachmentMeta = {
        id: 'att-1',
        filename: 'test.txt',
        mimeType: 'text/plain',
        size: 22,
        isInline: false
    };

    console.log('\n--- Running processImapAttachments ---');
    await handler.processImapAttachments(
        driver as any, // Cast to avoid private property compatibility issues in test script
        'email-1',
        'INBOX:123',
        [attachment],
        'tenant-1',
        'provider-1'
    );

    console.log('\n--- Verification Results ---');
    if (storage.uploadAttachmentCalled && storage.receivedStream) {
        console.log('✅ PASS: Stream flow verified successfully!');
    } else {
        console.error('❌ FAIL: Did not receive stream in storage service.');
        process.exit(1);
    }

    await app.close();
}

main().catch(console.error);
