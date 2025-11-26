import { Injectable } from '@nestjs/common';
import { BaseAgent } from './base.agent';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentResult, KnowledgeHitSummary } from '../interfaces/agent-result.interface';
import { KnowledgeBaseService } from '../../services/knowledge-base.service';

/**
 * KnowledgeAgent handles knowledge base queries (RAG results).
 * It fetches semantically similar items and returns a concise list.
 */
@Injectable()
export class KnowledgeAgent extends BaseAgent {
  readonly name = 'KnowledgeAgent';
  readonly description = 'Handles knowledge base search queries (RAG results)';
  readonly supportedIntents = [AgentIntent.KNOWLEDGE];

  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {
    super();
  }

  // Localized messages for knowledge base responses
  private readonly KNOWLEDGE_MESSAGES: Record<string, { noResults: string; found: string; source: string }> = {
    en: {
      noResults: 'No relevant results found in the knowledge base. Can you provide more details?',
      found: 'I found these references in the knowledge base:',
      source: 'Source',
    },
    it: {
      noResults: 'Non ho trovato risultati pertinenti nel knowledge base. Puoi fornire più dettagli?',
      found: 'Ho trovato questi riferimenti nel knowledge base:',
      source: 'Fonte',
    },
    es: {
      noResults: 'No encontré resultados relevantes en la base de conocimientos. ¿Puedes dar más detalles?',
      found: 'Encontré estas referencias en la base de conocimientos:',
      source: 'Fuente',
    },
    fr: {
      noResults: 'Aucun résultat pertinent trouvé dans la base de connaissances. Pouvez-vous fournir plus de détails?',
      found: "J'ai trouvé ces références dans la base de connaissances:",
      source: 'Source',
    },
    de: {
      noResults: 'Keine relevanten Ergebnisse in der Wissensdatenbank gefunden. Können Sie mehr Details angeben?',
      found: 'Ich habe diese Referenzen in der Wissensdatenbank gefunden:',
      source: 'Quelle',
    },
    pt: {
      noResults: 'Nenhum resultado relevante encontrado na base de conhecimento. Pode fornecer mais detalhes?',
      found: 'Encontrei estas referências na base de conhecimento:',
      source: 'Fonte',
    },
  };

  private getKnowledgeMessage(key: 'noResults' | 'found' | 'source', language: string): string {
    const lang = language.split('-')[0].toLowerCase();
    return this.KNOWLEDGE_MESSAGES[lang]?.[key] || this.KNOWLEDGE_MESSAGES.en[key];
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const { language } = this.getPreferences(context);

    try {
      const query = context.userMessage;
      const results = await this.knowledgeBaseService.searchKnowledgeBase({
        tenantId: context.tenantId,
        query,
        limit: 5,
      });

      if (!results.items?.length) {
        return this.createTextResponse(this.getKnowledgeMessage('noResults', language));
      }

      const knowledgeHits: KnowledgeHitSummary[] = results.items.map((item) => ({
        id: item.id,
        subject: item.subject,
        snippet: item.snippet,
        source: item.source,
        score: item.score,
        metadata: item.metadata,
      }));

      const sourceLabel = this.getKnowledgeMessage('source', language);
      const bullets = knowledgeHits.map((item, idx) => {
        const title = item.subject || `${sourceLabel} ${idx + 1}`;
        const snippet = (item.snippet || '').slice(0, 180);
        return `- ${title}: ${snippet}${snippet.length >= 180 ? '…' : ''}`;
      });

      return {
        messages: [
          this.getKnowledgeMessage('found', language),
          ...bullets,
        ],
        actions: [],
        knowledgeHits,
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.warn(`KnowledgeAgent error: ${err}`);
      const { language } = this.getPreferences(context);
      return this.createTextResponse(
        this.getLocalizedErrorMessage('general', language),
      );
    }
  }
}
