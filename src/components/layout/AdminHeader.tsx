"use client";
import { Menu, UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/types";

export function AdminHeader({ user, onMenu }: { user: SessionUser; onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-card/90 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:rounded focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="ml-auto flex items-center gap-3">
        <Badge tone="info">{user.role}</Badge>
        <div className="flex items-center gap-2 text-sm">
          <UserCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
          <span className="hidden max-w-[14rem] truncate sm:inline">{user.email}</span>
        </div>
      </div>
    </header>
  );
}
