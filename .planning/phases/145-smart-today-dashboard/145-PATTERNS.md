# Phase 145: Smart Today Dashboard - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 41 (28 create, 5 modify, 8 delete)
**Analogs found:** 33 / 33 (100% — every new file has a strong codebase analog)

This map is concrete by design: every "Pattern Assignment" cites an existing file with line numbers and an exact excerpt the planner can copy. The planner MUST NOT invent patterns when an analog exists below.

---

## File Classification

### Backend — Files to Create (8)

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `backend/src/modules/dashboard/dashboard.module.ts` | module | wiring | `backend/src/modules/tasks/tasks.module.ts` | exact |
| `backend/src/modules/dashboard/controllers/dashboard.controller.ts` | controller | request-response (read-only GET) | `backend/src/modules/tasks/controllers/tasks.controller.ts` (lines 38-113) | exact |
| `backend/src/modules/dashboard/services/dashboard-today.service.ts` | service (aggregator) | parallel fan-out + transform | `backend/src/modules/tasks/services/tasks-aggregation.service.ts:38-131` + `backend/src/modules/ai/services/briefing.service.ts:393-474` | exact (two complementary analogs) |
| `backend/src/modules/dashboard/services/today-scorer.service.ts` | service (pure functions) | transform | `backend/src/modules/tasks/services/tasks-aggregation.service.ts:31-36, 96-109` (PRIORITY_WEIGHT + sort comparator) | role-match |
| `backend/src/modules/dashboard/dto/today-feed-item.dto.ts` | dto | n/a | `backend/src/modules/tasks/dto/unified-task.dto.ts` | exact |
| `backend/src/modules/dashboard/dto/get-today-query.dto.ts` | dto (query) | n/a | `backend/src/modules/tasks/dto/list-tasks-query.dto.ts` | exact |
| `backend/src/modules/dashboard/dto/today-response.dto.ts` | dto (response wrapper) | n/a | `backend/src/modules/tasks/dto/unified-task.dto.ts:67-77` (`TaskMetaDto`, `UnifiedTaskListResponseDto`) | exact |
| `backend/src/modules/dashboard/services/__tests__/dashboard-today.service.spec.ts` | test | unit | `backend/src/modules/ai/services/__tests__/reminder-scheduler.service.spec.ts:1-100` | role-match |
| `backend/src/modules/dashboard/services/__tests__/today-scorer.service.spec.ts` | test | pure-function unit | `backend/src/modules/ai-chat/utils/tool-result-truncator.spec.ts` (pure unit pattern) | role-match |
| `backend/src/modules/dashboard/controllers/__tests__/dashboard.controller.spec.ts` | test | controller unit | `backend/src/modules/calendar/controllers/__tests__/calendar.controller.spec.ts:1-103` | exact |

### Backend — Files to Modify (1)

| File | Modification | Pattern Source |
|------|-------------|----------------|
| `backend/src/app.module.ts` | Add `DashboardModule` import + register in `imports[]` | Lines 44, 119 — follow the `TasksModule` precedent (the most recently added domain module) |

### Frontend — Files to Create (15)

| New File | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `frontend/components/dashboard/today/TodayDashboard.tsx` | component (container) | request-response | `frontend/components/dashboard/DashboardContainer.tsx` (header + layout shell) + `frontend/components/dashboard/widgets/BaseWidget.tsx` (loading/error/empty triplet) | role-match (intentional swap target) |
| `frontend/components/dashboard/today/TodayFeedList.tsx` | component (list) | request-response | `frontend/components/dashboard/widgets/FollowUpWidget.tsx:115-163` (List + ListItem map) | exact |
| `frontend/components/dashboard/today/TodayFeedItem.tsx` | component (row) | request-response + animation | `frontend/components/dashboard/widgets/FollowUpWidget.tsx:117-162` (ListItem with secondaryAction) | exact |
| `frontend/components/dashboard/today/TodayTierSection.tsx` | component (section header) | n/a | `frontend/components/common/PageContainer.tsx:37-60` (header pattern, simpler) | partial |
| `frontend/components/dashboard/today/TodayEmptyState.tsx` | component (empty state) | n/a | `frontend/components/dashboard/widgets/BaseWidget.tsx:326-359` (`EmptyState` internal component) | role-match |
| `frontend/components/dashboard/today/TodayGreeting.tsx` | component (header text) | n/a | `frontend/components/dashboard/widgets/BriefingWidget.tsx` (consume `BriefingData.summary`) | partial |
| `frontend/components/dashboard/today/SnoozeMenu.tsx` | component (MUI Menu) | event | `frontend/components/dashboard/widgets/FollowUpWidget.tsx:46-83, 170-194` (anchorEl + handleSnooze + Menu/MenuItem) | exact |
| `frontend/components/dashboard/today/__tests__/TodayDashboard.test.tsx` | test | RTL | `frontend/components/dashboard/widgets/BriefingWidget.test.tsx:1-120` | exact |
| `frontend/components/dashboard/today/__tests__/TodayFeedItem.test.tsx` | test | RTL | `frontend/components/dashboard/widgets/AiTriageWidget.test.tsx:1-90` (mock router.push) | exact |
| `frontend/components/dashboard/today/__tests__/TodayEmptyState.test.tsx` | test | RTL | `frontend/components/dashboard/widgets/BriefingWidget.test.tsx` | role-match |
| `frontend/hooks/queries/use-today.ts` | hook | TanStack Query | `frontend/hooks/queries/use-dashboard.ts:95-118` (`briefingOptions`) + `frontend/hooks/queries/use-follow-ups.ts:144-157` (mutations) | exact (two complementary) |
| `frontend/hooks/queries/__tests__/use-today.test.ts` | test | hook | `frontend/hooks/queries/use-contacts.test.ts:1-90` | exact |
| `frontend/lib/api/dashboard.ts` | api module | thin wrapper | `frontend/lib/api/tasks.ts:1-145` | exact |
| `frontend/hooks/queries/today-keys.ts` (recommended; matches dashboard-keys pattern) | utility | n/a | `frontend/hooks/queries/dashboard-keys.ts` | exact |
| `frontend/components/dashboard/today/index.ts` (barrel; matches project convention) | utility | n/a | `frontend/components/common/index.ts` | exact |

