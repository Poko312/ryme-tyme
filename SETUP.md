# Rhyme Tyme — Setup guide

Follow these steps in order. You only do each one once. Keep a private note (a password
manager is best) of every password and key you create. **Never paste secret keys into
chat, GitHub, or anywhere public.**

---

## Part 1 — Create the database tables (Supabase)

You already created the `rhyme-tyme` project in Supabase.

1. Open https://supabase.com/dashboard and click your **rhyme-tyme** project.
2. In the left sidebar, click **SQL Editor**.
3. Click **+ New query** (or the **+** button at the top).
4. In a new browser tab, open this file on GitHub:
   https://github.com/Poko312/ryme-tyme/blob/main/supabase/migrations/20261020000000_initial_schema.sql
5. Click the **Copy raw file** button (two overlapping squares, top-right of the file).
6. Go back to the Supabase SQL Editor, click in the big text box, paste (Ctrl+V / Cmd+V).
7. Click **Run** (bottom-right). You should see **"Success. No rows returned"**.
   - If it says something "already exists", the file was already run — that's fine, move on.
8. Click **+ New query** again. Open
   https://github.com/Poko312/ryme-tyme/blob/main/supabase/seed.sql,
   copy the raw file, paste it, and click **Run**. This adds 339 prompt words and 8 placeholder beats.
9. Check it worked: in the left sidebar click **Table Editor**. You should see tables
   `beats` (8 rows), `words` (339 rows), `profiles`, `recordings`, etc.

## Part 2 — Copy your Supabase keys

1. In Supabase, click the **gear icon (Project Settings)** at the bottom of the left sidebar.
2. Click **Data API** (or **API**). Copy the **Project URL** (looks like
   `https://abcdefghijkl.supabase.co`) into your private note, labelled `NEXT_PUBLIC_SUPABASE_URL`.
3. Click **API Keys**.
   - Copy the **Publishable key** (starts with `sb_publishable_`) → label it `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - Under **Secret keys**, click the eye/copy icon on the default secret key (starts with
     `sb_secret_`). If there isn't one, click **+ New secret key**, name it `vercel`, and create it.
     Label it `SUPABASE_SECRET_KEY`. **This one is powerful — keep it private.**
   - If you only see "anon" and "service_role" keys (older layout): use **anon** for the
     publishable key and **service_role** for the secret key. Both work.

## Part 3 — Put the app online (Vercel)

1. Go to https://vercel.com/signup and choose **Continue with GitHub**. Pick the free **Hobby** plan.
2. On the dashboard, click **Add New… → Project**.
3. Find **ryme-tyme** in the list and click **Import**. (If it isn't listed, click
   **Adjust GitHub App Permissions**, give Vercel access to `ryme-tyme`, then come back.)
4. Leave all build settings as they are. Open the **Environment Variables** section and add
   these three, one at a time (Name on the left, value from your note on the right, then **Add**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
5. Click **Deploy**. Wait 1–2 minutes for the confetti.
6. Click **Continue to Dashboard**. Under **Domains** you'll see your site address, something like
   `ryme-tyme.vercel.app`. Write it down — that's **your app's URL**.

From now on, every time code is pushed to GitHub, Vercel rebuilds the site automatically.

## Part 4 — Tell Supabase about your app's URL

1. In Supabase, click **Authentication** in the left sidebar, then **URL Configuration**.
2. **Site URL**: replace it with your app's URL, e.g. `https://ryme-tyme.vercel.app`. Click **Save**.
3. **Redirect URLs**: click **Add URL** and add each of these (use your real URL):
   - `https://ryme-tyme.vercel.app/**`
   - `http://localhost:3000/**`
   Click **Save**.

## Part 5 — Fix the confirmation email link (important for phones)

Without this, the "confirm your email" link can fail when it opens in a different browser
(for example, tapping it inside the Gmail app on an iPhone).

