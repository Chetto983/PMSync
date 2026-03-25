# Telegram Bot — Architecture

## Overview

PMSync Telegram bot uses raw Telegram Bot API (no framework). The bot is a webhook-based service that receives updates at `POST /api/v1/telegram/webhook` and responds synchronously.

## Components

```
                    Telegram Cloud
                         |
                    POST /webhook
                         |
              TelegramWebhookController
              (public, secret-token validated, rate-limited 60 req/min)
                         |
              TelegramWebhookService
                    /          \
            /start {token}    Plain text
            QR code link      Chat relay
                 |                |
           Redis lookup      AiChatService
           Upsert settings   .generateChat()
                              (non-streaming)
                                  |
                           ToolLoopAgent
                           (MiniMax M2.7)
                              /    \
                         No HITL   HITL needed
                           |           |
                      Send text    [Sprint 01]
                      to user      Send inline keyboard
                                   Store in Redis
                                   Wait for callback
                                        |
                                   callback_query
                                   approve:{id}
                                        |
                                   resolveApproval()
                                   Execute tool
                                   Edit message
```

## Key Constraints

1. **No streaming** — Telegram doesn't support SSE. We use `generateChat` (AI SDK `generateText` under the hood).

2. **60s webhook timeout** — Telegram expects a response within ~60s. We use `AbortSignal.timeout(60_000)` on the AI call. If the model is slow, we risk timeout.

3. **Single conversation per user** — Each Telegram user has one persistent `AiConversation` stored in `TelegramSettings.aiConversationId`. Use `/clear` to reset.

4. **No tenant context** — The webhook endpoint is `@Public()`. Tenant/user is resolved from `TelegramSettings` by `telegramChatId`. All DB queries use `withoutTenantScopingAsync`.

5. **callback_data max 64 bytes** — Telegram inline button `callback_data` is limited to 64 bytes. We use `{action}:{nanoid(12)}` and store the full payload in Redis.

## Security

- Webhook validated via `x-telegram-bot-api-secret-token` header
- Tenant boundary enforced on every callback: resolve user via `chatId`, verify ownership
- Redis keys are single-use: deleted after approval/rejection
- TTL 1h on pending approvals prevents stale state

## HITL Flow (Sprint 01)

See [sprint-01-hitl.md](../sprints/sprint-01-hitl.md) for detailed implementation plan.

### Before (broken)
```
User: "Send email to Marco"
Bot: [AI silently fails, returns generic text without sending]
```

### After (Sprint 01)
```
User: "Send email to Marco"
Bot: "L'AI vorrebbe eseguire:
      reply_email
      A: marco@example.com
      Corpo: Va bene

      [Approva]  [Rifiuta]"

User: [clicks Approva]
Bot: "Email inviata a marco@example.com"
```

## Message Limits

- Telegram max message: 4096 chars
- We use 4000 as safe limit
- Long messages are split at newline boundaries via `splitMessage()`
- Markdown v1 parse mode (safe for most AI output)
