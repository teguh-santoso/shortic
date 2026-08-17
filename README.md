# shortic

Static URL Shortener berbasis fragment (`contoh.com/#code`), tanpa backend server.

## Arsitektur

- **`public-site/`** → project CF Pages `shortener` (domain utama). Baca `#code`, lookup via Supabase RPC `get_link_by_code`, redirect client-side.
- **`admin-panel/`** → project CF Pages `shortener-admin` (`admin.` subdomain). Login Google OAuth, CRUD link, manajemen user (admin).
- **`supabase/`** → `schema.sql` (tabel + RPC + trigger allowlist) dan `policies.sql` (RLS).
- **`.github/workflows/supabase-keepalive.yml`** → cron harian mencegah pause project Free.

## Setup

1. Buat project di [supabase.com](https://supabase.com), ambil `Project URL` dan `anon key` (Settings → API).
2. Jalankan `supabase/schema.sql` lalu `supabase/policies.sql` di SQL Editor.
3. Isi satu baris di `allowed_emails` dengan email kamu, role `admin` — supaya ada admin pertama.
4. Aktifkan provider **Google** di Authentication → Providers, lengkapi Client ID/Secret dari Google Cloud Console.
5. Salin `.env.example` → isi `config.js` di `public-site/` dan `admin-panel/` dengan `SUPABASE_URL` dan `SUPABASE_ANON_KEY`.
6. Set `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sebagai GitHub Secrets untuk workflow keep-alive.

## Deploy ke Cloudflare Pages

`config.js` **tidak** disimpan di repo (lihat `.gitignore`). Saat deploy, file di-generate dari environment variables via `scripts/generate-config.js`.

Untuk tiap project, atur di Dashboard → project → **Settings → Builds & deployments**:

**Project `shortener` (public-site → `contoh.com`)**
- Build command: `node scripts/generate-config.js public-site`
- Build output directory: `public-site`

**Project `shortener-admin` (admin-panel → `admin.contoh.com`)**
- Build command: `node scripts/generate-config.js admin-panel`
- Build output directory: `admin-panel`

**Environment variables** (tambahkan di kedua project — Settings → Environment variables):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

> Saat deploy via **Direct Upload**, `config.js` ikut karena di-upload dari folder lokal — pastikan `config.js` sudah terisi sebelum upload.

Setelah deploy, tambahkan `https://admin.contoh.com` ke *Authorized JavaScript origins* di Google Cloud Console.