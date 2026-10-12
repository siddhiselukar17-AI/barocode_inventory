import { ApiError, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { serializeProduct, type ProductRow } from "@/lib/serializers";
import { normalizeSku } from "@/lib/utils";

type Params = { barcode: string };

/** Candidate spellings of a scanned code (UPC-A <-> EAN-13 leading-zero equivalence). */
function candidates(code: string) {
  const set = new Set([code]);
  if (/^\d{12}$/.test(code)) set.add(`0${code}`);
  if (/^0\d{12}$/.test(code)) set.add(code.slice(1));
  return [...set];
}

/** Looks a scanned value up by barcode, then QR value, then SKU. */
export const GET = route<Params>(async (_req, { params }) => {
  await requireAdmin();

  let code = params.barcode;
  try {
    code = decodeURIComponent(code);
  } catch {
    /* already decoded */
  }
  code = code.trim();
  if (!code || code.length > 512) throw new ApiError(400, "INVALID_BARCODE", "Invalid barcode");

  const list = candidates(code);
  const [product] = await query<ProductRow>(
    `SELECT * FROM products
      WHERE barcode IN (?) OR qr_code_value IN (?) OR sku = ?
      ORDER BY (barcode IN (?)) DESC, (qr_code_value IN (?)) DESC
      LIMIT 1`,
    [list, list, normalizeSku(code), list, list],
  );

  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "No product matches this barcode");
  return ok(serializeProduct(product));
});
