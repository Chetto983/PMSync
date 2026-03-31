import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';
import { Public } from '../../../../common/auth/public.decorator';
import { PrismaService } from '../../../../prisma/prisma.service';

class SubmitCsatDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

/**
 * Public CSAT survey controller — no auth required.
 * Survey is accessed via unique token (from email link).
 */
@ApiTags('Portal - CSAT')
@Public()
@Controller('portal/survey')
export class PortalCsatController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get CSAT survey info by token' })
  @ApiResponse({ status: 200, description: 'Survey details with ticket subject' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async getSurvey(@Param('token') token: string) {
    const survey = await this.prisma.cSATSurvey.findUnique({
      where: { token },
      include: {
        ticket: { select: { subject: true } },
      },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    return {
      id: survey.id,
      ticketSubject: survey.ticket.subject,
      alreadyResponded: survey.respondedAt !== null,
      rating: survey.rating,
    };
  }

  @Post(':token')
  @ApiOperation({ summary: 'Submit CSAT survey response' })
  @ApiResponse({ status: 200, description: 'Rating submitted' })
  @ApiResponse({ status: 400, description: 'Already responded' })
  @ApiResponse({ status: 404, description: 'Survey not found' })
  async submitSurvey(
    @Param('token') token: string,
    @Body() dto: SubmitCsatDto,
  ) {
    const survey = await this.prisma.cSATSurvey.findUnique({
      where: { token },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    if (survey.respondedAt) {
      throw new BadRequestException('Survey already submitted');
    }

    await this.prisma.cSATSurvey.update({
      where: { token },
      data: {
        rating: dto.rating,
        comment: dto.comment ?? null,
        respondedAt: new Date(),
      },
    });

    return { success: true, message: 'Thank you for your feedback!' };
  }
}
