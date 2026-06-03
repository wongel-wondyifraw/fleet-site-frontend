// Centralized fetch wrapper: handles base URL, JSON, auth header, and errors.
import { getStoredToken, clearStoredAuth } from "@/lib/auth/storage";
import { purgeApiCache } from "@/lib/pwa/purgeApiCache";
import type { ApiErrorPayload } from "@/lib/api/types";

// Base URL of the NestJS backend. Resolved in this order:
//   1. NEXT_PUBLIC_API_URL env var (used in production / explicit overrides).
//   2. In the browser, derive from window.location so that LAN devices (e.g. a
//      phone hitting http://192.168.1.3:3000) automatically target the same host
//      on the backend port (http://192.168.1.3:3001/api) instead of "localhost".
//   3. SSR / build-time fallback: localhost.
const DEFAULT_API_PORT = 3001;

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${DEFAULT_API_PORT}/api`;
  }
  return `http://localhost:${DEFAULT_API_PORT}/api`;
}

const API_BASE_URL = resolveApiBaseUrl();

// Custom error class so UI code can branch on status / read message cleanly.
export class ApiError extends Error {
  // HTTP status code from the failed response (e.g. 401, 404, 500).
  public readonly status: number;
  // Raw error payload from the server, when JSON-decodable.
  public readonly payload: ApiErrorPayload | null;

  constructor(message: string, status: number, payload: ApiErrorPayload | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  // Convenience for code that needs to know "did this fail because of auth?".
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

// Options accepted by the internal request() helper.
interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  // Plain JS object - the helper JSON-stringifies it.
  body?: unknown;
  // Pass false to skip attaching the bearer token (e.g. for /auth/login).
  auth?: boolean;
  // Lets callers pass an AbortSignal for cancelation.
  signal?: AbortSignal;
}

// Generic typed request. T is the expected success-response shape.
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  // Normalize path so callers can pass "/auth/login" or "auth/login".
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  // Build headers; Content-Type only set when sending a JSON body.
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  // Attach Bearer token unless explicitly opted out (e.g. login endpoint).
  if (options.auth !== false) {
    const token = getStoredToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  // Catch network-level errors (DNS, offline, CORS) separately from HTTP errors.
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      // Cookies aren't required (we use Bearer tokens) but keep CORS strict.
      credentials: "omit",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      0,
      null,
    );
  }

  // 204 No Content responses (e.g. DELETE, password change) have no body.
  if (response.status === 204) {
    return undefined as T;
  }

  // Best-effort parse; some error responses may not be JSON.
  let data: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    // Treat 401 as "session expired" and clear stored token.
    if (response.status === 401) {
      clearStoredAuth();
      purgeApiCache();
    }
    const payload = data as ApiErrorPayload | null;
    const message = extractErrorMessage(payload, response.statusText);
    throw new ApiError(message, response.status, payload);
  }

  return data as T;
}

// Nest returns either a string message or an array of validation messages.
// This collapses both shapes into a single user-facing string.
function extractErrorMessage(
  payload: ApiErrorPayload | null,
  fallback: string,
): string {
  if (!payload) return fallback || "Something went wrong";
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string") return payload.message;
  return fallback || "Something went wrong";
}
