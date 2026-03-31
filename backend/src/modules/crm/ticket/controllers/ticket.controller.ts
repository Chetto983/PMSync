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
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { TicketService } from '../services/ticket.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  ListTicketsQueryDto,
  ChangeTicketStatusDto,
  CreateTicketCommentDto,
  AssignTicketDto,
} from '../dto/ticket.dto';

@ApiTags('CRM - Tickets')
@ApiBearerAuth()
@Controller('crm/tickets')
@UseGuards(TenantGuard, RolesGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get()
  @ApiOperation({ summary: 'List tickets with filters' })
  @ApiResponse({ status: 200, description: 'Tickets returned successfully' })
  async list(@Req() req: any, @Query() query: ListTicketsQueryDto) {
    return this.ticketService.list(req.user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket by ID' })
  @ApiResponse({ status: 200, description: 'Ticket returned' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    return this.ticketService.findById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created' })
  async create(@Req() req: any, @Body() dto: CreateTicketDto) {
    return this.ticketService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket' })
  @ApiResponse({ status: 200, description: 'Ticket updated' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete ticket' })
  @ApiResponse({ status: 200, description: 'Ticket deleted' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.ticketService.delete(req.user.tenantId, id);
  }

  // ---- Status Transition ----

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change ticket status (state machine)' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 422, description: 'Invalid status transition' })
  async changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeTicketStatusDto,
  ) {
    return this.ticketService.changeStatus(req.user.tenantId, id, dto);
  }

  // ---- Assignment ----

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign or reassign ticket' })
  @ApiResponse({ status: 200, description: 'Ticket assigned' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async assign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.ticketService.assign(
      req.user.tenantId,
      id,
      dto.assigneeId,
      req.user.id,
    );
  }

  // ---- Comments ----

  @Get(':id/comments')
  @ApiOperation({ summary: 'List ticket comments' })
  @ApiResponse({ status: 200, description: 'Comments returned' })
  async listComments(@Req() req: any, @Param('id') id: string) {
    return this.ticketService.listComments(req.user.tenantId, id);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add comment to ticket' })
  @ApiResponse({ status: 201, description: 'Comment created' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async addComment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateTicketCommentDto,
  ) {
    return this.ticketService.addComment(
      req.user.tenantId,
      id,
      req.user.id,
      dto,
    );
  }
}
