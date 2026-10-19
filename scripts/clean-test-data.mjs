// 테스트로 만든 계획 지우기 (예시 계획은 남긴다): node --env-file=.env.local scripts/clean-test-data.mjs
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const del = await sql`delete from plans where not sample returning id`;
// 예시 계획에 남은 테스트 제안·기록도 지운다
await sql`delete from proposals where plan_id in (select id from plans where sample)`;
await sql`delete from plan_history where plan_id in (select id from plans where sample) and kind <> 'created'`;
console.log('deleted', del.length, 'plans');
await sql.end();
