-- =============================================================================
-- Step 5: recording editor
-- Adds non-destructive edits (trim, cuts, mix, effects) to recordings.
-- Safe to run more than once.
-- =============================================================================

alter table public.recordings
  add column if not exists edits jsonb;

comment on column public.recordings.edits is
  'Editor settings (lib/editing/edits.ts): { version, trim, cuts, mix, effects }. Null = unedited. Times are on the beat timeline.';

-- Keep the stored JSON small (a few cuts and sliders never need more than this).
alter table public.recordings drop constraint if exists recordings_edits_size;
alter table public.recordings
  add constraint recordings_edits_size check (edits is null or pg_column_size(edits) <= 8192);

-- Owners may edit; column grants keep everything else locked (see the initial migration).
grant update (edits) on public.recordings to authenticated;