### Frontend — Files to Modify (4)

| File | Modification | Pattern Source |
|------|-------------|----------------|
| `frontend/pages/dashboard/index.tsx` | Replace `import DashboardContainer` (line 2) and JSX usage (line 17) with `TodayDashboard` | One-line swap; the `<Layout><PageErrorBoundary>...` wrapper is preserved verbatim |
| `frontend/locales/en.ts` | Add `dashboard.today.*` keys (~25 keys) per UI-SPEC § Copywriting Contract | Insert as a sibling of `dashboard.widgets` at line ~602; copy structure from existing `dashboard.widgets.followUps` block (lines 641-653) |
| `frontend/locales/it.ts` | Mirror Italian copy from UI-SPEC § Copywriting Contract | Same insertion site as en.ts |
| `frontend/locales/index.ts` | Extend `DashboardTranslations` type with `today` block (lines 468-528 region) | Mirror `widgets.followUps` type shape (lines 567-579) |

### Frontend — Files to DELETE after E2E sign-off (15)

Per D-01/D-02. **Verified safe by grep** — see Deletion Safety Audit below.

| File | Reason |
|------|--------|
| `frontend/components/dashboard/DashboardContainer.tsx` (+ `.test.tsx`) | Replaced by `TodayDashboard` |
| `frontend/components/dashboard/dashboard/widget-registry.ts` | Sole importer is `DashboardContainer.tsx` |
| `frontend/components/dashboard/dashboard/CustomizeDrawer.tsx` | Sole importer is `DashboardContainer.tsx` |
| `frontend/components/dashboard/dashboard/WidgetCard.tsx` | Sole importer is `DashboardContainer.tsx` |
| `frontend/components/dashboard/dashboard/WidgetSkeleton.tsx` | Sole importer is `DashboardContainer.tsx` |
| `frontend/components/dashboard/dashboard/DashboardEmptyState.tsx` | Sole importer is `DashboardContainer.tsx` |
| `frontend/components/dashboard/dashboard/AiQuickAccess.tsx` | Sole importer is `DashboardContainer.tsx` |
| `frontend/components/dashboard/widgets/BriefingWidget.tsx` (+ `.test.tsx`) | Sole importer is `widget-registry.ts` (lazy) |
| `frontend/components/dashboard/widgets/UnreadEmailsWidget.tsx` | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/StaleContactsWidget.tsx` (+ `.test.tsx`) | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/AiTriageWidget.tsx` (+ `.test.tsx`) | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/FollowUpWidget.tsx` | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/TrendChartsWidget.tsx` | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/DeadlinesWidget.tsx` | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/TodayEventsWidget.tsx` | Sole importer is `widget-registry.ts` |
| `frontend/components/dashboard/widgets/BaseWidget.tsx` | Sole importers are widgets-being-deleted |
| `frontend/components/dashboard/CrmSuggestionsFeed.tsx` | Sole importer is `widget-registry.ts:44-46` (verified — no other importers) |
| `frontend/stores/dashboard-store.ts` | Sole importer is `DashboardContainer.tsx:18` |
| `frontend/lib/dashboard/widget-registry.ts` | No external importers found (separate from the dashboard/dashboard/ one) |
| `frontend/lib/dashboard/layout-engine.ts` | Sole importer is `frontend/hooks/queries/use-dashboard.ts:22` (type-only) — see Hook Cleanup below |
| `frontend/e2e/dashboard.spec.ts` | Tests obsolete customize/widget UI; rewrite OR delete |

### Frontend — Hook cleanup (partial-delete from `use-dashboard.ts`)

Delete only these exports (lines as of 2026-04-16):
- `dashboardPreferencesOptions` (line 425)
- `useDashboardPreferences` (line 454)
- `useSaveDashboardLayout` (line 461)
- `getDefaultLayout()` helper (line 404)
- The `import type { WidgetLayout, DashboardLayout }` (line 22)

Keep: `useBriefing`, `useTodayEvents`, `useDeadlines`, `useRecentUnreadEmails`, `useTriagedEmails`, `useImportantEmails`, `useStaleContacts`, `useEmailTrends` — all are sole-imported by widgets and will become dead code after widget deletion. **Audit and delete in the same wave** to avoid leaving orphan exports. Confirmed by grep: zero importers outside the widgets directory.

---

## Pattern Assignments

### Backend

#### `backend/src/modules/dashboard/dashboard.module.ts` (module, wiring)

**Analog:** `backend/src/modules/tasks/tasks.module.ts` (entire file)

