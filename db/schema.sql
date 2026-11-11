-- =============================================================
-- SpeakDaily — Supabase-compatible PostgreSQL Schema
-- =============================================================

-- -------------------------------------------------------
-- 1. PROFILES (extends Supabase auth.users)
-- -------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  full_name   text,
  avatar_url  text,
  streak_count   int not null default 0,
  total_sessions int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Public user profile, one-to-one with auth.users.';

-- -------------------------------------------------------
-- 2. DAILY_TOPICS
-- -------------------------------------------------------
create table public.daily_topics (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text not null,
  category         text not null,
  difficulty       text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  prompt_questions text[] not null default '{}',
  is_active        boolean not null default true,
  date             date unique not null,
  created_at       timestamptz not null default now()
);

comment on table public.daily_topics is 'One topic per day for speaking practice.';

-- -------------------------------------------------------
-- 3. PRACTICE_SESSIONS
-- -------------------------------------------------------
create table public.practice_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  topic_id         uuid not null references public.daily_topics(id) on delete cascade,
  audio_url        text,
  transcript       text,
  duration_seconds int,
  created_at       timestamptz not null default now()
);

comment on table public.practice_sessions is 'Each recording a user submits for a topic.';

create index idx_practice_sessions_user  on public.practice_sessions(user_id);
create index idx_practice_sessions_topic on public.practice_sessions(topic_id);

-- -------------------------------------------------------
-- 4. AI_FEEDBACK
-- -------------------------------------------------------
create table public.ai_feedback (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.practice_sessions(id) on delete cascade,
  grammar_score        int not null check (grammar_score        between 0 and 100),
  fluency_score        int not null check (fluency_score        between 0 and 100),
  pronunciation_score  int not null check (pronunciation_score  between 0 and 100),
  overall_score        int not null check (overall_score        between 0 and 100),
  corrections          jsonb not null default '[]'::jsonb,
  suggestions          text[] not null default '{}',
  encouraging_message  text,
  created_at           timestamptz not null default now()
);

comment on table public.ai_feedback is 'AI-generated feedback for a practice session.';

create index idx_ai_feedback_session on public.ai_feedback(session_id);

-- =============================================================
-- TRIGGER: auto-create profile on auth.users insert
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- =============================================================
-- TRIGGER: auto-update updated_at on profiles
-- =============================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

-- ---- profiles ------------------------------------------------
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Allow the trigger (security definer) to insert
create policy "Service role can insert profiles"
  on public.profiles for insert
  with check (true);

-- ---- daily_topics --------------------------------------------
alter table public.daily_topics enable row level security;

create policy "Anyone can read active topics"
  on public.daily_topics for select
  using (is_active = true);

-- ---- practice_sessions ---------------------------------------
alter table public.practice_sessions enable row level security;

create policy "Users can view their own sessions"
  on public.practice_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.practice_sessions for insert
  with check (auth.uid() = user_id);

-- ---- ai_feedback ---------------------------------------------
alter table public.ai_feedback enable row level security;

create policy "Users can read own feedback"
  on public.ai_feedback for select
  using (
    exists (
      select 1 from public.practice_sessions ps
      where ps.id = ai_feedback.session_id
        and ps.user_id = auth.uid()
    )
  );

create policy "Users can insert feedback for own sessions"
  on public.ai_feedback for insert
  with check (
    exists (
      select 1 from public.practice_sessions ps
      where ps.id = ai_feedback.session_id
        and ps.user_id = auth.uid()
    )
  );

-- =============================================================
-- REALTIME
-- =============================================================
alter publication supabase_realtime add table public.profiles;

-- =============================================================
-- SEED DATA: 7 daily topics
-- =============================================================
insert into public.daily_topics (title, description, category, difficulty, prompt_questions, date) values
(
  'Weekend Plans',
  'Talk about what you like to do on weekends and share your favourite activities.',
  'conversation',
  'beginner',
  array[
    'What do you usually do on weekends?',
    'Do you prefer staying home or going out?',
    'Describe your ideal weekend.'
  ],
  current_date
),
(
  'Booking a Hotel',
  'Practice the vocabulary and phrases needed when travelling and booking accommodation.',
  'travel',
  'intermediate',
  array[
    'How do you usually book hotels when you travel?',
    'What amenities are most important to you?',
    'Describe a memorable hotel stay.'
  ],
  current_date + interval '1 day'
),
(
  'Giving a Presentation',
  'Build confidence for workplace presentations and public speaking in English.',
  'workplace',
  'advanced',
  array[
    'How do you prepare for a presentation?',
    'What techniques help you manage nervousness?',
    'Describe a presentation that went really well.'
  ],
  current_date + interval '2 days'
),
(
  'Favourite Recipes',
  'Share your favourite recipes and learn food-related vocabulary.',
  'food',
  'beginner',
  array[
    'What is your favourite dish to cook?',
    'Describe the steps to make it.',
    'What foods from other countries have you tried?'
  ],
  current_date + interval '3 days'
),
(
  'AI in Everyday Life',
  'Discuss how technology and artificial intelligence affect our daily routines.',
  'technology',
  'intermediate',
  array[
    'How do you use AI tools in your daily life?',
    'What technology could you not live without?',
    'Do you think AI will change education?'
  ],
  current_date + interval '4 days'
),
(
  'Staying Healthy',
  'Talk about healthy habits, exercise routines, and mental well-being.',
  'health',
  'beginner',
  array[
    'What do you do to stay healthy?',
    'How important is mental health to you?',
    'Describe your exercise routine.'
  ],
  current_date + interval '5 days'
),
(
  'Festivals Around the World',
  'Explore cultural festivals, traditions, and celebrations from different countries.',
  'culture',
  'intermediate',
  array[
    'What is your favourite festival or celebration?',
    'Have you experienced a festival from another culture?',
    'Why are cultural traditions important?'
  ],
  current_date + interval '6 days'
);
