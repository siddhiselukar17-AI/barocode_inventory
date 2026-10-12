"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PageHeader } from "@/components/ui/states";
import { apiFetch, errorMessage } from "@/lib/client-api";
import type { SessionUser } from "@/types";

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ user: SessionUser }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Your account and security information." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Verified against the database on every request.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <ErrorState message={error} />
            ) : !user ? (
              <Skeleton className="h-16" />
            ) : (
              <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{user.email}</dd>
                <dt className="text-muted-foreground">Role</dt>
                <dd>
                  <Badge tone="info">{user.role}</Badge>
                </dd>
                <dt className="text-muted-foreground">Session</dt>
                <dd>Signed HTTP-only cookie, expires after 8 hours</dd>
              </dl>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Managing admins</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            New admin accounts are created from the server with <code className="rounded bg-muted px-1">npm run create-admin</code>,
            using credentials from environment variables. Passwords are never entered or stored in the browser.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
