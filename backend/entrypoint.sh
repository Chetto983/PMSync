#!/bin/sh
set -e

# Build DATABASE_URL from environment variables
export DATABASE_URL="postgresql://${DB_USER:-mailuser}:${DB_PASSWORD:-mailpass}@${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-mailagent}"

echo "Waiting for database to be ready..."
# Simple retry loop to wait for database
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  if nc -z ${DB_HOST:-localhost} ${DB_PORT:-5432} 2>/dev/null; then
    echo "Database is ready!"
    break
  fi
  echo "Attempt $attempt/$max_attempts: Database not ready yet, waiting..."
  sleep 1
  attempt=$((attempt + 1))
done

if [ "${NODE_ENV}" = "production" ] || [ "${RAILWAY_ENVIRONMENT}" = "production" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy
  echo "Skipping seed in production."
else
  # Destructive branch removed 2026-04-20 after 2nd prod wipe.
  # Caused the wipe: prisma db push --skip-generate + prisma db seed ran against prod.
  # For local dev, run migrations/seed manually and ONLY with a local DATABASE_URL.
  echo "FATAL: non-production branch disabled. Do NOT run entrypoint.sh directly for dev."
  echo "For local dev use: npx prisma migrate dev && npx prisma db seed (local DB only)."
  exit 1
fi

echo "Starting application..."
exec npm run start:prod
