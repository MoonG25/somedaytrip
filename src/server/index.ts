// 저장소 고르기: DATABASE_URL이 있으면 Supabase Postgres, 없으면 개발용 JSON 파일.
// 개발 서버가 모듈을 다시 불러와도 하나만 쓰도록 전역에 둔다.
import 'server-only';
import { FileRepo, type Repo } from './repo';
import { PgRepo } from './pg-repo';

declare global {
  var __sdtRepo: Repo | undefined;
}

export function repo(): Repo {
  // 개발 중 저장소 코드를 고치면 클래스가 새로 생긴다. 예전 클래스로 만든 것은 버리고 다시 만든다
  const cur = globalThis.__sdtRepo;
  if (cur && !(cur instanceof FileRepo) && !(cur instanceof PgRepo)) globalThis.__sdtRepo = undefined;
  globalThis.__sdtRepo ??= process.env.DATABASE_URL ? new PgRepo(process.env.DATABASE_URL) : new FileRepo(process.env.SDT_DATA_DIR || undefined);
  return globalThis.__sdtRepo;
}

export { RepoError, isRepoError } from './repo';