**Module skeleton** (lines 1-14):
```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TasksController } from './controllers/tasks.controller';
import { TasksAggregationService } from './services/tasks-aggregation.service';
import { ManualTaskService } from './services/manual-task.service';
import { SmartViewService } from './services/smart-view.service';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController],
  providers: [TasksAggregationService, ManualTaskService, SmartViewService],
  exports: [TasksAggregationService, ManualTaskService, SmartViewService],
})
export class TasksModule {}
```

**Adapt for Phase 145:** imports must include `PrismaModule, TasksModule, AiModule, CrmModule, CalendarModule` (so `DashboardTodayService` can inject `TasksAggregationService`, `BriefingService`, `DealService`). Providers: `DashboardTodayService, TodayScorerService`. No exports needed (no other module consumes dashboard).

---

#### `backend/src/modules/dashboard/controllers/dashboard.controller.ts` (controller, request-response)

**Analog:** `backend/src/modules/tasks/controllers/tasks.controller.ts`

**Imports + decorators pattern** (lines 1-42):
```typescript
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';

interface AuthenticatedRequest {
  user: { id: string; tenantId: string };
}

@ApiTags('Tasks')
@ApiCookieAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly aggregationService: TasksAggregationService,
    ...
  ) {}
```

**GET endpoint pattern** (lines 102-113):
```typescript
@Get()
@ApiOperation({ summary: 'List unified tasks from all sources' })
async list(
  @Req() req: AuthenticatedRequest,
  @Query() query: ListTasksQueryDto,
): Promise<UnifiedTaskListResponseDto> {
  return this.aggregationService.listTasks(
    req.user.tenantId,
    req.user.id,
    query,
  );
}
```

**Adapt for Phase 145:** `@ApiTags('Dashboard')`, `@Controller('dashboard')`, single `@Get('today')` route. Add `@RateTierDecorator('read')` per RESEARCH § Security (rate-limit). No write endpoints in this module — completion/snooze go to existing tasks/follow-ups endpoints.

---

#### `backend/src/modules/dashboard/services/dashboard-today.service.ts` (service, parallel fan-out)

**Analog A (parallel fan-out):** `backend/src/modules/ai/services/briefing.service.ts:393-474`

**Promise.all pattern** (excerpt at line 393):
```typescript
const [unreadEmails, todayEvents, followUps, staleContacts, ...] =
  await Promise.all([
    this.prisma.email.findMany({
      where: { tenantId, isRead: false, isDeleted: false },
      orderBy: { receivedAt: 'desc' },
      take: 20,
      select: { id: true, subject: true, from: true, ... },
    }),
    this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startTime: 'asc' },
      select: { id: true, title: true, startTime: true, endTime: true },
    }),
    this.prisma.emailFollowUp.findMany({
      where: { tenantId, status: 'PENDING' },
      take: 10,
      include: { email: { select: { subject: true, from: true } } },
    }),
    ...
  ]);
```

**Timezone resolution pattern** (lines 376-388 — copy verbatim, do NOT reinvent):
```typescript
const tz = timezone || 'UTC';
const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
const parts = todayStr.split('-').map(Number);
const naive = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
const probe = new Date(naive.toLocaleString('en-US', { timeZone: tz }));
const offsetMs = probe.getTime() - naive.getTime();
const startOfDay = new Date(naive.getTime() - offsetMs);
const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
```

**Analog B (sort + dedup + count after merge):** `backend/src/modules/tasks/services/tasks-aggregation.service.ts:38-131`

**Merge + sort pattern** (lines 89-130):
```typescript
const results = await Promise.all(queries);
let merged = results.flat();

// Sort
merged.sort((a, b) => {
  let cmp = 0;
  if (sortBy === 'dueDate') {
    const aVal = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bVal = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    cmp = aVal - bVal;
  } ...
  return sortOrder === 'desc' ? -cmp : cmp;
});

// Counts per group (before pagination)
const counts = { follow_up: 0, reminder: 0, ... };
for (const t of merged) { counts[t.sourceType]++; }
```

**Adapt for Phase 145:**
- 5 parallel queries: `tasksAggregation.listTasks(...)` (with `sourceType` exclude or include policy per Pitfall 1), `prisma.calendarEvent.findMany(...)`, `dealService.list(...)`, custom stuck-deal raw query, `briefingService.getBriefing(...)` (optional via `includeGreeting`).
- Use `Promise.all` (not `Promise.allSettled`) BUT wrap each call with `.catch(() => returnEmptyDefault)` so a single source failure doesn't 500 the whole feed (RESEARCH validation map calls this out as a required test).
- Counts shape: `{ urgent, today, fyi, total }` per `TodayFeedCountsDto` in RESEARCH lines 571-576.
- Apply `today-scorer.service.ts` to compute `(tier, score)` per item, then group + sort within tier.

