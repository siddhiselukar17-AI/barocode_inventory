"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Camera, CameraOff, Keyboard, PackagePlus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { StockBadge } from "@/components/products/badges";
import { apiFetch, ClientApiError, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { InventoryChangeResult, ProductDTO } from "@/types";

type Mode = "STOCK_IN" | "STOCK_OUT";
type CameraState = "idle" | "starting" | "scanning" | "denied" | "unavailable" | "error";

const SAME_CODE_COOLDOWN_MS = 3000;
const MAX_QTY = 1_000_000;

interface ScannerControls {
  stop: () => void;
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio not available */
  }
}

export function ScannerClient() {
  const [mode, setMode] = useState<Mode>("STOCK_IN");

  // camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState("");

  // scan state
  const lockRef = useRef(false); // scan lock: true while looking up / submitting / awaiting "scan next"
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const panelCodeRef = useRef<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  // transaction form
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InventoryChangeResult | null>(null);
  const keyRef = useRef(newKey());

  const qtyNum = Number(quantity);
  const qtyValid = /^\d+$/.test(quantity.trim()) && qtyNum >= 1 && qtyNum <= MAX_QTY;
  const qtyError = !quantity.trim()
    ? "Enter a quantity"
    : !qtyValid
      ? "Quantity must be a whole number of at least 1"
      : mode === "STOCK_OUT" && product && qtyNum > product.stockQuantity
        ? `Only ${product.stockQuantity} in stock`
        : undefined;
  const newStock = product && qtyValid ? product.stockQuantity + (mode === "STOCK_IN" ? qtyNum : -qtyNum) : null;

  const releaseLock = useCallback(() => {
    lockRef.current = false;
  }, []);

  const resetPanel = useCallback(() => {
    // Start the cooldown now so a barcode still in front of the camera isn't instantly re-processed.
    if (panelCodeRef.current) lastScanRef.current = { code: panelCodeRef.current, at: Date.now() };
    setProduct(null);
    setUnknownCode(null);
    setResult(null);
    setQuantity("1");
    setReason("");
    setConfirmOpen(false);
    panelCodeRef.current = null;
    keyRef.current = newKey();
    releaseLock();
  }, [releaseLock]);

  const handleScan = useCallback(
    async (raw: string, opts?: { manual?: boolean }) => {
      const code = raw.trim();
      if (!code || code.length > 512) return;

      if (opts?.manual) {
        // Explicit user action: always allowed, replaces whatever is on screen.
        resetPanel();
      } else {
        if (lockRef.current) return;
        if (panelCodeRef.current === code) return; // already showing this item
        const now = Date.now();
        if (lastScanRef.current.code === code && now - lastScanRef.current.at < SAME_CODE_COOLDOWN_MS) return;
        lastScanRef.current = { code, at: now };
      }

      lockRef.current = true;
      setLookingUp(true);
      try {
        const found = await apiFetch<ProductDTO>(`/api/products/barcode/${encodeURIComponent(code)}`);
        beep();
        panelCodeRef.current = code;
        setUnknownCode(null);
        setResult(null);
        setQuantity("1");
        setReason("");
        keyRef.current = newKey();
        setProduct(found);
        if (found.isArchived) {
          toast.warning(`${found.name} is archived. Restore it before changing stock.`);
        } else {
          toast.success(`Found: ${found.name}`);
        }
        lockRef.current = false; // allow a different product to be scanned until a transaction starts
      } catch (e) {
        lastScanRef.current = { code, at: Date.now() };
        if (e instanceof ClientApiError && e.status === 404) {
          setProduct(null);
          setUnknownCode(code);
          toast.error(`Unknown barcode: ${code}`);
        } else {
          toast.error(errorMessage(e));
        }
        lockRef.current = false;
      } finally {
        setLookingUp(false);
      }
    },
    [resetPanel],
  );

  // Latest handler for long-lived callbacks (camera / keyboard listeners).
  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  // ---------- Camera ----------
  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("idle");
  }, []);

  const startCamera = useCallback(
    async (preferredId?: string) => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraState("starting");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraState("unavailable");
          return;
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });

        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (list.length === 0) {
          setCameraState("unavailable");
          return;
        }
        setDevices(list.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })));
        const back = list.find((d) => /back|rear|environment/i.test(d.label));
        const chosen = preferredId || back?.deviceId || list[0].deviceId;
        setDeviceId(chosen);

        controlsRef.current = await reader.decodeFromVideoDevice(chosen, videoRef.current!, (res) => {
          if (res) void handleScanRef.current(res.getText());
        });
        setCameraState("scanning");
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "SecurityError") setCameraState("denied");
        else if (name === "NotFoundError" || name === "OverconstrainedError") setCameraState("unavailable");
        else {
          console.error("camera error", e);
          setCameraState("error");
        }
      }
    },
    [],
  );

  // Always release the camera when leaving the page.
  useEffect(() => stopCamera, [stopCamera]);

  // ---------- USB barcode scanner (acts like a very fast keyboard) ----------
  useEffect(() => {
    let buffer = "";
    let lastKeyAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      const now = Date.now();
      if (now - lastKeyAt > 100) buffer = ""; // humans type slowly; scanners send chars <~50ms apart
      lastKeyAt = now;
      if (e.key === "Enter") {
        if (buffer.length >= 4) void handleScanRef.current(buffer);
        buffer = "";
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Submit ----------
  async function submit() {
    if (!product || !qtyValid || qtyError) return;
    setSubmitting(true);
    lockRef.current = true; // no new scans while the request is in flight
    try {
      const res = await apiFetch<InventoryChangeResult>(
        mode === "STOCK_IN" ? "/api/inventory/stock-in" : "/api/inventory/stock-out",
        {
          method: "POST",
          body: JSON.stringify({
            productId: product.id,
            quantity: qtyNum,
            reason: reason.trim() || undefined,
            idempotencyKey: keyRef.current, // same key on retry => no duplicate movement
          }),
        },
      );
      setResult(res);
      setProduct({ ...product, stockQuantity: res.product.stockQuantity });
      setConfirmOpen(false);
      toast.success(
        `${mode === "STOCK_IN" ? "Stock in" : "Stock out"} recorded. New stock: ${res.product.stockQuantity}`,
      );
      // Lock stays on: a fresh scan or an explicit "Scan next item" is required.
    } catch (e) {
      setConfirmOpen(false);
      toast.error(errorMessage(e));
      lockRef.current = false;
      if (e instanceof ClientApiError && e.code === "INSUFFICIENT_STOCK") {
        try {
          const fresh = await apiFetch<ProductDTO>(`/api/products/${product.id}`);
          setProduct(fresh);
        } catch {
          /* ignore */
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const archived = product?.isArchived ?? false;
  const done = !!result;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: input methods */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Mode</CardTitle>
            <CardDescription>Nothing happens automatically — you choose the direction and confirm every change.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Transaction mode" className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "STOCK_IN", label: "STOCK IN", icon: ArrowDownToLine, on: "border-green-600 bg-green-50 text-green-800" },
                  { value: "STOCK_OUT", label: "STOCK OUT", icon: ArrowUpFromLine, on: "border-red-600 bg-red-50 text-red-800" },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  role="radio"
                  aria-checked={mode === m.value}
                  onClick={() => setMode(m.value)}
                  disabled={submitting}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors",
                    mode === m.value ? m.on : "bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <m.icon className="h-4 w-4" aria-hidden /> {m.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" aria-hidden /> Camera
            </CardTitle>
            <CardDescription>EAN-13, EAN-8, UPC-A, UPC-E, Code 128 and QR codes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Camera preview" />
              {cameraState !== "scanning" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-slate-300">
                  <CameraOff className="h-8 w-8" aria-hidden />
                  {cameraState === "starting" ? "Starting camera…" : "Camera is off"}
                </div>
              )}
              {cameraState === "scanning" && (
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" aria-hidden />
              )}
            </div>

            {cameraState === "denied" && (
              <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Camera permission was blocked.</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                  <li>Click the lock / camera icon in the address bar.</li>
                  <li>Set Camera to &ldquo;Allow&rdquo; for this site.</li>
                  <li>Reload the page and press Start camera again.</li>
                </ol>
                <p className="mt-1">You can still use manual entry or a USB scanner below.</p>
              </div>
            )}
            {cameraState === "unavailable" && (
              <p role="alert" className="rounded-md border bg-muted p-3 text-sm">
                No usable camera was found (or this browser blocks camera access on insecure HTTP — use HTTPS or
                localhost). Use manual entry or a USB scanner instead.
              </p>
            )}
            {cameraState === "error" && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                The camera could not be started (it may be in use by another app). Close other apps using it and try again.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {cameraState === "scanning" || cameraState === "starting" ? (
                <Button variant="outline" onClick={stopCamera}>
                  <CameraOff className="h-4 w-4" aria-hidden /> Stop camera
                </Button>
              ) : (
                <Button onClick={() => startCamera(deviceId || undefined)}>
                  <Camera className="h-4 w-4" aria-hidden /> Start camera
                </Button>
              )}
              {devices.length > 1 && (
                <Select
                  aria-label="Select camera"
                  className="w-auto min-w-48 flex-1"
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    if (cameraState === "scanning") void startCamera(e.target.value);
                  }}
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" aria-hidden /> Manual entry / USB scanner
            </CardTitle>
            <CardDescription>
              Type or paste a barcode, SKU or QR value. A USB scanner works anywhere on this page (it types like a keyboard).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = manual;
                setManual("");
                void handleScan(v, { manual: true });
              }}
            >
              <Label htmlFor="manual-code" className="sr-only">
                Barcode
              </Label>
              <Input
                id="manual-code"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Scan or type barcode, then Enter"
                autoComplete="off"
                inputMode="text"
                className="font-mono"
              />
              <Button type="submit" disabled={!manual.trim() || lookingUp} loading={lookingUp}>
                <ScanLine className="h-4 w-4" aria-hidden /> Look up
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right: result / transaction */}
      <div>
        <Card className="lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>{product ? "Scanned product" : "Waiting for scan"}</CardTitle>
            <CardDescription aria-live="polite">
              {lookingUp ? "Looking up product…" : product ? "Review, then confirm the transaction." : "Scan a code to begin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!product && !unknownCode && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <ScanLine className="h-10 w-10" aria-hidden />
                <p className="text-sm">No product scanned yet.</p>
              </div>
            )}

            {unknownCode && (
              <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="font-medium text-amber-900">Unknown barcode</p>
                <p className="break-all font-mono text-sm">{unknownCode}</p>
                <p className="text-sm text-amber-900">No product uses this code yet.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/products/new?barcode=${encodeURIComponent(unknownCode)}`}>
                    <Button>
                      <PackagePlus className="h-4 w-4" aria-hidden /> Register new product
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={resetPanel}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {product && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold">{product.name}</p>
                    {archived ? <Badge>Archived</Badge> : <StockBadge quantity={product.stockQuantity} threshold={product.lowStockThreshold} />}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Barcode</dt>
                      <dd className="break-all font-mono">{product.barcode ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">SKU</dt>
                      <dd className="break-all font-mono">{product.sku}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Current stock</dt>
                      <dd className="text-3xl font-semibold tabular-nums" aria-live="polite">
                        {product.stockQuantity}
                      </dd>
                    </div>
                  </dl>
                </div>

                {archived ? (
                  <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    This product is archived and cannot be changed.{" "}
                    <Link href={`/admin/products/${product.id}`} className="font-medium underline">
                      Open product to restore it
                    </Link>
                    .
                  </div>
                ) : done ? (
                  <div className="space-y-3">
                    <div role="status" className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
                      <p className="font-medium">
                        {mode === "STOCK_IN" ? "Stock in" : "Stock out"} recorded
                        {result.replayed ? " (already processed)" : ""}.
                      </p>
                      <p className="mt-1">
                        {result.transaction.stockBefore} → <strong>{result.product.stockQuantity}</strong> units
                        (server-confirmed)
                      </p>
                    </div>
                    <Button className="w-full" size="lg" onClick={resetPanel}>
                      <ScanLine className="h-4 w-4" aria-hidden /> Scan next item
                    </Button>
                  </div>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!qtyError) setConfirmOpen(true);
                    }}
                    noValidate
                  >
                    <div>
                      <Label htmlFor="qty">{mode === "STOCK_IN" ? "Received quantity" : "Dispatched quantity"}</Label>
                      <Input
                        id="qty"
                        inputMode="numeric"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        aria-invalid={!!qtyError}
                        disabled={submitting}
                        className="text-lg"
                      />
                      <FieldError message={qtyError} />
                    </div>
                    <div>
                      <Label htmlFor="reason">Reason (optional)</Label>
                      <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={submitting} />
                    </div>
                    {newStock !== null && !qtyError && (
                      <p className="rounded-md bg-muted px-3 py-2 text-sm">
                        {product.stockQuantity} {mode === "STOCK_IN" ? "+" : "−"} {qtyNum} = <strong>{newStock}</strong>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={resetPanel} disabled={submitting}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant={mode === "STOCK_IN" ? "success" : "destructive"}
                        className="flex-1"
                        disabled={!!qtyError || submitting}
                        loading={submitting}
                      >
                        Confirm {mode === "STOCK_IN" ? "Stock In" : "Stock Out"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        onConfirm={submit}
        loading={submitting}
        destructive={mode === "STOCK_OUT"}
        confirmLabel={mode === "STOCK_IN" ? "Yes, add stock" : "Yes, remove stock"}
        title={mode === "STOCK_IN" ? "Confirm Stock In" : "Confirm Stock Out"}
        description={
          product && newStock !== null
            ? `${product.name}: ${product.stockQuantity} ${mode === "STOCK_IN" ? "+" : "−"} ${qtyNum} → ${newStock} units. This is recorded permanently in the transaction history.`
            : ""
        }
      />
    </div>
  );
}
