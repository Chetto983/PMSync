import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum NBAActionStatus {
  SUGGESTED = 'SUGGESTED',
  ACCEPTED = 'ACCEPTED',
  DISMISSED = 'DISMISSED',
  EXECUTED = 'EXECUTED',
}

export class UpdateNBAStatusDto {
  @ApiPropertyOptional({ enum: NBAActionStatus })
  @IsEnum(NBAActionStatus)
  status: NBAActionStatus;
}
