-- ==============================================================================
-- MIRROR: PRODUCTION DATABASE SCHEMA WITH ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- 1. Profiles (Linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  timezone text default 'UTC',
  reminder_time time default '21:00',
  onboarding_completed boolean default false,
  created_at timestamptz default now()
);

-- 2. Priorities (User chosen life domains)
create table if not exists public.priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  colour text not null default '#8b5cf6',
  icon text default 'sparkles',
  why_statement text not null,
  weekly_target_minutes integer not null default 120,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- 3. Daily Check-ins (Voluntary daily reflection, 1 per user per date)
create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  checkin_date date not null default current_date,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  bedtime time,
  wake_time time,
  sleep_minutes integer,
  water_glasses integer default 0,
  meal_quality text check (meal_quality in ('balanced', 'okay', 'skipped')),
  wasted_minutes integer default 0,
  private_note text,
  created_at timestamptz default now(),
  unique(user_id, checkin_date)
);

-- 4. Time Entries (Minutes devoted to a specific priority in a daily check-in)
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  checkin_id uuid references public.daily_checkins on delete cascade not null,
  priority_id uuid references public.priorities on delete cascade not null,
  minutes integer not null default 0,
  created_at timestamptz default now()
);

-- 5. Experiments (Single active 7-day small change experiment)
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  target_priority_id uuid references public.priorities on delete cascade not null,
  transfer_minutes_per_day integer not null default 20,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

-- 6. Weekly Reports (Aggregated weekly reflections and Google Sheets sync audit)
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  week_start date not null,
  alignment_score integer not null,
  target_completion_percent integer not null,
  letter text not null,
  sheet_synced_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, week_start)
);

-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.priorities enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.time_entries enable row level security;
alter table public.experiments enable row level security;
alter table public.weekly_reports enable row level security;

-- ==============================================================================
-- RLS POLICIES (users can only access their own data)
-- ==============================================================================
-- Profiles
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Priorities
create policy "Users manage own priorities" on public.priorities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Daily Checkins
create policy "Users manage own checkins" on public.daily_checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Time Entries
create policy "Users manage own time entries" on public.time_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Experiments
create policy "Users manage own experiments" on public.experiments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Weekly Reports
create policy "Users manage own weekly reports" on public.weekly_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- AUTO-CREATE PROFILE ON AUTH SIGNUP
-- ==============================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, created_at)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.phone, 'Reflector'), now())
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
