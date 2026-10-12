import { redirect } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side session check (signature + expiry). API routes additionally re-check the DB.
  const session = await getSession();
  if (!session) redirect("/login");

  return <AdminShell user={{ id: session.sub, email: session.email, role: session.role }}>{children}</AdminShell>;
}
