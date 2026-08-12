"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Building2, X, Sparkles } from "lucide-react";

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateWorkspaceModal({ isOpen, onClose }: CreateWorkspaceModalProps) {
  const { token, login, refetchWorkspaces } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Workspace name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create workspace");
      }

      // Auto-switch into the newly created workspace using returned session token
      login(data.token, data.user || { id: "", name: "", email: "", role: "owner", orgId: data.workspace.id });
      await refetchWorkspaces();
      onClose();
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in p-4">
      <div
        className="w-full max-w-md bg-white border border-border rounded-lg shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
        data-testid="create-workspace-modal"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-neutral-50">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Create New Workspace</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-foreground rounded transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs font-semibold text-danger bg-danger/10 border border-danger/20 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1">
              Workspace / Business Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hearthlane Capital LLC"
              required
              className="w-full px-3 py-2 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-sans"
              data-testid="workspace-name-input"
            />
            <p className="text-[11px] text-muted mt-1">
              Separate your entities, properties, and bank accounts into isolated workspaces.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-muted hover:text-foreground border border-border rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded shadow-sm transition-colors disabled:opacity-50"
              data-testid="confirm-create-workspace-btn"
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
              {loading ? "Creating..." : "Confirm & Switch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
