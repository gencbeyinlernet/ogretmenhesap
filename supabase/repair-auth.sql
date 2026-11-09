-- Öğretmen Defteri — Mevcut kurulumda giriş onarımı.
-- Yalnızca Supabase SQL Editor'da proje sahibi tarafından çalıştırılır.
-- Öğrenci parolaları, mesajlar, ödevler ve puanlar değiştirilmez.
begin;
do $$
declare
 teacher_id uuid;
 teacher_password text := '__TEACHER_PASSWORD__';
begin
 if teacher_password = '__TEACHER_' || 'PASSWORD__' or length(teacher_password)<6 then
  raise exception 'SQL paneline en az 6 karakterli yeni öğretmen parolasını girin.';
 end if;
 select p.id into teacher_id
 from public.od_profiles p join auth.users u on u.id=p.id
 where p.role='teacher' and p.username='burakturgut'
   and u.email='burakturgut@login.ogretmendefteri.invalid'
 for update of p,u;
 if teacher_id is null then
  raise exception 'Kurulu öğretmen hesabı bulunamadı. Önce tam kurulum SQL dosyasını çalıştırın; mevcut kullanıcıları silmeyin.';
 end if;
 update auth.users set
  encrypted_password=extensions.crypt(teacher_password,extensions.gen_salt('bf')),
  email_confirmed_at=coalesce(email_confirmed_at,now()),
  confirmation_token='', recovery_token='', email_change_token_new='',
  email_change_token_current='', email_change='', reauthentication_token='',
  updated_at=now()
 where id=teacher_id;
 -- Bu uygulamaya ait mevcut, profili bulunan öğrenci hesaplarını onayla.
 -- Yeni kayıtlar için Dashboard'da Confirm email ayrıca kapatılmalıdır.
 update auth.users u set email_confirmed_at=coalesce(u.email_confirmed_at,now()),
  confirmation_token=coalesce(u.confirmation_token,''),
  recovery_token=coalesce(u.recovery_token,''),
  email_change_token_new=coalesce(u.email_change_token_new,''),
  email_change_token_current=coalesce(u.email_change_token_current,''),
  email_change=coalesce(u.email_change,''),
  reauthentication_token=coalesce(u.reauthentication_token,''),updated_at=now()
 from public.od_profiles p where p.id=u.id and p.role='student'
  and u.email=p.username||'@login.ogretmendefteri.invalid';
end $$;
commit;
-- Sonuçta yalnızca durum bilgisi gösterilir, parola veya hash gösterilmez.
select p.username,p.role,(u.email_confirmed_at is not null) as email_confirmed
from public.od_profiles p join auth.users u on u.id=p.id
where p.role='teacher';
