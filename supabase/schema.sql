-- Öğretmen Defteri — Supabase SQL Editor içinde tek seferde çalıştırın.
-- SQL düğmesi öğretmen parolasını yalnızca kopyalanan metne ekler.
-- Tekrar çalıştırmak mevcut öğretmenin parolasını veya verileri değiştirmez.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists od_private;
revoke all on schema od_private from public;
grant usage on schema od_private to authenticated;

create table if not exists public.od_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
 role text not null default 'student' check(role in ('teacher','student')),
 display_name text not null default '' check(length(display_name)<=120),
 bio text not null default '' check(length(bio)<=3000),
 school text not null default '' check(length(school)<=160),
 class_name text not null default '' check(length(class_name)<=80),
 created_at timestamptz not null default now(),
 check ((role='teacher' and username='burakturgut') or (role='student' and username<>'burakturgut'))
);
create unique index if not exists od_one_teacher on public.od_profiles(role) where role='teacher';
create or replace function od_private.is_teacher() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.od_profiles where id=(select auth.uid()) and role='teacher');
$$;
revoke all on function od_private.is_teacher() from public;
grant execute on function od_private.is_teacher() to authenticated;

create table if not exists public.od_teacher_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.od_profiles(id),
 kind text not null check(kind in ('annual','module','activity','note','plan')),
 title text not null check(length(trim(title)) between 1 and 180),
 body text not null default '' check(length(body)<=20000),
 scheduled_date date, scheduled_time time,
 created_at timestamptz not null default now()
);
create table if not exists public.od_assignments (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references public.od_profiles(id),
 title text not null check(length(trim(title)) between 1 and 180),
 description text not null default '' check(length(description)<=20000),
 due_date date not null, created_at timestamptz not null default now()
);
create table if not exists public.od_assignment_recipients (
 assignment_id uuid not null references public.od_assignments(id) on delete cascade,
 student_id uuid not null references public.od_profiles(id) on delete cascade,
 primary key(assignment_id, student_id)
);
create table if not exists public.od_submissions (
 assignment_id uuid not null, student_id uuid not null,
 content text not null check(length(trim(content)) between 1 and 20000),
 status text not null default 'submitted' check(status in ('submitted','graded','returned')),
 score integer check(score between 0 and 100), feedback text not null default '' check(length(feedback)<=5000),
 submitted_at timestamptz not null default now(), reviewed_at timestamptz,
 primary key(assignment_id,student_id),
 foreign key(assignment_id,student_id) references public.od_assignment_recipients(assignment_id,student_id) on delete cascade
);
create table if not exists public.od_messages (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.od_profiles(id),
 recipient_id uuid not null references public.od_profiles(id),
 body text not null check(length(trim(body)) between 1 and 5000),
 created_at timestamptz not null default now(), check(sender_id<>recipient_id)
);
create index if not exists od_message_pair_time on public.od_messages(sender_id,recipient_id,created_at desc);
create index if not exists od_message_recipient on public.od_messages(recipient_id,created_at desc);
create table if not exists public.od_activity_log (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.od_profiles(id),
 event_type text not null check(event_type in ('login','page','game','resource')),
 label text not null check(length(label) between 1 and 250),
 url text check(length(url)<=2000), score integer check(score between 0 and 100),
 created_at timestamptz not null default now()
);
create index if not exists od_activity_student_time on public.od_activity_log(student_id,created_at desc);
create table if not exists public.od_point_awards (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.od_profiles(id),
 awarded_by uuid not null references public.od_profiles(id),
 points integer not null check(points between 1 and 1000),
 reason text not null check(length(trim(reason)) between 1 and 500), created_at timestamptz not null default now()
);
create table if not exists public.od_resources (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.od_profiles(id),
 title text not null check(length(trim(title)) between 1 and 180),
 url text not null check(url ~ '^https://[^[:space:]]+$' and length(url)<=2000),
 kind text not null check(kind in ('game','site')), created_at timestamptz not null default now()
);

-- Öğretmen hesabı sadece SQL Editor yetkisiyle oluşturulur; kayıt formu öğretmen yaratamaz.
-- Parola kaynak dosyalarda bulunmaz. SQL paneline istenen başlangıç parolasını girin.
do $$
declare
 teacher_id uuid;
 teacher_email text := 'burakturgut@login.ogretmendefteri.invalid';
 teacher_password text := '__TEACHER_PASSWORD__';
