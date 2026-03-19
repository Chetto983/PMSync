import { ConfigService } from '@nestjs/config';
import { IntentClassifierService } from './intent-classifier.service';

describe('IntentClassifierService (regex fallback)', () => {
  let service: IntentClassifierService;

  beforeAll(async () => {
    const configMock = {
      get: jest.fn().mockReturnValue('/nonexistent/model.bin'),
    } as unknown as ConfigService;

    service = new IntentClassifierService(configMock);
    await service.onModuleInit();
    expect(service.isModelLoaded()).toBe(false);
  });

  it('classifies "Mostrami le email non lette di oggi" as email_search', async () => {
    const result = await service.classify(
      'Mostrami le email non lette di oggi',
    );

    expect(result.intent).toBe('email_search');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.lang).toBe('it');
  });

  it('recognizes inflected unread phrases as status_check', async () => {
    const result = await service.classify(
      'Quante email non lette ho?',
    );

    expect(result.intent).toBe('status_check');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.lang).toBe('it');
  });
});
