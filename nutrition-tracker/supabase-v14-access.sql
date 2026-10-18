-- Run once in Supabase SQL Editor AFTER syncing and downloading a full backup.
-- Existing nutrition_shared rows are retained; a server-side pre-migration copy is also kept.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.nutrition_v14_backup (board_id text primary key,data jsonb not null,revision bigint,created_at timestamptz default now());
insert into public.nutrition_v14_backup(board_id,data,revision) select board_id,data,revision from public.nutrition_shared on conflict do nothing;
create table if not exists public.nutrition_v14_history(board_id text,revision bigint,data jsonb not null,created_at timestamptz default now(),primary key(board_id,revision));
alter table public.nutrition_v14_history enable row level security;
revoke all on public.nutrition_v14_history from public,anon,authenticated;
grant all on public.nutrition_v14_history to service_role;
create table if not exists public.nutrition_access_config(id integer primary key check(id=1),setup_code text not null,initialized boolean not null default false,attempts integer not null default 0,window_at timestamptz not null default now());
insert into public.nutrition_access_config(id,setup_code) values(1,pg_catalog.gen_random_uuid()::text) on conflict do nothing;
create table if not exists public.nutrition_access_accounts(profile_id text primary key,name text unique not null,pin_hash text not null,role text not null check(role in ('admin','member')),failed integer not null default 0,blocked_until timestamptz);
create table if not exists public.nutrition_access_sessions(token_hash text primary key,profile_id text not null references public.nutrition_access_accounts(profile_id),expires_at timestamptz not null);
alter table public.nutrition_v14_backup enable row level security;
alter table public.nutrition_access_config enable row level security;
alter table public.nutrition_access_accounts enable row level security;
alter table public.nutrition_access_sessions enable row level security;
revoke all on public.nutrition_v14_backup,public.nutrition_access_config,public.nutrition_access_accounts,public.nutrition_access_sessions from public,anon,authenticated;
grant all on public.nutrition_v14_backup,public.nutrition_access_config,public.nutrition_access_accounts,public.nutrition_access_sessions to service_role;
create or replace function public.nutrition_gateway(p_action text,p_token text default '',p_payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.nutrition_access_accounts%rowtype; cfg public.nutrition_access_config%rowtype; b public.nutrition_shared%rowtype; token text; prof jsonb; incoming jsonb; target_id text; target_name text; pin text; result jsonb;
begin
 if p_action in ('login','bootstrap') then
  select * into cfg from public.nutrition_access_config where id=1 for update;
  if cfg.window_at<now()-interval '10 minutes' then update public.nutrition_access_config set attempts=0,window_at=now() where id=1;select * into cfg from public.nutrition_access_config where id=1;end if;
  if cfg.attempts>=100 then return jsonb_build_object('error','시도가 많습니다. 10분 후 다시 시도해주세요.');end if;
  update public.nutrition_access_config set attempts=attempts+1 where id=1;
  target_name=btrim(p_payload->>'name');pin=p_payload->>'pin';
  if target_name is null or pin is null or pin!~'^[0-9]{4}$' then return jsonb_build_object('error','이름과 숫자 4자리를 입력해주세요.');end if;
  if p_action='bootstrap' then
   if cfg.initialized or p_payload->>'setupCode' is distinct from cfg.setup_code or target_name<>'조승구' then return jsonb_build_object('error','최초 설정 코드와 관리자 이름을 확인해주세요.');end if;
   select data->'profiles' into result from public.nutrition_shared where board_id='health-shared-v5';
   select value->>'id' into target_id from jsonb_array_elements(result) where value->>'name'='조승구' limit 1;
   if target_id is null then return jsonb_build_object('error','조승구 프로필이 없습니다. 기존 기록을 먼저 확인해주세요.');end if;
   insert into public.nutrition_access_accounts(profile_id,name,pin_hash,role) values(target_id,target_name,extensions.crypt(pin,extensions.gen_salt('bf',10)),'admin');
   update public.nutrition_access_config set initialized=true,setup_code=pg_catalog.gen_random_uuid()::text where id=1;
  end if;
  select * into a from public.nutrition_access_accounts where name=target_name for update;
  if not found then return jsonb_build_object('error','이름 또는 비밀번호를 확인해주세요. 등록은 관리자에게 요청하세요.');end if;
  if a.blocked_until>now() then return jsonb_build_object('error','입력이 반복되어 잠겼습니다. 10분 후 다시 시도해주세요.');end if;
  if extensions.crypt(pin,a.pin_hash)<>a.pin_hash then
   update public.nutrition_access_accounts set failed=case when failed>=4 then 0 else failed+1 end,blocked_until=case when failed>=4 then now()+interval '10 minutes' else null end where profile_id=a.profile_id;
   return jsonb_build_object('error','이름 또는 비밀번호를 확인해주세요.');
  end if;
  update public.nutrition_access_accounts set failed=0,blocked_until=null where profile_id=a.profile_id;
  token=replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-','');
  delete from public.nutrition_access_sessions where expires_at<now();
  insert into public.nutrition_access_sessions values(encode(extensions.digest(token,'sha256'),'hex'),a.profile_id,now()+interval '7 days');
  return jsonb_build_object('token',token,'profileId',a.profile_id,'role',a.role,'name',a.name);
 end if;
 select ac.* into a from public.nutrition_access_sessions s join public.nutrition_access_accounts ac on ac.profile_id=s.profile_id where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and s.expires_at>now();
 if not found then return jsonb_build_object('error','접속이 만료됐습니다. 다시 들어와주세요.','code','SESSION_EXPIRED');end if;
 if p_action='identity' then return jsonb_build_object('profileId',a.profile_id,'role',a.role,'name',a.name);end if;
 if p_action='logout' then delete from public.nutrition_access_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');return '{}'::jsonb;end if;
 select * into b from public.nutrition_shared where board_id='health-shared-v5' for update;
 if not found then return jsonb_build_object('error','기존 공유 기록을 찾지 못했습니다.');end if;
 if p_action='read' then
  if a.role='admin' then result=b.data;else select value into prof from jsonb_array_elements(b.data->'profiles') where value->>'id'=a.profile_id;result=jsonb_build_object('version',5,'profiles',jsonb_build_array(prof));end if;
  return jsonb_build_object('data',result,'revision',b.revision,'user',jsonb_build_object('profileId',a.profile_id,'name',a.name,'role',a.role));
 elsif p_action='save' then
  if (p_payload->>'revision')::bigint is distinct from b.revision then return jsonb_build_object('error','SYNC_CONFLICT');end if;
  incoming=p_payload->'data';
  if incoming->>'version' is distinct from '5' or jsonb_typeof(incoming->'profiles') is distinct from 'array' or jsonb_array_length(incoming->'profiles')<1 then return jsonb_build_object('error','저장 형식 오류');end if;
  if a.role='admin' then
   if not exists(select 1 from jsonb_array_elements(incoming->'profiles') e where e->>'id'=a.profile_id) then return jsonb_build_object('error','관리자 기록을 제거할 수 없습니다.');end if;
   if exists(select 1 from public.nutrition_access_accounts ac where not exists(select 1 from jsonb_array_elements(incoming->'profiles') e where e->>'id'=ac.profile_id)) then return jsonb_build_object('error','등록된 사용자의 프로필은 백업 가져오기로 제거할 수 없습니다.');end if;
   if (select count(*) from jsonb_array_elements(incoming->'profiles'))<>(select count(distinct e->>'name') from jsonb_array_elements(incoming->'profiles') e) then return jsonb_build_object('error','이름은 중복될 수 없습니다.');end if;
   update public.nutrition_access_accounts ac set name=e.value->>'name' from jsonb_array_elements(incoming->'profiles') e where ac.profile_id=e.value->>'id';
   result=incoming;
  else
   if jsonb_array_length(incoming->'profiles')<>1 or incoming->'profiles'->0->>'id' is distinct from a.profile_id then return jsonb_build_object('error','다른 사람의 기록을 수정할 수 없습니다.');end if;
   prof=incoming->'profiles'->0;
   select jsonb_agg(case when value->>'id'=a.profile_id then jsonb_set(value,'{data}',prof->'data') else value end) into result from jsonb_array_elements(b.data->'profiles');
   result=jsonb_set(b.data,'{profiles}',result);
  end if;
  insert into public.nutrition_v14_history(board_id,revision,data) values(b.board_id,b.revision,b.data) on conflict do nothing;
  update public.nutrition_shared set data=result,revision=revision+1,updated_at=now() where board_id=b.board_id;
  return jsonb_build_object('revision',b.revision+1);
 elsif p_action='account' then
  if a.role<>'admin' then return jsonb_build_object('error','관리자 전용입니다.');end if;
  target_name=btrim(p_payload->>'name');pin=p_payload->>'pin';
  if target_name is null or length(target_name)<1 or length(target_name)>100 or pin is null or pin!~'^[0-9]{4}$' then return jsonb_build_object('error','이름과 숫자 4자리 확인');end if;
  select value into prof from jsonb_array_elements(b.data->'profiles') where value->>'name'=target_name limit 1;
  if prof is null then return jsonb_build_object('error','먼저 사람 추가에서 같은 이름의 프로필을 만들어주세요.');end if;
  target_id=prof->>'id';
  if target_id=a.profile_id then return jsonb_build_object('error','본인 비밀번호는 비밀번호 변경을 사용하세요.');end if;
  insert into public.nutrition_access_accounts(profile_id,name,pin_hash,role) values(target_id,target_name,extensions.crypt(pin,extensions.gen_salt('bf',10)),'member') on conflict(profile_id) do update set name=excluded.name,pin_hash=excluded.pin_hash,failed=0,blocked_until=null;
  delete from public.nutrition_access_sessions where profile_id=target_id;return jsonb_build_object('ok',true);
 elsif p_action='changePin' then
  pin=p_payload->>'pin';if pin is null or pin!~'^[0-9]{4}$' or extensions.crypt(p_payload->>'oldPin',a.pin_hash) is distinct from a.pin_hash then return jsonb_build_object('error','기존 비밀번호와 새 숫자 4자리를 확인해주세요.');end if;
  update public.nutrition_access_accounts set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf',10)) where profile_id=a.profile_id;
  delete from public.nutrition_access_sessions where profile_id=a.profile_id and token_hash<>encode(extensions.digest(p_token,'sha256'),'hex');return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','지원하지 않는 요청');
end;$$;
revoke all on function public.nutrition_gateway(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nutrition_gateway(text,text,jsonb) to service_role;
grant select,update on public.nutrition_shared to service_role;
-- Remove the old shared public API. No row or photo is deleted.
drop policy if exists shared_board_access on public.nutrition_shared;
revoke all on public.nutrition_shared from public,anon,authenticated;
revoke execute on function public.save_nutrition_shared(text,jsonb,bigint) from public,anon,authenticated;
drop policy if exists meal_photos_read on storage.objects;
drop policy if exists meal_photos_write on storage.objects;
notify pgrst,'reload schema';
commit;
select setup_code as administrator_setup_code from public.nutrition_access_config where id=1 and initialized=false;
