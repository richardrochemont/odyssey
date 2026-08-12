"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  X,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  UserX,
  AlertTriangle,
  Mail,
} from "lucide-react";

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "accountant" | "maintenance" | "read_only";
  status: "active" | "suspended";
  joinedAt: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: "owner" | "manager" | "accountant" | "maintenance" | "read_only";
  status: string;
  note?: string;
  expiresAt: string;
  createdAt: string;
  invitedByName: string;
}

export default function TeamSettingsPage() {
  const { token, user, workspaces } = useAuth();
  const activeWorkspace = workspaces.find((w) => w.isActive) || workspaces[0];
  const isOwner = user?.role === "owner";

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite Modal States
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "manager" | "accountant" | "maintenance" | "read_only">("manager");
  const [inviteNote, setInviteNote] = useState("");
  const [confirmOwnerInvite, setConfirmOwnerInvite] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // One-time Invitation Link Preview Modal State
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTeamData = useCallback(async () => {
    if (!token || !user?.activeOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      
      // Fetch members
      const memRes = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (memRes.ok) {
        const memData = await memRes.json();
        setMembers(memData);
      } else if (memRes.status === 403) {
        setError("Forbidden: Only owners and managers can view team members");
      }

      // Fetch invitations (Owner only)
      if (isOwner) {
        const invRes = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/invitations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          setInvitations(invData);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load team details");
    } finally {
      setLoading(false);
    }
  }, [token, user?.activeOrgId, isOwner]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  const handleRoleChange = async (membershipId: string, newRole: string) => {
    if (!token || !user?.activeOrgId) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/members/${membershipId}/role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      fetchTeamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSuspendMember = async (membershipId: string) => {
    if (!token || !user?.activeOrgId) return;
    if (!confirm("Are you sure you want to suspend this team member?")) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/members/${membershipId}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to suspend member");
      fetchTeamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!token || !user?.activeOrgId) return;
    if (!confirm("Are you sure you want to remove this team member from the workspace?")) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/members/${membershipId}/remove`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      fetchTeamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user?.activeOrgId) return;

    if (inviteRole === "owner" && !confirmOwnerInvite) {
      alert("Please confirm the explicit Owner permission warning before proceeding.");
      return;
    }

    setSubmittingInvite(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          note: inviteNote,
          confirmOwnerInvite: inviteRole === "owner" ? confirmOwnerInvite : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invitation");

      setCreatedUrl(data.invitationUrl);
      setIsInviteModalOpen(false);
      setInviteEmail("");
      setInviteNote("");
      setConfirmOwnerInvite(false);
      fetchTeamData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!token || !user?.activeOrgId) return;
    if (!confirm("Are you sure you want to revoke this pending invitation?")) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/invitations/${invitationId}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke invitation");
      fetchTeamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleGenerateReplacementLink = async (inv: Invitation) => {
    if (!token || !user?.activeOrgId) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces/${user.activeOrgId}/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inv.email,
          role: inv.role,
          confirmOwnerInvite: inv.role === "owner" ? true : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate replacement link");

      setCreatedUrl(data.invitationUrl);
      fetchTeamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCopyUrl = () => {
    if (createdUrl) {
      navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const activeOwnersCount = members.filter((m) => m.role === "owner" && m.status === "active").length;

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
        <div className="pb-6 mb-8 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight">Team Members</h1>
            <p className="text-xs text-muted mt-0.5">
              Workspace collaboration for {activeWorkspace?.name || "Active Workspace"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="px-3 py-1.5 text-xs font-bold bg-white text-muted hover:text-foreground border border-border rounded transition-colors"
            >
              General
            </Link>
            <Link
              href="/settings/team"
              className="px-3 py-1.5 text-xs font-bold bg-neutral-100 text-foreground border border-border rounded"
            >
              Team Members
            </Link>

            {isOwner && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded shadow-sm transition-colors ml-2"
                data-testid="invite-member-btn"
              >
                <UserPlus className="h-4 w-4" />
                Invite Member
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 text-xs font-semibold text-danger bg-danger/10 border border-danger/20 rounded flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Team Members Section */}
        <div className="bg-white border border-border rounded-md shadow-sm mb-8 overflow-hidden font-sans">
          <div className="px-6 py-4 border-b border-border bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Active Members</h3>
            </div>
            <span className="text-xs font-bold text-muted bg-white border border-border px-2 py-0.5 rounded">
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-muted uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-bold">User</th>
                  <th className="px-6 py-3 font-bold">Role</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                  <th className="px-6 py-3 font-bold">Joined</th>
                  {isOwner && <th className="px-6 py-3 font-bold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-xs text-muted">
                      Loading workspace members...
                    </td>
                  </tr>
                ) : (
                  members.map((m) => {
                  const isFinalOwner = m.role === "owner" && activeOwnersCount <= 1;
                  const isCurrentUser = m.userId === user?.id;

                  return (
                    <tr key={m.membershipId} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-neutral-200 text-primary flex items-center justify-center font-bold text-xs">
                            {m.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-foreground">
                              {m.name} {isCurrentUser && <span className="text-[10px] text-muted font-normal">(You)</span>}
                            </p>
                            <p className="text-[11px] text-muted">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isOwner && !isFinalOwner ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.membershipId, e.target.value)}
                            className="px-2 py-1 text-xs border border-border rounded bg-white font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="owner">Owner</option>
                            <option value="manager">Manager</option>
                            <option value="accountant">Accountant</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="read_only">Read-only</option>
                          </select>
                        ) : (
                          <span className="capitalize font-semibold text-foreground">
                            {m.role.replace("_", " ")}
                            {isFinalOwner && (
                              <span className="ml-2 text-[9px] uppercase font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Primary Owner
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            m.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-danger/10 text-danger border border-danger/20"
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted">
                        {new Date(m.joinedAt).toLocaleDateString()}
                      </td>
                      {isOwner && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isFinalOwner && (
                              <>
                                <button
                                  onClick={() => handleSuspendMember(m.membershipId)}
                                  className="p-1.5 text-muted hover:text-amber-600 rounded transition-colors"
                                  title="Suspend Member"
                                >
                                  <UserX className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleRemoveMember(m.membershipId)}
                                  className="p-1.5 text-muted hover:text-danger rounded transition-colors"
                                  title="Remove Member"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Invitations Section (Owner Only) */}
        {isOwner && (
          <div className="bg-white border border-border rounded-md shadow-sm overflow-hidden font-sans">
            <div className="px-6 py-4 border-b border-border bg-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Pending Invitations</h3>
              </div>
              <span className="text-xs font-bold text-muted bg-white border border-border px-2 py-0.5 rounded">
                {invitations.length} invitation{invitations.length === 1 ? "" : "s"}
              </span>
            </div>

            {invitations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-muted uppercase text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="px-6 py-3 font-bold">Invited Email</th>
                      <th className="px-6 py-3 font-bold">Role</th>
                      <th className="px-6 py-3 font-bold">Invited By</th>
                      <th className="px-6 py-3 font-bold">Expires</th>
                      <th className="px-6 py-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground">{inv.email}</td>
                        <td className="px-6 py-4 capitalize text-muted">{inv.role.replace("_", " ")}</td>
                        <td className="px-6 py-4 text-muted">{inv.invitedByName}</td>
                        <td className="px-6 py-4 text-muted">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleGenerateReplacementLink(inv)}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border border-border text-foreground hover:bg-neutral-50 rounded transition-colors"
                              title="Revokes active token and generates new raw link modal"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Generate replacement link
                            </button>
                            <button
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-danger border border-danger/20 bg-danger/5 hover:bg-danger hover:text-white rounded transition-colors"
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted">
                No pending invitations. Click &quot;Invite Member&quot; above to issue a new secure invitation.
              </div>
            )}
          </div>
        )}

        {/* Invite Member Modal */}
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4 animate-fade-in">
            <div
              className="w-full max-w-lg bg-white border border-border rounded-lg shadow-2xl overflow-hidden font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-neutral-50">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-bold text-foreground">Invite Team Member</h2>
                </div>
                <button onClick={() => setIsInviteModalOpen(false)} className="p-1 text-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCreateInvitation} className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-foreground uppercase tracking-wider mb-1">Invitee Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-bold text-foreground uppercase tracking-wider mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => {
                      const r = e.target.value as any;
                      setInviteRole(r);
                      if (r !== "owner") setConfirmOwnerInvite(false);
                    }}
                    className="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="manager">Manager (Manage properties, leases, expenses)</option>
                    <option value="accountant">Accountant (Manage financials & reports)</option>
                    <option value="maintenance">Maintenance (Manage work orders & requests)</option>
                    <option value="read_only">Read-only (Investor view)</option>
                    <option value="owner">Owner (Full administrative control)</option>
                  </select>
                </div>

                {/* Explicit Owner Warning Banner */}
                {inviteRole === "owner" && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded space-y-2 text-amber-900">
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <ShieldAlert className="h-4 w-4 text-amber-700" />
                      <span>Owner Access Warning</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Inviting an Owner grants complete administrative access to members, properties, tenant data, financials, documents, payment setups, workspace settings, and invitation management.
                    </p>
                    <label className="flex items-start gap-2 mt-2 pt-2 border-t border-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmOwnerInvite}
                        onChange={(e) => setConfirmOwnerInvite(e.target.checked)}
                        className="mt-0.5"
                        required
                      />
                      <span className="text-[11px] font-bold text-amber-950">
                        I explicitly confirm granting full Owner administrative access to {inviteEmail || "this user"}.
                      </span>
                    </label>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-foreground uppercase tracking-wider mb-1">Optional Note</label>
                  <textarea
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder="Welcome to Odyssey! Click the link below to join our workspace."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 font-semibold text-muted border border-border rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="px-4 py-2 font-bold text-white bg-primary hover:bg-neutral-800 rounded disabled:opacity-50"
                  >
                    {submittingInvite ? "Generating..." : "Create Invitation Link"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Immediate One-Time Invitation Link Confirmation Modal */}
        {createdUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4 animate-fade-in">
            <div
              className="w-full max-w-lg bg-white border border-border rounded-lg shadow-2xl overflow-hidden font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-border bg-neutral-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base font-bold text-foreground">Secure Invitation Link Created</h2>
                </div>
                <button onClick={() => setCreatedUrl(null)} className="p-1 text-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 leading-relaxed font-semibold">
                  This raw invitation link is shown <strong>ONCE ONLY</strong> and is not stored in the database. Copy the link below now to send to your team member.
                </div>

                <div>
                  <label className="block font-bold text-foreground uppercase tracking-wider mb-1">
                    Invitation URL (Fragment Token)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdUrl}
                      className="w-full px-3 py-2 text-xs font-mono border border-border rounded bg-neutral-50 text-foreground"
                    />
                    <button
                      onClick={handleCopyUrl}
                      className="flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-primary hover:bg-neutral-800 rounded whitespace-nowrap"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end border-t border-border">
                  <button
                    onClick={() => setCreatedUrl(null)}
                    className="px-4 py-2 font-bold text-foreground border border-border rounded hover:bg-neutral-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
