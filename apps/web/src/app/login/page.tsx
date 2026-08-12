"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { ShieldCheck, Loader2, Mail, Lock, User, Building, ChevronDown, ChevronUp } from "lucide-react";

interface SeededUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  
  // App/View modes
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showDevOptions, setShowDevOptions] = useState(false);
  
  // Loaded seed users for demo selector
  const [seededUsers, setSeededUsers] = useState<SeededUser[]>([]);
  
  // Login form fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Register form fields
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerOrgName, setRegisterOrgName] = useState("");
  const [invitationToken, setInvitationToken] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingSeedId, setSubmittingSeedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Process query parameters client-side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get("email");
      const registerParam = params.get("register");
      const tokenParam = params.get("token");
      const expiredParam = params.get("expired");

      if (expiredParam === "true") {
        setError("Your session has expired. Please sign in again.");
      }
      if (emailParam) {
        setLoginEmail(emailParam);
        setRegisterEmail(emailParam);
      }
      if (registerParam === "true") {
        setMode("register");
      }
      if (tokenParam) {
        setInvitationToken(tokenParam);
      }
    }
  }, []);

  // Discover seeded users for dev selector (development only)
  useEffect(() => {
    async function fetchUsers() {
      if (!showDevOptions || process.env.NODE_ENV === "production") {
        return;
      }
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const res = await fetch(`${apiUrl}/auth/users`);
        if (!res.ok) throw new Error("Failed to load developers credentials");
        const data = await res.json();
        setSeededUsers(data);
      } catch (err: any) {
        // Silently log or keep list empty in prod if dev endpoints are disabled
        console.log("Seeded credentials discovery skipped/disabled.");
      }
    }
    fetchUsers();
  }, [showDevOptions]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (!res.ok) {
        const errData = await res.json();
        const rawErr = errData.error || "Invalid email or password";
        if (rawErr.toLowerCase().includes("unauthorized") || rawErr.toLowerCase().includes("token")) {
          throw new Error("Invalid email or password");
        }
        throw new Error(rawErr);
      }

      const session = await res.json();
      login(session.token, session.user);
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const body: Record<string, any> = {
        name: registerName,
        email: registerEmail,
        password: registerPassword,
      };

      if (invitationToken) {
        body.invitationToken = invitationToken;
      } else {
        body.orgName = registerOrgName;
      }

      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Registration failed. Please try again.");
      }

      const session = await res.json();
      login(session.token, session.user);
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  const handleSelectUser = async (user: SeededUser) => {
    setSubmittingSeedId(user.id);
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
      setSubmittingSeedId(null);
    }
  };

  const roleLabels: Record<string, string> = {
    owner: "Owner-Manager (All permissions)",
    manager: "Property Manager (Operational focus)",
    maintenance: "Maintenance Lead (Work Orders & Tasks)",
    read_only: "Investor (Read-only view)",
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-2xl shadow-xl transition-all duration-300">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="bg-primary text-white p-3 rounded-2xl mb-4 shadow-md shadow-primary/20">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-primary">Odyssey</h1>
          <p className="text-sm text-slate-500 mt-1 font-sans">
            {mode === "login" ? "Sign in to manage your properties" : "Create your owner account & organization"}
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm mb-6 flex items-start gap-2 shadow-sm">
            <span className="font-semibold">Error:</span>
            <span>{error}</span>
          </div>
        )}

        {/* Auth Forms */}
        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-primary hover:bg-primary/95 text-white font-medium rounded-xl shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-75"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="Genevieve Hearth"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all text-sm"
                />
              </div>
            </div>

            {!invitationToken && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Organization / Company Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Building className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={registerOrgName}
                    onChange={(e) => setRegisterOrgName(e.target.value)}
                    placeholder="Odyssey Capital LLC"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="•••••••• (Min. 6 characters)"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-primary hover:bg-primary/95 text-white font-medium rounded-xl shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-75"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        )}

        {/* View Switcher Toggle */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-xs text-primary font-semibold hover:underline"
          >
            {mode === "login" ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
          </button>
        </div>

        {/* Collapsible Demo Mode Section */}
        {seededUsers.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => setShowDevOptions(!showDevOptions)}
              className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium"
            >
              <span>DEVELOPER DEMO PROFILES</span>
              {showDevOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showDevOptions && (
              <div className="mt-4 space-y-2.5">
                <p className="text-[11px] text-slate-400">
                  Select a pre-seeded developer profile to quickly skip authentication:
                </p>
                <div className="space-y-2">
                  {seededUsers.map((u) => {
                    const loadingThis = submittingSeedId === u.id;
                    return (
                      <button
                        key={u.id}
                        disabled={isSubmitting || !!submittingSeedId}
                        onClick={() => handleSelectUser(u)}
                        className={`w-full text-left p-3 border border-slate-100 rounded-xl hover:border-primary/30 hover:bg-slate-50/50 transition-all flex items-center justify-between ${
                          loadingThis ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700 truncate">{u.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                          <p className="text-[9px] mt-0.5 text-primary font-bold uppercase tracking-wider">
                            {roleLabels[u.role] || u.role}
                          </p>
                        </div>
                        {loadingThis && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
