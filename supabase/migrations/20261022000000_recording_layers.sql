-- =============================================================================
-- Overdub layers: extra vocal takes (ad-libs, doubles) recorded on top of a
-- saved recording. Free: 1 layer per recording; Premium: 4 (lib/limits/layers.ts).
-- Layers don't count against the 3-recording save limit.
-- Safe to run more than once.
-- =============================================================================

create table if not exists public.recording_layers (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Layer' check (char_length(label) between 1 and 40),
  -- path inside the private "recordings" bucket: "<user_id>/layers/<file>"
  vocal_path text not null,
  vocal_mime_type text not null,
  duration_seconds numeric(7, 2) not null check (duration_seconds > 0 and duration_seconds <= 300),
  -- where layer t=0 sits on the beat timeline (latency already removed)
  vocal_offset_seconds numeric(8, 4) not null default 0,
  latency_seconds numeric(6, 4) not null default 0,
  gain numeric(4, 3) not null default 1 check (gain between 0 and 2),
  muted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists recording_layers_recording_idx on public.recording_layers (recording_id, created_at);

alter table public.recording_layers enable row level security;

-- ---- Limit + ownership (mirrors lib/limits/layers.ts) -----------------------

create or replace function public.layer_limit(uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_premium(uid) then 4 else 1 end;
$$;

create or replace function public.enforce_layer_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.recordings r where r.id = new.recording_id and r.user_id = new.user_id
  ) then
    raise exception 'LAYER_NOT_OWNER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('layers:' || new.recording_id::text, 0));

  if (select count(*) from public.recording_layers l where l.recording_id = new.recording_id)
       >= public.layer_limit(new.user_id) then
    raise exception 'LAYER_LIMIT_REACHED'
      using hint = 'Free accounts can add ' || public.layer_limit(new.user_id) || ' layer per recording.';
  end if;
  return new;
end;
$$;

drop trigger if exists recording_layers_enforce_rules on public.recording_layers;
create trigger recording_layers_enforce_rules
  before insert on public.recording_layers
  for each row execute function public.enforce_layer_rules();

revoke execute on function public.enforce_layer_rules() from public, anon, authenticated;

-- ---- Row Level Security ------------------------------------------------------

drop policy if exists "Owners see their layers" on public.recording_layers;
create policy "Owners see their layers"
  on public.recording_layers for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Layers of public recordings are public too (share pages), unless either side blocked the other.
drop policy if exists "Layers of public recordings are visible" on public.recording_layers;
create policy "Layers of public recordings are visible"
  on public.recording_layers for select
  to anon, authenticated
  using (
    exists (select 1 from public.recordings r where r.id = recording_id and r.is_public)
    and not public.is_blocked_between((select auth.uid()), user_id)
  );

drop policy if exists "Owners add layers" on public.recording_layers;
create policy "Owners add layers"
  on public.recording_layers for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Owners update layers" on public.recording_layers;
create policy "Owners update layers"
  on public.recording_layers for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Owners and admins delete layers" on public.recording_layers;
create policy "Owners and admins delete layers"
  on public.recording_layers for delete
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Only the label, volume and mute can change after recording.
revoke update on public.recording_layers from anon, authenticated;
grant update (label, gain, muted) on public.recording_layers to authenticated;

-- ---- Storage: layer files may be uploaded even when the save limit is full --

drop policy if exists "Users upload their own recordings" on storage.objects;
create policy "Users upload their own recordings"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      (storage.foldername(name))[2] = 'layers'
      or public.can_save_recording((select auth.uid()))
    )
  );
