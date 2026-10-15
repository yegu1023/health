-- v5 공동 관리 전용. 로그인 없이 접속자가 모든 프로필을 조회/수정합니다.
-- 기존 nutrition_accounts와 v4 로그인 기록은 변경/삭제하지 않습니다.
begin;
create table if not exists public.nutrition_shared (
 board_id text primary key,
 data jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.nutrition_shared enable row level security;
grant usage on schema public to anon, authenticated;
grant select,insert,update on public.nutrition_shared to anon,authenticated;
drop policy if exists shared_board_access on public.nutrition_shared;
create policy shared_board_access on public.nutrition_shared for all to anon,authenticated
 using (board_id='health-shared-v5') with check (board_id='health-shared-v5');
create or replace function public.save_nutrition_shared(p_board text,p_data jsonb,p_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare next_revision bigint;
begin
 if p_board <> 'health-shared-v5' or p_board is null then raise exception 'INVALID_BOARD'; end if;
 if p_data is null or p_data->>'version' is distinct from '5' or jsonb_typeof(p_data->'profiles') is distinct from 'array' then raise exception 'INVALID_DATA'; end if;
 if p_revision=0 then
 insert into public.nutrition_shared(board_id,data,revision) values(p_board,p_data,1)
 on conflict(board_id) do nothing returning revision into next_revision;
 else
 update public.nutrition_shared set data=p_data,revision=revision+1,updated_at=now()
 where board_id=p_board and revision=p_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'SYNC_CONFLICT'; end if;
 return next_revision;
end; $$;
revoke execute on function public.save_nutrition_shared(text,jsonb,bigint) from public;
grant execute on function public.save_nutrition_shared(text,jsonb,bigint) to anon,authenticated;
notify pgrst,'reload schema';
commit;
