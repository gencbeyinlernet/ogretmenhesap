-- TÜBİTAK proje sihirbazı: ana kurulumdan sonra bir kez çalıştırın. Yeniden çalıştırılabilir.
begin;
create table if not exists public.od_projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.od_profiles(id) on delete cascade,
 title text not null default 'Yeni proje' check(length(title) between 1 and 180),
 report jsonb not null default '{}'::jsonb check(jsonb_typeof(report)='object' and octet_length(report::text)<=400000),
 revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists od_projects_owner_updated on public.od_projects(owner_id,updated_at desc);
create or replace function od_private.project_stamp() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now();new.revision=old.revision+1;return new;end $$;
revoke all on function od_private.project_stamp() from public;
drop trigger if exists od_project_stamp on public.od_projects;
create trigger od_project_stamp before update on public.od_projects for each row execute function od_private.project_stamp();
alter table public.od_projects enable row level security;
revoke all on public.od_projects from anon,authenticated;
grant select,delete on public.od_projects to authenticated;
grant insert(id,owner_id,title,report),update(title,report) on public.od_projects to authenticated;
drop policy if exists od_project_read on public.od_projects;
create policy od_project_read on public.od_projects for select to authenticated using(owner_id=(select auth.uid()) or (select od_private.is_teacher()));
drop policy if exists od_project_insert on public.od_projects;
create policy od_project_insert on public.od_projects for insert to authenticated with check(owner_id=(select auth.uid()));
drop policy if exists od_project_update on public.od_projects;
create policy od_project_update on public.od_projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists od_project_delete on public.od_projects;
create policy od_project_delete on public.od_projects for delete to authenticated using(owner_id=(select auth.uid()));
create table if not exists od_private.project_ai_usage(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.od_profiles(id) on delete cascade,created_at timestamptz not null default now());
create index if not exists od_project_usage_user_time on od_private.project_ai_usage(user_id,created_at desc);
alter table od_private.project_ai_usage enable row level security;
revoke all on od_private.project_ai_usage from public,anon,authenticated;
create or replace function public.od_reserve_project_ai_request() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.od_profiles where id=auth.uid()) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from od_private.project_ai_usage where user_id=auth.uid() and created_at>now()-interval '1 minute')>=3 or (select count(*) from od_private.project_ai_usage where user_id=auth.uid() and created_at>now()-interval '1 day')>=20 then return false;end if;
 insert into od_private.project_ai_usage(user_id) values(auth.uid());return true;
end $$;
revoke all on function public.od_reserve_project_ai_request() from public,anon;
grant execute on function public.od_reserve_project_ai_request() to authenticated;
notify pgrst,'reload schema';
commit;
