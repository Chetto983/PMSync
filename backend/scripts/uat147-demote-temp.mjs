import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const target = 'N2yTFNmu3YAOJOYdY2wSs4guBtbHCr3l';
const action = process.argv[2]; // 'admin' or 'super-admin'
if (!['admin', 'super-admin'].includes(action)) { console.error('arg must be admin or super-admin'); process.exit(1); }
const r = await c.query(`UPDATE users SET role = $1 WHERE id = $2 RETURNING id, role`, [action, target]);
console.log('UPDATED=', r.rowCount);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
