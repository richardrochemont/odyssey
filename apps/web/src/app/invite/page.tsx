"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Building2, AlertTriangle, ArrowRight, CheckCircle2, UserPlus, LogIn } from "lucide-react";

interface InvitationPreview {
  valid: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  isAccepted: boolean;
  email: string;
  role: string;
  note?: string;
  orgName: string;
  invitedByName: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const { token: userToken, user, login, logout } = useAuth();
  const router = useRouter();

  const [rawToken, setRawToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read URL fragment token on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash && hash.includes("token=")) {
        const tokenVal = hash.split("token=")[1].split("&")[0];
        setRawToken(tokenVal);
      } else {
        setLoading(false);
        setError("Invalid invitation link: Missing token fragment");
      }
    }
  }, []);

  const fetchPreview = useCallback(async (tokenVal: string) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/invitations/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenVal }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load invitation details");
      }

      setPreview(data);
    } catch (err: any) {
      setError(err.message || "Invalid or expired invitation link");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rawToken) {
      fetchPreview(rawToken);
    }
  }, [rawToken, fetchPreview]);

  const handleAccept = async () => {
    if (!userToken || !rawToken) return;
    setAccepting(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/invitations/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ token: rawToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }

      login(data.token, user || { id: "", name: "", email: preview?.email || "", role: data.role, orgId: data.activeOrgId });
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  const isEmailMatch = user && preview && user.email.toLowerCase() === preview.email.toLowerCase();

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded bg-primary text-white flex items-center justify-center font-serif font-bold text-sm">
            Ω
          </div>
          <span className="text-2xl font-serif font-bold tracking-tight text-primary">Odyssey</span>
        </div>
        <h2 className="text-xl font-bold font-serif text-foreground">Workspace Invitation</h2>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white border border-border py-8 px-6 shadow-xl rounded-lg font-sans">
          {loading ? (
            <div className="text-center py-8 text-xs text-muted">Loading invitation details...</div>
          ) : error ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-serif font-bold text-foreground">Invitation Error</h3>
              <p className="text-xs text-muted">{error}</p>
              <Link
                href="/login"
                className="inline-block px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded transition-colors"
              >
                Go to Sign In
              </Link>
            </div>
          ) : preview ? (
            <div className="space-y-6">
              {/* Workspace Badge */}
              <div className="p-4 bg-neutral-50 border border-border rounded text-center">
                <Building2 className="h-8 w-8 text-primary mx-auto mb-2" />
                <h3 className="text-lg font-serif font-bold text-foreground">{preview.orgName}</h3>
                <p className="text-xs text-muted mt-1">
                  Invited by <strong>{preview.invitedByName}</strong> as{" "}
                  <span className="capitalize font-semibold text-foreground">{preview.role.replace("_", " ")}</span>
                </p>
                {preview.note && (
                  <p className="text-xs italic text-muted mt-3 pt-3 border-t border-border bg-white p-2 rounded">
                    &quot;{preview.note}&quot;
                  </p>
                )}
              </div>

              {/* Status Rejections */}
              {!preview.valid && (
                <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold rounded text-center">
                  {preview.isExpired
                    ? "This invitation link has expired."
                    : preview.isRevoked
                    ? "This invitation has been revoked."
                    : preview.isAccepted
                    ? "This invitation has already been accepted."
                    : "This invitation is no longer active."}
                </div>
              )}

              {preview.valid && (
                <>
                  {/* Scenario 1: Not Logged In */}
                  {!user && (
                    <div className="space-y-4 pt-2">
                      <p className="text-xs text-muted text-center">
                        This invitation was sent to <strong className="text-foreground">{preview.email}</strong>. Please sign in or register to accept.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Link
                          href={`/login?email=${encodeURIComponent(preview.email)}`}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-foreground border border-border hover:bg-neutral-50 rounded transition-colors text-center"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Sign In
                        </Link>
                        <Link
                          href={`/login?register=true&email=${encodeURIComponent(preview.email)}&token=${encodeURIComponent(rawToken || "")}`}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded transition-colors text-center"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Register
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Scenario 2: Logged In & Email Matches */}
                  {user && isEmailMatch && (
                    <div className="space-y-4 pt-2">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Signed in as <strong>{user.email}</strong>. Ready to accept!</span>
                      </div>
                      <button
                        onClick={handleAccept}
                        disabled={accepting}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded shadow-md transition-colors disabled:opacity-50"
                        data-testid="accept-invitation-btn"
                      >
                        {accepting ? "Accepting..." : "Accept Invitation & Join Workspace"}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Scenario 3: Logged In & Email Mismatch */}
                  {user && !isEmailMatch && (
                    <div className="space-y-4 pt-2">
                      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded space-y-2">
                        <div className="flex items-center gap-2 font-bold text-amber-950">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                          <span>Email Mismatch Warning</span>
                        </div>
                        <p className="leading-relaxed">
                          You are currently signed in as <strong>{user.email}</strong>, but this invitation was sent to <strong>{preview.email}</strong>.
                        </p>
                      </div>
                      <button
                        onClick={logout}
                        className="w-full py-2.5 px-4 text-xs font-bold text-danger border border-danger/20 bg-danger/5 hover:bg-danger hover:text-white rounded transition-colors text-center"
                      >
                        Sign Out & Switch Account
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
