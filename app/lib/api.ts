// Client-side fetch helper. Throws ApiError with the server's message and field errors.
export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.replace("/login");
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.fields ?? {});
  return data as T;
}
