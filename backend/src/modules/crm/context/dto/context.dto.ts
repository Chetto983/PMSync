import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class GetCrmContextByEmailQueryDto {
  @ApiProperty({
    description: 'Contact email to resolve into CRM context',
    example: 'customer@example.com',
  })
  @IsEmail()
  email!: string;
}
