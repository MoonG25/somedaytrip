// 마이그레이션 적용: node --env-file=.env.local scripts-migrate.mjs
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
for (const f of readdirSync('supabase/migrations').sort()) {
  await sql.unsafe(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  console.log('applied', f);
}
const t = await sql`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1`;
console.log(t.map((r) => `${r.tablename} rls=${r.rowsecurity}`).join('\n'));
await sql.end();
