import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantKeyService } from '../common/services/tenant-key.service';
import { HashSearchService } from '../common/services/hash-search.service';

@Global()
@Module({
  providers: [PrismaService, TenantKeyService, HashSearchService],
  exports: [PrismaService, TenantKeyService, HashSearchService],
})
export class PrismaModule {}
