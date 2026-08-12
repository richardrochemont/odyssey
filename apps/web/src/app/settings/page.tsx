"use client";

import React from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { Users, Building2, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const { user, workspaces } = useAuth();
  const activeWorkspace = workspaces.find((w) => w.isActive) || workspaces[0];

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
        <div className="pb-6 mb-8 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight">Workspace Settings</h1>
            <p className="text-xs text-muted mt-0.5">Odyssey organization configuration & access control</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="px-3 py-1.5 text-xs font-bold bg-neutral-100 text-foreground border border-border rounded"
            >
              General
            </Link>
            <Link
              href="/settings/team"
              className="px-3 py-1.5 text-xs font-bold bg-white text-muted hover:text-foreground border border-border rounded transition-colors"
              data-testid="nav-team-settings"
            >
              Team Members
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Active Workspace Info */}
            <div className="bg-white border border-border p-6 rounded-md shadow-sm">
              <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-base font-semibold font-serif text-foreground">
                    {activeWorkspace ? activeWorkspace.name : "Active Workspace"}
                  </h3>
                  <p className="text-xs text-muted">
                    Slug: <code className="bg-neutral-100 px-1.5 py-0.5 rounded font-mono">{activeWorkspace?.slug || "active-org"}</code>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Your Role</span>
                  <span className="font-semibold text-foreground capitalize mt-0.5 block">
                    {user?.role ? user.role.replace("_", " ") : "Owner"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Joined Date</span>
                  <span className="font-semibold text-foreground mt-0.5 block">
                    {activeWorkspace?.joinedAt ? new Date(activeWorkspace.joinedAt).toLocaleDateString() : "Active Member"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white border border-border p-6 rounded-md shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-neutral-100 text-primary rounded-full">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Team & Roles Management</h4>
                  <p className="text-xs text-muted">Invite team members, manage roles, and review pending invitations.</p>
                </div>
              </div>
              <Link
                href="/settings/team"
                className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded transition-colors whitespace-nowrap"
              >
                Manage Team
              </Link>
            </div>
          </div>

          {/* Security & Permissions Summary */}
          <div className="bg-neutral-50 border border-border p-6 rounded-md space-y-4">
            <div className="flex items-center gap-2 text-foreground font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Workspace Isolation</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              All properties, leases, tenants, financials, and tasks in Odyssey are isolated within your active workspace.
            </p>
            <p className="text-xs text-muted leading-relaxed">
              Switching workspaces dynamically re-evaluates your role and permissions without exposing cross-organization records.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
