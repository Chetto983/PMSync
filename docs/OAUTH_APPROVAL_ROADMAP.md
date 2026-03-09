# OAuth App Approval Roadmap - PMSync

> Domain registration, email hosting, Google & Microsoft verification

## TL;DR

| Provider | Timeline | Cost | Difficulty |
|----------|----------|------|------------|
| Microsoft Publisher Verification | 1-2 weeks | Free | Easy |
| Google Sensitive Scopes (Calendar, Contacts) | 2-4 weeks | Free | Medium |
| Google Restricted Scopes (Gmail) + CASA | 8-16 weeks | $540-$1,800 | Hard |

**Total estimated cost: $600-$2,000** (domain + email + CASA audit)

---

## Phase 0: Infrastructure Setup (Week 1)

### 0.1 Domain Registration

**Recommended: Cloudflare Registrar**
- Cost: ~$10.44/year (.com)
- At-cost pricing, no renewal markup
- Free WHOIS privacy
- Built-in DNS management

**Action items:**
- [ ] Register `pmsync.com` (or chosen domain) on Cloudflare
- [ ] Enable DNSSEC
- [ ] Enable auto-renewal

### 0.2 Email Hosting

**Recommended: Migadu**
- Cost: ~$36/year (consumption-based, ~$3/month)
- Unlimited mailboxes and domains
- Full IMAP/SMTP support
- Swiss-based (privacy credibility)

**Required mailboxes:**
- `admin@pmsync.com` - admin/verification emails
- `privacy@pmsync.com` - privacy policy contact
- `support@pmsync.com` - user support

**Action items:**
- [ ] Create Migadu account
- [ ] Add domain and configure DNS records
- [ ] Create required mailboxes

### 0.3 DNS Records

All records below on `pmsync.com` (or chosen domain):

```dns
# Domain verification (add both, they coexist)
TXT  @   google-site-verification=XXXXX       # from Google Search Console
TXT  @   MS=msXXXXXXXX                        # from Microsoft Entra ID

# Email authentication (MANDATORY - Gmail rejects non-compliant senders since 2025)
TXT  @   v=spf1 include:_spf.migadu.com ~all
TXT  selector._domainkey   v=DKIM1; k=rsa; p=<public-key>   # from Migadu
TXT  _dmarc   v=DMARC1; p=quarantine; rua=mailto:dmarc@pmsync.com; pct=100

# Upgrade DMARC to p=reject after confirming all mail flows work
```

**Action items:**
- [ ] Add Google Search Console TXT verification record
- [ ] Add Microsoft Entra ID TXT verification record
- [ ] Configure SPF record for Migadu
- [ ] Configure DKIM record from Migadu
- [ ] Configure DMARC record (start with `p=quarantine`)
- [ ] Verify email deliverability with MXToolbox

### 0.4 Website / Landing Page

**Required pages** (both Google and Microsoft check these):

| Page | URL | Purpose |
|------|-----|---------|
| Homepage | `https://pmsync.com` | App description, features (NO login wall) |
| Privacy Policy | `https://pmsync.com/privacy` | Full privacy policy (see Phase 1) |
| Terms of Service | `https://pmsync.com/terms` | Usage terms |

**Hosting options (free):**
- Cloudflare Pages (recommended - same ecosystem as registrar)
- Vercel (free tier)
- GitHub Pages

