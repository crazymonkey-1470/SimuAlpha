"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { UserProfile } from "./types";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => ({ ok: false }),
  register: async () => ({ ok: false }),
  logout: () => {},
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function tryRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem("sa_refresh_token");
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newToken = data.access_token;
    if (newToken) {
      localStorage.setItem("sa_access_token", newToken);
      return newToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      let token = localStorage.getItem("sa_access_token");
      if (!token) {
        setLoading(false);
        return;
      }
      // Try current token
      let res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      // If expired, try refresh
      if (res && res.status === 401) {
        token = await tryRefresh();
        if (token) {
          res = await fetch(`${API_BASE}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
        }
      }

      if (res && res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem("sa_access_token");
        localStorage.removeItem("sa_refresh_token");
      }
      setLoading(false);
    }
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error || data.detail || "Login failed" };
      }
      const data = await res.json();
      localStorage.setItem("sa_access_token", data.access_token);
      localStorage.setItem("sa_refresh_token", data.refresh_token);
      setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error || data.detail || "Registration failed" };
      }
      const data = await res.json();
      localStorage.setItem("sa_access_token", data.access_token);
      localStorage.setItem("sa_refresh_token", data.refresh_token);
      setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem("sa_refresh_token");
    if (refreshToken) {
      fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem("sa_access_token");
    localStorage.removeItem("sa_refresh_token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
