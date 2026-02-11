import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO representing a single data export request response
 */
export class DataExportResponseDto {
  @ApiProperty({ description: 'Export request ID' })
  exportId!: string;

  @ApiProperty({
    description: 'Export status',
    enum: ['PENDING', 'PROCESSING', 'READY', 'EXPIRED', 'FAILED'],
  })
  status!: string;

  @ApiProperty({ description: 'When the export was requested' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'When the export file expires', type: Date, nullable: true })
  expiresAt?: Date | null;

  @ApiPropertyOptional({ description: 'Size of the export file in bytes', type: Number, nullable: true })
  fileSize?: number | null;
}

/**
 * DTO representing a list of data exports
 */
export class DataExportListDto {
  @ApiProperty({ type: [DataExportResponseDto], description: 'List of export requests' })
  exports!: DataExportResponseDto[];
}
