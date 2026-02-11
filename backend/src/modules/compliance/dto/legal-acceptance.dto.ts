import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for accepting a legal document (ToS or Privacy Policy)
 */
export class AcceptLegalDocumentDto {
  @ApiProperty({
    description: 'Type of legal document',
    enum: ['TOS', 'PRIVACY_POLICY'],
    example: 'TOS',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['TOS', 'PRIVACY_POLICY'])
  documentType!: string;

  @ApiProperty({
    description: 'Version of the document being accepted',
    example: '1.0',
  })
  @IsString()
  @IsNotEmpty()
  documentVersion!: string;
}

/**
 * DTO representing legal acceptance status for all documents
 */
export class LegalStatusDto {
  @ApiProperty({ description: 'Whether current ToS version is accepted' })
  tosAccepted!: boolean;

  @ApiProperty({ description: 'Accepted ToS version (or null)' })
  tosVersion!: string | null;

  @ApiProperty({ description: 'Whether current Privacy Policy version is accepted' })
  ppAccepted!: boolean;

  @ApiProperty({ description: 'Accepted Privacy Policy version (or null)' })
  ppVersion!: string | null;

  @ApiProperty({ description: 'Current required ToS version' })
  currentTosVersion!: string;

  @ApiProperty({ description: 'Current required Privacy Policy version' })
  currentPpVersion!: string;
}
