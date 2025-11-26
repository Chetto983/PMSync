import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { EmailModule } from '../../email/email.module';
import { CalendarModule } from '../../calendar/calendar.module';
import { ContactsModule } from '../../contacts/contacts.module';

// Controllers
import { MultiAgentController } from './controllers/multi-agent.controller';

// Services
import { HitlService } from './services/hitl.service';
import { FeedbackService } from './services/feedback.service';
import { MultiAgentService } from './services/multi-agent.service';
import { ActionExecutorService } from './services/action-executor.service';
import { MemoryService } from './services/memory.service';
import { AIQueueService } from './services/ai-queue.service';
import { PersonalizationService } from '../services/personalization.service';
import { MistralService } from '../services/mistral.service';
import { EmbeddingsService } from '../services/embeddings.service';

// Agents
import { RouterAgent } from './agents/router.agent';
import { GeneralAgent } from './agents/general.agent';
import { EmailAgent } from './agents/email.agent';
import { CalendarAgent } from './agents/calendar.agent';
import { ContactsAgent } from './agents/contacts.agent';
import { KnowledgeAgent } from './agents/knowledge.agent';

/**
 * MultiAgentModule provides the intelligent secretary functionality.
 * It includes:
 * - RouterAgent for intent classification
 * - Specialized agents for Email, Calendar, Contacts
 * - HITL (Human-in-the-Loop) approval workflow
 * - Feedback learning loop
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RealtimeModule,
    forwardRef(() => EmailModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => ContactsModule),
  ],
  controllers: [
    MultiAgentController,
  ],
  providers: [
    // Core services
    HitlService,
    FeedbackService,
    MultiAgentService,
    ActionExecutorService,
    MemoryService,
    AIQueueService,
    EmbeddingsService,
    MistralService,
    PersonalizationService,

    // Agents
    RouterAgent,
    GeneralAgent,
    EmailAgent,
    CalendarAgent,
    ContactsAgent,
    KnowledgeAgent,
  ],
  exports: [
    MultiAgentService,
    HitlService,
    FeedbackService,
    ActionExecutorService,
    MemoryService,
    AIQueueService,
    MistralService,
    RouterAgent,
  ],
})
export class MultiAgentModule implements OnModuleInit {
  constructor(
    private readonly multiAgentService: MultiAgentService,
    private readonly generalAgent: GeneralAgent,
    private readonly emailAgent: EmailAgent,
    private readonly calendarAgent: CalendarAgent,
    private readonly contactsAgent: ContactsAgent,
    private readonly knowledgeAgent: KnowledgeAgent,
  ) {}

  /**
   * Register all agents with the orchestrator on module initialization.
   */
  onModuleInit() {
    // Register specialized agents
    this.multiAgentService.registerAgent(this.generalAgent);
    this.multiAgentService.registerAgent(this.emailAgent);
    this.multiAgentService.registerAgent(this.calendarAgent);
    this.multiAgentService.registerAgent(this.contactsAgent);
    this.multiAgentService.registerAgent(this.knowledgeAgent);
  }
}
