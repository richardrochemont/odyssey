"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Users,
  Plus,
  AlertTriangle,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface Lease {
  id: string;
  unitId: string;
  primaryTenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  status: "draft" | "active" | "ended" | "renewed";
  renewalOption: boolean;
  notes: string | null;
  tenantName: string;
  unitNumber: string;
  propertyNickname: string;
  daysUntilExpiry: number;
  isExpiringSoon: boolean;
}

interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string | null;
}

interface PropertyUnit {
  id: string;
  unitNumber: string;
  status: string;
}

interface Property {
  id: string;
  nickname: string;
  units: PropertyUnit[];
}

export default function LeasesPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isReadOnly = user?.role === "read_only";
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"leases" | "tenants">("leases");
  const [showLeaseModal, setShowLeaseModal] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "add-tenant") {
        setShowTenantModal(true);
        // Clear param
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        router.replace(url.pathname);
      }
    }
  }, [router]);
  const [error, setError] = useState<string | null>(null);

  // Tenant Form
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tNotes, setTNotes] = useState("");

  // Lease Form
  const [lUnitId, setLUnitId] = useState("");
  const [lTenantId, setLTenantId] = useState("");
  const [lStartDate, setLStartDate] = useState("");
  const [lEndDate, setLEndDate] = useState("");
  const [lRent, setLRent] = useState("");
  const [lDeposit, setLDeposit] = useState("");
  const [lStatus, setLStatus] = useState<"draft" | "active" | "ended" | "renewed">("active");
  const [lRenewalOption, setLRenewalOption] = useState(false);
  const [lNotes, setLNotes] = useState("");

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  };

  const { data: leases = [], isLoading: leasesLoading } = useQuery<Lease[]>({
    queryKey: ["leases", token],
    queryFn: () => fetchWithAuth("/leases"),
    enabled: !!token,
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["tenants", token],
    queryFn: () => fetchWithAuth("/leases/tenants"),
    enabled: !!token,
  });

  const { data: properties = [], isLoading: propsLoading } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  // Extract vacant units for leasing selector
  const availableUnits = properties.flatMap((p) =>
    (p.units || []).map((u) => ({
      ...u,
      propertyNickname: p.nickname,
    }))
  );

  // Mutations
  const createTenantMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/leases/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create tenant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants", token] });
      setShowTenantModal(false);
      setTName("");
      setTEmail("");
      setTPhone("");
      setTNotes("");
    },
    onError: (err: any) => setError(err.message),
  });

  const createLeaseMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/leases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create lease");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leases", token] });
      queryClient.invalidateQueries({ queryKey: ["properties", token] });
      queryClient.invalidateQueries({ queryKey: ["tasks", token] }); // invalidates auto renewal tasks
      setShowLeaseModal(false);
      resetLeaseForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const resetLeaseForm = () => {
    setLUnitId("");
    setLTenantId("");
    setLStartDate("");
    setLEndDate("");
    setLRent("");
    setLDeposit("");
    setLStatus("active");
    setLRenewalOption(false);
    setLNotes("");
  };

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createTenantMutation.mutate({ name: tName, email: tEmail, phone: tPhone, notes: tNotes });
  };

  const handleCreateLease = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createLeaseMutation.mutate({
      unitId: lUnitId,
      primaryTenantId: lTenantId,
      startDate: lStartDate,
      endDate: lEndDate,
      monthlyRent: Number(lRent),
      securityDeposit: Number(lDeposit),
      status: lStatus,
      renewalOption: lRenewalOption,
      notes: lNotes,
    });
  };

  const leaseStatusColors = {
    active: "bg-success/15 text-success",
    draft: "bg-primary/10 text-primary",
    ended: "bg-danger/10 text-danger",
    renewed: "bg-accent/20 text-accent-foreground",
  };

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Tenants & Leases</h2>
            <p className="text-sm text-muted mt-1">Review active occupancies, warnings, and agreements.</p>
          </div>
          {!isReadOnly && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowTenantModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-border bg-white text-xs font-semibold rounded-lg hover:bg-background transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Tenant
              </button>
              <button
                onClick={() => setShowLeaseModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors"
              >
                <Plus className="h-4 w-4" /> Draw Lease
              </button>
            </div>
          )}
        </div>

        {/* Tab switchers */}
        <div className="flex border-b border-border mb-6 gap-6">
          <button
            onClick={() => setActiveTab("leases")}
            className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === "leases" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            Active Leases
          </button>
          <button
            onClick={() => setActiveTab("tenants")}
            className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === "tenants" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            Tenants Directory
          </button>
        </div>

        {leasesLoading || tenantsLoading || propsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : activeTab === "leases" ? (
          /* LEASES LIST */
          leases.length === 0 ? (
            <div className="text-center py-20 bg-white border border-border rounded-xl">
              <Clock className="h-12 w-12 text-muted mx-auto mb-3" />
              <h3 className="font-bold text-foreground">No leases drawn</h3>
              <p className="text-sm text-muted mt-1">Get started by creating your first lease agreement.</p>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted font-bold bg-background/50">
                      <th className="py-3 px-4">Tenant</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Term Dates</th>
                      <th className="py-3 px-4">Rent / Deposit</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Expirations Alert</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leases.map((lease) => (
                      <tr key={lease.id} className="border-b border-border hover:bg-background/30">
                        <td className="py-4 px-4">
                          <p className="font-bold text-foreground">{lease.tenantName}</p>
                          <p className="text-[10px] text-muted mt-0.5">Lease ID: {lease.id.substring(0, 8)}</p>
                        </td>
                        <td className="py-4 px-4 font-semibold text-primary">
                          {lease.propertyNickname} • Unit {lease.unitNumber}
                        </td>
                        <td className="py-4 px-4 leading-relaxed text-muted">
                          {new Date(lease.startDate).toLocaleDateString()} to {new Date(lease.endDate).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium text-foreground">{lease.monthlyRent.toLocaleString("en-US", { style: "currency", currency: "USD" })} / mo</p>
                          <p className="text-[10px] text-muted mt-0.5">Deposit: {lease.securityDeposit.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2 py-0.5 rounded-[4px] font-bold text-[9px] uppercase tracking-wider ${leaseStatusColors[lease.status]}`}>
                            {lease.status}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          {lease.isExpiringSoon ? (
                            <div className="flex items-center gap-1.5 text-warning font-bold">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                              <span>Expiring soon ({lease.daysUntilExpiry} days)</span>
                            </div>
                          ) : lease.status === "active" ? (
                            <span className="text-muted font-medium">Safe ({lease.daysUntilExpiry} days remaining)</span>
                          ) : (
                            <span className="text-muted font-medium">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <Link
                            href={`/leases/${lease.id}`}
                            className="text-xs font-bold text-primary hover:underline flex items-center justify-end gap-0.5"
                          >
                            Timeline & AI Summary <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          /* TENANTS LIST */
          tenants.length === 0 ? (
            <div className="text-center py-20 bg-white border border-border rounded-xl">
              <Users className="h-12 w-12 text-muted mx-auto mb-3" />
              <h3 className="font-bold text-foreground">No tenants registered</h3>
              <p className="text-sm text-muted mt-1">Add a tenant profile to link to lease agreements.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tenants.map((t) => (
                <div key={t.id} className="bg-white border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="p-1.5 bg-primary/5 text-primary rounded-full">
                        <Users className="h-4 w-4" />
                      </div>
                      <h3 className="font-bold text-foreground">{t.name}</h3>
                    </div>

                    <div className="space-y-1.5 text-xs text-muted leading-normal mb-4">
                      <p>Email: <span className="text-foreground">{t.email}</span></p>
                      <p>Phone: <span className="text-foreground">{t.phone}</span></p>
                    </div>

                    {t.notes && (
                      <div className="bg-background border border-border p-2.5 rounded text-[11px] text-muted italic">
                        {t.notes}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border mt-4 pt-3 flex justify-between items-center text-[10px] text-muted">
                    <span>ID: {t.id.substring(0, 8)}</span>
                    <span className="font-semibold text-primary">Leases Linked</span>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {/* Add Tenant Modal */}
        {showTenantModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-sm overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Register Tenant</h4>
              </div>
              <form onSubmit={handleCreateTenant}>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={tName}
                      onChange={(e) => setTName(e.target.value)}
                      placeholder="Alice Vance"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={tEmail}
                      onChange={(e) => setTEmail(e.target.value)}
                      placeholder="alice@example.com"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Phone</label>
                    <input
                      type="tel"
                      required
                      value={tPhone}
                      onChange={(e) => setTPhone(e.target.value)}
                      placeholder="512-555-0192"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Notes</label>
                    <textarea
                      value={tNotes}
                      onChange={(e) => setTNotes(e.target.value)}
                      placeholder="Preferences, contact notes..."
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTenantModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold">
                    Register
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Draw Lease Modal */}
        {showLeaseModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-md overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Draw Lease Agreement</h4>
              </div>
              <form onSubmit={handleCreateLease}>
                <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Select Unit</label>
                      <select
                        required
                        value={lUnitId}
                        onChange={(e) => setLUnitId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">Choose Unit...</option>
                        {availableUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.propertyNickname} • Unit {u.unitNumber} ({u.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Primary Tenant</label>
                      <select
                        required
                        value={lTenantId}
                        onChange={(e) => setLTenantId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">Choose Tenant...</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Start Date</label>
                      <input
                        type="date"
                        required
                        value={lStartDate}
                        onChange={(e) => setLStartDate(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">End Date</label>
                      <input
                        type="date"
                        required
                        value={lEndDate}
                        onChange={(e) => setLEndDate(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Monthly Rent ($)</label>
                      <input
                        type="number"
                        required
                        value={lRent}
                        onChange={(e) => setLRent(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Security Deposit ($)</label>
                      <input
                        type="number"
                        required
                        value={lDeposit}
                        onChange={(e) => setLDeposit(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Lease Status</label>
                      <select
                        value={lStatus}
                        onChange={(e) => setLStatus(e.target.value as any)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="ended">Ended</option>
                        <option value="renewed">Renewed</option>
                      </select>
                    </div>

                    <div className="flex items-center mt-4.5 pl-2">
                      <input
                        type="checkbox"
                        id="lRenewalOption"
                        checked={lRenewalOption}
                        onChange={(e) => setLRenewalOption(e.target.checked)}
                        className="h-4 w-4 border-border rounded text-primary focus:ring-primary mr-2"
                      />
                      <label htmlFor="lRenewalOption" className="text-xs font-bold text-foreground">
                        Renewal Option
                      </label>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Notes</label>
                      <textarea
                        value={lNotes}
                        onChange={(e) => setLNotes(e.target.value)}
                        placeholder="Additional lease terms..."
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLeaseModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLeaseMutation.isPending}
                    className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold flex items-center gap-1"
                  >
                    {createLeaseMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create Agreement
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
