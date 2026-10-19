// 저장소 고르기: DATABASE_URL이 있으면 Supabase Postgres, 없으면 개발용 JSON 파일.
// 개발 서버가 모듈을 다시 불러와도 하나만 쓰도록 전역에 둔다.
import 'server-only';
import { FileRepo, type Repo } from './repo';
import { PgRepo } from './pg-repo';

declare global {
  var __sdtRepo: Repo | undefined;
}

export function repo(): Repo {
  globalThis.__sdtRepo ??= process.env.DATABASE_URL ? new PgRepo(process.env.DATABASE_URL) : new FileRepo(process.env.SDT_DATA_DIR || undefined);
  return globalThis.__sdtRepo;
}

export { RepoError, isRepoError } from './repo';
