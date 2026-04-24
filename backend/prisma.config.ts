import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Defense-in-depth guard: block destructive prisma subcommands when
// DATABASE_URL points at a Railway production host. Covers `npx prisma …`
// invocations that bypass package.json predb:* hooks.
// Railway's own startup uses `prisma migrate deploy`, which is allowed.
(function preflight(): void {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const argv = process.argv.slice(2).join(' ');

  // Universal guard: prisma db push bypasses migrations and is the root cause
  // of the 38-orphan-table drift that broke reminders for 23 days. Block it
  // on ANY database (local, dev, prod). Users who truly know what they're
  // doing (e.g., spinning up a throwaway sandbox) set ALLOW_DB_PUSH=yes.
  if (/\bdb\s+push\b/.test(argv)) {
    if ((process.env.ALLOW_DB_PUSH || '').toLowerCase() === 'yes') {
      // eslint-disable-next-line no-console
      console.warn(
        `\n[prisma-preflight] WARNING: 'db push' permitted because ALLOW_DB_PUSH=yes. Schema changes should normally go through 'migrate dev'.\n`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(
        [
          '',
          '='.repeat(72),
          '[prisma-preflight] BLOCKED — prisma db push is disabled project-wide.',
          '',
          '  db push syncs schema.prisma to the DB WITHOUT creating a migration',
          '  file. On deploy, Railway has nothing to apply, and prod DB drifts',
          '  from the compiled Prisma Client. This caused 23 days of broken',
          '  reminders (commit 55e3d1a2, 2026-04-01) and built up 38 orphan',
          '  tables across the CRM/ticketing/KB modules.',
          '',
          '  Correct workflow:',
          '    npx prisma migrate dev --name <what-you-changed>',
          '  (creates a migration file; commit it alongside schema.prisma)',
          '',
          '  Escape hatch for throwaway sandboxes: set ALLOW_DB_PUSH=yes.',
          '='.repeat(72),
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
  }

  // Prod-only guard: block remaining destructive-capable commands when
  // DATABASE_URL points at a Railway production host.
  const PROD_HOST_PATTERNS = [/rlwy\.net$/i, /railway\.app$/i, /ballast\.proxy/i];
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (!PROD_HOST_PATTERNS.some((p) => p.test(host))) return;

  const DANGEROUS = [
    /\bmigrate\s+dev\b/,
    /\bmigrate\s+reset\b/,
    /\bdb\s+seed\b/,
    /\bdb\s+execute\b/,
  ];
  if (!DANGEROUS.some((p) => p.test(argv))) return;

  if ((process.env.ALLOW_PROD_DB_OP || '').toLowerCase() === 'yes') {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[prisma-preflight] WARNING: '${argv}' running against PROD host '${host}' because ALLOW_PROD_DB_OP=yes.\n`,
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.error(
    [
      '',
      '='.repeat(72),
      '[prisma-preflight] BLOCKED — destructive prisma command on PRODUCTION.',
      `  host:    ${host}`,
      `  command: prisma ${argv}`,
      '',
      '  Previous wipes (2026-04-01, 2026-04-20, 2026-04-24) all followed a local',
      '  prisma command against this host. Refusing to continue.',
      '',
      '  Point DATABASE_URL at a local Postgres, or set ALLOW_PROD_DB_OP=yes',
      '  if you have confirmed this is intentional.',
      '='.repeat(72),
      '',
    ].join('\n'),
  );
  process.exit(1);
})();

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    migrations: 'prisma/migrations',
    seed: 'npx ts-node prisma/seed.ts',
  },
});
