"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { ShieldCheck, Loader2 } from "lucide-react";

interface SeededUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [users, setUsers] = useState<SeededUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const res = await fetch(`${apiUrl}/auth/users`);
        if (!res.ok) throw new Error("Failed to load developers credentials");
        const data = await res.json();
        setUsers(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const handleSelectUser = async (user: SeededUser) => {
    setIsSubmitting(user.id);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password: "password123" }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Login failed");
      }

      const session = await res.json();
      login(session.token, session.user);
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(null);
    }
  };

  const roleLabels: Record<string, string> = {
    owner: "Owner-Manager (All permissions)",
    manager: "Property Manager (Operational focus)",
    maintenance: "Maintenance Lead (Work Orders & Tasks)",
    read_only: "Investor (Read-only view)",
  };

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-border p-8 rounded-xl shadow-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary text-white p-3 rounded-xl mb-4">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight text-primary">Odyssey</h1>
          <p className="text-sm text-muted mt-1 text-center font-sans">
            Local Developer Auth selector. Choose a seeded profile.
          </p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/25 text-danger px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted font-medium">Discovering seeded credentials...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((u) => {
              const loadingThis = isSubmitting === u.id;
              
              return (
                <button
                  key={u.id}
                  disabled={!!isSubmitting}
                  onClick={() => handleSelectUser(u)}
                  className={`w-full text-left p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-background/50 transition-all flex items-center justify-between ${
                    loadingThis ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                    <p className="text-xs text-muted truncate">{u.email}</p>
                    <p className="text-[10px] mt-1 text-primary/80 font-bold uppercase tracking-wider">
                      {roleLabels[u.role] || u.role}
                    </p>
                  </div>
                  {loadingThis && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-muted">
          <p>Local dev mode bypasses Clerk authentication.</p>
          <p className="mt-1">All pre-seeded passwords are <code className="bg-background px-1.5 py-0.5 rounded font-mono">password123</code></p>
        </div>
      </div>
    </main>
  );
}
