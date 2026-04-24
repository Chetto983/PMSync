import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Defense-in-depth guard: block destructive prisma subcommands when
// DATABASE_URL points at a Railway production host. Covers `npx prisma …`
// invocations that bypass package.json predb:* hooks.
// Railway's own startup uses `prisma migrate deploy`, which is allowed.
(function preflight(): void {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const PROD_HOST_PATTERNS = [/rlwy\.net$/i, /railway\.app$/i, /ballast\.proxy/i];
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (!PROD_HOST_PATTERNS.some((p) => p.test(host))) return;

  const argv = process.argv.slice(2).join(' ');
  const DANGEROUS = [
    /\bmigrate\s+dev\b/,
    /\bmigrate\s+reset\b/,
    /\bdb\s+push\b/,
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
