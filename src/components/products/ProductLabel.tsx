"use client";
import { useEffect, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProductDTO } from "@/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const OPTIONS = { displayValue: true, fontSize: 14, height: 56, margin: 0, width: 2 };

/** Most specific linear symbology the value fits; Code 128 encodes any ASCII text. */
function preferredFormat(value: string): string {
  if (/^\d{13}$/.test(value)) return "EAN13";
  if (/^\d{12}$/.test(value)) return "UPC";
  if (/^\d{8}$/.test(value)) return "EAN8";
  return "CODE128";
}

/** Returns SVG markup for the barcode (falls back to Code 128 when an EAN/UPC check digit is invalid). */
function buildBarcodeSvg(value: string): string {
  const fmt = preferredFormat(value);
  if (fmt !== "CODE128") {
    const svg = document.createElementNS(SVG_NS, "svg");
    let valid = true;
    try {
      JsBarcode(svg, value, { ...OPTIONS, format: fmt, valid: (v: boolean) => (valid = v) });
      if (valid) return svg.outerHTML;
    } catch {
      /* fall through to Code 128 */
    }
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  JsBarcode(svg, value, { ...OPTIONS, format: "CODE128" });
  return svg.outerHTML;
}

export function ProductLabel({ product }: { product: ProductDTO }) {
  const [barcodeSvg, setBarcodeSvg] = useState<string>("");
  const [qr, setQr] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);

  // What gets encoded: the real identifier, never the product name.
  const barcodeValue = product.barcode ?? product.sku;
  const qrValue = product.qrCodeValue ?? product.barcode ?? product.sku;

  useEffect(() => {
    try {
      setBarcodeSvg(buildBarcodeSvg(barcodeValue));
    } catch {
      setBarcodeSvg("");
    }
    QRCode.toDataURL(qrValue, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [barcodeValue, qrValue]);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="copies" className="mb-1 block text-sm font-medium">
            Copies
          </label>
          <input
            id="copies"
            type="number"
            min={1}
            max={60}
            value={copies}
            onChange={(e) => setCopies(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
            className="h-10 w-24 rounded-md border bg-card px-3 text-sm"
          />
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Print labels
        </Button>
      </div>

      <div className="print-area">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: copies }).map((_, i) => (
            <div key={i} className="w-72 break-inside-avoid rounded-lg border bg-white p-3 text-center text-black">
              <p className="truncate text-sm font-semibold">{product.name}</p>
              <p className="mb-2 font-mono text-[11px] text-slate-600">SKU {product.sku}</p>
              <div className="flex items-center justify-between gap-2">
                <div
                  className="min-w-0 flex-1 [&>svg]:h-auto [&>svg]:max-w-full"
                  role="img"
                  aria-label={`Barcode ${barcodeValue}`}
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                />
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={`QR code ${qrValue}`} className="h-20 w-20 shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="no-print mt-3 text-xs text-muted-foreground">
        Barcode encodes <span className="font-mono">{barcodeValue}</span>; QR encodes <span className="font-mono">{qrValue}</span>.
      </p>
    </div>
  );
}
