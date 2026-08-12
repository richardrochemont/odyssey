"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "accountant" | "maintenance" | "read_only";
  activeOrgId?: string;
  orgId: string;
  tokenVersion?: number;
}

export interface WorkspaceItem {
  orgId: string;
  name: string;
  slug: string;
  role: "owner" | "manager" | "accountant" | "maintenance" | "read_only";
  status: string;
  joinedAt: string;
  isActive: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  workspaces: WorkspaceItem[];
  login: (token: string, user: User) => void;
  logout: () => void;
  switchWorkspace: (orgId: string) => Promise<void>;
  refetchWorkspaces: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwt(token: string): User | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const parsed = JSON.parse(jsonPayload);
    return {
      ...parsed,
      activeOrgId: parsed.activeOrgId || parsed.orgId,
      orgId: parsed.activeOrgId || parsed.orgId,
    } as User;
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logout = useCallback(() => {
    localStorage.removeItem("hearthlane_token");
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    router.push("/login");
  }, [router]);

  const logoutExpired = useCallback(() => {
    localStorage.removeItem("hearthlane_token");
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    router.push("/login?expired=true");
  }, [router]);

  const fetchWorkspaces = useCallback(async (authToken: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        logoutExpired();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch (err) {
      // Silently ignore workspace list fetch errors
    }
  }, [logoutExpired]);

  useEffect(() => {
    const handleUnauthorized = () => {
      logoutExpired();
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [logoutExpired]);

  useEffect(() => {
    const storedToken = localStorage.getItem("hearthlane_token");
    if (storedToken) {
      const decoded = parseJwt(storedToken);
      if (decoded && decoded.id && decoded.tokenVersion !== undefined) {
        setToken(storedToken);
        setUser(decoded);
        fetchWorkspaces(storedToken);
      } else {
        localStorage.removeItem("hearthlane_token");
      }
    }
    setIsLoading(false);
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login" && !pathname?.startsWith("/invite")) {
      router.push("/login");
    }
  }, [user, isLoading, pathname, router]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("hearthlane_token", newToken);
    setToken(newToken);
    const decoded = parseJwt(newToken) || newUser;
    setUser(decoded);
    fetchWorkspaces(newToken);
    router.push("/");
  };

  const switchWorkspace = async (orgId: string) => {
    if (!token) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/auth/switch-workspace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to switch workspace");
      }

      const data = await res.json();
      localStorage.setItem("hearthlane_token", data.token);
      setToken(data.token);
      const decoded = parseJwt(data.token);
      if (decoded) {
        setUser(decoded);
      }
      await fetchWorkspaces(data.token);
      window.location.href = "/";
    } catch (err: any) {
      alert(err.message || "Could not switch workspace");
    }
  };

  const refetchWorkspaces = async () => {
    if (token) {
      await fetchWorkspaces(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        workspaces,
        login,
        logout,
        switchWorkspace,
        refetchWorkspaces,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
