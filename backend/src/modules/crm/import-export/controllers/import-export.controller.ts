/**
 * CRM Import/Export Controller
 *
 * Endpoints:
 * - POST /crm/contacts/import/headers — Parse CSV and return column headers
 * - POST /crm/contacts/import/preview — Preview mapped rows
 * - POST /crm/contacts/import — Start async import job
 * - GET /crm/contacts/export — Export contacts to XLSX
 * - GET /crm/accounts/export — Export accounts to XLSX
 */

import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  Req,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { Roles } from '../../../../common/auth/roles.decorator';
import { CsvImportService } from '../services/csv-import.service';
import { ContactImportQueueService } from '../services/contact-import-queue.service';
import { ExcelExportService } from '../services/excel-export.service';
import { ImportContactsDto } from '../dto/import.dto';
import { CSV_IMPORT_LIMITS } from '../types';

@ApiTags('CRM Import/Export')
@Controller('crm')
@UseGuards(TenantGuard, RolesGuard)
export class ImportExportController {
  constructor(
    private readonly csvImportService: CsvImportService,
    private readonly importQueueService: ContactImportQueueService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  @Post('contacts/import/headers')
  @Roles('admin', 'super-admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CSV_IMPORT_LIMITS.MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.match(/\.(csv|txt)$/i)) {
          return cb(new BadRequestException('Only CSV files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Parse CSV headers for column mapping' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'CSV headers parsed' })
  async parseHeaders(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const csvContent = file.buffer.toString('utf-8');
    const headers = this.csvImportService.parseHeaders(csvContent);

    return { headers };
  }

  @Post('contacts/import/preview')
  @Roles('admin', 'super-admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CSV_IMPORT_LIMITS.MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.match(/\.(csv|txt)$/i)) {
          return cb(new BadRequestException('Only CSV files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Preview mapped CSV rows before import' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Preview rows returned' })
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportContactsDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const csvContent = file.buffer.toString('utf-8');
    return this.csvImportService.parsePreview(csvContent, dto.mappings);
  }

  @Post('contacts/import')
  @Roles('admin', 'super-admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CSV_IMPORT_LIMITS.MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.match(/\.(csv|txt)$/i)) {
          return cb(new BadRequestException('Only CSV files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Import contacts from CSV (async via BullMQ)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 202, description: 'Import job enqueued' })
  async importContacts(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportContactsDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const tenantId = req.user.tenantId;
    const csvContent = file.buffer.toString('utf-8');

    const { jobId } = await this.importQueueService.enqueueImport({
      tenantId,
      csvContent,
      mappings: dto.mappings,
    });

    return { jobId, message: 'Import job enqueued. Track progress via Socket.IO event crm:import:progress' };
  }

  @Get('contacts/export')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Export contacts to XLSX' })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'XLSX file download' })
  async exportContacts(
    @Req() req: any,
    @Res() res: Response,
    @Query('search') search?: string,
  ) {
    const tenantId = req.user.tenantId;
    const buffer = await this.excelExportService.exportContacts(tenantId, { search });

    const filename = `contacts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('accounts/export')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Export accounts to XLSX' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'industry', required: false })
  @ApiResponse({ status: 200, description: 'XLSX file download' })
  async exportAccounts(
    @Req() req: any,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('industry') industry?: string,
  ) {
    const tenantId = req.user.tenantId;
    const buffer = await this.excelExportService.exportAccounts(tenantId, { search, industry });

    const filename = `accounts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
