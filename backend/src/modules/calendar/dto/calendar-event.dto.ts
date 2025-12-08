import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsDateString,
  MaxLength,
  ValidateNested,
  IsEmail,
  IsInt,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Attendee DTO for calendar events
 */
export class AttendeeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

/**
 * DTO for creating a calendar event
 */
export class CreateEventDto {
  @IsUUID()
  providerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  calendarId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  calendarName?: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timeZone?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees?: AttendeeDto[];

  @IsOptional()
  reminders?: any;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recurrence?: string[];
}

/**
 * DTO for updating a calendar event
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timeZone?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees?: AttendeeDto[];

  @IsOptional()
  reminders?: any;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  calendarName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recurrence?: string[];
}

/**
 * DTO for creating a calendar
 */
export class CreateCalendarDto {
  @IsUUID()
  providerId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;
}

/**
 * DTO for updating calendar preferences
 */
export class UpdateCalendarPreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;
}

/**
 * Query params for listing events
 */
export class ListEventsQueryDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  calendarId?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number;
}