**Constructor injection** (mirror `briefing.service.ts:289-301`):
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly tasksAggregation: TasksAggregationService,
  private readonly briefingService: BriefingService,
  private readonly dealService: DealService,
  // CalendarService is optional — direct prisma.calendarEvent.findMany works fine for "today's events"
) {}
```

---

#### `backend/src/modules/dashboard/services/today-scorer.service.ts` (pure functions)

**Analog:** `backend/src/modules/tasks/services/tasks-aggregation.service.ts:31-36, 96-109`

**Priority weight + comparator pattern** (lines 31-36):
```typescript
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};
```

**Adapt:** Implement exactly the algorithm in RESEARCH lines 590-642 (`scoreItem`, `scoreUrgent`, `scoreToday`, `scoreFyi`, `isToday`). Mark all methods `public` so they're directly testable. Tiebreaker rules (RESEARCH lines 644-648) MUST be honored for snapshot-test stability:
1. score desc
2. dueAt asc
3. type order: `email > task > event > deal`
4. id asc

`@Injectable()` so it can be DI'd into `DashboardTodayService` and replaced in tests.

---

#### `backend/src/modules/dashboard/dto/today-feed-item.dto.ts` (dto)

**Analog:** `backend/src/modules/tasks/dto/unified-task.dto.ts` (entire file)

**`as const` enum + class pattern** (lines 1-12):
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TASK_SOURCE_TYPES = ['follow_up', 'reminder', 'deal_action', 'ticket', 'manual'] as const;
export type TaskSourceType = (typeof TASK_SOURCE_TYPES)[number];

export class UnifiedTaskDto {
  @ApiProperty({ description: 'Unique task ID (composite: sourceType_sourceId)' })
  id!: string;

  @ApiProperty({ enum: TASK_SOURCE_TYPES, description: 'Origin system of the task' })
  sourceType!: TaskSourceType;
  ...
  @ApiPropertyOptional({ description: 'Due date in ISO 8601', nullable: true })
  dueDate!: string | null;
}
```

**Adapt:** The exact shape is given in RESEARCH lines 532-585 (`TODAY_ITEM_TYPES`, `TODAY_TIERS`, `TodayFeedItemDto`, `TodayFeedCountsDto`, `TodayFeedResponseDto`). Use the same `as const` + `(typeof X)[number]` style. Place all three DTO classes in this single file OR split to keep <500 LOC; either is fine.

---

#### `backend/src/modules/dashboard/dto/get-today-query.dto.ts` (dto, query)

**Analog:** `backend/src/modules/tasks/dto/list-tasks-query.dto.ts`

**Validation pattern** (lines 1-79):
```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: TASK_SOURCE_TYPES, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsIn([...TASK_SOURCE_TYPES], { each: true })
  sourceType?: TaskSourceType[];

  @ApiPropertyOptional({ description: 'Tasks due before this ISO 8601 date' })
  @IsOptional()
  @IsISO8601()
  dueBefore?: string;
}
```

**Adapt for Phase 145:**
- Three optional fields per RESEARCH § Assumptions A8: `locale?: string` (`@IsString() @IsIn(['en','it'])`), `tz?: string` (validate against `Intl.supportedValuesOf('timeZone')` allowlist per RESEARCH security V5/§ Threat patterns), `includeGreeting?: boolean` (use `@Type(() => Boolean)` + `@Transform`).

---

#### Backend test specs

**Analog A (service unit with mocked Prisma):** `backend/src/modules/ai/services/__tests__/reminder-scheduler.service.spec.ts:34-100`

**Mock prisma + Test.createTestingModule pattern** (lines 34-61):
```typescript
const mockPrisma = {
  emailFollowUp: { findMany: jest.fn(), update: jest.fn() },
};

beforeEach(async () => {
  jest.clearAllMocks();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ReminderSchedulerService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();
  service = module.get<ReminderSchedulerService>(ReminderSchedulerService);
});
```

**Analog B (controller unit, plain `new Controller(deps)`):** `backend/src/modules/calendar/controllers/__tests__/calendar.controller.spec.ts:1-103`

**Direct construction + per-method test pattern** (lines 4-58, 76-102):
```typescript
const buildController = () => {
  const calendarService = {
    listEvents: jest.fn(),
    ...
  } as never;
  const controller = new CalendarController(calendarService, ...);
  return { controller, calendarService };
};

describe('listEvents', () => {
  it('builds filters from query and passes tenantId', async () => {
    const { controller, calendarService } = buildController();
    (calendarService.listEvents as jest.Mock).mockResolvedValue({ events: [], total: 0 });

    await controller.listEvents(req, query as any);

    expect(calendarService.listEvents).toHaveBeenCalledWith(tenantId, {...});
  });
});
```

