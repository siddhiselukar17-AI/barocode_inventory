# Barcode / QR Inventory Management

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn-style UI · MySQL 8 (mysql2) · Zod · React Hook Form · signed HTTP-only cookie sessions.

## Quick start (Windows / VS Code)

```powershell
npm install
copy .env.example .env.local      # then edit .env.local (see below)
npm run dev                       # http://localhost:3000
```

`.env.local` is git-ignored. Required values:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `mysql://USER:PASSWORD@localhost:3306/barcode_inventory` (server only; URL-encode special characters in the password) |
| `SESSION_SECRET` | 32+ random chars. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used **only** by `npm run create-admin` (password ≥ 12 chars) |

### MySQL setup (Windows)
1. Make sure the MySQL service is running (`MySQL80` in *Services*) and you know a user/password that can create databases (e.g. `root`).
2. Put the URL in `.env.local`, e.g. `DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/barcode_inventory`.
3. Create the database, tables and triggers (safe to re-run):
   ```powershell
   npm run db:setup
   ```
   If your MySQL user cannot `CREATE DATABASE`, create an empty `barcode_inventory` database first, then run the command.
4. Hosted MySQL (Railway, Aiven, PlanetScale-compatible, etc.) works the same: paste its URL into `DATABASE_URL`. Use a MySQL 8.0.16+ server (CHECK constraints) with InnoDB.

### First admin and demo data
```powershell
npm run create-admin   # reads ADMIN_EMAIL / ADMIN_PASSWORD, hashes with bcrypt, creates tables if needed, never resets an existing account
npm run seed           # optional: 4 demo products, initial stock recorded as STOCK_IN transactions; safe to re-run
```
After the admin exists, delete `ADMIN_PASSWORD` from `.env.local`. For a separate test account, run `create-admin` again with a different `ADMIN_EMAIL`.

> **Going live?** See [DEPLOY.md](DEPLOY.md) for Vercel + hosted MySQL.

## Scripts
| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm start` | Production build / server |
| `npm run db:check` | Read-only connection / table check |
| `npm run db:setup` | Create database, tables and triggers |
| `npm run create-admin` | Create the first admin |
| `npm run seed` | Seed demo products (idempotent) |

## What needs MySQL
Everything except rendering the login page and the redirect/401 behaviour: **login, all `/api/*` data routes, every admin page's data**. Without `DATABASE_URL` the API returns `503 DATABASE_NOT_CONFIGURED`; with a wrong URL/password it returns `503 DATABASE_UNAVAILABLE`; before `db:setup` it returns `503 DATABASE_NOT_INITIALIZED`.

## Architecture notes
- **Auth**: HS256 JWT (via `jose`) in an `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie, 8 h expiry. `middleware.ts` guards `/admin/*`; every API route calls `requireAdmin()`, which re-verifies the signature/expiry **and** re-loads the admin from MySQL (deactivated accounts lose access immediately). Login is rate limited, uses a constant-time-ish bcrypt compare for unknown emails and returns one generic error. Cross-origin mutating API calls are rejected in middleware.
- **Inventory integrity** (`src/lib/inventory.ts`): every stock change (stock in/out, adjustment, initial stock, seed) goes through one function. Quantities, before/after values and the admin are computed on the server inside a real **InnoDB transaction**: `SELECT … FOR UPDATE` locks the product row (concurrent requests are serialised, no overselling), then the stock update and the history row commit together or roll back together. A `CHECK (stock_quantity >= 0)` constraint is a second line of defence.
- **Idempotency**: the UI sends an `idempotencyKey` per attempt; a unique partial index `(performedBy, idempotencyKey)` guarantees a retried request cannot create a second movement.
- **Immutable history**: MySQL triggers reject any `UPDATE`/`DELETE` on `inventory_transactions`; corrections are new `ADJUSTMENT` records. Foreign keys are `RESTRICT`, and products with history are archived rather than deleted.
- **Stock is never editable through the product API** (the PATCH schema is strict and rejects `stockQuantity`).
- **CSV export** neutralises formula injection (`= + - @ TAB CR` prefixed with `'`).
- **Labels**: `jsbarcode` (EAN-13/UPC/EAN-8 when valid, otherwise Code 128) and `qrcode`. Barcode = product barcode (or SKU if none); QR = QR value, else barcode, else SKU. The scanner looks up by barcode, then QR value, then SKU. Print from a product page; test by scanning the printed/on-screen label with the Scanner page or a USB scanner.
- **Rate limiting** is in-memory per server instance. On serverless/multi-instance hosting use a shared store (e.g. Upstash Redis) for strict limits.

## Deployment notes
- Set `DATABASE_URL` and `SESSION_SECRET` as host environment variables (never commit them), then run `npm run db:setup` once against the production database.
- The MySQL server must be reachable from your host (allow its IPs/firewall) and should use TLS for remote connections (add `?ssl={"rejectUnauthorized":true}` per your provider's docs).
- **HTTPS is required for camera access** on deployed sites (`localhost` is exempt). Cookies are `Secure` in production, so serve over HTTPS.
- Use InnoDB and MySQL 8.0.16+ so transactions, row locks, CHECK constraints and triggers work. Your DB user needs `CREATE TRIGGER` privilege for `db:setup`.

## Manual test checklist
1. Log in / out · wrong password shows a generic error · visiting `/admin/*` logged out redirects to `/login`.
2. `curl localhost:3000/api/products` (no cookie) → `401`.
3. Create a product with initial stock → a STOCK_IN row appears in Transactions.
4. Create another with the same SKU or barcode → rejected (409).
5. Scanner: manual-enter the barcode → Stock In 5 → stock increases; Stock Out 3 → decreases; Stock Out more than available → rejected.
6. Unknown barcode → "Register new product" opens the form with the barcode pre-filled.
7. Camera: Start camera, show the printed label; the same code isn't re-processed during the 3 s cooldown or until "Scan next item".
8. Inventory → Adjust (reason required) → ADJUSTMENT transaction with correct before/after.
9. Dashboard KPIs change after each movement; range buttons change the period figures only.
10. Transactions: search, type, date filters, sort, **Export CSV** matches the filters.
11. Archive a product with history → hidden by default, still visible in Transactions.
