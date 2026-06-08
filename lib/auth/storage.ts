// Token persistence layer. Keeps localStorage/sessionStorage knowledge in one place
// so we can swap to httpOnly cookies later without touching the rest of the app.

// LocalStorage keys; STORAGE_KEY_TOKEN holds the JWT, STORAGE_KEY_USER caches the profile.
const STORAGE_KEY_TOKEN = "fleetsite.accessToken";
const STORAGE_KEY_USER = "fleetsite.user";
const STORAGE_KEY_EMAIL = "fleetsite.rememberedEmail";

type WebStorage = Storage;

// SSR guard: localStorage doesn't exist on the server.
function hasLocalStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

// SSR guard: sessionStorage doesn't exist on the server.
function hasSessionStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

function getLocalStorage(): WebStorage | null {
  if (!hasLocalStorage()) return null;
  return window.localStorage;
}

function getSessionStorage(): WebStorage | null {
  if (!hasSessionStorage()) return null;
  return window.sessionStorage;
}

function readFromEitherStore(key: string): string | null {
  const session = getSessionStorage();
  if (session) {
    const sessionValue = session.getItem(key);
    if (sessionValue !== null) return sessionValue;
  }

  const local = getLocalStorage();
  if (!local) return null;
  return local.getItem(key);
}

function removeFromBothStores(key: string): void {
  getSessionStorage()?.removeItem(key);
  getLocalStorage()?.removeItem(key);
}

function writeToStore(
  key: string,
  value: string,
  remember: boolean,
): void {
  const target = remember ? getLocalStorage() : getSessionStorage();
  const other = remember ? getSessionStorage() : getLocalStorage();

  target?.setItem(key, value);
  other?.removeItem(key);
}

function isTokenInSessionStorage(): boolean {
  const session = getSessionStorage();
  if (!session) return false;
  return session.getItem(STORAGE_KEY_TOKEN) !== null;
}

// Read the stored JWT, or null when missing / on the server.
export function getStoredToken(): string | null {
  return readFromEitherStore(STORAGE_KEY_TOKEN);
}

// Persist the JWT after a successful login.
export function setStoredToken(token: string, remember: boolean): void {
  writeToStore(STORAGE_KEY_TOKEN, token, remember);
}

// Read the cached user object as raw JSON; callers do the JSON.parse.
export function getStoredUserRaw(): string | null {
  return readFromEitherStore(STORAGE_KEY_USER);
}

// Persist the user payload alongside the token so the UI can hydrate offline.
export function setStoredUser(userJson: string, remember: boolean): void {
  writeToStore(STORAGE_KEY_USER, userJson, remember);
}

// Update cached user in whichever store currently holds the auth token.
export function updateStoredUser(userJson: string): void {
  const remember = !isTokenInSessionStorage();
  writeToStore(STORAGE_KEY_USER, userJson, remember);
}

// Clear everything on logout or when the API returns 401.
export function clearStoredAuth(): void {
  removeFromBothStores(STORAGE_KEY_TOKEN);
  removeFromBothStores(STORAGE_KEY_USER);
}

// Remembered email is always localStorage so it survives browser restarts.
export function getRememberedEmail(): string | null {
  const local = getLocalStorage();
  if (!local) return null;
  return local.getItem(STORAGE_KEY_EMAIL);
}

export function setRememberedEmail(email: string): void {
  getLocalStorage()?.setItem(STORAGE_KEY_EMAIL, email);
}

export function clearRememberedEmail(): void {
  getLocalStorage()?.removeItem(STORAGE_KEY_EMAIL);
}
