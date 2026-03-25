# Telegram Integration — Roadmap su PMSync

## Panoramica

Telegram e' il canale mobile-first di PMSync: l'utente interagisce con l'AI assistant via chat Telegram, riceve reminder, e puo eseguire azioni (email, calendario, contatti) senza aprire la web UI.

- **PMSync fornisce:** AI chat engine, tool calling, HITL approval, conversation persistence, Redis, multi-tenancy
- **Telegram aggiunge:** mobile access, inline keyboards per HITL, reminder digest push, QR code linking
- **Formato:** solo developer, 3 sprint (~3-4 settimane), 2 fasi

---

## Cosa PMSync Fornisce Gia

| Capability                | Modulo PMSync                     | Status |
|---------------------------|-----------------------------------|--------|
| AI chat + tool calling    | `ai-chat`, ToolLoopAgent          | done   |
| HITL approval (web)       | `ai-chat`, AI SDK needsApproval   | done   |
| Conversation persistence  | `ai-chat/conversation.service`    | done   |
| Telegram bot service      | `telegram/telegram-bot.service`   | done   |
| Telegram webhook          | `telegram/telegram-webhook`       | done   |
| QR code linking           | `telegram/settings`, Redis token  | done   |
| Reminder digest push      | `telegram/reminder-email-monitor` | done   |
| Chat relay (text only)    | `telegram/webhook.handleChatRelay`| done   |
| Inline keyboard + callback| `telegram-bot.service`            | done   |

---

## Cosa Manca (Roadmap)

| Capability             | Sprint | SP  | Status |
|------------------------|--------|-----|--------|
| HITL approval via TG   | S01    | 15  | TODO   |
| Rich message formatting| S02    | 8   | TODO   |
| Telegram /commands      | S02    | 4   | TODO   |
| Voice message support  | S03    | 10  | FUTURE |

---

## Tech Stack

Identico a PMSync — nessuna dipendenza aggiuntiva.

- **Bot API:** Telegram Bot API via HTTPS (no framework, raw fetch in `telegram-bot.service.ts`)
- **State:** Redis via `CacheService` (pending approvals, link tokens)
- **AI:** `AiChatService.generateChat` (non-streaming per Telegram)
- **Callback routing:** `callback_data` con prefisso + nanoid, payload in Redis

---

## Struttura Directory

```
telegram/
+-- README.md                         <- questo file
+-- docs/
|   +-- 00-ARCHITECTURE.md            -- Architettura bot, webhook, HITL flow
+-- sprints/
    +-- sprint-01-hitl.md              -- HITL approval via inline keyboard
    +-- sprint-02-ux.md               -- Rich formatting, /commands
    +-- sprint-03-voice.md            -- Voice message transcription (futuro)
```

---

## Dove il Codice Telegram Vive in PMSync

| Cosa                | Path                                                    |
|---------------------|---------------------------------------------------------|
| Bot service         | `backend/src/modules/telegram/services/telegram-bot.service.ts` |
| Webhook handler     | `backend/src/modules/telegram/services/telegram-webhook.service.ts` |
| Settings controller | `backend/src/modules/telegram/controllers/telegram-settings.controller.ts` |
| Webhook controller  | `backend/src/modules/telegram/controllers/telegram-webhook.controller.ts` |
| Reminder monitor    | `backend/src/modules/telegram/services/reminder-email-monitor.service.ts` |
| Prisma schema       | `backend/prisma/schema.prisma` (`TelegramSettings`)    |
| Frontend settings   | `frontend/components/dashboard/Settings.tsx`            |
| Tool preview utils  | `backend/src/modules/telegram/utils/tool-preview.ts` (NEW) |

---

## Sprint Velocity

- **Solo dev:** 12-15 story points per sprint (1-2 settimane)
- **Sprint 01 (HITL):** 15 SP, ~1 settimana
- **Sprint 02 (UX):** 12 SP, ~1 settimana
- **Sprint 03 (Voice):** 10 SP, futuro
