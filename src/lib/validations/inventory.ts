import { z } from "zod";

const MAX_QTY = 1_000_000;

const productId = z.string().regex(/^[1-9]\d{0,17}$/, "Invalid product id");
const idempotencyKey = z.string().trim().min(8).max(100).optional();
const optionalReason = z.string().trim().max(500).optional();

export const stockMovementSchema = z
  .object({
    productId,
    quantity: z
      .number({ error: "Quantity must be a number" })
      .int("Quantity must be a whole number")
      .positive("Quantity must be greater than 0")
      .max(MAX_QTY),
    reason: optionalReason,
    idempotencyKey,
  })
  .strict();

export const adjustmentSchema = z
  .object({
    productId,
    // SET: `value` is the verified new stock level. DELTA: `value` is a signed change.
    mode: z.enum(["SET", "DELTA"]),
    value: z.number({ error: "Value must be a number" }).int("Value must be a whole number").min(-MAX_QTY).max(MAX_QTY),
    reason: z.string().trim().min(3, "A reason of at least 3 characters is required").max(500),
    idempotencyKey,
  })
  .strict()
  .refine((d) => d.mode !== "SET" || d.value >= 0, { message: "New stock quantity cannot be negative", path: ["value"] });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

const dateString = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const transactionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT"]).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  sort: z.enum(["asc", "desc"]).default("desc"),
});

export const dashboardQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d"]).default("7d"),
  // Start of the selected range computed by the browser in the user's local time zone.
  from: dateString.optional(),
  // Offset like +05:30 / -08:00, used to bucket days in the chart.
  tz: z
    .string()
    .regex(/^[+-](0\d|1\d|2[0-3]):[0-5]\d$/)
    .default("+00:00"),
});
