-- Supabase → SQL Editor → New query → paste this file → Run.
begin;
create table if not exists public.nutrition_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.nutrition_accounts enable row level security;
revoke all on public.nutrition_accounts from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.nutrition_accounts to authenticated;
drop policy if exists nutrition_owner on public.nutrition_accounts;
create policy nutrition_owner on public.nutrition_accounts for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function public.save_nutrition(p_data jsonb, p_revision bigint)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_revision bigint;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
 if jsonb_typeof(p_data) <> 'object' or p_data->>'version' <> '1' then raise exception 'INVALID_DATA'; end if;
 if p_revision = 0 then
  insert into public.nutrition_accounts(user_id,data,revision)
   values (auth.uid(),p_data,1) on conflict (user_id) do nothing returning revision into next_revision;
 else
  update public.nutrition_accounts set data=p_data, revision=revision+1, updated_at=now()
   where user_id=auth.uid() and revision=p_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'SYNC_CONFLICT'; end if;
 return next_revision;
end; $$;
revoke execute on function public.save_nutrition(jsonb,bigint) from public,anon;
grant execute on function public.save_nutrition(jsonb,bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
