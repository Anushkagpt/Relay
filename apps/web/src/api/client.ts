/**
 * Fetch wrapper. The access token lives only in memory; the refresh token is
 * an httpOnly cookie. On a 401 we refresh once and replay the request.
 */
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<(token: string | null) => void>();
const apiBase = import.meta.env.VITE_API_BASE || "";

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function onTokenChange(listener: (token: string | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function refreshSession(): Promise<string | null> {
  refreshing ??= fetch(`${apiBase}/api/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken: string };
      return body.accessToken;
    })
    .catch(() => null)
    .then((token) => {
      setAccessToken(token);
      refreshing = null;
      return token;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api${path}`, { ...init, headers, credentials: "include" });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const token = await refreshSession();
    if (token) return api<T>(path, init, false);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const json = (body: unknown) => JSON.stringify(body);
