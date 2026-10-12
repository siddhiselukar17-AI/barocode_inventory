import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Pagination as PaginationInfo } from "@/types";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-14 text-center", className)}>
      <Inbox className="h-9 w-9 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <AlertTriangle className="h-9 w-9 text-destructive" aria-hidden />
      <p className="font-medium">Couldn&apos;t load data</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function PaginationBar({
  pagination,
  onPage,
}: {
  pagination: PaginationInfo;
  onPage: (page: number) => void;
}) {
  const { page, totalPages, total, pageSize } = pagination;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
