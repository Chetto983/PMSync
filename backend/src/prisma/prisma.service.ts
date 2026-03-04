import { Inject, INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrismaAdapter } from './prisma-client.factory';
import { TenantKeyService } from '../common/services/tenant-key.service';
import { createFieldEncryptionExtension } from './encryption/field-encryption.extension';
import { createTenantScopingExtension } from './tenant-scoping/tenant-scoping.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private logger = new Logger(PrismaService.name);

  constructor(
    @Inject(TenantKeyService) private readonly tenantKeyService: TenantKeyService,
  ) {
    super({ adapter: createPrismaAdapter() });
  }

  async onModuleInit() {
    // Tenant scoping runs first — injects tenantId into args
    // so field encryption can read it for key derivation.
    let client: PrismaClient = this.$extends(
      createTenantScopingExtension(),
    ) as unknown as PrismaClient;
    this.logger.log('Tenant-scoping extension applied (audit mode)');

    if (this.tenantKeyService.isEnabled) {
      client = client.$extends(
        createFieldEncryptionExtension(
          (tenantId) => this.tenantKeyService.getCurrentKey(tenantId),
          (tenantId) => this.tenantKeyService.getDecryptionKeys(tenantId),
          (tenantId) => this.tenantKeyService.getHmacKey(tenantId),
        ),
      ) as unknown as PrismaClient;
      this.logger.log('Field encryption extension applied');
    }

    Object.assign(this, client);
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
