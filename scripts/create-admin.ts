/**
 * Creates the FIRST admin account from environment variables.
 *
 *   ADMIN_EMAIL, ADMIN_PASSWORD  (in .env.local or the shell)
 *
 * Run:  npm run create-admin
 *
 * Also creates the database tables if they don't exist yet.
 * Safety: if an account with that email already exists, nothing is changed
 * (the password is never reset by this script).
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const PLACEHOLDERS = ["change_this_password", "your_password", "password"];

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!dbUrl) fail("DATABASE_URL is not set. Add your MySQL connection URL to .env.local first.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("ADMIN_EMAIL is missing or not a valid email address.");
  if (!password) fail("ADMIN_PASSWORD is not set.");
  if (PLACEHOLDERS.includes(password.toLowerCase())) fail("ADMIN_PASSWORD is still a placeholder. Choose a real password.");
  if (password.length < 12) fail("ADMIN_PASSWORD must be at least 12 characters long.");

  const { ensureSchema } = await import("../src/lib/schema");
  const { closePool, execute, query } = await import("../src/lib/db");

  try {
    console.log("Connecting to MySQL…");
    await ensureSchema();

    const existing = await query("SELECT id FROM admins WHERE email = ? LIMIT 1", [email]);
    if (existing.length > 0) {
      console.log(`\n✔ An admin with email ${email} already exists. Nothing changed (password was NOT reset).\n`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    await execute(
      "INSERT INTO admins (email, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, 'ADMIN', 1, ?, ?)",
      [email, passwordHash, now, now],
    );
    console.log(`\n✔ Admin created: ${email}`);
    console.log("  You can now sign in at http://localhost:3000/login");
    console.log("  Tip: remove ADMIN_PASSWORD from .env.local now that the account exists.\n");
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  fail(`Could not create admin: ${msg}`);
});
