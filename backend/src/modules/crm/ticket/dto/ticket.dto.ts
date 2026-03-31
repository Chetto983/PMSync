import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Valid status transitions: from → allowed targets */
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['waiting', 'resolved', 'closed'],
  waiting: ['in_progress', 'closed'],
  resolved: ['closed'],
  closed: [],
};

export class CreateTicketDto {
  @IsString()
  @MaxLength(500)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(TICKET_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  emailId?: string;

  @IsOptional()
  @IsString()
  emailThreadId?: string;

  @IsOptional()
  @IsDateString()
  slaDeadline?: string;

  @IsOptional()
  @IsString()
  senderEmail?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(TICKET_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @IsString()
  accountId?: string | null;

  @IsOptional()
  @IsDateString()
  slaDeadline?: string | null;
}

export class ChangeTicketStatusDto {
  @IsString()
  @IsIn(TICKET_STATUSES)
  status!: string;
}

export class ListTicketsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(TICKET_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(TICKET_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 25;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

export class AssignTicketDto {
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class CreateTicketCommentDto {
  @IsString()
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
