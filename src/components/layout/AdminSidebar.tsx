"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  LogOut,
  Package,
  ScanBarcode,
  Settings,
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/scanner", label: "Barcode Scanner", icon: ScanBarcode },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
  { href: "/admin/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      setLoggingOut(false);
    }
  }

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b px-5">
        <Link href="/admin/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="h-4 w-4" aria-hidden />
          </span>
          Barcode Inventory
        </Link>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <button
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {loggingOut ? "Logging out…" : "Logout"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen border-r bg-card lg:block">{content}</aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn("absolute inset-0 bg-slate-900/50 transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={onClose}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r bg-card shadow-xl transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {content}
        </aside>
      </div>
    </>
  );
}
