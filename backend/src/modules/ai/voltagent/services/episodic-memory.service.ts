import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PendingActionStatus } from './hitl.service';

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
     */
    async getRecentLessons(
        tenantId: string,
        userId: string,
        agentName?: string,
        limit: number = 5,
    ): Promise<AgentLesson[]> {
        try {
            const whereClause: any = {
                tenantId,
                userId,
                status: PendingActionStatus.REJECTED,
                rejectionReason: {
                    not: null,
                },
            };

            if (agentName) {
                whereClause.agentName = agentName;
            }

            const rejections = await this.prisma.agentPendingAction.findMany({
                where: whereClause,
                orderBy: {
                    rejectedAt: 'desc',
                },
                take: limit,
                select: {
                    actionType: true,
                    rejectionReason: true,
                    rejectedAt: true,
                },
            });

            return rejections.map((r) => ({
                actionType: r.actionType,
                rejectionReason: r.rejectionReason || '',
                timestamp: r.rejectedAt || new Date(),
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
