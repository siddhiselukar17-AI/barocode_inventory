# Deploying to Vercel + hosted MySQL 8

The app needs exactly **two** runtime environment variables: `DATABASE_URL` and `SESSION_SECRET`.
(`ADMIN_EMAIL` / `ADMIN_PASSWORD` are read only by `npm run create-admin` on your own computer — never put them on Vercel.)

## 1. Create a hosted MySQL 8 database

The schema uses **foreign keys, CHECK constraints and triggers**, so you need real **MySQL 8.0.16+ (InnoDB)**.
TiDB and PlanetScale (Vitess) do **not** support triggers — don't use them.

**Railway** (simplest): New Project → *Provision MySQL* → open the MySQL service → *Variables*/*Connect* → copy the **public** URL (`MYSQL_PUBLIC_URL`, host like `*.proxy.rlwy.net`). Railway's public proxy is plain TCP, so leave `DATABASE_SSL` unset. Change the database name at the end of the URL to `barcode_inventory` (or keep `railway`; any name with letters/numbers/underscores works).

**Aiven**: Create service → MySQL (free plan available) → copy the *Service URI* (it ends in `?ssl-mode=REQUIRED`) and download the **CA certificate**. Aiven requires TLS; see `DATABASE_SSL` below.

Whichever provider you use, allow connections from Vercel. Vercel (non-Enterprise) has no fixed outbound IPs, so the database must accept connections from any IP; the protection is a strong password + TLS. Keep the DB user's password long and random.

Choose the database region closest to the Vercel Functions region (Vercel → Project → Settings → Functions → Region) for lower latency.

## 2. Environment variables

| Name | Where | Value |
| --- | --- | --- |
| `DATABASE_URL` | local `.env.local` **and** Vercel | `mysql://USER:PASSWORD@HOST:PORT/barcode_inventory` (URL-encode special characters in the password) |
| `SESSION_SECRET` | local **and** Vercel | 32+ random characters. Use the same value locally and on Vercel only if you want sessions to match; a different value on Vercel is fine. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_SSL` | optional | `true` (encrypt + verify certificate), `required`/`no-verify` (encrypt, don't verify), unset = no TLS |
| `DATABASE_SSL_CA` | optional | The provider's CA certificate PEM (Aiven). One line with literal `\n` is accepted |
| `DATABASE_POOL_SIZE` | optional | Connections per server instance (default **3** in production) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | **local only** | Used by `create-admin`; remove `ADMIN_PASSWORD` afterwards |

No variable starts with `NEXT_PUBLIC_`, so none can reach the browser bundle.

## 3. Initialise the hosted database safely (from your computer)

1. Put the hosted `DATABASE_URL` (and `DATABASE_SSL` / `DATABASE_SSL_CA` if needed) in `.env.local`. This file is git-ignored.
2. **Read-only connection test** (runs only SELECTs):
   ```powershell
   npm run db:check
   ```
3. Create tables (only after you've confirmed the target is the correct, intended database):
   ```powershell
   npm run db:setup
   ```
   It is non-destructive: `CREATE DATABASE/TABLE IF NOT EXISTS`, and it re-creates only the two history-protection triggers. It never drops tables or touches rows.
4. Create the first admin (set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` of 12+ characters in `.env.local` first):
   ```powershell
   npm run create-admin
   ```
   Then delete `ADMIN_PASSWORD` from `.env.local`. It never resets an existing admin's password.
5. Don't run `npm run seed` in production unless you want the 4 demo products.

## 4. Deploy on Vercel

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. **Import** `siddhiselukar17-AI/barocode_inventory` (grant Vercel access to that repo if asked).
3. Project settings (all auto-detected; verify):
   - Framework Preset: **Next.js**
   - Root Directory: `./` (repository root)
   - Build Command: `next build` (default) · Install Command: `npm install` (default) · Output Directory: default (leave empty)
   - Node.js version: 20.x or newer (the project declares `>=20.9`)
   - Production Branch: **main**
4. Expand **Environment Variables**, add `DATABASE_URL` and `SESSION_SECRET` (plus `DATABASE_SSL`, `DATABASE_SSL_CA` if you use them) for *Production* (and *Preview* if you want preview deploys to work).
5. Click **Deploy**. Every later push to `main` redeploys automatically.

## 5. Open your site

When the build finishes, Vercel shows a URL like `https://barocode-inventory.vercel.app` (Project → Domains).
Open `https://<your-url>/admin/dashboard` — you'll be redirected to `/login`; sign in with the admin created in step 3.
The camera scanner works because Vercel serves HTTPS (browsers block camera access on plain HTTP except `localhost`).

## 6. Production notes and remaining risks

- **Login rate limiting** is stored in MySQL (`rate_limits` table) so it holds across all serverless instances (5 attempts per IP+email and 30 per IP per 15 minutes). Other authenticated endpoints use a per-instance in-memory limiter, which is approximate on serverless.
- **Cookies**: `HttpOnly`, `SameSite=Lax`, `Secure` in production, 8-hour signed session; the admin is re-checked in the database on every API call.
- **Connection limits**: each warm serverless instance keeps up to 3 connections. Many concurrent instances can exceed a small plan's limit (Railway/Aiven free tiers are low). If you see `ER_CON_COUNT_ERROR`, lower `DATABASE_POOL_SIZE` to `1`–`2` or upgrade the plan.
- **TLS**: prefer `DATABASE_SSL=true` with the provider CA. `no-verify` encrypts but doesn't authenticate the server.
- **Secrets**: rotate the DB password and `SESSION_SECRET` if they are ever exposed. Rotating `SESSION_SECRET` logs everyone out.
- **Backups**: enable your provider's automatic backups; stock history is permanent and only fixable via adjustment records.
