-- Keeps portal accounts (public.profiles) and Supabase Auth logins (auth.users)
-- identical, no matter where the change is made (portal, Supabase dashboard, SQL).
--
--   1. A portal account can only be created/re-linked for an existing login.
--   2. Login deleted          -> portal account deleted
--                                (kept but disabled if it has gate-pass history).
--   3. Login email changed    -> portal email follows.
--   4. Portal account deleted -> its login is deleted too.
--
-- Idempotent: safe to run again. Apply with:
--   npx prisma db execute --file prisma/migrations/auth_profile_sync.sql --schema prisma/schema.prisma

-- 1. Every portal account must have a login --------------------------------
create or replace function public.gp_profile_requires_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id::text = new."userId") then
    raise exception 'Portal account % has no Supabase login', new.email
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists gp_profile_requires_login on public.profiles;
create trigger gp_profile_requires_login
  before insert or update of "userId" on public.profiles
  for each row execute function public.gp_profile_requires_login();

-- 2. Login deleted -> portal account deleted (or disabled if it has history) --
create or replace function public.gp_on_login_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p_id text;
  f_id text;
  w_id text;
  has_history boolean;
begin
  select id into p_id from public.profiles where "userId" = old.id::text;
  if p_id is null then
    return old;
  end if;

  select id into f_id from public.faculty where profile_id = p_id;
  select id into w_id from public.wardens where profile_id = p_id;

  select
    exists (
      select 1 from public.students s
      where s.profile_id = p_id
        and (exists (select 1 from public.permissions where student_id = s.id)
          or exists (select 1 from public.movements where student_id = s.id))
    )
    or (f_id is not null and (
          exists (select 1 from public.permissions where faculty_id = f_id)
       or exists (select 1 from public.permission_approvals where faculty_id = f_id)
       or exists (select 1 from public.movements where faculty_id = f_id)))
    or (w_id is not null and exists (select 1 from public.permission_approvals where warden_id = w_id))
    or exists (
      select 1 from public.security_staff ss
      where ss.profile_id = p_id
        and exists (select 1 from public.movements m where m.security_user_id = ss.id)
    )
  into has_history;

  if has_history then
    update public.profiles set active = false, updated_at = now() where id = p_id;
    return old;
  end if;

  begin
    if f_id is not null then
      update public.students set faculty_id = null where faculty_id = f_id;
    end if;
    if w_id is not null then
      update public.students set warden_id = null where warden_id = w_id;
    end if;
    delete from public.profiles where id = p_id; -- role rows cascade
  exception when others then
    -- Never block the login deletion; the account can no longer sign in anyway.
    update public.profiles set active = false, updated_at = now() where id = p_id;
  end;
  return old;
end;
$$;

drop trigger if exists gp_on_login_deleted on auth.users;
create trigger gp_on_login_deleted
  after delete on auth.users
  for each row execute function public.gp_on_login_deleted();

-- 3. Login email changed -> portal email follows -----------------------------
create or replace function public.gp_on_login_email_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    begin
      update public.profiles
        set email = new.email, updated_at = now()
        where "userId" = new.id::text and email is distinct from new.email;
    exception when unique_violation then
      raise warning 'Email % is already used by another portal account', new.email;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists gp_on_login_email_changed on auth.users;
create trigger gp_on_login_email_changed
  after update of email on auth.users
  for each row execute function public.gp_on_login_email_changed();

-- 4. Portal account deleted -> its login is deleted --------------------------
create or replace function public.gp_on_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id::text = old."userId";
  return old;
end;
$$;

drop trigger if exists gp_on_profile_deleted on public.profiles;
create trigger gp_on_profile_deleted
  after delete on public.profiles
  for each row execute function public.gp_on_profile_deleted();

-- These are trigger-only functions; nobody should call them through the API.
revoke all on function public.gp_profile_requires_login() from public, anon, authenticated;
revoke all on function public.gp_on_login_deleted() from public, anon, authenticated;
revoke all on function public.gp_on_login_email_changed() from public, anon, authenticated;
revoke all on function public.gp_on_profile_deleted() from public, anon, authenticated;