**Required tests (from RESEARCH § Phase Requirements → Test Map):**
- Service: "groups items by tier", "tolerates source failure" (single rejected promise doesn't throw), tenant scoping
- Scorer: overdue → urgent, due today → today, upcoming → fyi, tiebreakers stable
- Controller: tenant isolation (different `req.user.tenantId` returns different data)

---

### Frontend

#### `frontend/components/dashboard/today/TodayDashboard.tsx` (component, container)

**Analog A (page wrapper):** `frontend/components/dashboard/DashboardContainer.tsx:81-100`

**PageContainer + headerActions pattern** (lines 94-100):
```typescript
return (
  <PageContainer
    title={t.dashboard?.title || 'Dashboard'}
    subtitle={t.dashboard?.subtitle || 'Your personal command center'}
  >
    <Stack spacing={3}>
      ...
    </Stack>
  </PageContainer>
);
```

**Analog B (loading/error/empty triplet):** `frontend/components/dashboard/widgets/BaseWidget.tsx:229-298`

**Three-state pattern** (lines 229-297):
```typescript
{loading ? (
  <WidgetSkeleton />
) : error ? (
  <Box sx={{ borderRadius: 2, bgcolor: alpha(theme.palette.error.main, 0.06), ... }}>
    <Typography variant="body2" color="text.secondary">{error}</Typography>
    <Button onClick={onRefresh}>{t.dashboard.widgets.common.retry}</Button>
  </Box>
) : isEmpty ? (
  <EmptyState text={emptyText} />
) : (
  children
)}
```

**Adapt for Phase 145:** Replace internal Box-error with `<QueryErrorAlert error={error} onRetry={refetch} />` per UI-SPEC § Error State. Replace `<WidgetSkeleton />` with the inline skeleton spec'd in UI-SPEC § Loading State (Greeting Skeleton + 5x 48px rectangular Skeletons). Use `useTodayFeed()` hook from `frontend/hooks/queries/use-today.ts`.

**Container max-width per UI-SPEC § Responsive (single column, 720px max):**
```typescript
<PageContainer
  title={t.dashboard.today.title}
  subtitle={t.dashboard.today.subtitle}
  maxWidth={720}
>
```

---

#### `frontend/components/dashboard/today/TodayFeedItem.tsx` (component, row)

**Analog:** `frontend/components/dashboard/widgets/FollowUpWidget.tsx:117-162`

**Clickable row + secondaryAction pattern** (lines 118-145):
```typescript
<ListItem
  key={followUp.id}
  disablePadding
  sx={{
    mb: 1,
    cursor: 'pointer',
    borderRadius: 1,
    '&:hover': { bgcolor: 'action.hover' },
    px: 1,
    py: 0.5,
  }}
  onClick={() => followUp.emailId && router.push(`/dashboard/email?id=${followUp.emailId}`)}
  secondaryAction={
    <Tooltip title={snoozeText.title}>
      <IconButton
        size="small"
        onClick={(e) => handleMenuOpen(e, followUp.id)}
        sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
      >
        <Clock size={16} />
      </IconButton>
    </Tooltip>
  }
>
  <ListItemText
    primary={followUp.subject}
    secondary={...}
    slotProps={{
      primary: { variant: 'body2', noWrap: true, sx: { pr: 4 } },
      secondary: { variant: 'caption', noWrap: true, color: followUp.status === 'overdue' ? 'error' : 'text.secondary' },
    }}
  />
</ListItem>
```

**Adapt for Phase 145:**
- Row height MUST be 48px (`minHeight: 48`) per UI-SPEC D-06.
- Click target: entire row, dispatch by `item.type` per UI-SPEC § Click-through Navigation table.
- Hover-revealed quick actions: opacity 0 → 1 on row hover (UI-SPEC § Animations: 150ms cubic-bezier).
- Wrap in `<motion.div layout exit={{ opacity: 0, x: -20, height: 0 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}>` per RESEARCH Pattern 4.
- ARIA: `role="listitem"` on row container; per UI-SPEC § a11y notes, the parent List can lose semantics with framer-motion — use `role="list"` on `TodayFeedList` outer container.
- Use entity-color icon backgrounds per UI-SPEC § Entity Type Colors.

**`useRouter` import** (FollowUpWidget line 32):
```typescript
import { useRouter } from 'next/navigation';
```

---

#### `frontend/components/dashboard/today/SnoozeMenu.tsx` (component, MUI Menu)

**Analog:** `frontend/components/dashboard/widgets/FollowUpWidget.tsx:46-83, 170-194`

**State + handler pattern** (lines 46-83):
```typescript
const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
const [selectedId, setSelectedId] = useState<string | null>(null);

const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, id: string) => {
  event.stopPropagation();   // CRITICAL — prevents row click navigation
  setAnchorEl(event.currentTarget);
  setSelectedId(id);
}, []);

const handleSnooze = useCallback(async (hours: number | 'tomorrow' | 'nextWeek') => {
  if (!selectedId) return;
  let dueDate: Date;
  if (hours === 'tomorrow') {
    dueDate = startOfTomorrow();
    dueDate.setHours(9, 0, 0, 0);
  } else if (hours === 'nextWeek') {
    dueDate = nextMonday(new Date());
    dueDate.setHours(9, 0, 0, 0);
  } else {
    dueDate = addHours(new Date(), hours);
  }
  try {
    await snoozeMutation.mutateAsync({ id: selectedId, dueDate: dueDate.toISOString() });
    refetch();
  } catch {
    toast.error(t.common.genericError);
  }
  handleMenuClose();
}, [selectedId, snoozeMutation, refetch, handleMenuClose]);
```

**Menu render pattern** (lines 170-194):
```typescript
<Menu
  anchorEl={anchorEl}
  open={Boolean(anchorEl)}
  onClose={handleMenuClose}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
>
  <MenuItem onClick={() => handleSnooze(1)}>
    <ListItemIcon><Clock size={16} /></ListItemIcon>
    {snoozeText.oneHour}
  </MenuItem>
  <MenuItem onClick={() => handleSnooze('tomorrow')}>
    <ListItemIcon><Sun size={16} /></ListItemIcon>
    {snoozeText.tomorrow}
  </MenuItem>
  <MenuItem onClick={() => handleSnooze('nextWeek')}>
    <ListItemIcon><CalendarDays size={16} /></ListItemIcon>
    {snoozeText.nextWeek}
  </MenuItem>
</Menu>
```

**Adapt for Phase 145:** Three options exactly per UI-SPEC § Snooze Menu — `oneHour`, `tomorrow`, `nextWeek` (no `fourHours`). Icons: `Clock`, `Sun`, `CalendarDays` per UI-SPEC. Translation namespace: `t.dashboard.today.snooze.*` (NOT `t.ai.followUpTracker.snooze`).

---

#### `frontend/components/dashboard/today/TodayEmptyState.tsx`

**Analog:** `frontend/components/dashboard/widgets/BaseWidget.tsx:326-359`

**Centered empty state with icon-in-circle** (lines 329-358):
```typescript
function EmptyState({ text, defaultText }: { text?: string; defaultText: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
        color: 'text.disabled',
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.action.active, 0.06),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1.5,
        }}
      >
        <Inbox size={24} />
      </Box>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        {text || defaultText}
      </Typography>
    </Box>
  );
}
```

**Adapt for Phase 145:** Follow UI-SPEC § Empty State exactly:
- `Paper elevation=0`, `py: 8`
- `PartyPopper` lucide icon, 48px, `success.main`, in 80px circle with `success.subtle` bg
- Heading `variant="h5"` weight 600
- Two body variants: `bodyClean` (no items at all) vs `body` (no urgent items, preview next)
- If `nextItem` provided, render a single `<TodayFeedItem item={nextItem} />` with `sx={{ opacity: 0.6 }}`

---

#### `frontend/hooks/queries/use-today.ts`

**Analog A (queryOptions):** `frontend/hooks/queries/use-dashboard.ts:95-118`

```typescript
export function briefingOptions(locale?: string, enabled = true) {
  return queryOptions({
    queryKey: dashboardKeys.briefing(locale),
    queryFn: async (): Promise<BriefingData> => {
      const response = await aiChatApi.getBriefing(locale);
      ...
    },
    staleTime: 5 * 60 * 1000,   // 5 minutes
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled,
  });
}
```

**Analog B (mutation with cache invalidation):** `frontend/hooks/queries/use-follow-ups.ts:144-157`

```typescript
export function useSnoozeFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string }) => {
      const res = await aiChatApi.snoozeFollowUp(id, dueDate);
      if (!res.data?.success) throw new Error(res.data?.error || 'Failed to snooze');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followUpKeys.all });
    },
  });
}
```

**Adapt for Phase 145:** Implement the three exports given in RESEARCH lines 654-682:
- `todayFeedOptions(opts)` (queryOptions, `staleTime: 5min`, `gcTime: 30min`, `retry: 1` per UI-SPEC § State Management)
- `useTodayFeed(opts)` consumer hook
- `useCompleteFeedItem()` — POSTs `/tasks/${item.taskSourceType}/${item.taskSourceId}/complete` (existing endpoint)
- `useSnoozeFeedItem()` — PATCHes `/ai/follow-ups/${item.taskSourceId}/snooze` for follow-up-derived items only; throw or no-op for other types (RESEARCH Open Q1)
- All mutations invalidate `['dashboard', 'today']`
- Add `today-keys.ts` with `todayKeys.all = ['dashboard','today']` matching `dashboard-keys.ts` style

---

#### `frontend/lib/api/dashboard.ts`

**Analog:** `frontend/lib/api/tasks.ts:1-145`

**Type + API object pattern** (lines 1-58, 101-145):
```typescript
import { apiClient } from '../api-client';

export type TaskSourceType = 'follow_up' | 'reminder' | 'deal_action' | 'ticket' | 'manual';

export interface UnifiedTask { id: string; sourceType: TaskSourceType; ... }
export interface UnifiedTaskListResponse { data: UnifiedTask[]; meta: TaskMeta; }
export interface ListTasksQuery { sourceType?: TaskSourceType[]; ... }

export const tasksApi = {
  list(query?: ListTasksQuery) {
    return apiClient.get<UnifiedTaskListResponse>('/tasks', { params: query });
  },
  complete(sourceType: TaskSourceType, id: string) {
    return apiClient.post<{ success: boolean }>(`/tasks/${sourceType}/${id}/complete`);
  },
};
```

**Adapt for Phase 145:**
- Mirror backend DTOs exactly (`TodayItemType`, `TodayTier`, `TodayFeedItem`, `TodayFeedCounts`, `TodayFeedResponse`).
- Single-method API:
  ```typescript
  export const dashboardApi = {
    getTodayFeed(query?: { locale?: string; tz?: string; includeGreeting?: boolean }) {
      return apiClient.get<TodayFeedResponse>('/dashboard/today', { params: query });
    },
  };
  ```
- DO NOT add `dismissTodayItem` — dismiss is client-only per UI-SPEC § State Management.
- Snooze + complete piggyback on existing `tasksApi.complete()` and `aiChatApi.snoozeFollowUp()` — do NOT duplicate them here.

---

#### Frontend test specs

**Analog A (component RTL with mocked hooks):** `frontend/components/dashboard/widgets/BriefingWidget.test.tsx:1-120`

**Provider wrap + jest.mock pattern** (lines 1-110):
```typescript
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BriefingWidget } from './BriefingWidget';

jest.mock('@/hooks/queries/use-dashboard', () => ({
  useBriefing: () => ({ data: {...}, isLoading: false, error: undefined, refetch: jest.fn() }),
  useTriagedEmails: () => ({...}),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ dashboard: { widgets: { briefing: { title: 'Daily Briefing' } } } }),
}));

describe('BriefingWidget', () => {
  it('uses a factual fallback summary when the AI briefing is weak', () => {
    render(<ThemeProvider theme={createTheme()}><BriefingWidget /></ThemeProvider>);
    expect(screen.getByText(/Inbox summary:/)).toBeInTheDocument();
  });
});
```

**Analog B (router mock for navigation tests):** `frontend/components/dashboard/widgets/AiTriageWidget.test.tsx:5-9`

```typescript
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
```

**Analog C (hook tests with QueryClientProvider wrapper):** `frontend/hooks/queries/use-contacts.test.ts:1-90`

```typescript
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return TestQueryWrapper;
}

jest.mock('@/lib/api/contacts', () => ({
  contactsApi: { listContacts: jest.fn(), ... },
}));

it('contactsListOptions() has correct query key', () => {
  const opts = contactsListOptions();
  expect(opts.queryKey).toEqual(['contacts', 'list', {}]);
});
```

**For Phase 145:**
- `TodayDashboard.test.tsx`: render with mocked `useTodayFeed`, assert tier sections present, counts visible
- `TodayFeedItem.test.tsx`: mock `useRouter` (Analog B), test click navigation per type, test complete/dismiss/snooze button click handlers
- `TodayEmptyState.test.tsx`: assert "all caught up" copy when items empty, assert next-item preview when provided
- `use-today.test.ts`: assert query key shape, mock `dashboardApi.getTodayFeed`, test `useCompleteFeedItem` calls correct endpoint
- **Mock `framer-motion`** for animation tests — RESEARCH Wave 0 Gap calls this out:
  ```typescript
  jest.mock('framer-motion', () => ({
    AnimatePresence: ({ children }) => children,
    motion: { div: 'div', li: 'li' },
  }));
  ```

---

## Shared Patterns (cross-cutting)

### Pattern S1 — Authentication & Authorization (backend)

**Source:** `backend/src/modules/tasks/controllers/tasks.controller.ts:38-40`
**Apply to:** `dashboard.controller.ts`

```typescript
@ApiTags('Dashboard')
@ApiCookieAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('dashboard')
```

Plus the `AuthenticatedRequest` interface (lines 34-36) for `@Req()` typing. The global `BetterAuthGuard` (`app.module.ts:135-137`) handles session validation upstream.

---

### Pattern S2 — Multi-tenant query scoping (backend, MANDATORY)

**Source:** `backend/src/modules/ai/services/briefing.service.ts:395, 411, 420, 437, 446-475` (every Prisma call)
**Apply to:** every Prisma call in `dashboard-today.service.ts` and any sub-services

```typescript
this.prisma.email.findMany({
  where: { tenantId, isRead: false, isDeleted: false },
  ...
})
this.prisma.calendarEvent.findMany({
  where: { tenantId, isDeleted: false, ... },
  ...
})
this.prisma.emailFollowUp.findMany({
  where: { tenantId, status: 'PENDING' },
  ...
})
```

**Hard rule from CLAUDE.md:** Forgetting `tenantId` in any `where` clause is a data leak. Add it as the first key in every `where` block.

---

### Pattern S3 — Rate limiting (backend)

**Source:** `backend/src/modules/tasks/controllers/tasks.controller.ts:56, 67, 83, 93, 116, 132, 154, 171`
**Apply to:** every endpoint in `dashboard.controller.ts`

```typescript
@Get('today')
@RateTierDecorator('read')   // GETs use 'read' tier (300/min per app.module.ts:69)
async getToday(...) { ... }
```

---

### Pattern S4 — Error handling (backend)

**Source:** `backend/src/modules/tasks/services/tasks-aggregation.service.ts:144-152, 230` (NestJS `NotFoundException` / `BadRequestException`)
**Apply to:** `dashboard-today.service.ts` source-failure handling

```typescript
if (!record || record.tenantId !== tenantId) {
  throw new NotFoundException(`Follow-up ${sourceId} not found`);
}
```

For Phase 145 specifically: per RESEARCH § Validation, the aggregator must "tolerate one source failing". Wrap each `Promise.all` member with `.catch(err => { this.logger.warn({err, source: 'tasks'}, 'source failed'); return EMPTY_DEFAULT; })`. Do NOT let `BriefingService` errors bubble — catch and return `null` greeting.

---

### Pattern S5 — i18n (frontend, MANDATORY)

**Source:** `frontend/lib/hooks/use-translations.ts:1-12` + `frontend/components/dashboard/widgets/FollowUpWidget.tsx:35, 90-97`
**Apply to:** every component in `frontend/components/dashboard/today/*`

```typescript
import { useTranslations } from '@/lib/hooks/use-translations';

const t = useTranslations();
const wt = t.dashboard.today;
return <Typography>{wt.title}</Typography>;
```

Per CLAUDE.md hard rule: zero hardcoded UI strings. All copy from UI-SPEC § Copywriting Contract goes into `dashboard.today.*` namespace in `en.ts`/`it.ts` BEFORE any component is written (CLAUDE.md frontend procedure step 1).

---

### Pattern S6 — TanStack Query defaults (frontend)

**Source:** `frontend/hooks/queries/use-dashboard.ts:113-115`
**Apply to:** `useTodayFeed()` query options

```typescript
staleTime: 5 * 60 * 1000,   // 5 minutes
gcTime: 30 * 60 * 1000,     // 30 minutes
retry: 1,
```

These match UI-SPEC § State Management exactly.

---

### Pattern S7 — Toast with undo (frontend)

**Source:** `frontend/lib/context/toast-context.tsx:26-33` (`ToastOptions`) + `frontend/lib/context/toast-context.tsx:111-120` (Snackbar action button)
**Apply to:** complete/dismiss/snooze handlers in `TodayFeedItem.tsx`

```typescript
const toast = useGlobalToast();

toast.info(t.dashboard.today.toasts.dismissed, {
  actionLabel: t.dashboard.today.toasts.undo,
  duration: 6000,    // 6s for undo toasts (toast-context.tsx:31 default 4s)
  onAction: () => restoreItem(item.id),
});
```

The toast already supports `actionLabel` + `onAction` natively — do NOT add a custom toast wrapper.

---

### Pattern S8 — Snooze date math (frontend)

**Source:** `frontend/components/dashboard/widgets/FollowUpWidget.tsx:28, 61-83`
**Apply to:** `SnoozeMenu.tsx`

```typescript
import { addHours, startOfTomorrow, nextMonday } from 'date-fns';

if (when === 'oneHour') return addHours(new Date(), 1);
if (when === 'tomorrow') {
  const d = startOfTomorrow();
  d.setHours(9, 0, 0, 0);   // 9 AM
  return d;
}
const d = nextMonday(new Date());
d.setHours(9, 0, 0, 0);
return d;
```

---

### Pattern S9 — User timezone resolution (frontend)

**Source:** `frontend/components/dashboard/widgets/FollowUpWidget.tsx:38` + existing `frontend/hooks/use-user-timezone.ts`
**Apply to:** `TodayDashboard.tsx` (pass `tz` query param to `useTodayFeed`)

```typescript
import { useUserTimezone } from '@/hooks/use-user-timezone';

const timezone = useUserTimezone();   // e.g., 'America/New_York'
const { data } = useTodayFeed({ tz: timezone });
```

This resolves Pitfall 4 (timezone day-boundary drift) from RESEARCH.

---

## Deletion Safety Audit

Performed `frontend`-wide grep on 2026-04-16. Results:

| Component / Module | Importers Found | Safe to Delete? |
|--------------------|-----------------|-----------------|
| `BriefingWidget` | `widget-registry.ts:21`, `BriefingWidget.test.tsx` | YES (only widget registry + own test) |
| `UnreadEmailsWidget` | `widget-registry.ts:24` | YES |
| `DeadlinesWidget` | `widget-registry.ts:27` | YES |
| `FollowUpWidget` | `widget-registry.ts:30` | YES |
| `TodayEventsWidget` | `widget-registry.ts:33` | YES |
| `TrendChartsWidget` | `widget-registry.ts:36` | YES |
| `StaleContactsWidget` | `widget-registry.ts:39`, `StaleContactsWidget.test.tsx` | YES |
| `AiTriageWidget` | `widget-registry.ts:42`, `AiTriageWidget.test.tsx` | YES |
| `BaseWidget` | All deleted widgets above (no other importers) | YES (delete in same wave) |
| `WidgetCard`, `WidgetSkeleton`, `CustomizeDrawer`, `DashboardEmptyState`, `AiQuickAccess` | Only `DashboardContainer.tsx` | YES |
| `CrmSuggestionsFeed` | Only `widget-registry.ts:44-46` (verified — `CrmSuggestionsFeed` string only appears in own definition + widget-registry) | YES — RESEARCH Open Q3 RESOLVED |
| `dashboard-store` | Only `DashboardContainer.tsx:18` | YES |
| `lib/dashboard/widget-registry.ts` (separate file) | No external importers found | YES |
| `lib/dashboard/layout-engine.ts` | Only `frontend/hooks/queries/use-dashboard.ts:22` (type-only `WidgetLayout`, `DashboardLayout`) | YES, but delete the dashboard-preferences hooks first (lines 401-477) to drop the import |
| `frontend/e2e/dashboard.spec.ts` | Tests obsolete customize-drawer + widget-grid flow | DELETE or REWRITE — current assertions (`getByRole('button', { name: /customize/i })`, `MuiSwitch-root`) will fail against the new TodayDashboard |

**Hooks dead after widget deletion** (delete in same wave to avoid orphan exports — verified zero importers outside `widgets/`):
- `useBriefing`, `useTodayEvents`, `useDeadlines`, `useRecentUnreadEmails`, `useTriagedEmails`, `useImportantEmails`, `useStaleContacts`, `useEmailTrends` — all in `frontend/hooks/queries/use-dashboard.ts`
- `useFollowUps` (the dashboard re-export, NOT the canonical `use-follow-ups.ts`) — keep `usePendingFollowUps` and `useSnoozeFollowUp` from `use-follow-ups.ts`; those are still used by other features

**Backend cleanup (deferred per RESEARCH § State of the Art):**
- `PUT/GET /users/me/dashboard-preferences` endpoint becomes unused after frontend cleanup. RESEARCH says defer; the planner should add a note to ROADMAP for a future cleanup phase, not delete it now.

---

## No Analog Found

| File | Why no analog | Mitigation |
|------|---------------|------------|
| Animations using `framer-motion` `<AnimatePresence>` + `layout` prop on a row list | Existing project uses pure CSS transitions or `react-grid-layout`; no `<AnimatePresence>` usage in dashboard-adjacent code | Follow RESEARCH Pattern 4 verbatim. Add a single small example component for reference. Mock `framer-motion` in tests per the test guidance above. |

Everything else has a strong analog.

---

## Metadata

**Analog search scope:**
- `backend/src/modules/{tasks,ai,calendar,crm}/**`
- `frontend/components/dashboard/**`
- `frontend/hooks/queries/**`
- `frontend/lib/{api,context,hooks}/**`
- `frontend/locales/**`

**Files scanned:** ~85 (sampled representative analogs from each cluster).

**Pattern extraction date:** 2026-04-16
**Mapper:** gsd-pattern-mapper
**Source-of-truth confirmation:** All file:line references verified by direct Read against the working copy on `main` branch as of commit `e0aedbbf`.

## PATTERN MAPPING COMPLETE
