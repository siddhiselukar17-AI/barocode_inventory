import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-5" />
          ))}
        </div>
      ))}
    </div>
  );
}
