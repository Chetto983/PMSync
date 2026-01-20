# Super-Admin Dashboard Roadmap

## Overview

A dedicated dashboard for super-admin users to manage multi-tenant operations, system health, billing oversight, and cross-tenant administration.

## Current State

- Backend: `super-admin` role exists with guards (`RolesGuard`, `@Roles('super-admin')`)
- Frontend: **No admin pages exist**
- Role hierarchy: `user` < `admin` < `super-admin`

## Phase 1: Foundation (MVP)

### 1.1 Admin Layout Shell

**Files to create:**
- `frontend/pages/admin/index.tsx` - Admin dashboard home
- `frontend/components/admin/AdminLayout.tsx` - Layout wrapper with sidebar
- `frontend/components/admin/AdminSidebar.tsx` - Navigation menu

**Features:**
- Protected route (super-admin only)
- Dedicated sidebar navigation
- Breadcrumb navigation

### 1.2 Tenant Management

**Endpoints (existing):**
- `GET /api/v1/tenants` - List all tenants
- `POST /api/v1/tenants` - Create tenant
- `PATCH /api/v1/tenants/:id` - Update tenant
- `DELETE /api/v1/tenants/:id` - Delete tenant

**Pages:**
- `frontend/pages/admin/tenants/index.tsx` - Tenant list with search/filter
- `frontend/pages/admin/tenants/[id].tsx` - Tenant detail/edit

**Features:**
- List all tenants with status badges
- Create new tenant
- Edit tenant details
- Activate/deactivate tenant
- View tenant users

### 1.3 Subscription Management

**Pages:**
- `frontend/pages/admin/subscriptions/index.tsx` - All subscriptions
- `frontend/pages/admin/subscriptions/[tenantId].tsx` - Subscription detail

**Features:**
- View all tenant subscriptions
- Manually upgrade/downgrade plans
- Reset usage counters
- View billing history
- Override limits temporarily

---

## Phase 2: Observability

### 2.1 System Health Dashboard

**Files:**
- `frontend/pages/admin/health/index.tsx`

**Widgets:**
- API response times (P50, P95, P99)
- Error rates by endpoint
- Active connections (IMAP, database, Redis)
- Queue depths (BullMQ)
- Memory/CPU usage

### 2.2 Audit Logs

**Backend (existing):**
- `AuditLog` model in Prisma
- Audit logging in controllers

**Pages:**
- `frontend/pages/admin/audit/index.tsx`

**Features:**
- Filterable log viewer
- Search by tenant, user, action
- Date range filter
- Export to CSV

### 2.3 Cost & Usage Analytics

**Pages:**
- `frontend/pages/admin/analytics/index.tsx`

**Features:**
- Cross-tenant AI usage charts
- Cost per tenant breakdown
- Usage trends over time
- Quota alert history

---

## Phase 3: Operations

### 3.1 User Management

**Pages:**
- `frontend/pages/admin/users/index.tsx` - All users across tenants
- `frontend/pages/admin/users/[id].tsx` - User detail

**Features:**
- Search users across all tenants
- Impersonate user (with audit trail)
- Lock/unlock accounts
- Reset passwords
- Manage roles

### 3.2 Email Account Oversight

**Pages:**
- `frontend/pages/admin/email-accounts/index.tsx`

**Features:**
- View all connected email accounts
- Check sync status
- Trigger re-sync
- View error logs

### 3.3 GDPR/Compliance Tools

**Pages:**
- `frontend/pages/admin/compliance/index.tsx`

**Features:**
- Data export requests queue
- Data deletion requests
- Compliance audit reports
- Retention policy override

---

## Phase 4: Automation & Alerts

### 4.1 Alert Configuration

**Pages:**
- `frontend/pages/admin/alerts/index.tsx`

**Features:**
- Configure cost threshold alerts
- System health alert rules
- Email notification settings
- Slack/webhook integrations

### 4.2 Scheduled Tasks

**Pages:**
- `frontend/pages/admin/jobs/index.tsx`

**Features:**
- View scheduled jobs (cron)
- Manually trigger jobs
- View job history
- Pause/resume jobs

---

## Technical Requirements

### Backend Changes Needed

1. **Super-admin auth flow:**
   - Separate login page or elevated auth
   - Session isolation from regular users

2. **Cross-tenant queries:**
   - New endpoints without tenant filter
   - Pagination for large datasets

3. **Metrics aggregation:**
   - System-wide metrics endpoint
   - Usage aggregation across tenants

### Frontend Stack

- **Routing:** Next.js pages in `/admin/`
- **State:** TanStack Query for data fetching
- **Charts:** Recharts or Tremor for analytics
- **Tables:** TanStack Table for data grids
- **Forms:** React Hook Form + Zod

### Security Considerations

- IP allowlist for admin access
- MFA requirement for super-admin
- All actions logged to audit trail
- Session timeout (shorter than regular)
- Rate limiting on sensitive actions

---

## Priority Order

| Priority | Feature | Business Value |
|----------|---------|----------------|
| P0 | Tenant list + basic CRUD | Multi-tenant ops |
| P0 | Subscription management | Billing control |
| P1 | Audit logs viewer | Compliance |
| P1 | User management | Support ops |
| P2 | System health dashboard | DevOps visibility |
| P2 | Cost analytics | Business insights |
| P3 | Alert configuration | Proactive ops |
| P3 | GDPR tools | Compliance |

---

## Definition of Done

- All pages localized (en.ts, it.ts)
- TanStack Query for all data fetching
- Loading/error/empty states
- Responsive layout (desktop priority)
- Role-protected routes
- Actions logged to audit trail
- Unit tests for critical flows