**Requirements:**
- HTTPS with valid certificate (Let's Encrypt = free)
- TLS 1.2 minimum (TLS 1.3 preferred)
- No redirect from homepage to a different domain
- Privacy policy on same root domain as app (NOT Notion/Webflow/external)
- Publicly accessible without login

**Action items:**
- [ ] Create static landing page with app description
- [ ] Deploy to Cloudflare Pages (or Vercel)
- [ ] Verify HTTPS works correctly
- [ ] Link privacy policy and ToS from homepage footer

---

## Phase 1: Privacy Policy & Terms of Service (Week 1-2)

### 1.1 Privacy Policy - Required Sections

A single privacy policy satisfies Google, Microsoft, and GDPR. Must include ALL of the following:

#### Section 1: Identity & Contact

```
Data Controller: [Your name / PMSync / business entity]
Address: [Physical or registered address]
Privacy Contact: privacy@pmsync.com
```

#### Section 2: Data Collected

Explicitly list:
- Gmail message content (headers, body, attachments)
- Google Calendar events (title, description, attendees, time)
- Google Contacts (names, emails, phone numbers)
- Microsoft Outlook mail (headers, body, attachments)
- Microsoft Calendar events
- Microsoft Contacts
- OAuth tokens (encrypted at rest)
- Account identifiers (Google/Microsoft user ID, email)
- Usage data (logins, feature usage, timestamps)
- Technical data (IP address, browser, device)

#### Section 3: Purpose & Lawful Basis

Be specific per data type:
- "Gmail data is used to display email threads in the PMSync interface"
- "Calendar data is used to show upcoming events and schedule meetings"
- "Contact data is used to auto-complete recipients and manage relationships"

GDPR lawful basis: contract performance (core service), legitimate interest (analytics)

#### Section 4: Google Limited Use Disclosure (MANDATORY)

**Must include verbatim:**

> PMSync's use and transfer of information received from Google APIs to any other app will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

**This exact clause is checked by Google reviewers. Missing it = instant rejection.**

#### Section 5: Prohibited Uses (Google requirement)

Explicitly state you do NOT:
- Sell or share data with advertising platforms or data brokers
- Use data for personalized advertising or retargeting
- Use data for credit assessment
- Allow human reading of user data (except user-consented support, legal compliance, security)

#### Section 6: Data Sharing & Third Parties

List all subprocessors:
- Cloud hosting provider (e.g., Railway, Vercel)
- Database provider (e.g., Supabase/PostgreSQL)
- Monitoring tools (e.g., Sentry)
- Email delivery (e.g., Mailgun for transactional)

State: "We do not sell your data to any third party."

#### Section 7: Data Retention & Deletion

- How long data is retained while account active
- What happens after account deletion
- Deletion timeline: "Within 30 days of request"
- How to request deletion: email to privacy@pmsync.com or in-app

#### Section 8: User Rights

- Access their data
- Delete their account and all data
- Data portability (export)
- Withdraw consent
- GDPR: restrict processing, object, lodge complaint with supervisory authority

#### Section 9: Security

- Encryption at rest (AES-256) and in transit (TLS 1.2/1.3)
- Access controls
- Breach notification process (72 hours per GDPR)

#### Section 10: Changes

- How users are notified of material changes (email)
- Continued use constitutes acceptance

**Action items:**
- [ ] Draft privacy policy with ALL sections above
- [ ] Include Google Limited Use clause verbatim
- [ ] Include subprocessor list
- [ ] Draft Terms of Service
- [ ] Publish both on `pmsync.com/privacy` and `pmsync.com/terms`
- [ ] Link from homepage footer
- [ ] Link from OAuth consent screens (Google Cloud Console + Entra ID)

---

## Phase 2: Microsoft Publisher Verification (Week 1-3)

Microsoft is faster and free. Start this on day 1.

### 2.1 Entra ID Setup

1. Go to `portal.azure.com`
2. Create Entra ID tenant (if not already done)
3. Add custom domain `pmsync.com`:
   - Entra ID > Custom domain names > Add custom domain
   - Add TXT record `MS=msXXXXXXXX` to DNS
   - Click Verify (15-60 min for DNS propagation)
4. Create work account: `admin@pmsync.com` with Global Administrator role
   - **Cannot use personal @outlook.com account for publisher verification**

### 2.2 Microsoft Partner Center Enrollment

1. Go to `partner.microsoft.com`
2. Enroll in Microsoft AI Cloud Partner Program (formerly MPN)
3. Provide legal business details
4. Wait for verification: **~5 business days**
5. Receive Partner One ID (PartnerID)
6. Cost: **Free**

### 2.3 App Registration

1. Azure Portal > App Registrations > New registration
2. Name: "PMSync"
3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
4. Redirect URI: `https://pmsync.com/api/auth/callback/microsoft` (your actual callback)
5. In Branding & properties:
   - Set publisher domain to `pmsync.com` (verified custom domain)
   - Add privacy policy URL: `https://pmsync.com/privacy`
   - Add Terms of Service URL: `https://pmsync.com/terms`

### 2.4 Publisher Verification

1. App Registration > Branding & properties
2. Click "Add Partner ID to verify publisher"
3. Enter Partner One ID (Partner Global Account ID, NOT location-specific)
4. Click "Verify and save"
5. Blue "Verified" badge appears within minutes to hours

**Critical requirement:** Email domain used in Partner Center must match publisher domain on the app.

**MFA required:** The user performing verification must be signed in with MFA.

### 2.5 Required Permissions (Delegated)

| Permission | Admin Consent? | Purpose |
|------------|---------------|---------|
| `Mail.Read` | No (user consent) | Read emails |
| `Mail.ReadWrite` | No (user consent) | Read/write/send emails |
| `Mail.Send` | No (user consent) | Send emails |
| `Calendars.ReadWrite` | No (user consent) | Calendar access |
| `Contacts.ReadWrite` | No (user consent) | Contacts access |
| `offline_access` | No | Refresh tokens |
| `openid`, `profile`, `email` | No | Sign-in |

All delegated permissions above allow user self-serve consent. No admin consent needed for individual users.

**Enterprise customers:** Their IT admin may still require tenant-wide admin consent depending on their Entra policies. Provide an admin consent URL:

```
https://login.microsoftonline.com/{tenant}/adminconsent?client_id={client_id}
```

**Action items:**
- [ ] Create/configure Entra ID tenant
- [ ] Verify custom domain in Entra ID (DNS TXT record)
- [ ] Create admin@pmsync.com work account with Global Admin role
- [ ] Enroll in Microsoft Partner Center
- [ ] Wait for Partner Center verification (~5 business days)
- [ ] Register app in Entra ID with correct settings
- [ ] Complete publisher verification with Partner One ID
- [ ] Configure delegated permissions
- [ ] Test OAuth flow with personal Microsoft account
- [ ] Test OAuth flow with work/school account
- [ ] Document admin consent URL for enterprise onboarding

---

## Phase 3: Google OAuth Verification (Week 2-16)

### 3.1 Scope Classification

PMSync needs these scopes:

| Scope | Tier | CASA Required? |
|-------|------|---------------|
| `gmail.readonly` or `gmail.modify` | **Restricted** | **Yes** |
| `gmail.send` | Sensitive | No |
| `calendar.readonly` or `calendar.events` | Sensitive | No |
| `contacts.readonly` or `contacts` | Sensitive | No |
| `userinfo.email`, `userinfo.profile` | Basic | No |

**Because Gmail read/write scopes are restricted, CASA is mandatory.** No way around this.

### 3.2 Testing Mode (Use While Waiting)

While verification is in progress, your app runs in Testing mode:
- **100 user cap** - must add each tester manually by email in Cloud Console
- **7-day token expiry** - refresh tokens die after 7 days, forcing re-auth
- **"Unverified app" warning** - scary interstitial scares non-technical users
- Viable for internal testing and small closed beta only

### 3.3 Google Cloud Console Setup

1. Go to `console.cloud.google.com`
2. Create project "PMSync"
3. Enable APIs:
   - Gmail API
   - Google Calendar API
   - People API (Contacts)
4. Configure OAuth consent screen:
   - User type: External
   - App name: "PMSync"
   - User support email: `support@pmsync.com`
   - App logo: finalize BEFORE submission (changing logo triggers re-verification)
   - App homepage: `https://pmsync.com`
   - Privacy policy: `https://pmsync.com/privacy`
   - Terms of Service: `https://pmsync.com/terms`
   - Authorized domains: `pmsync.com`
   - Developer contact: `admin@pmsync.com`
5. Add ALL scopes you will ever need (adding scopes later restarts verification):
   - `https://www.googleapis.com/auth/gmail.modify` (or `.readonly`)
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `openid`, `email`, `profile`

### 3.4 Domain Verification in Google Search Console

1. Go to `search.google.com/search-console`
2. Add property `pmsync.com`
3. Verify via DNS TXT record: `google-site-verification=XXXXX`
4. **CRITICAL:** Use the SAME Google account that owns your GCP project. Mismatch = rejection.

### 3.5 Demo Video

Record an unlisted YouTube video (5-6 minutes) showing:

1. Complete OAuth authorization flow from start to finish
2. OAuth consent screen displaying correct app name "PMSync"
3. Browser address bar clearly showing OAuth client ID during flow
4. Each requested scope justified by actual app functionality:
   - Show email list/thread view (justifies `gmail.modify`)
   - Show sending an email (justifies `gmail.send`)
   - Show calendar events (justifies `calendar.events`)
   - Show contacts list (justifies `contacts.readonly`)
5. In English

Upload as **Unlisted** (not Private - Google can't view Private).

### 3.6 Scope Justifications

Write a clear justification for each scope (one paragraph minimum):

| Scope | Justification Example |
|-------|----------------------|
| `gmail.modify` | "PMSync reads user emails to display inbox, threads, and message content. We mark emails as read when opened in our interface and support labeling/archiving." |
| `gmail.send` | "PMSync allows users to compose and send emails directly from our interface, including replies and forwards." |
| `calendar.events` | "PMSync displays upcoming calendar events on the dashboard and allows creating/editing events for scheduling." |
| `contacts.readonly` | "PMSync reads contacts to auto-complete email recipients and display contact information alongside emails." |

### 3.7 Submit for Verification

1. Set publishing status to "In production"
2. Click "Prepare for verification"
3. Fill in all scope justifications
4. Provide YouTube video link
5. Submit

Google reviews and assigns CASA tier (typically Tier 2 for SaaS with Gmail).

### 3.8 CASA Security Assessment

**What is CASA:** Cloud Application Security Assessment - a third-party security audit mandated by Google for restricted scopes.

**Tier assignment** (Google decides, you don't choose):
- **Tier 2** (most likely for PMSync): Self-run automated scans validated by approved lab
- **Tier 3** (if assigned): Full lab-conducted penetration test

**Approved assessors and pricing:**

| Assessor | Tier 2 Cost | Tier 3 Cost | Notes |
|----------|-------------|-------------|-------|
| TAC Security | $540-$1,800 | ~$4,500 | Cheapest option |
| NetSentries | $900-$1,500 | $5,500-$7,500 | Good mid-range |
| Leviathan Security | $800-$1,200 | $5,000-$8,000 | |
| Prescient Security | $1,000+ | $6,000+ | |
| NCC Group | $1,200+ | $7,000+ | Premium |
| Bishop Fox | $1,500+ | $8,000+ | Premium |
| KPMG | Contact | Contact | Enterprise |
| DEKRA | Contact | Contact | Enterprise |
| Orange Cyberdefense | Contact | Contact | Enterprise |

**What gets tested (OWASP ASVS):**
- Authentication and session management
- Access control mechanisms
- Cryptography and data storage
- Input validation and injection vulnerabilities
- Error handling and logging
- API security

**Timeline:**
- Tier 2: 1-3 weeks assessment
- Tier 3: 2-4 weeks assessment
- Budget 2 months total from CASA start to receiving Letter of Assessment (LOA)

**After LOA:**
1. Submit LOA to Google
2. Final approval: 1-2 weeks

**Action items:**
- [ ] Create GCP project and enable APIs
- [ ] Configure OAuth consent screen with ALL fields
- [ ] Finalize app logo BEFORE submission
- [ ] Verify domain in Google Search Console (same account as GCP owner!)
- [ ] Add all required scopes upfront (adding later restarts verification)
- [ ] Write scope justifications
- [ ] Record demo video and upload as Unlisted to YouTube
- [ ] Submit for verification
- [ ] Contact 2-3 CASA assessors for quotes (TAC Security for budget)
- [ ] Complete CASA assessment
- [ ] Submit LOA to Google
- [ ] Await final approval

---

## Phase 4: Common Rejection Reasons & How to Avoid

### Google Rejections

| Rejection Reason | How to Avoid |
|------------------|-------------|
| Homepage is a login page | Landing page must describe app WITHOUT requiring login |
| Domain mismatch GCP vs Search Console | Use SAME Google account for both |
| Homepage URL redirects to different domain | Static URL, no redirects |
| Missing Limited Use clause in privacy policy | Include verbatim (see Phase 1) |
| Privacy policy on external domain | Host on `pmsync.com`, not Notion/Webflow |
| Logo changed after submission | Finalize logo BEFORE submitting |
| Scope added after submission | Declare ALL scopes upfront |
| Video doesn't show address bar with client ID | Re-record with address bar visible |
| Vague scope justification | Be specific: "to mark emails as read when opened" |

### Microsoft Rejections

| Rejection Reason | How to Avoid |
|------------------|-------------|
| Used personal @outlook.com for verification | Use work account on custom domain |
| Partner ID is location-specific not Global | Use Partner Global Account ID |
| Domain not verified in Entra ID | Complete DNS TXT verification first |
| MFA not enabled | Enable MFA on the verifying account |

---

## Phase 5: Annual Maintenance

### Google
- [ ] CASA re-assessment every 12 months from LOA date
- [ ] Re-verification triggered if adding new restricted scopes
- [ ] Keep privacy policy updated with any new subprocessors
- [ ] Keep demo video current if UI changes significantly

### Microsoft
- [ ] No annual re-verification required
- [ ] Keep Partner Center enrollment active
- [ ] Update privacy policy URL if it changes

---

## Cost Summary

### One-Time Costs

| Item | Cost |
|------|------|
| CASA Tier 2 assessment | $540-$1,800 |
| Privacy policy (DIY with template) | $0 |
| Privacy policy (lawyer review) | $200-$500 (optional) |
| Demo video recording | $0 (screen recorder) |
| Microsoft Partner Center | Free |

### Annual Recurring Costs

| Item | Cost/Year |
|------|-----------|
| Domain (Cloudflare) | $10.44 |
| Email hosting (Migadu) | ~$36 |
| Website hosting (Cloudflare Pages) | Free |
| SSL certificate (Let's Encrypt) | Free |
| CASA re-assessment (annual) | $540-$1,800 |
| **Total annual** | **$587-$1,847** |

### Legal Entity

| Entity Type | Required By | Cost |
|-------------|------------|------|
| Sole proprietor | Minimum for both | Varies by country |
| LLC/SRL | Recommended for liability | Varies by country |

Neither Google nor Microsoft formally require incorporation. A sole proprietor with a real domain and verified identity can complete both processes.

---

## Timeline Overview

```
Week 1-2:  [INFRA] Domain + DNS + Email + Landing Page + Privacy Policy
           [MSFT]  Entra ID setup + Partner Center enrollment
           [GOOG]  GCP project + Search Console verification

Week 2-3:  [MSFT]  Partner Center verified -> Publisher verification (DONE)
           [GOOG]  OAuth consent screen + demo video + submit for verification

Week 3-6:  [GOOG]  Brand verification review
           [GOOG]  CASA tier assigned -> contact assessors

Week 6-12: [GOOG]  CASA assessment in progress

Week 12-14:[GOOG]  LOA received -> submit to Google

Week 14-16:[GOOG]  Final approval -> PRODUCTION READY

Microsoft: DONE by week 3
Google:    DONE by week 12-16
```

---

## Quick Reference: What Goes Where

| What | Where |
|------|-------|
| Domain registration | Cloudflare Registrar |
| DNS management | Cloudflare |
| Email hosting | Migadu |
| Landing page hosting | Cloudflare Pages (free) |
| Privacy policy hosting | Cloudflare Pages (same site) |
| Google domain verification | Google Search Console (DNS TXT) |
| Microsoft domain verification | Entra ID (DNS TXT) |
| Google OAuth config | Google Cloud Console |
| Microsoft OAuth config | Azure Portal > App Registrations |
| Microsoft partner enrollment | partner.microsoft.com |
| CASA assessment | TAC Security (budget) or Bishop Fox (premium) |

---

## References

- [Google Restricted Scope Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Google CASA Authorized Assessors](https://appdefensealliance.dev/casa/casa-assessors)
- [Gmail API Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Microsoft Publisher Verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [Microsoft App Registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft Graph Permissions Reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
