-- =============================================================================
-- Rhyme Tyme — initial schema
--
-- Tables: profiles, user_settings, beats, words, recordings, subscriptions,
--         payment_customers, reports, blocks
-- Every table has Row Level Security enabled. The service-role key (server only)
-- bypasses RLS and is used for the Stripe webhook and signed audio URLs.
--
-- Room for battle mode (NOT built yet). These are expected to be added later
-- without changing the tables below:
--   battles        (id, created_by → profiles, beat_id → beats, status, ...)
--   battle_rounds  (id, battle_id → battles, user_id → profiles,
--                   recording_id → recordings, round_number, ...)
--   votes          (battle_id → battles, voter_id → profiles, round_id, ...)
-- recordings.kind gains a 'battle' value, and reports.target_type gains 'battle'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Mirrors lib/account/username.ts
create or replace function public.is_valid_username(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select name ~ '^[a-z0-9_]{3,20}$'
    and name not in (
      'admin', 'administrator', 'api', 'auth', 'help', 'mod', 'moderator',
      'official', 'rhymetyme', 'rhyme_tyme', 'root', 'settings', 'staff',
      'support', 'system'
    );
$$;

-- -----------------------------------------------------------------------------
-- profiles: public identity (readable by everyone)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- null until the user picks one (e.g. right after Google sign-in)
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  bio text check (char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_settings: private per-user data (only the owner can read it)
-- -----------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_admin boolean not null default false,
  -- set when the user confirms they are 13 or older
  age_confirmed_at timestamptz,
  -- freestyle preferences: word frequency, difficulty, theme, rhyme hints
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.is_admin from public.user_settings s where s.user_id = auth.uid()),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- New user → profile + settings rows
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));
  chosen text := null;
begin
  if requested is not null
     and public.is_valid_username(requested)
     and not exists (select 1 from public.profiles p where p.username = requested) then
    chosen := requested;
  end if;

  -- Deliberately not copying the Google display name or photo: users may be
  -- teenagers, so nothing personal is made public unless they add it.
  begin
    insert into public.profiles (id, username) values (new.id, chosen);
  exception when unique_violation then
    -- someone grabbed the username a moment ago; they'll pick another in onboarding
    insert into public.profiles (id, username) values (new.id, null);
  end;

  insert into public.user_settings (user_id, age_confirmed_at)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'age_confirmed' = 'true' then now() end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_valid_username(lower(trim(name)))
    and not exists (select 1 from public.profiles p where p.username = lower(trim(name)));
$$;

