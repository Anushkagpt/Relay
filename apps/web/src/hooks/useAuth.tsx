import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, json, refreshSession, setAccessToken } from "../api/client";
import type { User } from "../api/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    (async () => {
      const token = await refreshSession();
      if (token) {
        const { user } = await api<{ user: User }>("/auth/me");
        setUser(user);
      }
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  const handleSession = useCallback((res: { accessToken: string; user: User }) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      handleSession(await api("/auth/login", { method: "POST", body: json({ email, password }) }));
    },
    [handleSession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      handleSession(await api("/auth/register", { method: "POST", body: json({ name, email, password }) }));
    },
    [handleSession],
  );

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
