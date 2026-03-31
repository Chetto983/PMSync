import { Module } from '@nestjs/common';
import { AccountController } from './controllers/account.controller';
import { AccountService } from './services/account.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ImportExportModule } from '../import-export/import-export.module';

@Module({
  imports: [PrismaModule, ImportExportModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
