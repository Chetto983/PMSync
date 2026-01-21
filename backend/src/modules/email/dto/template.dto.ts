import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template name', example: 'Follow-up Template' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Email subject line', example: 'Following up on our conversation' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subject: string;

  @ApiProperty({ description: 'HTML content of the email body', example: '<p>Hi,</p><p>Just following up...</p>' })
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  bodyHtml: string;

  @ApiPropertyOptional({ description: 'Category for organizing templates', example: 'Sales' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: 'Set as default template for quick access', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

export class TemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  bodyHtml: string;

  @ApiProperty({ nullable: true })
  category: string | null;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TemplateListResponseDto {
  @ApiProperty({ type: [TemplateResponseDto] })
  templates: TemplateResponseDto[];

  @ApiProperty()
  total: number;
}
