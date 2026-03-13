/**
 * Jest globalSetup: runs Prisma migrations and seeds the test database.
 * DATABASE_URL is loaded from .env.test by dotenv-cli before Jest starts.
 */
import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  try {
    console.log('[test:setup] Running prisma migrate deploy...');
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      cwd: __dirname + '/..',
    });

    console.log('[test:setup] Running prisma db seed...');
    execSync('npx prisma db seed', {
      stdio: 'inherit',
      cwd: __dirname + '/..',
    });

    console.log('[test:setup] Test database ready.');
  } catch (error) {
    console.error(
      '[test:setup] Test DB setup failed. Did you run `npm run test:docker:up`?',
    );
    throw error;
  }

  // Generate OpenAPI spec for contract tests (non-blocking — needs full NestJS app)
  try {
    console.log('[test:setup] Generating OpenAPI spec...');
    execSync('npm run openapi:generate', {
      stdio: 'inherit',
      cwd: __dirname + '/..',
    });
    console.log('[test:setup] OpenAPI spec generated.');
  } catch {
    console.log(
      '[test:setup] OpenAPI spec generation skipped (app bootstrap failed). Contract tests will skip.',
    );
  }
}
