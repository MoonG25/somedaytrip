// 저장소 고르기: DATABASE_URL이 있으면 Supabase Postgres, 없으면 개발용 JSON 파일.
// 개발 서버가 모듈을 다시 불러와도 하나만 쓰도록 전역에 둔다.
import 'server-only';
import { FileRepo, type Repo } from './repo';
import { PgRepo } from './pg-repo';
import { FileUserStore, type BaseUserStore } from './users';
import { PgUserStore } from './users-pg';

declare global {
  var __sdtRepo: Repo | undefined;
  var __sdtUsers: BaseUserStore | undefined;
}

export function repo(): Repo {
  // 개발 중 저장소 코드를 고치면 클래스가 새로 생긴다. 예전 클래스로 만든 것은 버리고 다시 만든다
  const cur = globalThis.__sdtRepo;
  if (cur && !(cur instanceof FileRepo) && !(cur instanceof PgRepo)) globalThis.__sdtRepo = undefined;
  globalThis.__sdtRepo ??= process.env.DATABASE_URL ? new PgRepo(process.env.DATABASE_URL) : new FileRepo(process.env.SDT_DATA_DIR || undefined);
  return globalThis.__sdtRepo;
}

/** 계정 저장소 (선택 가입) */
export function users(): BaseUserStore {
  const cur = globalThis.__sdtUsers;
  if (cur && !(cur instanceof FileUserStore) && !(cur instanceof PgUserStore)) globalThis.__sdtUsers = undefined;
  globalThis.__sdtUsers ??= process.env.DATABASE_URL ? new PgUserStore(process.env.DATABASE_URL) : new FileUserStore(process.env.SDT_DATA_DIR || undefined);
  return globalThis.__sdtUsers;
}

export { RepoError, isRepoError } from './repo';
