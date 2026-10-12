import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

// Cache on globalThis so dev hot-reloads reuse one pool.
const globalForDb = globalThis as unknown as { _mysqlPool?: Pool };

/** Server-only. Never import this from a client component. */
export function getPool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new DatabaseNotConfiguredError();

  if (!globalForDb._mysqlPool) {
    const pool = mysql.createPool({
      uri: url,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 8000,
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
