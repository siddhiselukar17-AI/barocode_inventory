import { Suspense } from "react";
import { Boxes } from "lucide-react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Barcode Inventory" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Barcode Inventory</h1>
          <p className="text-sm text-muted-foreground">Sign in to the admin panel</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
