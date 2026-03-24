# Sprint 03 — Autenticazione & Identity

## Fase: Phase 1 — Stabilization & Foundation
## Date: M2-W1 → M2-W2
## Sprint Goal / Obiettivo Sprint

Servizio di autenticazione completo e production-ready: registrazione utente con verifica email, login con JWT access/refresh token e rotation automatica, MFA tramite TOTP (Google Authenticator / Authy), gestione sessioni con limiti concorrenza, policy password conformi NIST SP 800-63B, account lockout progressivo. Frontend: pagine login, registrazione e setup MFA.

## Capacità Team: 85 SP

| Ruolo | Persone | Disponibilità |
|-------|---------|---------------|
| Backend | 4 | 100% |
| Frontend | 2 | 100% |
| Security | 1 | 100% |
| QA | 2 | 50% (sprint ramp-up) |

---

## Sprint Backlog

### EP-02 — Autenticazione, Autorizzazione & Multi-Tenancy

- [ ] T-0301 — Endpoint POST `/auth/register`: validazione input (Zod), creazione utente con password hash (Argon2id) — 5 SP — Backend — 📋 TODO
- [ ] T-0302 — Servizio email verification: generazione token sicuro (crypto.randomBytes), invio email con link di conferma, scadenza 24h — 5 SP — Backend — 📋 TODO
- [ ] T-0303 — Endpoint GET `/auth/verify-email/:token`: validazione token, attivazione account, invalidazione token usato — 3 SP — Backend — 📋 TODO
- [ ] T-0304 — Endpoint POST `/auth/login`: verifica credenziali, generazione JWT access token (15min) e refresh token (7d) — 5 SP — Backend — 📋 TODO
- [ ] T-0305 — Servizio JWT: generazione RS256 con key rotation, validazione, blacklist su Redis per token revocati — 8 SP — Backend — 📋 TODO
- [ ] T-0306 — Endpoint POST `/auth/refresh`: refresh token rotation (single-use), rilevamento reuse per invalidare famiglia token — 5 SP — Backend — 📋 TODO
- [ ] T-0307 — Endpoint POST `/auth/logout`: invalidazione access + refresh token, pulizia sessione — 2 SP — Backend — 📋 TODO
- [ ] T-0308 — Servizio MFA TOTP: generazione secret, QR code per setup, verifica codice con finestra temporale ±1 — 5 SP — Backend — 📋 TODO
- [ ] T-0309 — Endpoint POST `/auth/mfa/setup`: avvio configurazione MFA, ritorno QR code e backup codes (10 codici monouso) — 3 SP — Backend — 📋 TODO
- [ ] T-0310 — Endpoint POST `/auth/mfa/verify`: verifica codice TOTP durante login, fallback su backup codes — 3 SP — Backend — 📋 TODO
- [ ] T-0311 — Endpoint POST `/auth/password/forgot`: generazione token reset, invio email, scadenza 1h, rate limit 3/ora — 3 SP — Backend — 📋 TODO
- [ ] T-0312 — Endpoint POST `/auth/password/reset`: validazione token, aggiornamento password, invalidazione sessioni attive — 3 SP — Backend — 📋 TODO
- [ ] T-0313 — Servizio gestione sessioni: tracciamento sessioni attive per utente, limite massimo 5 sessioni concorrenti — 5 SP — Backend — 📋 TODO
- [ ] T-0314 — Account lockout progressivo: 5 tentativi falliti → lock 15min, 10 → lock 1h, 20 → lock 24h con notifica email — 3 SP — Backend — 📋 TODO
- [ ] T-0315 — Password policy NIST SP 800-63B: minimo 12 caratteri, check against breached passwords (HaveIBeenPwned API), no regole composizione arbitrarie — 3 SP — Security — 📋 TODO
- [ ] T-0316 — Auth guard middleware NestJS: estrazione JWT da header/cookie, validazione, inject user context nel request — 3 SP — Backend — 📋 TODO
- [ ] T-0317 — Rate limiting su endpoint auth: login 10/min, register 5/min, password reset 3/h (Redis sliding window) — 3 SP — Backend — 📋 TODO
- [ ] T-0318 — Security headers middleware: HSTS, X-Content-Type-Options, X-Frame-Options, CSP base, Referrer-Policy — 2 SP — Security — 📋 TODO
- [ ] T-0319 — Pagina frontend Login: form email/password, gestione errori, redirect post-login, step MFA condizionale — 5 SP — Frontend — 📋 TODO
- [ ] T-0320 — Pagina frontend Registrazione: form multi-step (dati personali → verifica email), validazione client-side — 5 SP — Frontend — 📋 TODO
- [ ] T-0321 — Pagina frontend MFA Setup: scansione QR code, input codice verifica, visualizzazione backup codes — 3 SP — Frontend — 📋 TODO
- [ ] T-0322 — Test di integrazione auth: flusso completo register → verify → login → refresh → logout — 3 SP — QA — 📋 TODO
- [ ] T-0323 — Test di integrazione MFA: setup → login con TOTP → login con backup code → disabilitazione MFA — 2 SP — QA — 📋 TODO

