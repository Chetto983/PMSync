import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PendingActionStatus } from '../services/hitl.service';

export class ApproveActionDto {
  @ApiPropertyOptional({ description: 'Optional message for approval' })
  @IsOptional()
  @IsString()
  message?: string;
}

export class RejectActionDto {
  @ApiPropertyOptional({ description: 'Reason for rejection (helps learning)' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GetPendingActionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: PendingActionStatus })
  @IsOptional()
  @IsEnum(PendingActionStatus)
  status?: PendingActionStatus;

  @ApiPropertyOptional({ description: 'Filter by agent name' })
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ description: 'Limit results', default: 50 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @IsOptional()
  offset?: number;
}
