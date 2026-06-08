"use client";

// React context that owns auth state (current user + token) and exposes
// login/logout helpers. Consumed via the useAuth() hook anywhere in the tree.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "@/lib/api/client";
import { fetchCurrentUser, loginRequest } from "@/lib/api/auth";
import type { ApiUser } from "@/lib/api/types";
import {
  clearRememberedEmail,
  clearStoredAuth,
  getStoredToken,
  getStoredUserRaw,
  setRememberedEmail,
  setStoredToken,
  setStoredUser,
  updateStoredUser,
} from "@/lib/auth/storage";
import { purgeApiCache } from "@/lib/pwa/purgeApiCache";

// Public shape of what useAuth() returns. Keep this minimal and stable.
interface AuthContextValue {
  // Currently authenticated user, null when logged out.
  user: ApiUser | null;
  // True until we finish bootstrapping from localStorage on first mount.
  isLoading: boolean;
  // Convenience boolean derived from user.
  isAuthenticated: boolean;
  // Performs the full login flow and updates context state.
  login: (email: string, password: string, remember: boolean) => Promise<ApiUser>;
  // Clears state + storage.
  logout: () => void;
  // Re-fetches /auth/me - useful after profile edits.
  refresh: () => Promise<void>;
}

// undefined sentinel so useAuth() can detect "used outside provider".
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // user holds the authenticated profile or null when not logged in.
  const [user, setUser] = useState<ApiUser | null>(null);
  // isLoading guards initial render so we don't flash the login screen for
  // already-authenticated users.
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap: try to hydrate from localStorage, then validate with /auth/me.
  useEffect(() => {
    // AbortController lets us cancel if the component unmounts mid-fetch.
    const controller = new AbortController();

    async function bootstrap() {
      // No token means nobody is logged in; we're done.
      const token = getStoredToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Optimistically hydrate from cached user JSON for instant UI.
      const cached = getStoredUserRaw();
      if (cached) {
        try {
          setUser(JSON.parse(cached) as ApiUser);
        } catch {
          // Corrupt cache - ignore and rely on the network fetch below.
        }
      }

      // Validate the token by hitting /auth/me; updates the cached user too.
      try {
        const fresh = await fetchCurrentUser(controller.signal);
        setUser(fresh);
        updateStoredUser(JSON.stringify(fresh));
      } catch (err) {
        // 401 means the token is no longer valid - clear and force re-login.
        if (err instanceof ApiError && err.isAuth) {
          clearStoredAuth();
          purgeApiCache();
          setUser(null);
        }
        // Network errors leave the optimistic state in place.
      } finally {
        setIsLoading(false);
      }
    }

    bootstrap();
    return () => controller.abort();
  }, []);

  // login: persists token + user, returns the user so callers can branch on role.
  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const { accessToken, user: signedInUser } = await loginRequest({
        email,
        password,
      });
      setStoredToken(accessToken, remember);
      setStoredUser(JSON.stringify(signedInUser), remember);
      if (remember) {
        setRememberedEmail(email);
      } else {
        clearRememberedEmail();
      }
      setUser(signedInUser);
      return signedInUser;
    },
    [],
  );

  // logout: wipe state + storage; UI redirects happen at the caller.
  const logout = useCallback(() => {
    clearStoredAuth();
    purgeApiCache();
    setUser(null);
  }, []);

  // refresh: re-fetch /auth/me on demand (e.g. after profile updates).
  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchCurrentUser();
      setUser(fresh);
      updateStoredUser(JSON.stringify(fresh));
    } catch (err) {
      if (err instanceof ApiError && err.isAuth) {
        clearStoredAuth();
        purgeApiCache();
        setUser(null);
      }
    }
  }, []);

  // Memoize the context value so consumers don't re-render unnecessarily.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
      refresh,
    }),
    [user, isLoading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Public hook: throws if used outside the provider so misuse fails loudly.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthProvider>");
  }
  return ctx;
}
