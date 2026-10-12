/**
 * Creates the MySQL database (if your user may) and all tables/triggers. Safe to re-run.
 *
 * Run:  npm run db:setup
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local first (see .env.example).");
  }
  const { ensureSchema } = await import("../src/lib/schema");
  const { closePool } = await import("../src/lib/db");
  try {
    console.log("Setting up MySQL schema…");
    await ensureSchema();
    console.log("\n✔ Database ready (tables: admins, products, inventory_transactions).\n");
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
