"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { Plus, Edit3, Archive, Filter, Search, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";


interface Lease {
  id: string;
  unitId: string;
  primaryTenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  status: string;
  renewalOption: boolean;
  notes: string | null;
  tenantName: string;
  unitNumber: string;
  propertyNickname: string;
  propertyId: string;
}

interface Property {
  id: string;
  nickname: string;
  units: { id: string; unitNumber: string }[];
}

interface Payment {
  id: string;
  tenantId: string;
  leaseId: string;
  propertyId: string;
  unitId: string;
  amountDue: number;
  amountReceived: number;
  dueDate: string;
  paidDate: string | null;
  status: "upcoming" | "paid" | "partial" | "overdue" | "waived";
  paymentMethod: string | null;
  memo: string | null;
  tenantName: string;
  propertyNickname: string;
  unitNumber: string;
}

export default function CashFlowPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "record-payment") {
        setShowModal(true);
        // Clear param
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        router.replace(url.pathname);
      }
    }
  }, [router]);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [tenantId, setTenantId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [status, setStatus] = useState<"upcoming" | "paid" | "partial" | "overdue" | "waived">("upcoming");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [memo, setMemo] = useState("");

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  };

  // Queries
  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["payments", token],
    queryFn: () => fetchWithAuth("/payments"),
    enabled: !!token,
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  const { data: leases = [] } = useQuery<Lease[]>({
    queryKey: ["leases", token],
    queryFn: () => fetchWithAuth("/leases"),
    enabled: !!token,
  });

  // Mutations
  const createPaymentMutation = useMutation({
    mutationFn: async (newPayment: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newPayment),
      });
      if (!res.ok) throw new Error("Failed to create payment record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", token] });
      setShowModal(false);
      resetForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: any }) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/payments/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Failed to update payment record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", token] });
      setShowModal(false);
      setEditingPayment(null);
      resetForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const archivePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/payments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive payment record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments", token] });
    },
  });

  const handleOpenEdit = (p: Payment) => {
    setEditingPayment(p);
    setTenantId(p.tenantId);
    setPropertyId(p.propertyId);
    setUnitId(p.unitId);
    setLeaseId(p.leaseId);
    setAmountDue(p.amountDue.toString());
    setAmountReceived(p.amountReceived.toString());
    setDueDate(p.dueDate.split("T")[0]);
    setPaidDate(p.paidDate ? p.paidDate.split("T")[0] : "");
    setStatus(p.status);
    setPaymentMethod(p.paymentMethod || "");
    setMemo(p.memo || "");
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fields = {
      tenantId,
      leaseId,
      propertyId,
      unitId,
      amountDue: parseFloat(amountDue),
      amountReceived: parseFloat(amountReceived || "0"),
      dueDate,
      paidDate: paidDate || null,
      status,
      paymentMethod: paymentMethod || null,
      memo: memo || null,
    };

    if (editingPayment) {
      updatePaymentMutation.mutate({ id: editingPayment.id, fields });
    } else {
      createPaymentMutation.mutate(fields);
    }
  };

  const resetForm = () => {
    setTenantId("");
    setPropertyId("");
    setUnitId("");
    setLeaseId("");
    setAmountDue("");
    setAmountReceived("");
    setDueDate("");
    setPaidDate("");
    setStatus("upcoming");
    setPaymentMethod("");
    setMemo("");
    setError(null);
    setEditingPayment(null);
  };

  // Summaries
  const totalCollected = payments.reduce((sum, p) => sum + p.amountReceived, 0);
  const totalOverdue = payments
    .filter((p) => p.status === "overdue")
    .reduce((sum, p) => sum + (p.amountDue - p.amountReceived), 0);
  const totalUpcoming = payments
    .filter((p) => p.status === "upcoming")
    .reduce((sum, p) => sum + p.amountDue, 0);

  // Filters
  const filteredPayments = payments.filter((p) => {
    const matchesSearch = p.tenantName.toLowerCase().includes(search.toLowerCase()) || 
                          p.propertyNickname.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === "all" || p.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-border gap-4">
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight">Cash Flow</h1>
            <p className="text-xs text-muted font-sans mt-0.5">
              Odyssey Payments Ledger • <span className="font-semibold text-danger">Operational view — not accounting</span>
            </p>
          </div>
          {user?.role !== "read_only" && (
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-neutral-800 rounded-md shadow-sm transition-all font-sans"
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </button>
          )}
        </div>

        {/* Cash Flow Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Rent Collected</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">
              ${(totalCollected / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Cumulated operational inflow</p>
          </div>

          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Delinquent / Overdue</p>
            <h3 className="text-2xl font-serif font-bold text-danger">
              ${(totalOverdue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Rent balances outstanding</p>
          </div>

          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Upcoming Projected</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">
              ${(totalUpcoming / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Rent scheduled in current leases</p>
          </div>
        </div>

        {/* Ledger Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by tenant name or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-border pl-10 pr-4 py-2 text-sm rounded-md outline-none focus:border-primary font-sans"
            />
          </div>

          <div className="flex items-center gap-2 text-sm font-sans">
            <Filter className="h-4 w-4 text-neutral-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-border px-3 py-2 rounded-md outline-none focus:border-primary text-xs font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
              <option value="waived">Waived</option>
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        {paymentsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="bg-white border border-border rounded-md shadow-sm overflow-hidden font-sans">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border text-[10px] font-bold text-muted uppercase tracking-widest">
                    <th className="px-6 py-4">Tenant</th>
                    <th className="px-6 py-4">Property & Unit</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4 text-right">Amount Due</th>
                    <th className="px-6 py-4 text-right">Received</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4">Memo</th>
                    {user?.role !== "read_only" && <th className="px-6 py-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPayments.length > 0 ? (
                    filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground">{p.tenantName}</td>
                        <td className="px-6 py-4">
                          {p.propertyNickname} • Unit {p.unitNumber}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {new Date(p.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold">
                          ${(p.amountDue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold">
                          ${(p.amountReceived / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold">
                          <span
                            className={`px-2 py-0.5 rounded-full ${
                              p.status === "paid"
                                ? "bg-neutral-100 text-foreground"
                                : p.status === "overdue"
                                ? "bg-danger/10 text-danger"
                                : p.status === "partial"
                                ? "bg-neutral-100 text-foreground/80"
                                : "bg-neutral-50 text-muted"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted uppercase">{p.paymentMethod || "—"}</td>
                        <td className="px-6 py-4 text-xs text-muted max-w-[150px] truncate">{p.memo || "—"}</td>
                        {user?.role !== "read_only" && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenEdit(p)}
                                className="p-1 hover:bg-neutral-100 text-neutral-600 rounded"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Are you sure you want to archive this payment?")) {
                                    archivePaymentMutation.mutate(p.id);
                                  }
                                }}
                                className="p-1 hover:bg-neutral-100 text-danger rounded"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={user?.role !== "read_only" ? 9 : 8} className="text-center py-8 text-sm text-muted">
                        No payments found matching the current search parameters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Record / Edit Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans text-sm">
          <div className="bg-white border border-border p-8 rounded-md max-w-md w-full shadow-lg">
            <h3 className="text-lg font-serif font-bold mb-4">
              {editingPayment ? "Edit Payment Record" : "Record Payment Inflow"}
            </h3>
            {error && <div className="bg-danger/10 border border-danger/25 text-danger p-3 rounded-md mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Leases and Tenants selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Tenant Lease Agreement
                </label>
                <select
                  required
                  value={leaseId}
                  onChange={(e) => {
                    const lId = e.target.value;
                    setLeaseId(lId);
                    // Match tenant, unit, property
                    const l = leases.find((l) => l.id === lId);
                    if (l) {
                      setTenantId(l.primaryTenantId);
                      setUnitId(l.unitId);
                      setAmountDue((l.monthlyRent / 100).toString());
                      // Find property matching unit's parent property
                      const prop = properties.find((p) => p.nickname === l.propertyNickname);
                      if (prop) setPropertyId(prop.id);
                    }
                  }}
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                >
                  <option value="">Select Tenant Lease</option>
                  {leases.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.tenantName} • Unit {l.unitNumber} ({l.propertyNickname})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Amount Due ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amountDue}
                    onChange={(e) => setAmountDue(e.target.value)}
                    placeholder="1200.00"
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Received ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="1200.00"
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Paid Date
                  </label>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="overdue">Overdue</option>
                    <option value="waived">Waived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  >
                    <option value="">Select Method</option>
                    <option value="ach">ACH Transfer</option>
                    <option value="check">Check</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Memo
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Rent payment for month of June..."
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary h-16 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-border rounded-md hover:bg-neutral-50 text-xs font-semibold font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                  className="px-4 py-2 bg-primary hover:bg-neutral-800 text-white rounded-md text-xs font-semibold shadow-sm transition-all font-sans"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