---

**Totale Story Points: 85 SP**

---

## Dipendenze Esterne

- PostgreSQL con schema v1 e tabella `users` (output Sprint 02)
- Redis Cluster per sessioni, rate limiting e token blacklist (output Sprint 02)
- Servizio email SMTP/API per invio email di verifica e reset (SendGrid o SES)
- HaveIBeenPwned API per password breach check (richiede API key k-anonymity)

## Rischi Sprint

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | Refresh token rotation causa logout imprevisti su connessioni lente (race condition) | Alta | Alto | Implementare grace period di 30 secondi per vecchio refresh token dopo rotation |
| 2 | HaveIBeenPwned API non disponibile blocca registrazione utenti | Media | Alto | Fallback: accettare password se API non risponde entro 2s, loggare warning |
| 3 | Rate limiting troppo aggressivo blocca utenti legittimi durante demo | Media | Medio | Configurare limiti come variabili ambiente, rate limit più permissivo in dev/staging |
| 4 | QA team al 50% non riesce a completare test di integrazione | Alta | Medio | Backend developers scrivono test di integrazione base, QA li estende nello sprint successivo |

## Definition of Done Sprint

- [ ] Flusso completo registrazione → verifica email → login → refresh → logout funzionante end-to-end
- [ ] MFA TOTP configurabile e verificabile, backup codes funzionanti
- [ ] Password reset via email funzionante con token monouso
- [ ] Account lockout scatta dopo 5 tentativi falliti e si sblocca automaticamente
- [ ] Rate limiting attivo su tutti gli endpoint auth, verificato con test di carico
- [ ] Security headers presenti su tutte le risposte HTTP (verificato con securityheaders.com)
- [ ] Pagine frontend login, registrazione e MFA setup funzionanti e responsive
- [ ] Test di integrazione auth e MFA passano in CI/CD pipeline
- [ ] Nessun secret hardcoded nel codice (verificato con scan Trivy/Gitleaks)

## Deliverable Attesi

1. **Auth service completo** — Register, login, logout, refresh con JWT RS256
2. **MFA TOTP** — Setup, verifica, backup codes, disabilitazione
3. **Password management** — Reset flow, policy NIST, breach check
4. **Session management** — Tracciamento, limiti concorrenza, lockout
5. **Frontend auth pages** — Login, registrazione, MFA setup
6. **Security hardening** — Rate limiting, security headers, auth guard middleware

## Demo/Review Notes

**Data Review:** Fine M2-W2
**Partecipanti:** Product Owner, Tech Lead, Security Lead, Team Backend, Team Frontend

### Checklist Demo
- [ ] Demo registrazione nuovo utente con verifica email (mostrare email ricevuta)
- [ ] Demo login con credenziali corrette e redirect alla dashboard
- [ ] Demo login con credenziali errate: mostrare lockout progressivo
- [ ] Demo setup MFA: scansione QR con Google Authenticator, verifica codice
- [ ] Demo login con MFA: inserimento codice TOTP dopo credenziali
- [ ] Demo password reset: richiesta, email, nuovo password, login
- [ ] Demo rate limiting: mostrare risposta 429 dopo troppi tentativi
- [ ] Mostrare report security headers su securityheaders.com

### Feedback Raccolto
_(da compilare durante la review)_

### Action Items Post-Review
_(da compilare durante la review)_
