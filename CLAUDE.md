# Rhyme Tyme — project context for Claude

## What this is
Rhyme Tyme is a mobile-first web app (installable PWA) where users freestyle rap over beats while
prompt words appear on screen, locked to the beat. Users can record their vocals, save recordings,
share a public page per recording, and export a vertical (9:16) video clip. A monthly Premium
subscription unlocks unlimited saves, the full beat library, and watermark-free clips.

This is the **MVP**, built to test whether people use it. **Battle mode is out of scope** — do not
build it — but the schema must allow adding `battles`, `battle_rounds`, and `votes` tables later
without reworking existing tables.

The owner is not an experienced developer. When they must do something by hand (create accounts,
get API keys, set env vars, test on an iPhone), give exact numbered steps.

## Tech stack
- **Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS v4** — Next 16 differs from older
  versions: read `node_modules/next/dist/docs/` before using unfamiliar APIs (see AGENTS.md).
  `middleware` is now `src/proxy.ts`; `cookies()`, `headers()`, `params`, `searchParams` are async.
  Cache Components is deliberately **off** (next.config.ts).
- **Supabase**: auth (email + Google), Postgres, Storage (audio files). Row Level Security on every table.
- **Stripe**: Checkout (monthly Premium), webhook for subscription status, Customer Portal
- **Web Audio API** for beat playback and timing; **MediaRecorder API** for vocal recording
- **PostHog** for analytics
- **Vercel** for hosting
- **PWA**: web manifest, icons, service worker
- **Vitest** for unit tests

## Build order (stop after each step for the owner to test)
1. Project setup, Supabase connection, auth, database schema and seed data
2. Beat library and beat player
3. Freestyle session with BPM-synced words
4. Recording, latency calibration, save limit
5. Recording editor: trim, cut middle sections, volume balance, effects (reverb/echo)
6. Stripe Premium and paywall
7. Share pages and video clip export
8. Reporting, blocking, admin page
9. PWA setup, analytics, deployment to Vercel

Track which step is current in the "Status" section at the bottom of this file.

## Architecture & conventions

### Layout
```
lib/              platform-agnostic core logic + tests (import as @lib/...)
src/app/          routes. (auth)/ = login & signup, (app)/ = signed-in pages with bottom nav
src/auth/         viewer.ts (getViewer/requireViewer — includes isAdmin/isPremium), safeNext, siteUrl
src/audio/        browser audio: context.ts (shared AudioContext + iOS unlock), usePreviewPlayer,
                  freestyleEngine, useBeatBuffer, useWakeLock
src/session/      freestyle settings form/hook/server action, CalibrationStatus; src/words/ = server word queries
src/recording/    microphone.ts, markerRecorder.ts (MediaRecorder + sync marker), latencyStore.ts (localStorage)
src/recordings/   server actions: getSaveStatus, createRecording, deleteRecording, renameRecording, getPlayback
src/audio/mixPlayer.ts  plays beat + vocal (+ edits) in sync; mixGraph.ts = shared effects chain;
                  renderMix.ts = offline render of the edited mix (share page / video export)
src/editor/       RecordingEditor (trim/cut/mix/effects UI) + EditorTimeline
src/beats/        server-only beat queries + resolveAudioUrls (signed URLs; never send audio_path to the client)
src/supabase/     server.ts / browser.ts (act as the user), admin.ts (service role), proxy.ts
src/components/   shared UI (ui.ts has buttonClass/inputClass)
supabase/         migrations/*.sql, seed.sql (GENERATED), make-admin.sql
scripts/          generate-seed.ts (npm run db:seed:generate), generate-placeholder-beats.ts (ffmpeg)
SETUP.md          owner's step-by-step setup guide — update it when setup changes
```

### `/lib` is platform-agnostic
Core logic lives in `/lib` and must contain **no browser, DOM, Next.js, or React code**, so it can
be reused in a future React Native/Expo app. This includes:
- `lib/timing/` — beat/bar math and word scheduling (pure functions: BPM + start time → event times)
- `lib/words/` — word selection (difficulty, theme, no-repeat logic); takes an injectable RNG
- `lib/limits/` — save-limit rules (free = 3 saves; premium = unlimited)
- `lib/latency/` — calibration math (tap offsets → latency estimate)
- `lib/editing/` — edit list → playback segments, bar snapping for cuts, word-sequence remapping
- `lib/payments/` — payment provider interface; Stripe implementation behind it so it can be
  swapped for in-app purchases on mobile
- `lib/analytics/` — typed event names + a thin interface; PostHog adapter lives outside `/lib/core`

Functions in `/lib` take time as plain numbers (seconds) — never call `AudioContext`,
`performance.now()`, `window`, or `setTimeout` directly. Browser adapters live in `src/audio/`,
`src/recording/`, etc. and call into `/lib`.

### Audio timing rules
- **All beat-synced events are scheduled from `AudioContext.currentTime`**, never from
  `setTimeout`/`setInterval` wall-clock time. Use a short look-ahead scheduler
  (requestAnimationFrame reads `currentTime` and shows whatever word is due).