1. In Supabase, click **Authentication → Emails** (or **Email Templates**).
2. Click the **Confirm signup** template.
3. In the message body, find `{{ .ConfirmationURL }}` and replace it with exactly:
   ```
   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/home
   ```
   (It appears inside `href="..."`. Replace only what's between the quotes.)
4. Optional: change the subject to `Confirm your Rhyme Tyme account`.
5. Click **Save**.

> ⚠️ Supabase's built-in email sender is for testing only: it sends just a few emails per hour,
> and may only deliver to your own (team member) address. Before real users sign up we'll connect
> a proper email service (step 8). For now, test with your own email.

## Part 6 — Test step 1

On your computer **and** on your iPhone (in Safari), open your app's URL and check:

- [ ] The landing page loads with the dark/yellow design.
- [ ] **Start freestyling** → sign-up form. Try a username like `ab` — you get a friendly error.
- [ ] Leaving the "13 or older" box unticked won't let you sign up.
- [ ] Sign up with jnluongo250@gmail.com, a username, and a password → "Check your email".
- [ ] The email arrives; tapping the link signs you in and shows **What's good, @yourname**.
- [ ] The bottom bar shows Home / Beats / Spit / Saved / Settings (the middle three say "Coming in step N").
- [ ] **Settings → Log out** takes you back to the landing page.
- [ ] **Log in** with your email and password works. A wrong password shows "Wrong email or password."
- [ ] While logged out, visiting `your-url/home` sends you to the login page.
- [ ] In Supabase → **Table Editor → profiles**, your username is there.

## Part 7 — Make yourself admin

After you've signed up:

1. Supabase → **SQL Editor → + New query**.
2. Open https://github.com/Poko312/ryme-tyme/blob/main/supabase/make-admin.sql, copy the raw
   file, paste, **Run**. The result should show your email with `is_admin = true`.
3. In the app, **Settings** now shows **Role: Admin**.

## Part 8 — Google sign-in (optional now, needed before launch)

Takes about 15 minutes. Until this is done, the "Continue with Google" button shows an error.

**A. Get the callback address from Supabase**
1. Supabase → **Authentication → Sign In / Providers** → click **Google**.
2. Copy the **Callback URL (for OAuth)** shown there (looks like
   `https://abcdefghijkl.supabase.co/auth/v1/callback`). Leave this tab open.

**B. Create Google credentials**
1. Go to https://console.cloud.google.com and sign in with your Google account.
2. At the top, click the project picker → **New Project** → name it `Rhyme Tyme` → **Create**.
   Make sure it's selected in the project picker.
3. Search the top bar for **Google Auth Platform** and open it. Click **Get started**.
   - App name: `Rhyme Tyme`. User support email: your email. **Next**.
   - Audience: **External**. **Next**.
   - Contact email: your email. **Next** → agree → **Create**.
4. In the left menu click **Clients → + Create client**.
   - Application type: **Web application**. Name: `Rhyme Tyme web`.
   - Under **Authorized JavaScript origins** click **+ Add URI** and enter your app's URL
     (e.g. `https://ryme-tyme.vercel.app`).
   - Under **Authorized redirect URIs** click **+ Add URI** and paste the Supabase callback URL from A.2.
   - Click **Create**. Copy the **Client ID** and **Client secret** into your private note.
5. In the left menu click **Audience** and click **Publish app** (so anyone can sign in, not just test users).

**C. Turn it on in Supabase**
1. Back in the Supabase Google provider tab: switch **Enable Sign in with Google** on.
2. Paste the **Client ID** and **Client secret**. Click **Save**.
3. Test: log out, click **Continue with Google**. New Google users are asked to pick a
   username and confirm they're 13+.

---

## Database updates for later steps

Some build steps add to the database. Run each update **once**, in order, the same way as Part 1:
Supabase → **SQL Editor → + New query** → paste the file's raw contents → **Run** → "Success".
(Each update is safe to run twice by accident.)

| Step | File | What it adds |
|---|---|---|
| 5 | [`supabase/migrations/20261021000000_recording_edits.sql`](https://github.com/Poko312/ryme-tyme/blob/main/supabase/migrations/20261021000000_recording_edits.sql) | Saved edits (trim, cuts, mix, effects) on recordings |
| 5b | [`supabase/migrations/20261022000000_recording_layers.sql`](https://github.com/Poko312/ryme-tyme/blob/main/supabase/migrations/20261022000000_recording_layers.sql) | Overdub layers (ad-libs) on recordings, with the free/Premium layer limit |

---

## Running it on your own computer (optional — not needed if you test on Vercel)

1. Install Node.js 22 or newer from https://nodejs.org (the "LTS" button).
2. Download the code: on https://github.com/Poko312/ryme-tyme click **Code → Download ZIP**, unzip it.
3. In the folder, copy `.env.example` to a new file called `.env.local` and fill in the three Supabase values.
4. Open a terminal in that folder and run `npm install`, then `npm run dev`.
5. Open http://localhost:3000.
