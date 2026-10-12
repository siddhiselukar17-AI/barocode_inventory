/**
 * Seeds a few demo products (safe to run repeatedly).
 *
 * - Skips any product whose SKU or barcode already exists (never overwrites anything).
 * - Initial stock is recorded as a STOCK_IN transaction attributed to the first active admin.
 * - Requires at least one admin (run `npm run create-admin` first).
 *
 * Run:  npm run seed
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function ean13(base12: string) {
  const sum = base12.split("").reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

const DEMO = [
  { name: "Wireless Mouse", sku: "DEMO-MOUSE-001", barcode: ean13("590123412345"), category: "Electronics", sellingPrice: 19.99, costPrice: 8.5, lowStockThreshold: 10, stock: 40 },
  { name: "USB-C Cable 1m", sku: "DEMO-CABLE-002", barcode: ean13("400638133393"), category: "Electronics", sellingPrice: 9.99, costPrice: 2.2, lowStockThreshold: 20, stock: 15 },
  { name: "Cotton T-Shirt (M)", sku: "DEMO-TSHIRT-003", barcode: "DEMO-TSHIRT-003", category: "Apparel", sellingPrice: 14.5, costPrice: 5.0, lowStockThreshold: 8, stock: 0 },
  { name: "Stainless Water Bottle", sku: "DEMO-BOTTLE-004", barcode: ean13("501234567890"), category: "Home", sellingPrice: 24.0, costPrice: 9.75, lowStockThreshold: 5, stock: 5 },
];

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is not set. Add it to .env.local first.");

  const { ensureSchema } = await import("../src/lib/schema");
  const { closePool, query, withTransaction } = await import("../src/lib/db");
  const { applyInventoryChange } = await import("../src/lib/inventory");

  try {
    console.log("Connecting to MySQL…");
    await ensureSchema();

    const [admin] = await query<{ id: number; email: string } & import("mysql2/promise").RowDataPacket>(
      "SELECT id, email FROM admins WHERE is_active = 1 ORDER BY id LIMIT 1",
    );
    if (!admin) throw new Error("No admin account found. Run `npm run create-admin` first.");

    let created = 0;
    let skipped = 0;
    for (const d of DEMO) {
      const exists = await query("SELECT id FROM products WHERE sku = ? OR barcode = ? LIMIT 1", [d.sku, d.barcode]);
      if (exists.length > 0) {
        skipped++;
        console.log(`  • skipped ${d.sku} (already exists)`);
        continue;
      }
      await withTransaction(async (conn) => {
        const now = new Date();
        const [res] = await conn.query<import("mysql2/promise").ResultSetHeader>("INSERT INTO products SET ?", [
          {
            name: d.name,
            sku: d.sku,
            barcode: d.barcode,
            category: d.category,
            description: "Demo product",
            selling_price: d.sellingPrice,
            cost_price: d.costPrice,
            low_stock_threshold: d.lowStockThreshold,
            stock_quantity: 0,
            created_at: now,
            updated_at: now,
          },
        ]);
        if (d.stock > 0) {
          await applyInventoryChange(
            {
              productId: String(res.insertId),
              type: "STOCK_IN",
              quantity: d.stock,
              reason: "Initial stock (seed)",
              admin: { id: String(admin.id), email: admin.email },
              idempotencyKey: `seed-${d.sku}`,
            },
            conn,
          );
        }
      });
      created++;
      console.log(`  ✔ created ${d.sku} (barcode ${d.barcode}, stock ${d.stock})`);
    }
    console.log(`\nDone. Created ${created}, skipped ${skipped}.\n`);
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error(`\n✖ Seed failed: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