- Beat start time is captured as an AudioContext time; word change times are computed from it in `/lib`.
- Count-in = 1 bar (4 beats, 4/4 assumed). Word changes land on downbeats every 2, 4, or 8 bars (default 4).
- Recordings store: vocal file, `beat_id`, the word sequence with bar positions, the
  vocal start offset relative to beat start, and the measured latency used — enough to re-sync on playback.
- AudioContext must be created/resumed inside a user gesture (iOS Safari requirement).

### Recording editor (non-destructive)
- The original vocal file is never modified. Edits are stored as JSON on the recording
  (`recordings.edits`, added by a new migration in step 5) with a `version` field, e.g.
  `{ version: 1, trim: {start, end}, cuts: [{start, end}], mix: {vocalGain, beatGain},
  effects: {reverb, echo} }`. All times are on the **beat timeline**, so trimming/cutting moves
  beat, vocals, and prompt words together and keeps them in sync.
- Cuts snap to whole **beats** (owner asked for free-form cuts; beat snapping keeps the beat from
  stuttering while staying fine-grained); apply a ~10 ms fade at each cut. Editor has two modes:
  Trim (yellow handles) and Cut (pink selection, drag ends/middle, "Remove selection"; "Put back"
  undoes). Seeking uses a separate full-width position slider + a back-to-start button.
- One shared Web Audio graph builder (gain → reverb ConvolverNode / echo DelayNode) is used for
  the editor, the share page, and OfflineAudioContext video export, so they all sound the same.
- Editing is available before saving (review screen) and after (Recordings page); "reset" clears edits.
  Editing does not count against the save limit.

### Database
- Supabase migrations in `supabase/migrations/` (SQL, numbered). Seed data in `supabase/seed.sql`.
- Tables: `profiles` (public identity), `user_settings` (private: is_admin, age_confirmed_at,
  preferences), `beats`, `words`, `recordings`, `subscriptions`, `payment_customers`, `reports`,
  `blocks` (future: `battles`, `battle_rounds`, `votes`).
- The owner applies migrations by pasting them into the Supabase SQL Editor (see SETUP.md), so
  every new migration must be a **new file** that is safe to run once, plus a note to the owner.
- Column-level grants restrict what users may update (e.g. only `recordings.title/is_public`).
  Usernames change only through the `complete_onboarding()` RPC.
- Storage buckets `beats` and `recordings` are private; audio is served via signed URLs.
- Seed words live in `lib/words/starterWords.ts`; regenerate `supabase/seed.sql` after edits.
- To test SQL locally there's no Docker: start Postgres 16 from `/usr/lib/postgresql/16/bin`
  as the `postgres` user with small stubs for `auth.users`, `auth.uid()`, `storage.*`, and roles.
- RLS enabled on **every** table. Writes that need elevated rights (Stripe webhook, admin actions)
  use the service-role key **only on the server**.
- The free save limit is **enforced in the database** (trigger/policy on `recordings` insert), not only in UI.
- Reports and other references to content use a polymorphic-friendly shape
  (`target_type` + `target_id`) so future battle content can be reported without schema changes.
- Admin = `user_settings.is_admin = true` (set via supabase/make-admin.sql), checked with
  `public.is_admin()` in RLS and `getViewer().isAdmin` on the server.

### Code style
- TypeScript strict; no `any` without a comment explaining why.
- Server Components by default; `"use client"` only where needed (audio, recording, forms).
- Server-side mutations via Route Handlers or Server Actions; validate input (zod).
- Tailwind only; dark theme, bold hip-hop style, high contrast, mobile-first, tap targets ≥ 48px.
  The freestyle screen must be usable one-handed (primary controls in the bottom third).
- Keep components small; co-locate page-specific components under the route folder.

### Secrets
- Secrets go in `.env.local` (git-ignored). Keep `.env.example` up to date with every variable
  (names only, with comments). Never commit real keys. Only `NEXT_PUBLIC_*` vars reach the browser.

### Testing
- `npm test` runs Vitest. Timing, word scheduling, latency math, and save-limit logic in `/lib`
  must have unit tests. Add tests when changing that logic.

### iPhone Safari watch-list
Flag to the owner any change touching these, with steps to test on a real iPhone:
- Audio only starts after a user tap; the ring/silent switch can mute Web Audio.
- Mic permission prompts behave differently in Safari vs. an installed home-screen PWA.
- MediaRecorder on iOS records `audio/mp4` (AAC), not WebM/Opus — handle both.
- Output latency differs a lot between wired, Bluetooth (AirPods), and speaker — hence calibration.
- Backgrounding the tab/app suspends the AudioContext.

## Analytics events (PostHog)
`sign_up`, `session_started`, `session_completed`, `recording_saved`, `save_limit_hit`,
`paywall_viewed`, `upgrade_clicked`, `subscription_started`, `share_link_created`,
`clip_downloaded`, `share_page_visited`. Define them once as a typed union in `/lib/analytics`.

