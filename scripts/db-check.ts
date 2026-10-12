/**
 * READ-ONLY connection check. Connects with DATABASE_URL, runs SELECT queries only, and reports
 * whether the tables exist. It never creates, changes or deletes anything.
 *
 * Run:  npm run db:check
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not set.");
  const { query, closePool, parseDatabaseUrl } = await import("../src/lib/db");
  const cfg = parseDatabaseUrl();
  try {
    const [info] = await query<{ v: string } & import("mysql2/promise").RowDataPacket>("SELECT VERSION() AS v");
    console.log(`✔ Connected to MySQL ${info.v} at ${cfg.host}:${cfg.port}, database "${cfg.database}" (TLS: ${cfg.ssl ? "on" : "off"})`);
    const tables = await query<{ t: string } & import("mysql2/promise").RowDataPacket>(
      "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    );
    const have = new Set(tables.map((r) => r.t));
    for (const t of ["admins", "products", "inventory_transactions", "rate_limits"]) {
      console.log(`  ${have.has(t) ? "✔" : "✖ missing:"} ${t}`);
    }
    if (!["admins", "products", "inventory_transactions", "rate_limits"].every((t) => have.has(t))) {
      console.log("\nSome tables are missing. After you approve it, run: npm run db:setup");
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  const e = err as { code?: string; message?: string };
  console.error(`\n✖ Connection failed${e.code ? ` (${e.code})` : ""}: ${e.message ?? err}\n`);
  process.exit(1);
});
