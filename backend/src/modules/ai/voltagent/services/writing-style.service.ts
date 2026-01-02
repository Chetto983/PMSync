/**
 * Writing Style Service for VoltAgent
 *
 * Analyzes user writing patterns for personalized email composition.
 * 2025 Best Practices: NLP-based style extraction.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { WritingStyleProfile } from '@prisma/client';

export interface WritingMetrics {
  // Structure
  avgSentenceLength: number;
  avgParagraphLines: number;
  avgWordsPerEmail: number;
  bulletListRate: number;

  // Vocabulary
  formalityScore: number;
  contractionRate: number;
  emojiRate: number;
  typeTokenRatio: number;

  // Punctuation
  exclamationRate: number;
  questionRate: number;
  ellipsisRate: number;

  // Greeting/Sign-off
  greetingPresent: boolean;
  preferredGreetings: string[];
  signOffPresent: boolean;
  preferredSignOffs: string[];

  // Tone
  sentimentPolarity: number;
  empathyPhraseRate: number;
  hedgeRate: number;
}

// Common formal words indicating formal writing
const FORMAL_MARKERS = [
  'accordingly', 'furthermore', 'nevertheless', 'consequently', 'therefore',
  'regarding', 'pursuant', 'herein', 'hereby', 'sincerely', 'respectfully',
  'kindly', 'please', 'appreciate', 'gratitude', 'acknowledge',
];

// Common casual markers
const CASUAL_MARKERS = [
  'hey', 'hi', 'yeah', 'sure', 'cool', 'awesome', 'great', 'thanks',
  'gonna', 'wanna', 'gotta', "what's", "that's", "i'm", "we're", "you're",
  'btw', 'fyi', 'asap', 'lol', 'haha', '!',
];

// Contractions list
const CONTRACTIONS = [
  "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll", "you'd",
  "he's", "she's", "it's", "we're", "we've", "we'll", "we'd",
  "they're", "they've", "they'll", "they'd", "that's", "what's",
  "who's", "where's", "there's", "here's", "let's", "can't", "won't",
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't",
  "hasn't", "haven't", "hadn't", "shouldn't", "wouldn't", "couldn't",
  "mustn't", "needn't", "shan't",
];

// Empathy phrases
const EMPATHY_PHRASES = [
  'i understand', 'i appreciate', 'thank you for', 'i can see',
  'that must be', 'i hear you', 'i recognize', 'happy to help',
  'i hope', 'feel free', 'no worries', 'take your time',
];

// Hedge words (uncertainty markers)
const HEDGE_WORDS = [
  'perhaps', 'maybe', 'might', 'possibly', 'probably', 'likely',
  'could', 'would', 'seems', 'appears', 'somewhat', 'fairly',
  'rather', 'sort of', 'kind of', 'i think', 'i believe', 'in my opinion',
];

// Common greetings
const GREETINGS = [
  'hi', 'hello', 'hey', 'dear', 'good morning', 'good afternoon',
  'good evening', 'greetings', 'hi there', 'hello there',
];

// Common sign-offs
const SIGN_OFFS = [
  'best', 'best regards', 'regards', 'kind regards', 'sincerely',
  'thanks', 'thank you', 'cheers', 'take care', 'warm regards',
  'yours', 'yours truly', 'respectfully', 'cordially',
];

@Injectable()
export class WritingStyleService {
  private readonly logger = new Logger(WritingStyleService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Analyze an email body and extract writing metrics.
   */
  analyzeText(text: string): WritingMetrics {
    if (!text || text.trim().length === 0) {
      return this.getDefaultMetrics();
    }

    const cleanText = this.stripHtml(text).trim();
    const words = this.getWords(cleanText);
    const sentences = this.getSentences(cleanText);
    const paragraphs = this.getParagraphs(cleanText);

    // Structure metrics
    const avgSentenceLength = sentences.length > 0
      ? words.length / sentences.length
      : 0;
    const avgParagraphLines = paragraphs.length > 0
      ? sentences.length / paragraphs.length
      : 0;
    const avgWordsPerEmail = words.length;
    const bulletListRate = this.calculateBulletRate(cleanText);

    // Vocabulary metrics
    const formalityScore = this.calculateFormalityScore(cleanText, words);
    const contractionRate = this.calculateContractionRate(words);
    const emojiRate = this.calculateEmojiRate(cleanText, words.length);
    const typeTokenRatio = this.calculateTypeTokenRatio(words);

    // Punctuation metrics
    const exclamationRate = this.calculatePunctuationRate(sentences, '!');
    const questionRate = this.calculatePunctuationRate(sentences, '?');
    const ellipsisRate = this.calculateEllipsisRate(cleanText, sentences.length);

    // Greeting/Sign-off detection
    const greetingInfo = this.detectGreeting(cleanText);
    const signOffInfo = this.detectSignOff(cleanText);

    // Tone metrics
    const sentimentPolarity = this.calculateSimpleSentiment(cleanText);
    const empathyPhraseRate = this.calculatePhraseRate(cleanText, EMPATHY_PHRASES, sentences.length);
    const hedgeRate = this.calculatePhraseRate(cleanText, HEDGE_WORDS, sentences.length);

    return {
      avgSentenceLength,
      avgParagraphLines,
      avgWordsPerEmail,
      bulletListRate,
      formalityScore,
      contractionRate,
      emojiRate,
      typeTokenRatio,
      exclamationRate,
      questionRate,
      ellipsisRate,
      greetingPresent: greetingInfo.present,
      preferredGreetings: greetingInfo.detected,
      signOffPresent: signOffInfo.present,
      preferredSignOffs: signOffInfo.detected,
      sentimentPolarity,
      empathyPhraseRate,
      hedgeRate,
    };
  }

  /**
   * Analyze a user's sent emails and update their writing style profile.
   */
  async analyzeUserEmails(
    tenantId: string,
    userId: string,
    limit: number = 50,
  ): Promise<WritingStyleProfile> {
    // Get the user's sent emails
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        folder: 'SENT',
        bodyText: { not: null },
      },
      select: {
        id: true,
        bodyText: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    if (emails.length === 0) {
      this.logger.debug(`No sent emails found for user ${userId}`);
      return this.getOrCreateProfile(tenantId, userId);
    }

    // Analyze each email
    const metricsArray: WritingMetrics[] = [];
    for (const email of emails) {
      if (email.bodyText && email.bodyText.length > 20) {
        metricsArray.push(this.analyzeText(email.bodyText));
      }
    }

    if (metricsArray.length === 0) {
      return this.getOrCreateProfile(tenantId, userId);
    }

    // Average the metrics
    const avgMetrics = this.averageMetrics(metricsArray);

    // Collect greetings and sign-offs
    const allGreetings: string[] = [];
    const allSignOffs: string[] = [];
    for (const m of metricsArray) {
      allGreetings.push(...m.preferredGreetings);
      allSignOffs.push(...m.preferredSignOffs);
    }

    // Get top 3 most frequent greetings and sign-offs
    const topGreetings = this.getTopItems(allGreetings, 3);
    const topSignOffs = this.getTopItems(allSignOffs, 3);

    // Update or create the profile
    const profile = await this.prisma.writingStyleProfile.upsert({
      where: {
        tenantId_userId: { tenantId, userId },
      },
      create: {
        tenantId,
        userId,
        ...avgMetrics,
        preferredGreetings: topGreetings,
        preferredSignOffs: topSignOffs,
        sampleCount: metricsArray.length,
        lastAnalyzedEmailId: emails[0]?.id,
        lastAnalyzed: new Date(),
      },
      update: {
        ...avgMetrics,
        preferredGreetings: topGreetings,
        preferredSignOffs: topSignOffs,
        sampleCount: metricsArray.length,
        lastAnalyzedEmailId: emails[0]?.id,
        lastAnalyzed: new Date(),
      },
    });

    this.logger.log(
      `Updated writing style profile for user ${userId} (${metricsArray.length} samples)`,
    );

    return profile;
  }

  /**
   * Learn from a single email (incremental update)
   * Uses moving average to update stats without re-reading all history.
   */
  async learnFromEmail(
    tenantId: string,
    userId: string,
    emailBody: string,
  ): Promise<void> {
    if (!emailBody || emailBody.length < 50) {
      return; // Skip short emails
    }

    try {
      const metrics = this.analyzeText(emailBody);
      const profile = await this.getOrCreateProfile(tenantId, userId);

      const n = profile.sampleCount;
      const newN = n + 1;

      // Moving average formula: NewAvg = ((OldAvg * n) + NewVal) / (n + 1)
      const updateAvg = (oldVal: number, newVal: number) => ((oldVal * n) + newVal) / newN;

      // Update basic metrics
      const newMetrics: Partial<WritingMetrics> = {
        avgSentenceLength: updateAvg(profile.avgSentenceLength, metrics.avgSentenceLength),
        avgParagraphLines: updateAvg(profile.avgParagraphLines, metrics.avgParagraphLines),
        avgWordsPerEmail: Math.round(updateAvg(profile.avgWordsPerEmail, metrics.avgWordsPerEmail)),
        bulletListRate: updateAvg(profile.bulletListRate, metrics.bulletListRate),
        formalityScore: updateAvg(profile.formalityScore, metrics.formalityScore),
        contractionRate: updateAvg(profile.contractionRate, metrics.contractionRate),
        emojiRate: updateAvg(profile.emojiRate, metrics.emojiRate),
        typeTokenRatio: updateAvg(profile.typeTokenRatio, metrics.typeTokenRatio),
        exclamationRate: updateAvg(profile.exclamationRate, metrics.exclamationRate),
        questionRate: updateAvg(profile.questionRate, metrics.questionRate),
        ellipsisRate: updateAvg(profile.ellipsisRate, metrics.ellipsisRate),
        sentimentPolarity: updateAvg(profile.sentimentPolarity, metrics.sentimentPolarity),
        empathyPhraseRate: updateAvg(profile.empathyPhraseRate, metrics.empathyPhraseRate),
        hedgeRate: updateAvg(profile.hedgeRate, metrics.hedgeRate),
        // Booleans can be approximated as probabilities if stored as numbers, but here we just keep them if frequent enough
        // Ideally we should track "greetingRate" instead of boolean. For now, let's keep boolean logic simple:
        // If current is true, stay true. If false, become true if new email has it? No, that's flip-floppy.
        // Let's rely on the lists logic below for greetings/signoffs mainly.
      };

      // Update Lists (Greetings/SignOffs) - Naive merge (keep top N most frequent)
      // Since we don't store full frequency map in DB, we just merge simply.
      // A better approach requires schema change to store frequency map. 
      // For now: Add detected ones to the list, if list grows too big, we can't easily trim by frequency without history.
      // COMPROMISE: We just append unique new ones to the top 10 unique list to accumulate variety.
      const uniqueGreetings = Array.from(new Set([...profile.preferredGreetings, ...metrics.preferredGreetings])).slice(0, 10);
      const uniqueSignOffs = Array.from(new Set([...profile.preferredSignOffs, ...metrics.preferredSignOffs])).slice(0, 10);

      await this.prisma.writingStyleProfile.update({
        where: { id: profile.id },
        data: {
          ...newMetrics,
          preferredGreetings: uniqueGreetings,
          preferredSignOffs: uniqueSignOffs,
          sampleCount: { increment: 1 },
          lastAnalyzed: new Date(),
          greetingPresent: uniqueGreetings.length > 0, // Simplified
          signOffPresent: uniqueSignOffs.length > 0, // Simplified
        },
      });

    } catch (error) {
      this.logger.warn(`Failed to learn from email for user ${userId}: ${(error as Error).message}`);
    }
  }

  /**
   * Get or create a user's writing style profile.
   */
  async getOrCreateProfile(tenantId: string, userId: string): Promise<WritingStyleProfile> {
    let profile = await this.prisma.writingStyleProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!profile) {
      profile = await this.prisma.writingStyleProfile.create({
        data: { tenantId, userId },
      });

      // Auto-backfill on creation
      this.logger.log(`New writing style profile created for ${userId}. Triggering auto-backfill...`);
      // We await this to ensure the user sees data immediately, 
      // as 50 emails analysis is sub-second usually.
      try {
        profile = await this.analyzeUserEmails(tenantId, userId, 50);
      } catch (e) {
        this.logger.error(`Auto-backfill failed: ${(e as Error).message}`);
      }
    } else if (profile.sampleCount === 0) {
      // Profile exists but empty? Try to backfill again.
      this.logger.log(`Existing empty writing style profile for ${userId}. Retrying backfill...`);
      try {
        profile = await this.analyzeUserEmails(tenantId, userId, 50);
      } catch (e) {
        this.logger.error(`Auto-backfill failed: ${(e as Error).message}`);
      }
    }

    return profile;
  }

  /**
   * Get the user's writing style profile.
   */
  async getProfile(tenantId: string, userId: string): Promise<WritingStyleProfile | null> {
    return this.prisma.writingStyleProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
  }

  /**
   * Generate a prompt section describing the user's writing style.
   * This can be injected into email composition prompts.
   */
  async getStylePromptSection(
    tenantId: string,
    userId: string,
    locale: 'en' | 'it' = 'en',
  ): Promise<string | null> {
    const profile = await this.getProfile(tenantId, userId);
    if (!profile || profile.sampleCount < 5) {
      return null; // Not enough data
    }

    const styleDescriptions: string[] = [];
    const isIt = locale === 'it';

    // Formality
    if (profile.formalityScore > 0.7) {
      styleDescriptions.push(isIt ? 'tono formale e professionale' : 'formal and professional tone');
    } else if (profile.formalityScore < 0.3) {
      styleDescriptions.push(isIt ? 'tono casuale e amichevole' : 'casual and friendly tone');
    } else {
      styleDescriptions.push(isIt ? 'tono professionale equilibrato' : 'balanced professional tone');
    }

    // Sentence length
    if (profile.avgSentenceLength > 20) {
      styleDescriptions.push(isIt ? 'frasi più lunghe e dettagliate' : 'longer, more detailed sentences');
    } else if (profile.avgSentenceLength < 12) {
      styleDescriptions.push(isIt ? 'frasi brevi e concise' : 'short, concise sentences');
    }

    // Contractions
    if (profile.contractionRate > 0.3) {
      styleDescriptions.push(
        isIt ? 'usa contrazioni (es. l\'ho, c\'è, dov\'è)' : "uses contractions (e.g., I'm, we're, don't)",
      );
    } else if (profile.contractionRate < 0.1) {
      styleDescriptions.push(isIt ? 'evita le contrazioni' : 'avoids contractions');
    }

    // Greetings
    if (profile.greetingPresent && profile.preferredGreetings.length > 0) {
      const greeting = profile.preferredGreetings[0];
      styleDescriptions.push(
        isIt ? `tipicamente inizia con "${greeting}"` : `typically starts with "${greeting}"`,
      );
    }

    // Sign-offs
    if (profile.signOffPresent && profile.preferredSignOffs.length > 0) {
      const signOff = profile.preferredSignOffs[0];
      styleDescriptions.push(
        isIt ? `tipicamente termina con "${signOff}"` : `typically ends with "${signOff}"`,
      );
    }

    // Emoji usage
    if (profile.emojiRate > 0.05) {
      styleDescriptions.push(isIt ? 'usa occasionalmente emoji' : 'occasionally uses emoji');
    }

    if (styleDescriptions.length === 0) {
      return null;
    }

    const header = isIt ? 'Imita lo stile di scrittura dell\'utente:' : 'Mirror the user\'s writing style:';
    const avgLabel = isIt ? 'Lunghezza media email' : 'Average email length';

    return `<writing_style>
${header}
- ${styleDescriptions.join('\n- ')}
- ${avgLabel}: ~${profile.avgWordsPerEmail} words
</writing_style>`;
  }

  // ========== PRIVATE HELPER METHODS ==========

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getWords(text: string): string[] {
    return text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  }

  private getSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  }

  private getParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  }

  private calculateBulletRate(text: string): number {
    const bulletMatches = text.match(/^[\s]*[-•*]\s/gm) || [];
    const totalLines = text.split('\n').filter((l) => l.trim().length > 0).length;
    return totalLines > 0 ? bulletMatches.length / totalLines : 0;
  }

  private calculateFormalityScore(text: string, _words: string[]): number {
    const lowerText = text.toLowerCase();
    let formalCount = 0;
    let casualCount = 0;

    for (const marker of FORMAL_MARKERS) {
      if (lowerText.includes(marker)) formalCount++;
    }

    for (const marker of CASUAL_MARKERS) {
      if (lowerText.includes(marker)) casualCount++;
    }

    const total = formalCount + casualCount;
    if (total === 0) return 0.5;
    return formalCount / total;
  }

  private calculateContractionRate(words: string[]): number {
    if (words.length === 0) return 0;
    let count = 0;
    for (const word of words) {
      if (CONTRACTIONS.includes(word.toLowerCase())) {
        count++;
      }
    }
    return count / words.length;
  }

  private calculateEmojiRate(text: string, wordCount: number): number {
    if (wordCount === 0) return 0;
    // Simple emoji regex - catches common emoji
    const emojiMatches = text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
    return emojiMatches.length / wordCount;
  }

  private calculateTypeTokenRatio(words: string[]): number {
    if (words.length === 0) return 0;
    const uniqueWords = new Set(words);
    return uniqueWords.size / words.length;
  }

  private calculatePunctuationRate(sentences: string[], punct: string): number {
    if (sentences.length === 0) return 0;
    let count = 0;
    for (const s of sentences) {
      if (s.includes(punct)) count++;
    }
    return count / sentences.length;
  }

  private calculateEllipsisRate(text: string, sentenceCount: number): number {
    if (sentenceCount === 0) return 0;
    const matches = text.match(/\.{3}/g) || [];
    return matches.length / sentenceCount;
  }

  private detectGreeting(text: string): { present: boolean; detected: string[] } {
    const firstLines = text.split('\n').slice(0, 3).join(' ').toLowerCase();
    const detected: string[] = [];

    for (const greeting of GREETINGS) {
      if (firstLines.includes(greeting)) {
        detected.push(greeting);
      }
    }

    return { present: detected.length > 0, detected };
  }

  private detectSignOff(text: string): { present: boolean; detected: string[] } {
    const lastLines = text.split('\n').slice(-5).join(' ').toLowerCase();
    const detected: string[] = [];

    for (const signOff of SIGN_OFFS) {
      if (lastLines.includes(signOff)) {
        detected.push(signOff);
      }
    }

    return { present: detected.length > 0, detected };
  }

  private calculateSimpleSentiment(text: string): number {
    const positiveWords = ['thanks', 'thank', 'great', 'good', 'excellent', 'appreciate', 'happy', 'glad', 'wonderful', 'fantastic', 'love', 'pleased'];
    const negativeWords = ['sorry', 'apologize', 'unfortunately', 'problem', 'issue', 'concern', 'difficult', 'bad', 'wrong', 'fail'];

    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) positiveCount++;
    }
    for (const word of negativeWords) {
      if (lowerText.includes(word)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;
    return (positiveCount - negativeCount) / total;
  }

  private calculatePhraseRate(text: string, phrases: string[], sentenceCount: number): number {
    if (sentenceCount === 0) return 0;
    const lowerText = text.toLowerCase();
    let count = 0;

    for (const phrase of phrases) {
      const matches = lowerText.match(new RegExp(phrase, 'g'));
      if (matches) count += matches.length;
    }

    return count / sentenceCount;
  }

  private getDefaultMetrics(): WritingMetrics {
    return {
      avgSentenceLength: 15,
      avgParagraphLines: 3,
      avgWordsPerEmail: 100,
      bulletListRate: 0,
      formalityScore: 0.5,
      contractionRate: 0.3,
      emojiRate: 0,
      typeTokenRatio: 0.5,
      exclamationRate: 0,
      questionRate: 0,
      ellipsisRate: 0,
      greetingPresent: true,
      preferredGreetings: [],
      signOffPresent: true,
      preferredSignOffs: [],
      sentimentPolarity: 0,
      empathyPhraseRate: 0,
      hedgeRate: 0,
    };
  }

  private averageMetrics(metricsArray: WritingMetrics[]): Partial<WritingMetrics> {
    if (metricsArray.length === 0) return this.getDefaultMetrics();

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => sum(arr) / arr.length;

    return {
      avgSentenceLength: avg(metricsArray.map((m) => m.avgSentenceLength)),
      avgParagraphLines: avg(metricsArray.map((m) => m.avgParagraphLines)),
      avgWordsPerEmail: Math.round(avg(metricsArray.map((m) => m.avgWordsPerEmail))),
      bulletListRate: avg(metricsArray.map((m) => m.bulletListRate)),
      formalityScore: avg(metricsArray.map((m) => m.formalityScore)),
      contractionRate: avg(metricsArray.map((m) => m.contractionRate)),
      emojiRate: avg(metricsArray.map((m) => m.emojiRate)),
      typeTokenRatio: avg(metricsArray.map((m) => m.typeTokenRatio)),
      exclamationRate: avg(metricsArray.map((m) => m.exclamationRate)),
      questionRate: avg(metricsArray.map((m) => m.questionRate)),
      ellipsisRate: avg(metricsArray.map((m) => m.ellipsisRate)),
      greetingPresent: metricsArray.filter((m) => m.greetingPresent).length > metricsArray.length / 2,
      signOffPresent: metricsArray.filter((m) => m.signOffPresent).length > metricsArray.length / 2,
      sentimentPolarity: avg(metricsArray.map((m) => m.sentimentPolarity)),
      empathyPhraseRate: avg(metricsArray.map((m) => m.empathyPhraseRate)),
      hedgeRate: avg(metricsArray.map((m) => m.hedgeRate)),
    };
  }

  private getTopItems(items: string[], count: number): string[] {
    const frequency: Record<string, number> = {};
    for (const item of items) {
      frequency[item] = (frequency[item] || 0) + 1;
    }

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([item]) => item);
  }
}
