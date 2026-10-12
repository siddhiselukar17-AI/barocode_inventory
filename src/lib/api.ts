import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DatabaseNotConfiguredError } from "@/lib/db";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

interface MysqlErrorLike {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

const asMysql = (e: unknown): MysqlErrorLike => (typeof e === "object" && e !== null ? (e as MysqlErrorLike) : {});

const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_CON_COUNT_ERROR",
]);

export function handleError(e: unknown) {
  if (e instanceof ApiError) return fail(e.status, e.code, e.message, e.details);
  if (e instanceof ZodError) {
    return fail(
      400,
      "VALIDATION_ERROR",
      e.issues[0]?.message ?? "Invalid request data",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (e instanceof DatabaseNotConfiguredError) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "Database is not configured. Set DATABASE_URL in .env.local.");
  }
  const my = asMysql(e);
  if (my.code === "ER_DUP_ENTRY") {
    const key = my.sqlMessage ?? "";
    const field = /sku/i.test(key) ? "sku" : /barcode/i.test(key) ? "barcode" : /email/i.test(key) ? "email" : null;
    return fail(
      409,
      "DUPLICATE",
      field ? `A record with this ${field} already exists.` : "A record with these values already exists.",
      field ? [{ path: field, message: "Already in use" }] : undefined,
    );
  }
  if (my.code === "ER_CHECK_CONSTRAINT_VIOLATED") {
    return fail(409, "CONSTRAINT_VIOLATION", "That change would make a quantity negative.");
  }
  if (my.code === "ER_NO_SUCH_TABLE") {
    console.error("[db] missing table:", my.sqlMessage);
    return fail(503, "DATABASE_NOT_INITIALIZED", "Database tables are missing. Run `npm run db:setup`.");
  }
  if (my.code && CONNECTION_CODES.has(my.code)) {
    console.error("[db] connection error:", my.code, my.sqlMessage ?? "");
    return fail(503, "DATABASE_UNAVAILABLE", "Database is unavailable. Check DATABASE_URL and that MySQL is running.");
  }
  console.error("[api] unexpected error:", e);
  return fail(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}

type RouteHandler<P> = (req: NextRequest, ctx: { params: P }) => Promise<Response>;

/** Wraps a route handler: resolves async params and converts thrown errors into JSON responses. */
export function route<P = Record<string, never>>(handler: RouteHandler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const params = await ctx.params;
      return await handler(req, { params });
    } catch (e) {
      return handleError(e);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

/** Product / admin ids are positive integers. */
export function assertId(id: string, label = "id") {
  if (!/^[1-9]\d{0,17}$/.test(id)) {
    throw new ApiError(400, "INVALID_ID", `Invalid ${label}`);
  }
}

export function getClientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
