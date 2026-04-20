import pg from 'pg';
const url = process.env.DATABASE_PUBLIC_URL;
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const TARGET_TENANT = 'cmngk6g1j000001pbf8xh2b3h';

console.log('=== BEFORE ===');
const before = await c.query(
  `SELECT id, email, role, "tenantId" FROM users WHERE "tenantId" = $1 ORDER BY email`,
  [TARGET_TENANT],
);
console.log(JSON.stringify(before.rows.map(r => ({ ...r, email: r.email.replace(/^(.).*@/, '$1***@') })), null, 2));

// Pick the admin (not super-admin, not user) to promote
const target = before.rows.find(r => r.role === 'admin');
if (!target) {
  console.error('No admin found in target tenant');
  process.exit(1);
}

console.log(`\nPromoting userId=${target.id} from 'admin' → 'super-admin' ...`);
const upd = await c.query(
  `UPDATE users SET role = 'super-admin', "updatedAt" = NOW() WHERE id = $1 AND role = 'admin' RETURNING id, email, role`,
  [target.id],
);
console.log('UPDATED rows:', upd.rowCount);
console.log(JSON.stringify(upd.rows.map(r => ({ ...r, email: r.email.replace(/^(.).*@/, '$1***@') })), null, 2));

console.log('\n=== AFTER ===');
const after = await c.query(
  `SELECT id, email, role, "tenantId" FROM users WHERE "tenantId" = $1 ORDER BY email`,
  [TARGET_TENANT],
);
console.log(JSON.stringify(after.rows.map(r => ({ ...r, email: r.email.replace(/^(.).*@/, '$1***@') })), null, 2));

console.log('\nREVERT SQL (save this): UPDATE users SET role = \'admin\' WHERE id = \'' + target.id + '\';');

await c.end();
