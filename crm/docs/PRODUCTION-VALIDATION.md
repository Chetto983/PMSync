# CRM Production Validation

MANDATORY at sprint end. A sprint is not done until production passes.

## Push & Deploy
```bash
git push origin main
```
Wait for Railway (backend) and Vercel (frontend) to pick up the new commit.

## Backend Validation (Railway)
```bash
# Health check
curl -s -w "\nHTTP %{http_code}" https://backend-production-78e1.up.railway.app/health

# Hit new CRM endpoints (expect 401 = route exists, auth guard works)
curl -s -w "\nHTTP %{http_code}" https://backend-production-78e1.up.railway.app/api/v1/crm/<new-resource>

# Check Railway logs for startup errors
railway logs -n 20
```

**Expected results:**
- `/health` → 200
- New endpoints → 401 (unauthenticated) or 200 (if public)
- No crash loops or import errors in logs
- If 404 on new endpoints, deployment hasn't rolled yet — wait and retry (max 3 min)

## Browser Validation (Edge DevTools — PRIMARY method)

Use Playwright connected to Edge Default profile via CDP to validate the real UI with real auth cookies.

```bash
# Run the CRM production validation script
node scripts/validate-crm-production.mjs

# Or against localhost
APP_URL=http://localhost:3001 node scripts/validate-crm-production.mjs
```

**Prerequisites:**
- Edge must be running with `--remote-debugging-port=9222` (script auto-launches if not)
- User must be logged in to PMSync on Edge Default profile
- Playwright installed: `npx playwright install chromium`

**What it validates:**
- Page navigation succeeds (no auth redirect = real session)
- Page title, buttons, search field render correctly
- API calls to `/api/v1/crm/*` return 200
- Dialogs open and contain expected form fields
- Screenshots saved to `scripts/screenshots/` for visual review

**After the script runs, visually inspect the screenshots** using the Read tool on the PNG files. Check:
- Layout looks correct, no broken CSS
- Translations render in the correct locale
- Empty states show proper messaging
- Dialogs have all expected fields

## Mobile Validation
Navigate to each new/modified page at 375x812 viewport via CDP and screenshot:
```javascript
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'scripts/screenshots/<page>_mobile.png', fullPage: true });
```
Check:
- Fields don't overflow or get cut off
- Touch targets are large enough (min 44px)
- Selects open properly on narrow viewport
- No horizontal scroll on main content
- Grid columns stack to full width
- Compare against `crm/docs/UI-DESIGN-SYSTEM.md` for consistency

## Fallback: curl Validation (if Edge not available)
```bash
curl -s -o /dev/null -w "%{http_code}" https://mail-agent-indol.vercel.app/dashboard/crm/<new-page>
```
New pages → 307 (auth redirect) or 200. No build errors on Vercel.

## Report Production Status
Add to the session summary:
```
Production Validation
- Railway: /api/v1/crm/<resource> → 401 (route registered, auth guard active)
- Browser: Page renders, API 200, dialog works (screenshots reviewed)
- Logs: No startup errors
```

## If Production Fails
- Check `railway logs` for error details
- If build fails: fix locally, commit, push, re-validate
- If runtime crash: check for missing env vars or DB schema drift
- If browser validation fails: inspect screenshot, check console errors
- Do NOT close the sprint until production passes
