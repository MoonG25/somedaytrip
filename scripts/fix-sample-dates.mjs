// 예시 계획 중 지난 출발일을 samples.js 값으로 맞춘다: node --env-file=.env.local scripts/fix-sample-dates.mjs
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const r = await sql`update plans set info = jsonb_set(info, '{target}', '"2027-11-19"') where id = 'kyoto-autumn-plan' and sample returning id, info->>'target' as target`;
console.log(r);
await sql.end();
