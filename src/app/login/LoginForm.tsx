"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

function safeNext(next: string | null) {
  // Only allow same-site /admin paths (prevents open redirects).
  if (next && next.startsWith("/admin") && !next.startsWith("//")) return next;
  return "/admin/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
      toast.success("Signed in");
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
