begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('meal-photos','meal-photos',false,2097152,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];
drop policy if exists meal_photos_read on storage.objects;
drop policy if exists meal_photos_write on storage.objects;
create policy meal_photos_read on storage.objects for select to anon,authenticated
using(bucket_id='meal-photos' and (storage.foldername(name))[1]='health-shared-v5');
create policy meal_photos_write on storage.objects for insert to anon,authenticated
with check(bucket_id='meal-photos' and (storage.foldername(name))[1]='health-shared-v5');
-- API call budget: accessible only by the server service role.
create table if not exists public.meal_ai_usage(day date primary key,calls integer not null default 0);
alter table public.meal_ai_usage enable row level security;
revoke all on public.meal_ai_usage from public,anon,authenticated;
grant select,insert,update on public.meal_ai_usage to service_role;
create or replace function public.reserve_meal_ai(p_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare allowed boolean;
begin
 if p_limit<1 or p_limit>100 then return false; end if;
 insert into public.meal_ai_usage(day,calls) values((now() at time zone 'Asia/Seoul')::date,1)
 on conflict(day) do update set calls=public.meal_ai_usage.calls+1
 where public.meal_ai_usage.calls<p_limit returning true into allowed;
 return coalesce(allowed,false);
end; $$;
revoke execute on function public.reserve_meal_ai(integer) from public,anon,authenticated;
grant execute on function public.reserve_meal_ai(integer) to service_role;
notify pgrst,'reload schema';
commit;
