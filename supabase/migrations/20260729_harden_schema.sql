-- Corrections to the initial schema, applied after the first release.
--
-- 1. updated_at was written once on insert and never touched again, so every
--    row claimed to have been last changed at creation time.
-- 2. Nothing stopped a subject name from being empty or a record from being
--    dated in the future; the client validates both, but the client is not the
--    only thing that can write here.
-- 3. Two foreign keys had no supporting index.

/* -------------------------------------------------------------------------- */
/* updated_at                                                                  */
/* -------------------------------------------------------------------------- */

create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security invoker set search_path = '';

revoke execute on function public.touch_updated_at() from public;

drop trigger if exists attendance_records_touch_updated_at on public.attendance_records;

create trigger attendance_records_touch_updated_at
  before update on public.attendance_records
  for each row
  execute function public.touch_updated_at();

/* -------------------------------------------------------------------------- */
/* Data integrity                                                              */
/* -------------------------------------------------------------------------- */

-- Existing rows are repaired first so the constraints can be validated.
update public.subjects set name = 'Untitled subject' where btrim(name) = '';
update public.subjects set color = '#6f6f77' where color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.subjects
  drop constraint if exists subjects_name_not_blank,
  add constraint subjects_name_not_blank check (btrim(name) <> '' and length(name) <= 80);

alter table public.subjects
  drop constraint if exists subjects_code_length,
  add constraint subjects_code_length check (code is null or length(code) <= 16);

alter table public.subjects
  drop constraint if exists subjects_color_is_hex,
  add constraint subjects_color_is_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

-- A target of 0 makes the "classes you can miss" figure meaningless.
alter table public.subjects
  drop constraint if exists subjects_target_percentage_check,
  add constraint subjects_target_percentage_check check (target_percentage between 1 and 100);

alter table public.profiles
  drop constraint if exists profiles_default_target_percentage_check,
  add constraint profiles_default_target_percentage_check
    check (default_target_percentage is null or default_target_percentage between 1 and 100);

-- The client allows up to 8 sessions a day; the table stopped at 6.
alter table public.subject_schedule
  drop constraint if exists subject_schedule_sessions_per_day_check,
  add constraint subject_schedule_sessions_per_day_check check (sessions_per_day between 1 and 8);

alter table public.attendance_records
  drop constraint if exists attendance_records_session_index_check,
  add constraint attendance_records_session_index_check check (session_index between 1 and 8);

-- Two rules that a CHECK constraint cannot express: one needs the current date
-- (which is not immutable), the other needs a lookup in another table.
create or replace function public.validate_attendance_record() returns trigger as $$
begin
  -- A class can be backfilled but never recorded for next week. The two-day
  -- allowance absorbs the gap between a device's clock and the server's.
  if new.record_date > ((now() at time zone 'utc')::date + 2) then
    raise exception 'attendance cannot be recorded for a future date';
  end if;

  if not exists (
    select 1 from public.subjects s
    where s.id = new.subject_id and s.user_id = new.user_id
  ) then
    raise exception 'attendance record must belong to a subject owned by the same user';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.validate_attendance_record() from public;

drop trigger if exists attendance_records_validate on public.attendance_records;

create trigger attendance_records_validate
  before insert or update of subject_id, user_id, record_date on public.attendance_records
  for each row
  execute function public.validate_attendance_record();

/* -------------------------------------------------------------------------- */
/* Indexes                                                                     */
/* -------------------------------------------------------------------------- */

-- The dashboard reads every record for one user ordered by date; the existing
-- index is keyed on subject first and cannot serve that.
create index if not exists attendance_records_user_date_idx
  on public.attendance_records (user_id, record_date desc);