## Owner decisions (agreed defaults)
- Admin account: jnluongo250@gmail.com
- Premium: $4.99/month, no free trial
- Free starter pack: 5 beats (other beats premium)
- Placeholder beats: generated drum loops in `public/placeholder-beats/` (flagged `is_placeholder`)
- Recordings private by default; public once the user shares (share_slug assigned automatically)
- Max recording length: the beat's length, capped at 5 minutes
- Strongly prompt users to wear headphones before recording
- Prompt words are clean (no profanity/slurs/violence) — users can be 13
- Free users can create share pages and download watermarked clips
- Recording editor: trim, cut middle parts, volume balance, reverb/echo — before and after saving
- Testing happens on the Vercel deployment (auto-deploys from `main`), including on iPhone

## Status
- [x] Step 1 — setup, Supabase, auth (email + Google), schema + RLS, seed (339 words, 8 beats).
      Owner confirmed working on Vercel (email + Google sign-in).
- [x] Step 2 — beat library (genre/mood filters, 15 s previews via a shared <audio> element),
      locked premium beats → /upgrade (placeholder page), /freestyle?beat=<id> hand-off,
      admin beat upload/edit/hide/delete at /admin/beats, 8 generated placeholder beats.
      Owner confirmed working.
- [x] Step 3 — freestyle session: lib/timing/beatClock (count-in, word schedule, positionAt),
      lib/words/picker (shuffle-bag, seeded), lib/session/settings (saved in
      user_settings.preferences.freestyle). src/audio/freestyleEngine schedules clicks + beat on the
      AudioContext clock; FreestyleSession reads ctx.currentTime each frame (minus estimated output
      latency). Pause = ctx.suspend(). Wake lock while running. Owner confirmed working.
- [x] Step 4 — recording: Record toggle + mic explainer; MarkerRecorder records mic through the
      AudioContext with MediaRecorder (AAC/mp4 preferred, WebM fallback; no LGPL encoders) and stamps a
      3 kHz marker at a known context time, so file time ↔ audio clock is exact (loopback test: constant
      ~20 ms browser mic-path delay, zero jitter — absorbed by calibration). Vocal offset =
      lib/recording/sync. Calibration (/settings/calibrate): 4 lead + 8 clicks at 80 BPM, user claps,
      lib/latency estimates round trip (median); stored per mic label in localStorage; words displayed
      with roundTrip/2. Review screen: waveform, play, ±300 ms sync nudge, title, Save/Discard.
      No pausing while recording (backgrounding ends the take). Save = getSaveStatus → upload to
      recordings/<uid>/<uuid>.<ext> → createRecording; limit → SaveLimitModal (delete one / upgrade).
      Recordings page: play/rename/delete + "x of 3 free saves". Owner confirmed working.
- [x] Step 5 — recording editor. Migration 20261021000000_recording_edits.sql (edits jsonb, size
      check, grant update(edits)) — owner must run it (SETUP.md "Database updates"). lib/editing/edits
      (normalize, beat-snapped cuts, kept segments, output↔source time maps, activeWordAt) and
      lib/editing/plan (clips with 10 ms cut fades / 30 ms edge fades). src/audio/mixGraph is THE audio
      chain (gains → reverb convolver w/ seeded impulse + dotted-8th echo → limiter → 0.85 out);
      scheduleClip + MixPlayer (live) + renderMix (OfflineAudioContext — for step 7 share/video).
      src/editor/RecordingEditor + EditorTimeline used on the review screen and /recordings/[id]/edit.
      Offline render test: exact edited length, click-free cuts, no clipping at max settings.
      Awaiting owner test.
- Check in step 7: recordings made in Chrome on Linux/Firefox are WebM or Opus-in-MP4; verify they
  play on iPhone Safari share pages, else transcode or prefer another format.
- Admins can play premium beats (treated as premium for access checks).
- Step numbers changed: the recording editor was added as step 5, so Stripe is now 6,
  share/clips 7, safety/admin 8, PWA/analytics/launch 9.
- Analytics events (session_started/session_completed, …) are wired up in step 9.

## Before launch (don't forget)
- **Privacy policy + terms of service pages** (/privacy, /terms), linked from sign-up, landing footer
  and settings. Owner to source the legal text (lawyer or Termly/iubenda); we build the pages.
  Must cover voice recordings, public share pages, analytics, Stripe, and teen users.
- **Age gate 16+ outside the US, 13+ in the US** (EU/UK GDPR consent age). Owner decision, not yet
  built. Plan: ask country (prefill from Vercel's `x-vercel-ip-country` header) + age confirmation at
  sign-up/onboarding; store `country` + `age_confirmed_at`; minimum age from a lib/account rule with tests.
- **Account deletion** (Settings → Delete account: removes recordings, files, profile) — app stores
  need it and privacy laws expect it.
- "Confirm email" is currently OFF in Supabase (built-in mailer timed out). In step 9: set up custom
  SMTP (e.g. Resend), turn Confirm email back on, and apply the SETUP.md Part 5 email template.
