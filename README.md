<p align="center">
  <img src="assets/logo.svg" alt="shortic" width="320" />
</p>

<p align="center">
  <strong>A static URL shortener without a backend server.</strong><br />
  <em>Fragment-based redirects (<code>example.com/#code</code>), Supabase behind the scenes.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cloudflare%20Pages-f38020?logo=cloudflare&logoColor=white" alt="Cloudflare Pages" />
  <img src="https://img.shields.io/badge/Database-Supabase-3fcf8e?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/License-MIT-3da9fc" alt="License: MIT" />
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.id.md">Bahasa Indonesia</a>
</p>

---

## Features

- **No backend server** — everything is static HTML/CSS/JS hosted on Cloudflare Pages. No Node server, no Worker (unless you want to add one).
- **Fragment-based short links** — `https://example.com/#abc123` redirects to the target URL client-side.
- **Google OAuth login** with a database-level **allowlist** enforced by a Postgres trigger — rejected users are deleted from `auth.users` automatically.
- **Admin panel** (`admin.example.com`):
  - Create / edit / delete links with auto-generated random codes (or custom codes).
  - Search and pagination for large link lists.
  - **QR code** per link with copy + **PNG download**.
  - User management (admins only): change roles and manage the email allowlist.
  - Responsive **flat UI** with **dark mode** toggle.
- **Row-level security** — users can only manage their own links; admins manage everything.
- **Anti-enumeration** — anonymous clients can only look up links through a constrained `SECURITY DEFINER` RPC, never direct table access.
- **Keep-alive cron** — a GitHub Actions workflow pings Supabase daily so a free-tier project is never paused for inactivity.

## Architecture

```
                        ┌─────────────────────────────┐
                        │        Cloudflare Pages      │
                        │                             │
   example.com/#code ──▶│  public-site/  (static)     │
                        │  reads #code, calls RPC     │
                        └──────────────┬──────────────┘
                                       │  supabase-js (anon key)
                        ┌──────────────▼──────────────┐
                        │          Supabase            │
                        │  Postgres + Auth + RLS       │
                        │  - links / profiles          │
                        │  - allowed_emails (allowlist)│
                        └──────────────▲──────────────┘
                                       │  supabase-js (authenticated)
                        ┌──────────────┴──────────────┐
                        │  admin-panel/  (static)      │
   admin.example.com ──▶│  Google OAuth login + CRUD   │
                        └─────────────────────────────┘

   .github/workflows/supabase-keepalive.yml
     ──▶ pings Supabase daily to prevent free-tier pause
```

**Security model**

- The **`anon` key is public** — it is embedded in the public site's JavaScript and is safe to expose. All real enforcement lives in the **database** (RLS policies + triggers), never in frontend code.
- Anonymous clients can **only** call `get_link_by_code()` (a `SECURITY DEFINER` RPC that returns at most one row for an exact code). Direct `SELECT` on `links` is revoked for the `anon` role.
- The `service_role` key **must never** be committed to the repository or embedded in frontend code.

## Tech Stack

- **Frontend:** vanilla HTML/CSS/JS (no framework), [supabase-js v2](https://github.com/supabase/supabase-js), [Materialize CSS](https://materializecss.com/) (overridden to a flat design), [qrcodejs](https://github.com/davidshimjs/qrcodejs) for QR rendering.
- **Backend / data:** [Supabase](https://supabase.com) (Postgres + Auth + RLS).
- **Hosting:** Cloudflare Pages (two projects).
- **CI:** GitHub Actions (daily keep-alive).

## Project Structure

```
shortic/
├── public-site/                 # → CF Pages project "shortener" (example.com)
│   ├── index.html               # landing page with the SVG logo
│   ├── app.js                   # reads #code, resolves via RPC, redirects
│   ├── config.js                # runtime config (gitignored, generated at build)
│   └── style.css
│
├── admin-panel/                 # → CF Pages project "shortener-admin" (admin.example.com)
│   ├── index.html               # login page (Google OAuth)
│   ├── dashboard.html           # CRUD links, users, allowlist, QR
│   ├── auth.js                  # session guard + profile sync
│   ├── app.js                   # dashboard logic (search, pagination, QR, modals)
│   ├── theme.js                 # dark/light mode toggle (localStorage)
│   ├── config.js                # runtime config (gitignored, generated at build)
│   └── style.css
│
├── supabase/
│   ├── schema.sql               # tables, RPCs, allowlist trigger
│   ├── policies.sql             # RLS policies (idempotent)
│   ├── seed.sql                 # insert your first admin email
│   └── reconcile.sql            # one-time backfill for pre-existing users
│
├── scripts/
│   └── generate-config.js       # writes config.js from env vars at build time
│
├── assets/
│   └── logo.svg                 # the shortic logo (used in this README)
│
└── .github/workflows/
    └── supabase-keepalive.yml   # daily ping to prevent free-tier pause
```

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier is enough).
- A [Cloudflare](https://cloudflare.com) account with Pages.
- A [GitHub](https://github.com) account (for hosting the repo + Actions).
- (Optional but recommended) a custom domain, e.g. `example.com` with `admin.example.com` for the admin panel.
- A Google Cloud project for OAuth.

## Setup

### 1. Create a Supabase project

1. Create a project at [database.new](https://database.new).
2. Go to **Settings → API** and note down:
   - **Project URL** (e.g. `https://YOUR-PROJECT-REF.supabase.co`)
   - **anon public** key

### 2. Run the SQL

Open the **SQL Editor** in the Supabase dashboard and run, in order:

1. `supabase/schema.sql` — creates tables (`links`, `profiles`, `allowed_emails`), the allowlist trigger on `auth.users`, and the RPCs.
2. `supabase/policies.sql` — enables Row Level Security and creates all policies (idempotent, safe to re-run).
3. `supabase/seed.sql` — **edit it first** and replace `admin@example.com` with your own email, then run it. This creates the first admin entry in the allowlist.

> If you already had users in `auth.users` before the trigger existed, also run `supabase/reconcile.sql` once. It creates profiles for allowlisted users and removes users who are not allowlisted.

### 3. Set up Google OAuth

**Google Cloud Console**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create/select a project.
2. **APIs & Services → OAuth consent screen** → choose *External*, fill in app name and email, then click **Publish app**.
   - While the app is in *Testing* status, only emails you add as test users can log in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
4. Add the **Authorized redirect URI**:
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
5. Add the **Authorized JavaScript origins**:
   - `https://admin.example.com`
   - `http://localhost` and `http://localhost:PORT` (only if you develop locally)
6. Copy the **Client ID** and **Client Secret**.

**Supabase Dashboard**

1. **Authentication → Providers** → enable **Google**.
2. Paste the Client ID and Client Secret, then **Save**.

### 4. Create the local `config.js` files

`config.js` is **gitignored** on purpose. For local development, copy `.env.example` values into `public-site/config.js` and `admin-panel/config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
  PUBLIC_BASE_URL: "https://example.com", // admin-panel only
};
```

> `PUBLIC_BASE_URL` is used by the admin panel to build the short-link text shown in the dashboard. It is not needed in `public-site/config.js`.

### 5. Local development

Serve each folder with any static server, e.g.:

```bash
npx serve public-site
npx serve admin-panel
```

Make sure your local origins (e.g. `http://localhost:3000`) are added to both:
- Google Cloud Console → **Authorized JavaScript origins**
- Supabase → **Authentication → URL Configuration → Redirect URLs** (e.g. `http://localhost:3000/dashboard.html`)

## Deploy to Cloudflare Pages

`config.js` is **not** stored in the repository. At build time it is generated from environment variables by `scripts/generate-config.js`.

Create **two separate Pages projects** from this repository.

### Project 1 — `shortener` (public site → `example.com`)

| Setting                | Value                                            |
|------------------------|--------------------------------------------------|
| Root directory         | *(leave empty — repo root)*                      |
| Build command          | `node scripts/generate-config.js public-site`    |
| Build output directory | `public-site`                                    |

### Project 2 — `shortener-admin` (admin → `admin.example.com`)

| Setting                | Value                                            |
|------------------------|--------------------------------------------------|
| Root directory         | *(leave empty — repo root)*                      |
| Build command          | `node scripts/generate-config.js admin-panel`    |
| Build output directory | `admin-panel`                                    |

> **Important:** do **not** set the Root directory to a subfolder — the build command always runs from the repo root. If you already set one, clear it; or use `node ../scripts/generate-config.js .` with output directory `.`.

### Environment variables

Set these in **Settings → Environment variables** of each project:

| Variable           | public-site | admin-panel | Description                                   |
|--------------------|:-----------:|:-----------:|-----------------------------------------------|
| `SUPABASE_URL`     | ✅          | ✅          | Your Supabase Project URL                     |
| `SUPABASE_ANON_KEY`| ✅          | ✅          | Your Supabase anon public key                 |
| `PUBLIC_BASE_URL`  | —           | ✅          | Public base URL for short links, e.g. `https://example.com` |

> When deploying via **Direct Upload**, upload the local folder directly — `config.js` is included because it exists locally. Make sure it is filled in before uploading.

### Custom domains

1. Go to the project → **Custom domains** → add `example.com` (public site) and `admin.example.com` (admin).
2. Follow the DNS verification steps.
3. Add `https://admin.example.com` to the **Authorized JavaScript origins** in Google Cloud Console.

## GitHub Actions — Supabase Keep-Alive

The workflow in `.github/workflows/supabase-keepalive.yml` pings Supabase once a day to prevent a free-tier project from being paused after 7 days of inactivity.

Set two repository secrets (**Settings → Secrets and variables → Actions**):

| Secret                | Value                                          |
|-----------------------|------------------------------------------------|
| `SUPABASE_URL`        | `https://YOUR-PROJECT-REF.supabase.co`         |
| `SUPABASE_ANON_KEY`   | your anon public key                           |

> The workflow calls the `get_link_by_code` RPC with a dummy code rather than querying the `links` table directly. Anonymous direct access to `links` is deliberately revoked for security (anti-enumeration), so a direct table query would fail — and would defeat the security model if it worked.

Run it manually once from the **Actions** tab to verify (the log should show `Supabase pinged successfully.`).

## Environment Variables Reference

| Variable             | Where                          | Required | Purpose                                   |
|----------------------|--------------------------------|:--------:|-------------------------------------------|
| `SUPABASE_URL`       | CF Pages env (both projects), local `config.js` | ✅ | Supabase Project URL          |
| `SUPABASE_ANON_KEY`  | CF Pages env (both projects), local `config.js`, GitHub secret | ✅ | Supabase anon public key |
| `PUBLIC_BASE_URL`    | CF Pages env (admin only), local `config.js` (admin only) | ⚠️ | Public short-link base for the admin dashboard |

## Security Notes

- **`anon` key is public by design.** It lives in the frontend and is safe to expose; the protection comes from RLS, not from hiding the key.
- **Direct table access is revoked for `anon`** (`revoke all on table public.links from anon`). The only anon entry point is `get_link_by_code()`, a `SECURITY DEFINER` RPC that returns exactly one row for an exact `code` — preventing bulk enumeration of every short link.
- **The allowlist is enforced in the database**, not in the UI. A trigger on `auth.users` deletes accounts whose email is not in `allowed_emails`, so a rejected user cannot keep using a session even if they bypass the frontend.
- **RLS policies** guarantee users can only `SELECT/UPDATE/DELETE` links they own (`owner_id = auth.uid()`), unless they are admins.
- **Never commit the `service_role` key** to the repository or embed it in frontend code. It is only for trusted server-side/admin tooling.

## Troubleshooting

| Symptom                                                              | Likely cause / fix                                                                                                    |
|----------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `Refused to execute script from '.../config.js'` (MIME text/html)    | `config.js` was not generated during the Pages build. Set the build command + env vars (see Deploy section).          |
| `infinite recursion detected in policy for relation "profiles"`       | You are running an older `policies.sql`. Re-run `schema.sql` (adds `is_admin()`) then the latest `policies.sql`.      |
| After Google login it redirects to `localhost:3000`                  | Supabase **Site URL** / **Redirect URLs** are still local. Update them to your real domains.                          |
| Keep-alive fails with HTTP 401                                       | Stale/incorrect `SUPABASE_ANON_KEY` in GitHub Secrets. Re-copy the current anon key from Supabase → Settings → API.    |
| `Identifier 'supabase' has already been declared`                    | Old cached scripts. Hard refresh (Ctrl+Shift+R) — the current code names the client `sb` to avoid the CDN global.      |
| Short link shows the logo but never redirects                        | Check the browser console. Usually a missing/invalid `config.js` or the RPC not existing in your Supabase project.     |

## Limitations & Roadmap

- Static redirects happen client-side, so search engines / bots that don't run JavaScript will not follow the redirect.
- Free-tier Supabase limits apply (500 MB database, project pause after 7 days of inactivity — mitigated by the keep-alive cron).
- Potential improvements: click analytics dashboard, custom slug editing, custom themes, PWA support.

## License

[MIT](LICENSE) © 2026 Teguh Santoso