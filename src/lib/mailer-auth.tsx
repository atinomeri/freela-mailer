"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ============================================
// Types
// ============================================

interface MailerUser {
  id: string;
  email: string;
  balance: number;
  isAdmin: boolean;
}

interface AuthState {
  user: MailerUser | null;
  token: string | null;
  loading: boolean;
}

interface MailerAuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Authenticated fetch — attaches Bearer token, handles 401 refresh */
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

interface ApiErrorShape {
  error?: string | { message?: string };
  message?: string;
}

// ============================================
// Path-mount helpers
// ============================================

// When the mailer app is served path-mounted under https://freela.ge/mailer,
// client-side fetches to `/api/*` would hit the freela host, not the mailer.
// We prefix every API path with NEXT_PUBLIC_MAILER_BASE_PATH so they stay
// inside the mailer upstream. Empty string = no prefix (subdomain mode).
//
// The mailer app itself doesn't care: Next.js rewrites in next.config.mjs
// strip the `/mailer` prefix back to the existing route handlers.
const MAILER_BASE_PATH = (process.env.NEXT_PUBLIC_MAILER_BASE_PATH ?? "").replace(/\/+$/, "");

function withBasePath(url: string): string {
  if (!MAILER_BASE_PATH) return url;
  if (!url.startsWith("/")) return url; // already absolute (http://...) or relative; leave it
  if (url.startsWith(MAILER_BASE_PATH + "/") || url === MAILER_BASE_PATH) return url;
  return `${MAILER_BASE_PATH}${url}`;
}

// ============================================
// Storage helpers
// ============================================

const STORAGE_KEY = "mailer_auth";

function loadFromStorage(): { token: string; refreshToken: string; user: MailerUser } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(data: { token: string; refreshToken: string; user: MailerUser }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================
// Context
// ============================================

const MailerAuthContext = createContext<MailerAuthContextType | undefined>(undefined);

export function useMailerAuth() {
  const ctx = useContext(MailerAuthContext);
  if (!ctx) throw new Error("useMailerAuth must be used within MailerAuthProvider");
  return ctx;
}

// ============================================
// Provider
// ============================================

export function MailerAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    let cancelled = false;
    const stored = loadFromStorage();
    const hydratedUser = stored?.user
      ? { ...stored.user, isAdmin: Boolean(stored.user.isAdmin) }
      : null;
    const nextState: AuthState = stored && hydratedUser
      ? { user: hydratedUser, token: stored.token, loading: false }
      : { user: null, token: null, loading: false };

    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setState(nextState);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const logout = useCallback(() => {
    clearStorage();
    setState({ user: null, token: null, loading: false });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(withBasePath("/api/desktop/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorShape | null;
      const apiError = body?.error;
      const message =
        typeof apiError === "string"
          ? apiError
          : typeof apiError?.message === "string"
            ? apiError.message
            : typeof body?.message === "string"
              ? body.message
              : "Login failed";
      throw new Error(message);
    }

    const data = await res.json();
    const user: MailerUser = {
      id: data.user.id,
      email: data.user.email,
      balance: data.user.balance,
      isAdmin: Boolean(data.user.isAdmin),
    };

    saveToStorage({
      token: data.accessToken,
      refreshToken: data.refreshToken,
      user,
    });

    setState({ user, token: data.accessToken, loading: false });
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const stored = loadFromStorage();
    if (!stored?.refreshToken) return null;

    try {
      const res = await fetch(withBasePath("/api/desktop/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      saveToStorage({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        user: stored.user,
      });

      setState((s) => ({ ...s, token: data.accessToken }));
      return data.accessToken;
    } catch {
      return null;
    }
  }, []);

  const apiFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const stored = loadFromStorage();
      const currentToken = stored?.token;

      if (!currentToken) {
        logout();
        throw new Error("Not authenticated");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${currentToken}`);

      const finalUrl = withBasePath(url);
      let res = await fetch(finalUrl, { ...init, headers });

      // Try refresh on 401
      if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          headers.set("Authorization", `Bearer ${newToken}`);
          res = await fetch(finalUrl, { ...init, headers });
        } else {
          logout();
        }
      }

      return res;
    },
    [logout, refreshAccessToken],
  );

  return (
    <MailerAuthContext.Provider value={{ ...state, login, logout, apiFetch }}>
      {children}
    </MailerAuthContext.Provider>
  );
}
