import type { ApiResponse } from "@/types";

export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

/** Browser fetch wrapper: returns `data` on success, throws ClientApiError otherwise. */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      credentials: "same-origin",
    });
  } catch {
    throw new ClientApiError("Network error. Check your connection.", 0, "NETWORK");
  }
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    /* non-JSON response */
  }
  if (!json || !json.success) {
    const err = json && !json.success ? json.error : null;
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/login")) {
      window.location.href = "/login";
    }
    throw new ClientApiError(err?.message ?? `Request failed (${res.status})`, res.status, err?.code ?? "UNKNOWN");
  }
  return json.data;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
