import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for approving or rejecting a HITL action.
 */
export class ApproveActionDto {
  @ApiProperty({ description: 'ID of the ActionQueue entry to resolve' })
  @IsString()
  actionId: string;

  @ApiProperty({
    description: 'Decision: approve, reject, or modify',
    enum: ['approve', 'reject', 'modify'],
  })
  @IsEnum(['approve', 'reject', 'modify'])
  decision: 'approve' | 'reject' | 'modify';

  @ApiPropertyOptional({
    description: 'Modified payload (only for decision=modify)',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  modifiedPayload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Reason for rejection (only for decision=reject)',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

/**
 * Response shape for a pending HITL action.
 */
export interface PendingActionResponse {
  id: string;
  executionId: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  payload: Record<string, unknown>;
  suspendReason: string;
  suspendedAt: Date;
  userId: string;
  agentName: string;
  confidence?: number;
  adjustedConfidence?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
  expiresAt: Date | null;
  reasoningSteps?: string;
}