begin
 if not exists(select 1 from public.od_profiles where role='teacher') then
  if teacher_password = '__TEACHER_' || 'PASSWORD__' or length(teacher_password)<6 then
   raise exception 'SQL paneline en az 6 karakterli öğretmen başlangıç parolasını girin.';
  end if;
  if exists(select 1 from auth.users where email=teacher_email) then
   raise exception 'Öğretmen e-posta kimliği zaten var. Mevcut hesabı incelemeden üzerine yazılmaz.';
  end if;
  teacher_id := gen_random_uuid();
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000',teacher_id,'authenticated','authenticated',teacher_email,
   extensions.crypt(teacher_password,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',
   '{"username":"burakturgut"}',now(),now(),'','','','','','');
  insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at)
  values (gen_random_uuid(),teacher_id,teacher_id::text,jsonb_build_object('sub',teacher_id::text,'email',teacher_email,'email_verified',true),'email',now(),now());
  insert into public.od_profiles(id,username,role,display_name) values(teacher_id,'burakturgut','teacher','Burak Turgut');
 end if;
end $$;

create or replace function od_private.handle_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare uname text;
begin
 uname := split_part(new.email,'@',1);
 if new.email is null or new.email <> uname || '@login.ogretmendefteri.invalid' or uname !~ '^[a-z0-9_]{3,24}$' or uname='burakturgut' then
  raise exception 'Geçersiz veya ayrılmış kullanıcı adı.';
 end if;
 insert into public.od_profiles(id,username,role,display_name) values(new.id,uname,'student',uname);
 return new;
end $$;
revoke all on function od_private.handle_signup() from public;
drop trigger if exists od_signup on auth.users;
create trigger od_signup after insert on auth.users for each row execute function od_private.handle_signup();

-- Kullanıcı dizini yalnızca ad, kullanıcı adı ve rol döndürür. Özel profil alanları paylaşılmaz.
create or replace function public.od_contacts()
returns table(id uuid,username text,display_name text,role text)
language sql stable security definer set search_path='' as $$
 select p.id,p.username,p.display_name,p.role from public.od_profiles p where (select auth.uid()) is not null order by p.username;
