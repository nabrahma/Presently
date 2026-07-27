create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  branch text,
  semester int check (semester between 1 and 10),
  default_target_percentage numeric default 75 check (default_target_percentage between 0 and 100),
  created_at timestamptz not null default now()
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  subject_type text not null default 'lecture' check (subject_type in ('lecture', 'lab', 'tutorial')),
  color text not null default '#6366F1',
  target_percentage numeric not null default 75 check (target_percentage between 0 and 100),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table subject_schedule (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  sessions_per_day int not null default 1 check (sessions_per_day between 1 and 6),
  created_at timestamptz not null default now(),
  unique (subject_id, weekday)
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  record_date date not null,
  session_index int not null default 1,
  status text not null check (status in ('present', 'absent', 'cancelled', 'holiday')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, record_date, session_index)
);

create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table profiles enable row level security;
alter table subjects enable row level security;
alter table subject_schedule enable row level security;
alter table attendance_records enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own subjects" on subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own attendance" on attendance_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own schedule" on subject_schedule for all using (
  exists (select 1 from subjects s where s.id = subject_schedule.subject_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from subjects s where s.id = subject_schedule.subject_id and s.user_id = auth.uid())
);
