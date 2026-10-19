// 마이그레이션 적용: node --env-file=.env.local scripts/migrate.mjs  (적용한 파일은 _migrations에 기록해서 다시 돌리지 않는다)
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
await sql`create table if not exists _migrations (name text primary key, at timestamptz default now())`;
await sql`alter table _migrations enable row level security`;
await sql.unsafe('revoke all on _migrations from anon, authenticated');
const done = new Set((await sql`select name from _migrations`).map((r) => r.name));
for (const f of readdirSync('supabase/migrations').sort()) {
  if (done.has(f)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    await tx`insert into _migrations (name) values (${f}) on conflict do nothing`;
  });
  console.log('applied', f);
}
await sql.end();