$$;
-- Seçilen öğrencilere ödev dağıtımı tek işlemde tamamlanır.
create or replace function public.od_create_assignment(p_title text,p_description text,p_due_date date,p_students uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid;
begin
 if not od_private.is_teacher() then raise exception 'Öğretmen yetkisi gerekiyor.'; end if;
 if coalesce(cardinality(p_students),0)=0 then raise exception 'En az bir öğrenci seçin.'; end if;
 if exists(select 1 from unnest(p_students) s where not exists(select 1 from public.od_profiles p where p.id=s and p.role='student')) then raise exception 'Geçersiz öğrenci.'; end if;
 insert into public.od_assignments(created_by,title,description,due_date) values(auth.uid(),p_title,p_description,p_due_date) returning id into aid;
 insert into public.od_assignment_recipients(assignment_id,student_id) select aid,s from (select distinct unnest(p_students) s) x;
 return aid;
end $$;
-- Öğrenci puanı, durumu ve öğretmen geribildirimini doğrudan değiştiremez.
create or replace function public.od_submit_assignment(p_assignment uuid,p_content text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.od_profiles where id=auth.uid() and role='student') or not exists(select 1 from public.od_assignment_recipients where assignment_id=p_assignment and student_id=auth.uid()) then raise exception 'Bu ödev size atanmadı.'; end if;
 -- Aynı ödevde teslim ve değerlendirmeyi sıraya koyar.
 perform 1 from public.od_assignment_recipients where assignment_id=p_assignment and student_id=auth.uid() for update;
 if exists(select 1 from public.od_submissions where assignment_id=p_assignment and student_id=auth.uid() and status<>'returned') then raise exception 'Gönderilen ödev ancak öğretmen iade ettikten sonra yeniden teslim edilebilir.'; end if;
 insert into public.od_submissions(assignment_id,student_id,content) values(p_assignment,auth.uid(),p_content)
 on conflict(assignment_id,student_id) do update set content=excluded.content,status='submitted',score=null,feedback='',submitted_at=now(),reviewed_at=null;
end $$;
create or replace function public.od_review_submission(p_assignment uuid,p_student uuid,p_status text,p_score integer,p_feedback text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not od_private.is_teacher() then raise exception 'Öğretmen yetkisi gerekiyor.'; end if;
 if p_status not in ('graded','returned') or (p_status='graded' and p_score is null) then raise exception 'Geçersiz değerlendirme.'; end if;
 perform 1 from public.od_assignment_recipients where assignment_id=p_assignment and student_id=p_student for update;
 update public.od_submissions set status=p_status,score=case when p_status='graded' then p_score else null end,feedback=p_feedback,reviewed_at=now() where assignment_id=p_assignment and student_id=p_student;
 if not found then raise exception 'Teslim bulunamadı.'; end if;
end $$;

-- Açık yetkileri kapat; her tabloya rol ve sahiplik politikası uygula.
alter table public.od_profiles enable row level security;
alter table public.od_teacher_entries enable row level security;
alter table public.od_assignments enable row level security;
alter table public.od_assignment_recipients enable row level security;
alter table public.od_submissions enable row level security;
alter table public.od_messages enable row level security;
alter table public.od_activity_log enable row level security;
alter table public.od_point_awards enable row level security;
alter table public.od_resources enable row level security;
revoke all on public.od_profiles,public.od_teacher_entries,public.od_assignments,public.od_assignment_recipients,public.od_submissions,public.od_messages,public.od_activity_log,public.od_point_awards,public.od_resources from anon,authenticated;
grant select on public.od_profiles,public.od_teacher_entries,public.od_assignments,public.od_assignment_recipients,public.od_submissions,public.od_messages,public.od_activity_log,public.od_point_awards,public.od_resources to authenticated;
grant update(display_name,bio,school,class_name) on public.od_profiles to authenticated;
grant insert(owner_id,kind,title,body,scheduled_date,scheduled_time),update(title,body,scheduled_date,scheduled_time),delete on public.od_teacher_entries to authenticated;
grant delete on public.od_assignments to authenticated;
grant insert(sender_id,recipient_id,body) on public.od_messages to authenticated;
grant insert(student_id,event_type,label,url,score) on public.od_activity_log to authenticated;
grant insert(student_id,awarded_by,points,reason) on public.od_point_awards to authenticated;
grant insert(created_by,title,url,kind),delete on public.od_resources to authenticated;

 drop policy if exists od_profile_read on public.od_profiles;
 create policy od_profile_read on public.od_profiles for select to authenticated using(id=(select auth.uid()) or (select od_private.is_teacher()));
 drop policy if exists od_profile_edit on public.od_profiles;
 create policy od_profile_edit on public.od_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
 drop policy if exists od_entries_owner on public.od_teacher_entries;
 create policy od_entries_owner on public.od_teacher_entries for all to authenticated using(owner_id=(select auth.uid()) and (select od_private.is_teacher())) with check(owner_id=(select auth.uid()) and (select od_private.is_teacher()));
 drop policy if exists od_assignment_read on public.od_assignments;
 create policy od_assignment_read on public.od_assignments for select to authenticated using((select od_private.is_teacher()) or exists(select 1 from public.od_assignment_recipients r where r.assignment_id=id and r.student_id=(select auth.uid())));
 drop policy if exists od_assignment_delete on public.od_assignments;
 create policy od_assignment_delete on public.od_assignments for delete to authenticated using((select od_private.is_teacher()));
 drop policy if exists od_recipient_read on public.od_assignment_recipients;
 create policy od_recipient_read on public.od_assignment_recipients for select to authenticated using(student_id=(select auth.uid()) or (select od_private.is_teacher()));
 drop policy if exists od_submission_read on public.od_submissions;
 create policy od_submission_read on public.od_submissions for select to authenticated using(student_id=(select auth.uid()) or (select od_private.is_teacher()));
 drop policy if exists od_message_read on public.od_messages;
 create policy od_message_read on public.od_messages for select to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()) or (select od_private.is_teacher()));
 drop policy if exists od_message_send on public.od_messages;
 create policy od_message_send on public.od_messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.od_profiles where id=(select auth.uid())));
 drop policy if exists od_activity_read on public.od_activity_log;
 create policy od_activity_read on public.od_activity_log for select to authenticated using((select od_private.is_teacher()));
 drop policy if exists od_activity_add on public.od_activity_log;
 create policy od_activity_add on public.od_activity_log for insert to authenticated with check(student_id=(select auth.uid()) and not (select od_private.is_teacher()));
 drop policy if exists od_points_read on public.od_point_awards;
 create policy od_points_read on public.od_point_awards for select to authenticated using(student_id=(select auth.uid()) or (select od_private.is_teacher()));
 drop policy if exists od_points_add on public.od_point_awards;
 create policy od_points_add on public.od_point_awards for insert to authenticated with check(awarded_by=(select auth.uid()) and (select od_private.is_teacher()) and exists(select 1 from public.od_profiles where id=student_id and role='student'));
 drop policy if exists od_resource_read on public.od_resources;
 create policy od_resource_read on public.od_resources for select to authenticated using(true);
 drop policy if exists od_resource_manage on public.od_resources;
 create policy od_resource_manage on public.od_resources for all to authenticated using((select od_private.is_teacher())) with check(created_by=(select auth.uid()) and (select od_private.is_teacher()));

revoke all on function public.od_contacts(),public.od_create_assignment(text,text,date,uuid[]),public.od_submit_assignment(uuid,text),public.od_review_submission(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.od_contacts(),public.od_create_assignment(text,text,date,uuid[]),public.od_submit_assignment(uuid,text),public.od_review_submission(uuid,uuid,text,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
