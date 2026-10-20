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
5. Stripe Premium and paywall
6. Share pages and video clip export
7. Reporting, blocking, admin page
8. PWA setup, analytics, deployment to Vercel

Track which step is current in the "Status" section at the bottom of this file.

## Architecture & conventions

### Layout
```
lib/              platform-agnostic core logic + tests (import as @lib/...)
src/app/          routes. (auth)/ = login & signup, (app)/ = signed-in pages with bottom nav
src/auth/         viewer.ts (getViewer/requireViewer), safeNext, siteUrl
src/supabase/     server.ts / browser.ts (act as the user), admin.ts (service role), proxy.ts
src/components/   shared UI (ui.ts has buttonClass/inputClass)
supabase/         migrations/*.sql, seed.sql (GENERATED), make-admin.sql
scripts/          generate-seed.ts (npm run db:seed:generate)
SETUP.md          owner's step-by-step setup guide — update it when setup changes
```

### `/lib` is platform-agnostic
Core logic lives in `/lib` and must contain **no browser, DOM, Next.js, or React code**, so it can
be reused in a future React Native/Expo app. This includes:
- `lib/timing/` — beat/bar math and word scheduling (pure functions: BPM + start time → event times)
- `lib/words/` — word selection (difficulty, theme, no-repeat logic); takes an injectable RNG
- `lib/limits/` — save-limit rules (free = 3 saves; premium = unlimited)
- `lib/latency/` — calibration math (tap offsets → latency estimate)
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
- Testing happens on the Vercel deployment (auto-deploys from `main`), including on iPhone

## Status
- [x] Step 1 — setup, Supabase, auth (email + Google), schema + RLS, seed (339 words, 8 beats)
- [ ] Step 2 — beat library and player (generate placeholder audio with ffmpeg first)
