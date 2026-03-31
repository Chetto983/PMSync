import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { Roles } from '../../../../common/auth/roles.decorator';
import { AccountService } from '../services/account.service';
import { ExcelExportService } from '../../import-export/services/excel-export.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  ListAccountsQueryDto,
  LinkContactDto,
  CreateAccountActivityDto,
  ListAccountActivitiesQueryDto,
} from '../dto/account.dto';

@ApiTags('CRM - Accounts')
@ApiBearerAuth()
@Controller('crm/accounts')
@UseGuards(TenantGuard, RolesGuard)
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List accounts' })
  @ApiResponse({ status: 200, description: 'Accounts returned successfully' })
  async list(@Req() req: any, @Query() query: ListAccountsQueryDto) {
    const tenantId = req.user.tenantId;
    return this.accountService.list(tenantId, query);
  }

  @Get('export')
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

  @Get('by-contact/:contactId')
  @ApiOperation({ summary: 'List accounts linked to a contact' })
  @ApiResponse({ status: 200, description: 'Linked accounts returned' })
  async getAccountsByContact(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.getAccountsByContact(tenantId, contactId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiResponse({ status: 200, description: 'Account returned' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.findById(tenantId, id);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Get child accounts' })
  @ApiResponse({ status: 200, description: 'Child accounts returned' })
  @ApiResponse({ status: 404, description: 'Parent account not found' })
  async getChildren(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.getChildren(tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  async create(@Req() req: any, @Body() dto: CreateAccountDto) {
    const tenantId = req.user.tenantId;
    return this.accountService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account' })
  @ApiResponse({ status: 200, description: 'Account updated' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete account (soft)' })
  @ApiResponse({ status: 200, description: 'Account soft-deleted' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.delete(tenantId, id);
  }

  @Get(':id/contacts')
  @ApiOperation({ summary: 'List contacts linked to account' })
  @ApiResponse({ status: 200, description: 'Linked contacts returned' })
  async getContacts(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.accountService.getContacts(tenantId, id);
  }

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Link contact to account' })
  @ApiResponse({ status: 201, description: 'Contact linked' })
  @ApiResponse({ status: 409, description: 'Contact already linked' })
  async linkContact(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: LinkContactDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.linkContact(tenantId, id, dto);
  }

  @Delete(':accountId/contacts/:contactId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink contact from account' })
  @ApiResponse({ status: 200, description: 'Contact unlinked' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async unlinkContact(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.accountService.unlinkContact(tenantId, accountId, contactId);
  }

  // ---- Activities ----

  @Get(':id/activities')
  @ApiOperation({ summary: 'List activities for an account' })
  @ApiResponse({ status: 200, description: 'Activities returned' })
  async listActivities(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: ListAccountActivitiesQueryDto,
  ) {
    return this.accountService.listActivities(req.user.tenantId, id, query);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Create activity for an account' })
  @ApiResponse({ status: 201, description: 'Activity created' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async createActivity(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateAccountActivityDto,
  ) {
    return this.accountService.createActivity(req.user.tenantId, id, dto);
  }
}
