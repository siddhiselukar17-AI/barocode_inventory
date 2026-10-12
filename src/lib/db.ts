import mysql, { type Pool, type PoolConnection, type PoolOptions, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

// Cache on globalThis so dev hot-reloads (and warm serverless instances) reuse one pool.
const globalForDb = globalThis as unknown as { _mysqlPool?: Pool };

/**
 * TLS for hosted MySQL, configured with environment variables (never in code):
 *   DATABASE_SSL = true | verify_ca | verify_identity   -> encrypted + certificate verified
 *                  required | no-verify                 -> encrypted, certificate NOT verified
 *                  (unset / false / disabled)           -> plain connection (local MySQL)
 *   DATABASE_SSL_CA = PEM text of the provider's CA certificate (needed by some providers, e.g. Aiven)
 * A provider-style `?ssl-mode=REQUIRED` in DATABASE_URL is honoured as well.
 */
function sslOptions(url: URL): PoolOptions["ssl"] {
  const mode = (url.searchParams.get("ssl-mode") ?? process.env.DATABASE_SSL ?? "").trim().toLowerCase();
  if (!mode || mode === "false" || mode === "disabled" || mode === "0") return undefined;
  const verify = !["required", "no-verify", "preferred"].includes(mode);
  // Env var UIs often store the PEM on one line with literal "\n"; restore real newlines.
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim();
  return { minVersion: "TLSv1.2", rejectUnauthorized: verify, ...(ca ? { ca } : {}) };
}

export function parseDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new DatabaseNotConfiguredError();
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl: sslOptions(url),
  };
}

/** Server-only. Never import this from a client component. */
export function getPool(): Pool {
  if (!globalForDb._mysqlPool) {
    // Serverless platforms run many instances; keep each one's pool small so the total stays
    // under the provider's connection limit. Override with DATABASE_POOL_SIZE if needed.
    const size = Number(process.env.DATABASE_POOL_SIZE) || (process.env.NODE_ENV === "production" ? 3 : 10);
    const pool = mysql.createPool({
      ...parseDatabaseUrl(),
      waitForConnections: true,
      connectionLimit: size,
      maxIdle: size,
      idleTimeout: 30_000,
      queueLimit: 0,
      enableKeepAlive: true,
      connectTimeout: 10_000,
      charset: "utf8mb4",
      decimalNumbers: true, // DECIMAL columns come back as numbers, not strings
      timezone: "Z", // JS Dates are read/written as UTC
    });
    // Make server-side time functions UTC too.
    pool.pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
    globalForDb._mysqlPool = pool;
  }
  return globalForDb._mysqlPool;
}

type Queryable = Pick<Pool | PoolConnection, "query">;

export async function query<T extends RowDataPacket>(sql: string, params: unknown[] = [], db?: Queryable): Promise<T[]> {
  const [rows] = await (db ?? getPool()).query<T[]>(sql, params);
  return rows;
}

export async function execute(sql: string, params: unknown[] = [], db?: Queryable): Promise<ResultSetHeader> {
  const [res] = await (db ?? getPool()).query<ResultSetHeader>(sql, params);
  return res;
}

interface MysqlErrorLike {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

export function isDuplicateEntry(e: unknown): e is MysqlErrorLike {
  return typeof e === "object" && e !== null && (e as MysqlErrorLike).code === "ER_DUP_ENTRY";
}

function isRetryable(e: unknown) {
  const code = (e as MysqlErrorLike)?.code;
  return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT";
}

/** Runs `fn` in a real InnoDB transaction (commit on success, rollback on error). Retries deadlocks. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      if (isRetryable(e) && attempt < 3) continue;
      throw e;
    } finally {
      conn.release();
    }
  }
}

export async function closePool() {
  await globalForDb._mysqlPool?.end();
  globalForDb._mysqlPool = undefined;
}
