import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramWebhookController } from '../telegram-webhook.controller';
import { TelegramWebhookService } from '../../services/telegram-webhook.service';
import { TelegramBotService } from '../../services/telegram-bot.service';

describe('TelegramWebhookController', () => {
  let controller: TelegramWebhookController;
  let webhookService: jest.Mocked<TelegramWebhookService>;
  let botService: jest.Mocked<TelegramBotService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramWebhookController],
      providers: [
        {
          provide: TelegramWebhookService,
          useValue: {
            handleUpdate: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TelegramBotService,
          useValue: {
            getWebhookSecret: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(TelegramWebhookController);
    webhookService = module.get(TelegramWebhookService);
    botService = module.get(TelegramBotService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    const validBody = { update_id: 123, message: { text: 'hello' } };

    it('should process update and return ok when secret token is valid', async () => {
      botService.getWebhookSecret.mockReturnValue('correct-secret');

      const result = await controller.handleWebhook('correct-secret', validBody);

      expect(botService.getWebhookSecret).toHaveBeenCalled();
      expect(webhookService.handleUpdate).toHaveBeenCalledWith(validBody);
      expect(result).toEqual({ ok: true });
    });

    it('should throw UnauthorizedException when secret token is invalid', async () => {
      botService.getWebhookSecret.mockReturnValue('correct-secret');

      await expect(
        controller.handleWebhook('wrong-secret', validBody),
      ).rejects.toThrow(UnauthorizedException);

      expect(webhookService.handleUpdate).not.toHaveBeenCalled();
    });

    it('should process update without validation when no secret is configured', async () => {
      botService.getWebhookSecret.mockReturnValue(null);

      const result = await controller.handleWebhook(undefined, validBody);

      expect(webhookService.handleUpdate).toHaveBeenCalledWith(validBody);
      expect(result).toEqual({ ok: true });
    });

    it('should propagate service errors', async () => {
      botService.getWebhookSecret.mockReturnValue(null);
      webhookService.handleUpdate.mockRejectedValue(
        new Error('Processing failed'),
      );

      await expect(
        controller.handleWebhook(undefined, validBody),
      ).rejects.toThrow('Processing failed');
    });
  });
});
