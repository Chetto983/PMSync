import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrismaAdapter } from './prisma-client.factory';
import { getConfiguration } from '../config/configuration';
import { TenantKeyService } from '../common/services/tenant-key.service';
import { createFieldEncryptionExtension } from './encryption/field-encryption.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: createPrismaAdapter() });

    const config = getConfiguration();
    const masterKey = config.fieldEncryption.masterKey;

    if (masterKey) {
      const tenantKeyService = new TenantKeyService();

      if (tenantKeyService.isEnabled) {
        const extended = this.$extends(
          createFieldEncryptionExtension(
            (tenantId) => tenantKeyService.getCurrentKey(tenantId),
            (tenantId) => tenantKeyService.getDecryptionKeys(tenantId),
          ),
        );
        Object.assign(this, extended);
        this.logger.log('Field encryption extension applied');
      }
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected to database');
  }

  async enableShutdownHooks(app: INestApplication) {
    // Use process event instead of Prisma's $on for type safety
    process.on('SIGINT', async () => {
      await this.$disconnect();
      await app.close();
    });

    process.on('SIGTERM', async () => {
      await this.$disconnect();
      await app.close();
    });
  }
}
