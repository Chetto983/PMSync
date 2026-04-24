#!/bin/sh
# Production startup script for Railway container.
#
# Flow:
#   1. Apply pending migrations (npx prisma migrate deploy — non-destructive).
#   2. Check for residual drift between live DB and schema.prisma (Guard F).
#      - 0 drift  -> log "in sync" and start the app.
#      - drift detected -> log the SQL, then:
#          * if ALLOW_RUNTIME_DRIFT=yes -> warn loudly, start anyway.
#          * else -> exit 1 (deploy rolls back, prod stays on last healthy).
#   3. Start the Nest app.
#
# Rationale: the 2026-04-01 drift (missing 3 Reminder columns) silently broke
# the reminder-alert-check cron for 23 days because nothing on startup noticed
# the mismatch. Failing fast on drift catches the class of bug where
# schema.prisma was edited without a corresponding migration.

set -e

echo "[startup] prisma migrate deploy"
npx prisma migrate deploy

echo "[startup] schema drift check"
# --exit-code: 0 empty, 2 non-empty, 1 error. --script prints SQL if non-empty.
DRIFT_SQL=$(npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code \
  --script 2>&1) && DRIFT_RC=0 || DRIFT_RC=$?

if [ "$DRIFT_RC" = "0" ]; then
  echo "[startup] schema in sync with migrations — OK"
elif [ "$DRIFT_RC" = "2" ]; then
  echo "[startup] ==============================================================="
  echo "[startup] SCHEMA DRIFT DETECTED between live DB and schema.prisma:"
  echo "$DRIFT_SQL"
  echo "[startup] ==============================================================="
  if [ "${ALLOW_RUNTIME_DRIFT:-}" = "yes" ]; then
    echo "[startup] WARNING: booting anyway because ALLOW_RUNTIME_DRIFT=yes"
  else
    echo "[startup] FATAL: refusing to boot with schema drift."
    echo "[startup]   Fix: generate a migration for the missing schema changes,"
    echo "[startup]         or set ALLOW_RUNTIME_DRIFT=yes to boot anyway."
    exit 1
  fi
else
  # Diff tool itself errored — don't block boot on tooling issues.
  echo "[startup] WARNING: drift check tooling errored (rc=$DRIFT_RC); continuing."
  echo "$DRIFT_SQL"
fi

echo "[startup] launching app"
exec node dist/main
