-- Additive Gemini cache/quota only. Never modifies existing health records.
create table if not exists public.nutrition_coach_cache(
 profile_id text not null, fingerprint text not null, feedback jsonb,
 created_at timestamptz not null default now(), locked_until timestamptz,
 primary key(profile_id,fingerprint)
);
create table if not exists public.nutrition_coach_usage(day date primary key, attempts integer not null default 0);
alter table public.nutrition_coach_cache enable row level security;
alter table public.nutrition_coach_usage enable row level security;
revoke all on public.nutrition_coach_cache,public.nutrition_coach_usage from anon,authenticated;
-- Reservation runs as the function owner, but REST result writes run as service_role.
grant select, update on table public.nutrition_coach_cache to service_role;
create or replace function public.nutrition_coach_reserve(p_profile text,p_hash text,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.nutrition_coach_cache; n integer; usage_day date := (now() at time zone 'Asia/Seoul')::date;
begin
 perform pg_advisory_xact_lock(hashtext('nutrition-coach-global'));
 select * into c from public.nutrition_coach_cache where profile_id=p_profile and fingerprint=p_hash;
 if c.feedback is not null then return jsonb_build_object('status','cached','feedback',c.feedback,'createdAt',c.created_at);end if;
 if c.locked_until>now() then return jsonb_build_object('status','busy');end if;
 insert into public.nutrition_coach_usage(day,attempts) values(usage_day,0) on conflict do nothing;
 update public.nutrition_coach_usage set attempts=attempts+1 where day=usage_day and attempts<least(100,greatest(1,p_limit)) returning attempts into n;
 if n is null then return jsonb_build_object('status','quota');end if;
 insert into public.nutrition_coach_cache(profile_id,fingerprint,locked_until) values(p_profile,p_hash,now()+interval '100 seconds')
 on conflict(profile_id,fingerprint) do update set locked_until=excluded.locked_until;
 return jsonb_build_object('status','reserved');
end $$;
revoke all on function public.nutrition_coach_reserve(text,text,integer) from public,anon,authenticated;
grant execute on function public.nutrition_coach_reserve(text,text,integer) to service_role;
