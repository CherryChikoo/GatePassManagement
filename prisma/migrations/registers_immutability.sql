-- Immutable records for the Security registers and gate passes.
--
-- Once saved, a record cannot be edited or deleted by anyone (including the
-- portal's own database user and Main Admin). Corrections and later details
-- are new rows that point at the original. Workflow state (approval status,
-- QR use, visitor exit) is still allowed to move forward.
--
--   register_entries      only Main Admin edits / deletes (enforced in the portal)
--   movements             no UPDATE, no DELETE (actual gate exits/entries)
--   permission_approvals  no UPDATE, no DELETE (approval decisions)
--   permissions           no DELETE; submitted request details cannot change
--   outsiders             no DELETE; only INSIDE -> EXITED (exit time) once
--
-- Idempotent: safe to run again. Apply with:
--   npx prisma db execute --file prisma/migrations/registers_immutability.sql --schema prisma/schema.prisma

-- Generic "this table is append-only" guard -----------------------------------
create or replace function public.gp_block_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are permanent and cannot be % (record %)',
    tg_table_name, lower(tg_op) || 'd', coalesce(old.id, '?')
    using errcode = 'insufficient_privilege';
end;
$$;

create or replace function public.gp_block_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are permanent and cannot be truncated', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['register_entries', 'movements', 'permission_approvals', 'permissions', 'outsiders'] loop
    execute format('drop trigger if exists gp_%s_no_truncate on public.%I', t, t);
    execute format('create trigger gp_%s_no_truncate before truncate on public.%I '
                   'for each statement execute function public.gp_block_truncate()', t, t);
  end loop;
end;
$$;

-- register_entries: Main Admin may edit / delete these (registers_admin_edit.sql),
-- so no update/delete trigger here.
drop trigger if exists gp_register_entries_immutable on public.register_entries;

drop trigger if exists gp_movements_immutable on public.movements;
create trigger gp_movements_immutable
  before update or delete on public.movements
  for each row execute function public.gp_block_change();

drop trigger if exists gp_permission_approvals_immutable on public.permission_approvals;
create trigger gp_permission_approvals_immutable
  before update or delete on public.permission_approvals
  for each row execute function public.gp_block_change();

drop trigger if exists gp_permissions_no_delete on public.permissions;
create trigger gp_permissions_no_delete
  before delete on public.permissions
  for each row execute function public.gp_block_change();

drop trigger if exists gp_outsiders_no_delete on public.outsiders;
create trigger gp_outsiders_no_delete
  before delete on public.outsiders
  for each row execute function public.gp_block_change();

-- Passes: what the student / faculty submitted never changes ------------------
create or replace function public.gp_permission_submission_locked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.student_id, new.faculty_id, new.type, new.purpose, new.destination, new.exit_date,
      new.expected_exit, new.expected_return, new.contact_number, new.remarks, new.created_at,
      new.request_type, new.end_date, new.number_of_days, new.parent_informed, new.video_call_number,
      new.guardian_name, new.guardian_relation, new.hostel_incharge_details, new.warden_details,
      new.approval_mode, new.pass_kind)
     is distinct from
     (old.student_id, old.faculty_id, old.type, old.purpose, old.destination, old.exit_date,
      old.expected_exit, old.expected_return, old.contact_number, old.remarks, old.created_at,
      old.request_type, old.end_date, old.number_of_days, old.parent_informed, old.video_call_number,
      old.guardian_name, old.guardian_relation, old.hostel_incharge_details, old.warden_details,
      old.approval_mode, old.pass_kind)
  then
    raise exception 'Submitted pass details are permanent and cannot be changed (pass %)', old.id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists gp_permission_submission_locked on public.permissions;
create trigger gp_permission_submission_locked
  before update on public.permissions
  for each row execute function public.gp_permission_submission_locked();

-- Visitors: only the exit can be recorded, once -------------------------------
create or replace function public.gp_outsider_locked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The guard who registered the visitor may later be removed; the name snapshot stays.
  if new.recorded_by_id is null and old.recorded_by_id is not null
     and (to_jsonb(new) - 'recorded_by_id') = (to_jsonb(old) - 'recorded_by_id') then
    return new;
  end if;

  if old.status = 'INSIDE' and new.status = 'EXITED' and new.exit_time is not null
     and (to_jsonb(new) - 'status' - 'exit_time') = (to_jsonb(old) - 'status' - 'exit_time') then
    return new;
  end if;

  raise exception 'Visitor records are permanent and cannot be changed (visitor %)', old.id
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists gp_outsider_locked on public.outsiders;
create trigger gp_outsider_locked
  before update on public.outsiders
  for each row execute function public.gp_outsider_locked();

-- Login deleted -> keep accounts that recorded registers or visitors ------------
-- (replaces the function from auth_profile_sync.sql with the extra history checks)
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
    or exists (select 1 from public.register_entries where recorded_by_id = p_id)
    or exists (select 1 from public.outsiders where recorded_by_id = p_id)
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
    delete from public.profiles where id = p_id;
  exception when others then
    update public.profiles set active = false, updated_at = now() where id = p_id;
  end;
  return old;
end;
$$;

-- Browser API keys (anon / authenticated) never write these tables directly ---
alter table public.register_entries enable row level security;
revoke insert, update, delete, truncate on public.register_entries from anon, authenticated;
revoke update, delete, truncate on public.movements from anon, authenticated;
revoke update, delete, truncate on public.permission_approvals from anon, authenticated;
revoke delete, truncate on public.permissions from anon, authenticated;
revoke delete, truncate on public.outsiders from anon, authenticated;

revoke all on function public.gp_block_change() from public, anon, authenticated;
revoke all on function public.gp_block_truncate() from public, anon, authenticated;
revoke all on function public.gp_permission_submission_locked() from public, anon, authenticated;
revoke all on function public.gp_outsider_locked() from public, anon, authenticated;
revoke all on function public.gp_on_login_deleted() from public, anon, authenticated;
