import { readFileSync } from 'node:fs';
import { Client } from 'pg';
const raw = readFileSync('.env.local', 'utf8');
let url = '';
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq <= 0) continue;
  if (t.slice(0, eq).trim() === 'DATABASE_URL') url = t.slice(eq + 1).trim().replace(/^"|"$/g, '');
}
const c = new Client({ connectionString: url });
await c.connect();
const r = await c.query("SELECT count(*)::int n, count(*) FILTER (WHERE is_free) free, count(*) FILTER (WHERE NOT is_free) paid FROM events");
console.log('events:', JSON.stringify(r.rows[0]));
const r2 = await c.query("SELECT id, source, message, created_at FROM scan_errors ORDER BY id DESC LIMIT 1");
if (r2.rows[0]) console.log('último scan_error:', r2.rows[0].id, '|', String(r2.rows[0].message).slice(0, 90), '|', r2.rows[0].created_at);
else console.log('último scan_error: nenhum');
const r3 = await c.query("SELECT id, title, is_free, min_price, city, uf FROM events ORDER BY id DESC LIMIT 8");
console.log('linhas:');
for (const row of r3.rows) console.log(`  #${row.id} ${row.title} | free=${row.is_free} R$${row.min_price} | ${row.city}-${row.uf}`);
await c.end();