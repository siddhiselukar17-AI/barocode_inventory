import mysql from "mysql2/promise";
import { execute, parseDatabaseUrl } from "@/lib/db";

const IMMUTABLE_MSG = "Inventory transactions are immutable. Create an ADJUSTMENT transaction instead.";

/** Idempotent DDL: safe to run on every setup. */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS admins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role ENUM('ADMIN','STAFF') NOT NULL DEFAULT 'ADMIN',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admins_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // barcode / qr_code_value use a binary collation: case-sensitive exact matching.
  // MySQL unique indexes allow many NULLs, so products without a barcode never collide.
  `CREATE TABLE IF NOT EXISTS products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    barcode VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    qr_code_value VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Uncategorized',
    description TEXT NULL,
    selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_quantity INT NOT NULL DEFAULT 0,
    low_stock_threshold INT NOT NULL DEFAULT 5,
    image_url VARCHAR(2048) NULL,
    is_archived TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_products_sku (sku),
    UNIQUE KEY uq_products_barcode (barcode),
    KEY idx_products_qr (qr_code_value(191)),
    KEY idx_products_archived_category (is_archived, category),
    KEY idx_products_archived_stock (is_archived, stock_quantity),
    KEY idx_products_updated (updated_at),
    KEY idx_products_name (name),
    CONSTRAINT chk_products_stock CHECK (stock_quantity >= 0),
    CONSTRAINT chk_products_threshold CHECK (low_stock_threshold >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS inventory_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    product_name_snapshot VARCHAR(200) NOT NULL,
    barcode VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    sku VARCHAR(64) NOT NULL,
    type ENUM('STOCK_IN','STOCK_OUT','ADJUSTMENT') NOT NULL,
    quantity INT NOT NULL,
    stock_before INT NOT NULL,
    stock_after INT NOT NULL,
    reason VARCHAR(500) NULL,
    performed_by BIGINT UNSIGNED NOT NULL,
    performed_by_email VARCHAR(254) NOT NULL,
    idempotency_key VARCHAR(100) NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tx_idempotency (performed_by, idempotency_key),
    KEY idx_tx_created (created_at),
    KEY idx_tx_product (product_id, created_at),
    KEY idx_tx_type (type, created_at),
    CONSTRAINT fk_tx_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tx_admin FOREIGN KEY (performed_by) REFERENCES admins (id) ON DELETE RESTRICT,
    CONSTRAINT chk_tx_quantity CHECK (quantity > 0),
    CONSTRAINT chk_tx_stock CHECK (stock_before >= 0 AND stock_after >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Shared (cross-instance) login rate limiting.
  `CREATE TABLE IF NOT EXISTS rate_limits (
    rl_key VARCHAR(190) NOT NULL,
    hits INT NOT NULL DEFAULT 0,
    reset_at DATETIME(3) NOT NULL,
    PRIMARY KEY (rl_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // History is append-only, enforced by the database itself.
  `DROP TRIGGER IF EXISTS trg_tx_no_update`,
  `CREATE TRIGGER trg_tx_no_update BEFORE UPDATE ON inventory_transactions FOR EACH ROW
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${IMMUTABLE_MSG}'`,
  `DROP TRIGGER IF EXISTS trg_tx_no_delete`,
  `CREATE TRIGGER trg_tx_no_delete BEFORE DELETE ON inventory_transactions FOR EACH ROW
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${IMMUTABLE_MSG}'`,
];

/** Creates the database (if the user may) and all tables/triggers. Idempotent. Never drops anything. */
export async function ensureSchema() {
  const { database: dbName, ...server } = parseDatabaseUrl();
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error("DATABASE_URL must end with a database name using only letters, numbers and underscores.");
  }

  // Connect without a database to create it if needed (CREATE DATABASE IF NOT EXISTS never overwrites).
  const conn = await mysql.createConnection({ ...server, connectTimeout: 10_000 });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "ER_DBACCESS_DENIED_ERROR" && code !== "ER_SPECIFIC_ACCESS_DENIED_ERROR") throw e;
    // No CREATE privilege: fine if the database already exists (the next step will tell us).
  } finally {
    await conn.end();
  }

  for (const sql of SCHEMA_STATEMENTS) await execute(sql);
}
