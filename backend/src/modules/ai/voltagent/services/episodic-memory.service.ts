import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ActionStatus, Prisma } from '@prisma/client';

export interface AgentLesson {
    actionType: string;
    rejectionReason: string;
    timestamp: Date;
}

@Injectable()
export class EpisodicMemoryService {
    private readonly logger = new Logger(EpisodicMemoryService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Retrieve recent lessons (rejections) for a specific agent.
     * "Episodic Learning" - remembering past mistakes.
     * Uses ActionQueue model (AI refactor v2.0).
     */
    async getRecentLessons(
        tenantId: string,
        userId: string,
        agentName?: string,
        limit: number = 5,
    ): Promise<AgentLesson[]> {
        try {
            const whereClause: Prisma.ActionQueueWhereInput = {
                tenantId,
                userId,
                status: ActionStatus.REJECTED,
                rejectedReason: {
                    not: null,
                },
            };

            // Filter by agentName stored in actionPayload JSON
            if (agentName) {
                whereClause.actionPayload = {
                    path: ['agentName'],
                    equals: agentName,
                };
            }

            const rejections = await this.prisma.actionQueue.findMany({
                where: whereClause,
                orderBy: {
                    updatedAt: 'desc', // Use updatedAt since rejectedAt doesn't exist
                },
                take: limit,
                select: {
                    actionType: true,
                    rejectedReason: true,
                    updatedAt: true,
                },
            });

            return rejections.map((r: { actionType: string; rejectedReason: string | null; updatedAt: Date }) => ({
                actionType: r.actionType,
                rejectionReason: r.rejectedReason || '',
                timestamp: r.updatedAt,
            }));
        } catch (error) {
            this.logger.warn(`Failed to fetch episodic memory: ${error}`);
            return [];
        }
    }

    /**
     * Format lessons into a prompt-ready string.
     */
    formatLessonsForPrompt(lessons: AgentLesson[]): string {
        if (lessons.length === 0) return '';

        const formatted = lessons.map(
            (l) => `- Action '${l.actionType}' was rejected: "${l.rejectionReason}"`
        ).join('\n');

        return `
## Learned Constraints (Do NOT Ignore)
The user has previously rejected the following actions. You MUST avoid repeating these mistakes:
${formatted}
`;
    }
}
