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
  IsIn,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Reminder override DTO for calendar events
 * Supports Google Calendar and Microsoft Graph reminder formats
 */
export class ReminderOverrideDto {
  @IsString()
  @IsIn(['email', 'popup', 'sms'])
  method!: 'email' | 'popup' | 'sms';

  @IsInt()
  @Min(0)
  @Max(40320) // Max 4 weeks in minutes
  minutes!: number;
}

/**
 * Reminders DTO for calendar events
 * Compatible with Google Calendar API format
 */
export class RemindersDto {
  @IsOptional()
  @IsBoolean()
  useDefault?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderOverrideDto)
  @ArrayMaxSize(5) // Limit number of reminders
  overrides?: ReminderOverrideDto[];
}

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
  @IsString()
  @MaxLength(50)
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
  @ValidateNested()
  @Type(() => RemindersDto)
  reminders?: RemindersDto;

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
  @ValidateNested()
  @Type(() => RemindersDto)
  reminders?: RemindersDto;

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
  @IsString()
  @MaxLength(50)
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
  @IsString()
  @MaxLength(50)
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
