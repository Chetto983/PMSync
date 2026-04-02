import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSmartViewDto } from '../dto/create-smart-view.dto';
import { UpdateSmartViewDto } from '../dto/update-smart-view.dto';

const MAX_PINNED_VIEWS = 5;

@Injectable()
export class SmartViewService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    return this.prisma.taskSmartView.findMany({
      where: { tenantId, userId },
      orderBy: [
        { isPinned: 'desc' },
        { pinOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async create(tenantId: string, userId: string, dto: CreateSmartViewDto) {
    if (dto.isPinned) {
      await this.enforcePinLimit(tenantId, userId);
    }
    return this.prisma.taskSmartView.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        filters: dto.filters as object,
        isPinned: dto.isPinned ?? false,
      },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    viewId: string,
    dto: UpdateSmartViewDto,
  ) {
    const view = await this.findOneOrThrow(tenantId, userId, viewId);
    if (dto.isPinned === true && !view.isPinned) {
      await this.enforcePinLimit(tenantId, userId);
    }
    return this.prisma.taskSmartView.update({
      where: { id: viewId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.filters !== undefined && { filters: dto.filters as object }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
        ...(dto.pinOrder !== undefined && { pinOrder: dto.pinOrder }),
      },
    });
  }

  async remove(tenantId: string, userId: string, viewId: string) {
    await this.findOneOrThrow(tenantId, userId, viewId);
    await this.prisma.taskSmartView.delete({ where: { id: viewId } });
    return { deleted: true };
  }

  async togglePin(tenantId: string, userId: string, viewId: string) {
    const view = await this.findOneOrThrow(tenantId, userId, viewId);
    if (!view.isPinned) {
      await this.enforcePinLimit(tenantId, userId);
    }
    return this.prisma.taskSmartView.update({
      where: { id: viewId },
      data: { isPinned: !view.isPinned },
    });
  }

  private async findOneOrThrow(
    tenantId: string,
    userId: string,
    viewId: string,
  ) {
    const view = await this.prisma.taskSmartView.findFirst({
      where: { id: viewId, tenantId, userId },
    });
    if (!view) {
      throw new NotFoundException(`Smart view ${viewId} not found`);
    }
    return view;
  }

  private async enforcePinLimit(tenantId: string, userId: string) {
    const pinnedCount = await this.prisma.taskSmartView.count({
      where: { tenantId, userId, isPinned: true },
    });
    if (pinnedCount >= MAX_PINNED_VIEWS) {
      throw new BadRequestException(
        `Maximum ${MAX_PINNED_VIEWS} pinned views allowed. Unpin one to add another.`,
      );
    }
  }
}
