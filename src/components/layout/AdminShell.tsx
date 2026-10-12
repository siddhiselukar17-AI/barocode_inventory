"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import type { SessionUser } from "@/types";

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer after navigating.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-col">
        <AdminHeader user={user} onMenu={() => setOpen(true)} />
        <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
