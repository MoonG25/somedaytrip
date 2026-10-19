-- 링크 새로 만들기: 계획 id가 바뀌면 비밀·제안·기록도 함께 따라가게 (ON UPDATE CASCADE)
alter table plan_secrets drop constraint if exists plan_secrets_plan_id_fkey,
  add constraint plan_secrets_plan_id_fkey foreign key (plan_id) references plans (id) on delete cascade on update cascade;
alter table proposals drop constraint if exists proposals_plan_id_fkey,
  add constraint proposals_plan_id_fkey foreign key (plan_id) references plans (id) on delete cascade on update cascade;
alter table plan_history drop constraint if exists plan_history_plan_id_fkey,
  add constraint plan_history_plan_id_fkey foreign key (plan_id) references plans (id) on delete cascade on update cascade;