-- Called after sign-up (and after Google sign-in) to set username + age confirmation.
create or replace function public.complete_onboarding(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  name text := lower(trim(p_username));
  current_name text;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.username into current_name from public.profiles p where p.id = uid;

  if current_name is distinct from name then
    if not public.is_username_available(name) then
      raise exception 'USERNAME_UNAVAILABLE';
    end if;
    update public.profiles set username = name where id = uid;
  end if;

  update public.user_settings
     set age_confirmed_at = coalesce(age_confirmed_at, now())
   where user_id = uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- beats
-- -----------------------------------------------------------------------------

create table public.beats (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  producer text not null default 'Unknown' check (char_length(producer) <= 100),
  bpm numeric(5, 2) not null check (bpm between 40 and 220),
  beats_per_bar smallint not null default 4 check (beats_per_bar between 2 and 12),
  -- seconds from the start of the file to the first downbeat (skips intros/silence)
  first_downbeat_seconds numeric(7, 3) not null default 0 check (first_downbeat_seconds >= 0),
  genre text not null,
  mood text not null,
  duration_seconds numeric(7, 2) not null check (duration_seconds > 0),
  -- Path inside the private "beats" storage bucket (e.g. "abc123.mp3"),
  -- or a site-relative URL for bundled placeholder beats (starts with "/").
  audio_path text not null,
  is_premium boolean not null default false,
  is_published boolean not null default true,
  is_placeholder boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index beats_browse_idx on public.beats (is_published, genre, mood);

create trigger beats_set_updated_at
  before update on public.beats
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- words (prompt words)
-- -----------------------------------------------------------------------------

create table public.words (
  id uuid primary key default gen_random_uuid(),
  word text not null check (char_length(word) between 1 and 40),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  themes text[] not null default '{}',
  rhyme_hints text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index words_word_unique on public.words (lower(word));
create index words_themes_idx on public.words using gin (themes);
create index words_difficulty_idx on public.words (difficulty) where is_active;

create trigger words_set_updated_at
  before update on public.words
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- subscriptions + payment customers (provider-agnostic: Stripe now, IAP later)
-- -----------------------------------------------------------------------------

create table public.payment_customers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, customer_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe', 'apple', 'google')),
  provider_subscription_id text not null,
  -- mirrors the provider's status: active, trialing, past_due, canceled, incomplete, ...
  status text not null,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index subscriptions_user_idx on public.subscriptions (user_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create or replace function public.is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- -----------------------------------------------------------------------------
-- blocks
-- -----------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- true if either user has blocked the other
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

-- -----------------------------------------------------------------------------
-- recordings
-- -----------------------------------------------------------------------------

create or replace function public.generate_share_slug()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  beat_id uuid not null references public.beats (id) on delete restrict,
  kind text not null default 'freestyle' check (kind in ('freestyle')),
  title text not null default 'Untitled freestyle' check (char_length(title) between 1 and 80),
  -- path inside the private "recordings" bucket: "<user_id>/<file>"
  vocal_path text not null,
  vocal_mime_type text not null,
  duration_seconds numeric(7, 2) not null check (duration_seconds > 0 and duration_seconds <= 300),
  -- where vocal t=0 sits on the beat's timeline, in seconds (already latency-compensated)
  vocal_offset_seconds numeric(8, 4) not null default 0,
  -- latency that was measured/applied when recording (for debugging re-sync issues)
  latency_seconds numeric(6, 4) not null default 0,
  -- [{ "word": "cash", "bar": 4, "time": 10.67 }, ...] — time is on the beat timeline
  word_sequence jsonb not null default '[]'::jsonb,
  -- { "wordEveryBars": 4, "difficulty": "easy", "theme": "money", "rhymeHints": true }
  session_settings jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recordings_user_idx on public.recordings (user_id, created_at desc);
create index recordings_public_idx on public.recordings (user_id) where is_public;

create trigger recordings_set_updated_at
  before update on public.recordings
  for each row execute function public.set_updated_at();

-- Give a recording a share slug the first time it is made public.
create or replace function public.recordings_assign_share_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_public and new.share_slug is null then
    new.share_slug := public.generate_share_slug();
  end if;
  return new;
end;
$$;

create trigger recordings_assign_share_slug
  before insert or update of is_public on public.recordings
  for each row execute function public.recordings_assign_share_slug();

-- ---- Save limit (mirrors lib/limits/saveLimit.ts) ----------------------------

create or replace function public.free_save_limit()
returns integer
language sql
immutable
as $$
  select 3;
$$;

create or replace function public.can_save_recording(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and (
    public.is_premium(uid)
    or (
      select count(*) from public.recordings r
      where r.user_id = uid and r.kind = 'freestyle'
    ) < public.free_save_limit()
  );
$$;

-- Enforced on the server: even if the app is bypassed, a free user's 4th insert fails.
create or replace function public.enforce_save_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialise saves per user so two simultaneous uploads can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('recordings:' || new.user_id::text, 0));

  if not public.can_save_recording(new.user_id) then
    raise exception 'SAVE_LIMIT_REACHED'
      using hint = 'Free accounts can save ' || public.free_save_limit()
                   || ' recordings. Delete one or upgrade to Premium.';
  end if;
  return new;
end;
$$;

create trigger recordings_enforce_save_limit
  before insert on public.recordings
  for each row execute function public.enforce_save_limit();

-- -----------------------------------------------------------------------------
-- reports
-- -----------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  -- polymorphic target so future content types (e.g. 'battle') need no schema change
  target_type text not null check (target_type in ('recording', 'profile')),
  target_id uuid not null,
  reason text not null check (
    reason in ('harassment', 'hate', 'sexual', 'violence', 'self_harm',
               'underage', 'spam', 'copyright', 'other')
  ),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_status_idx on public.reports (status, created_at desc);
-- one open report per user per target
create unique index reports_one_open_per_target
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.beats enable row level security;
alter table public.words enable row level security;
alter table public.payment_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.blocks enable row level security;
alter table public.recordings enable row level security;
alter table public.reports enable row level security;

-- ---- profiles ----------------------------------------------------------------
create policy "Profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Usernames change only through complete_onboarding(); other columns are editable.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_url) on public.profiles to authenticated;

-- ---- user_settings -----------------------------------------------------------
create policy "Users read their own settings"
  on public.user_settings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users update their own settings"
  on public.user_settings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Only preferences are user-editable; is_admin can only be changed in the SQL editor.
revoke insert, update, delete on public.user_settings from anon, authenticated;
grant update (preferences) on public.user_settings to authenticated;

-- ---- beats -------------------------------------------------------------------
create policy "Published beats are visible to everyone"
  on public.beats for select
  to anon, authenticated
  using (is_published or (select public.is_admin()));

create policy "Admins insert beats"
  on public.beats for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update beats"
  on public.beats for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete beats"
  on public.beats for delete
  to authenticated
  using ((select public.is_admin()));

-- ---- words -------------------------------------------------------------------
create policy "Active words are visible to everyone"
  on public.words for select
  to anon, authenticated
  using (is_active or (select public.is_admin()));

create policy "Admins insert words"
  on public.words for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update words"
  on public.words for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete words"
  on public.words for delete
  to authenticated
  using ((select public.is_admin()));

-- ---- payment_customers / subscriptions (written only by the server) ---------
create policy "Users read their own payment customer"
  on public.payment_customers for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.payment_customers from anon, authenticated;
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ---- blocks ------------------------------------------------------------------
create policy "Users see who they blocked"
  on public.blocks for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy "Users block others"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "Users unblock"
  on public.blocks for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

revoke update on public.blocks from anon, authenticated;

-- ---- recordings --------------------------------------------------------------
create policy "Owners see their recordings"
  on public.recordings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Public recordings are visible unless blocked"
  on public.recordings for select
  to anon, authenticated
  using (
    is_public
    and not public.is_blocked_between((select auth.uid()), user_id)
  );

create policy "Admins see all recordings"
  on public.recordings for select
  to authenticated
  using ((select public.is_admin()));

create policy "Users save their own recordings"
  on public.recordings for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their recordings"
  on public.recordings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners and admins delete recordings"
  on public.recordings for delete
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Only title and visibility are editable after saving.
revoke update on public.recordings from anon, authenticated;
grant update (title, is_public) on public.recordings to authenticated;

-- ---- reports -----------------------------------------------------------------
create policy "Users file reports"
  on public.reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

create policy "Users see their reports; admins see all"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins review reports"
  on public.reports for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke update, delete on public.reports from anon;
revoke delete on public.reports from authenticated;

-- =============================================================================
-- Function permissions
-- =============================================================================

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_save_limit() from public, anon, authenticated;
revoke execute on function public.complete_onboarding(text) from public, anon;
grant execute on function public.complete_onboarding(text) to authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- =============================================================================
-- Storage buckets (both private: audio is served through short-lived signed URLs)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('beats', 'beats', false, 52428800,
   array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4',
         'audio/aac', 'audio/x-m4a', 'audio/ogg']),
  ('recordings', 'recordings', false, 26214400,
   array['audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/ogg',
         'audio/mpeg', 'audio/wav'])
on conflict (id) do nothing;

-- beats bucket: admins manage files; everyone else gets signed URLs from the server.
create policy "Admins read beat files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'beats' and (select public.is_admin()));

create policy "Admins upload beat files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'beats' and (select public.is_admin()));

create policy "Admins update beat files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'beats' and (select public.is_admin()));

create policy "Admins delete beat files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'beats' and (select public.is_admin()));

-- recordings bucket: files live under "<user_id>/...". Uploads are refused once a
-- free user is at the save limit, so the limit also protects storage.
create policy "Users upload their own recordings"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_save_recording((select auth.uid()))
  );

create policy "Users read their own recording files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their own recording files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
