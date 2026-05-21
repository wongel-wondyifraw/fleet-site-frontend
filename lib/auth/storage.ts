// Token persistence layer. Keeps localStorage knowledge in one place so we can
// swap to httpOnly cookies later without touching the rest of the app.

// LocalStorage keys; STORAGE_KEY_TOKEN holds the JWT, STORAGE_KEY_USER caches the profile.
const STORAGE_KEY_TOKEN = "fleetsite.accessToken";
const STORAGE_KEY_USER = "fleetsite.user";

// SSR guard: localStorage doesn't exist on the server.
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// Read the stored JWT, or null when missing / on the server.
export function getStoredToken(): string | null {
  if (!hasStorage()) return null;
  return window.localStorage.getItem(STORAGE_KEY_TOKEN);
}

// Persist the JWT after a successful login.
export function setStoredToken(token: string): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

// Read the cached user object as raw JSON; callers do the JSON.parse.
export function getStoredUserRaw(): string | null {
  if (!hasStorage()) return null;
  return window.localStorage.getItem(STORAGE_KEY_USER);
}

// Persist the user payload alongside the token so the UI can hydrate offline.
export function setStoredUser(userJson: string): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY_USER, userJson);
}

// Clear everything on logout or when the API returns 401.
export function clearStoredAuth(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY_TOKEN);
  window.localStorage.removeItem(STORAGE_KEY_USER);
}
