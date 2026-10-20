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
- **Next.js (App Router) + TypeScript (strict) + Tailwind CSS**
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
- Tables: `profiles`, `beats`, `words`, `recordings`, `subscriptions`, `reports`, `blocks`
  (future: `battles`, `battle_rounds`, `votes`).
- RLS enabled on **every** table. Writes that need elevated rights (Stripe webhook, admin actions)
  use the service-role key **only on the server**.
- The free save limit is **enforced in the database** (trigger/policy on `recordings` insert), not only in UI.
- Reports and other references to content use a polymorphic-friendly shape
  (`target_type` + `target_id`) so future battle content can be reported without schema changes.
- Admin = `profiles.is_admin = true`, checked server-side and in RLS.

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

## Status
- [ ] Step 1 — not started (plan agreed, awaiting owner's answers)
