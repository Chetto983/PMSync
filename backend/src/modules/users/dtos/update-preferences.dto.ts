import { IsOptional, IsBoolean, IsString, IsObject, IsArray, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({
    description: 'Folder order per provider',
    example: { 'provider-id-1': ['folder-1', 'folder-2'], 'provider-id-2': ['folder-3'] },
    required: false,
  })
  @IsOptional()
  @IsObject()
  folderOrders?: Record<string, string[]>;

  @ApiProperty({
    description: 'Whether smart filters section is expanded in sidebar',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  sidebarSmartFiltersExpanded?: boolean;

  @ApiProperty({
    description: 'Whether labels section is expanded in sidebar',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  sidebarLabelsExpanded?: boolean;

  @ApiProperty({
    description: 'UI theme preference',
    example: 'light',
    required: false,
  })
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiProperty({
    description: 'Language preference',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({
    description: 'Email list density',
    example: 'comfortable',
    required: false,
  })
  @IsOptional()
  @IsString()
  emailDensity?: string;

  // ==========================================
  // AI Personalization Fields
  // ==========================================

  @ApiProperty({
    description: 'Job title',
    example: 'Software Engineer',
    required: false,
  })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiProperty({
    description: 'Job role type',
    example: 'IC',
    enum: ['EXECUTIVE', 'MANAGER', 'IC', 'FREELANCER', 'STUDENT', 'OTHER'],
    required: false,
  })
  @IsOptional()
  @IsString()
  jobRole?: string;

  @ApiProperty({
    description: 'Department',
    example: 'Engineering',
    required: false,
  })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({
    description: 'Industry',
    example: 'Technology',
    required: false,
  })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({
    description: 'Company size',
    example: 'SMB',
    enum: ['SOLO', 'STARTUP', 'SMB', 'ENTERPRISE'],
    required: false,
  })
  @IsOptional()
  @IsString()
  companySize?: string;

  @ApiProperty({
    description: 'AI communication style',
    example: 'CASUAL',
    enum: ['FORMAL', 'CASUAL', 'TECHNICAL', 'CREATIVE'],
    required: false,
  })
  @IsOptional()
  @IsString()
  communicationStyle?: string;

  @ApiProperty({
    description: 'AI response length preference',
    example: 'MODERATE',
    enum: ['BRIEF', 'MODERATE', 'DETAILED'],
    required: false,
  })
  @IsOptional()
  @IsString()
  responseLength?: string;

  @ApiProperty({
    description: 'Working hours start (HH:mm)',
    example: '09:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  workingHoursStart?: string;

  @ApiProperty({
    description: 'Working hours end (HH:mm)',
    example: '18:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  workingHoursEnd?: string;

  @ApiProperty({
    description: 'Working days',
    example: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workingDays?: string[];

  @ApiProperty({
    description: 'AI proactivity level',
    example: 'MEDIUM',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    required: false,
  })
  @IsOptional()
  @IsString()
  proactivityLevel?: string;

  @ApiProperty({
    description: 'Notification frequency preference',
    example: 'DIGEST',
    enum: ['IMMEDIATE', 'DIGEST', 'MINIMAL'],
    required: false,
  })
  @IsOptional()
  @IsString()
  notificationFrequency?: string;

  @ApiProperty({
    description: 'AI auto-approve threshold (0-1)',
    example: 0.9,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  aiAutoApproveThreshold?: number;

  @ApiProperty({
    description: 'Enable AI smart replies',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  aiSmartRepliesEnabled?: boolean;

  @ApiProperty({
    description: 'Enable AI summarization',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  aiSummarizationEnabled?: boolean;

  @ApiProperty({
    description: 'Enable AI scheduling assistance',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  aiSchedulingEnabled?: boolean;
}
