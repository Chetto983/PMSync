declare module 'node-nlp' {
  export interface NlpManagerSettings {
    languages?: string[];
    forceNER?: boolean;
    nlu?: {
      useNoneFeature?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export interface NlpProcessResult {
    intent?: string;
    score?: number;
    language?: string;
    [key: string]: unknown;
  }

  export class NlpManager {
    constructor(settings?: NlpManagerSettings);
    addDocument(language: string, utterance: string, intent: string): void;
    train(): Promise<void>;
    process(language: string, utterance: string): Promise<NlpProcessResult>;
    import(data: string): void;
    export(): string;
  }
}
