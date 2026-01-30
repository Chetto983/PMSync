declare module 'fasttext' {
  export class Classifier {
    constructor();
    train(
      method: 'supervised' | 'skipgram' | 'cbow',
      options: {
        input: string;
        output: string;
        epoch?: number;
        lr?: number;
        lrUpdateRate?: number;
        wordNgrams?: number;
        minCount?: number;
        dim?: number;
        bucket?: number;
        loss?: 'softmax' | 'hs' | 'ns';
        thread?: number;
      },
    ): Promise<void>;
    loadModel(modelPath: string): Promise<void>;
    predict(text: string, k?: number): Promise<Array<{ label: string; value: number }>>;
    test(testPath: string, k?: number): Promise<{
      precision: number;
      recall: number;
      nexamples: number;
    }>;
  }

  export class Query {
    constructor();
    loadModel(modelPath: string): Promise<void>;
    nn(word: string, k?: number): Promise<Array<{ word: string; value: number }>>;
  }
}
