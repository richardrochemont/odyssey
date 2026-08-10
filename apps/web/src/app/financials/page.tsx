"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import {
  DollarSign,
  Plus,
  TrendingUp,
  TrendingDown,
  Info,
  Calendar,
  Loader2,
  Trash2,
} from "lucide-react";

interface LedgerRecord {
  id: string;
  propertyId: string;
  unitId: string | null;
  type: "income" | "expense";
  amount: number; // in dollars
  date: string;
  category: string;
  notes: string | null;
  propertyNickname: string;
  unitNumber: string | null;
}

interface Summary {
  scheduledRent: number;
  recordedRent: number;
  totalIncome: number;
  totalExpenses: number;
  netOperatingIncome: number;
  notes: string;
}

interface PropertyUnit {
  id: string;
  unitNumber: string;
}

interface Property {
  id: string;
  nickname: string;
  units: PropertyUnit[];
}

export default function FinancialsPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const isReadOnly = user?.role === "read_only";

  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [fPropId, setFPropId] = useState("");
  const [fUnitId, setFUnitId] = useState("");
  const [fType, setFType] = useState<"income" | "expense">("income");
  const [fAmount, setFAmount] = useState("");
  const [fDate, setFDate] = useState("");
  const [fCategory, setFCategory] = useState("rent");
  const [fNotes, setFNotes] = useState("");

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  };

  const { data: records = [], isLoading: recordsLoading } = useQuery<LedgerRecord[]>({
    queryKey: ["financial-records", token],
    queryFn: () => fetchWithAuth("/financials/records"),
    enabled: !!token,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ["financial-summary", token],
    queryFn: () => fetchWithAuth("/financials/summary"),
    enabled: !!token,
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  const selectedProperty = properties.find((p) => p.id === fPropId);

  // Mutations
  const createRecordMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to log transaction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-records", token] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary", token] });
      setShowModal(false);
      resetForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const archiveRecordMutation = useMutation({
    mutationFn: async (recId: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/records/${recId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive transaction");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-records", token] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary", token] });
    },
  });

  const resetForm = () => {
    setFPropId("");
    setFUnitId("");
    setFType("income");
    setFAmount("");
    setFDate("");
    setFCategory("rent");
    setFNotes("");
  };

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createRecordMutation.mutate({
      propertyId: fPropId,
      unitId: fUnitId || null,
      type: fType,
      amount: Number(fAmount),
      date: fDate,
      category: fCategory,
      notes: fNotes || undefined,
    });
  };

  const categoryLabels: Record<string, string> = {
    rent: "Rental Income",
    maintenance_repair: "Maintenance & Repairs",
    utility_water: "Utilities (Water)",
    utility_electricity: "Utilities (Electricity)",
    utility_gas: "Utilities (Gas)",
    utility_internet: "Utilities (Internet)",
    insurance: "Insurance Premium",
    property_tax: "Property Taxes",
    mortgage: "Mortgage Payment",
    management_fee: "Management Fees",
    other: "Other Expense",
  };

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Warning Accounting Banner */}
        <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-start gap-3 mb-8">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-foreground">Operational view — not accounting</p>
            <p className="text-xs mt-1 text-muted leading-relaxed">
              This panel tracks operational rental transactions and simple net cash flow indicators to assist renewal planning.
              It is not audited double-entry accounting or official tax compliance reporting.
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Financial Operating Records</h2>
            <p className="text-sm text-muted mt-1">Review scheduled incomes, cash inflows, and maintenance expenses.</p>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="h-4.5 w-4.5" /> Log Transaction
            </button>
          )}
        </div>

        {summaryLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : summary ? (
          /* Portfolio metrics cards */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white border border-border p-5 rounded-xl shadow-sm">
              <div className="flex justify-between items-center text-xs font-bold text-muted uppercase tracking-wider mb-2">
                <span>Scheduled Rent</span>
                <Calendar className="h-4.5 w-4.5 text-primary" />
              </div>
              <p className="text-2xl font-extrabold text-foreground">
                {summary.scheduledRent.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </p>
              <p className="text-[10px] text-muted mt-1 font-medium">Contracted active lease totals</p>
            </div>

            <div className="bg-white border border-border p-5 rounded-xl shadow-sm">
              <div className="flex justify-between items-center text-xs font-bold text-muted uppercase tracking-wider mb-2">
                <span>Recorded Rent</span>
                <TrendingUp className="h-4.5 w-4.5 text-success" />
              </div>
              <p className="text-2xl font-extrabold text-success">
                {summary.recordedRent.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </p>
              <p className="text-[10px] text-muted mt-1 font-medium">Actual rent payments logged</p>
            </div>

            <div className="bg-white border border-border p-5 rounded-xl shadow-sm">
              <div className="flex justify-between items-center text-xs font-bold text-muted uppercase tracking-wider mb-2">
                <span>Operating Expenses</span>
                <TrendingDown className="h-4.5 w-4.5 text-danger" />
              </div>
              <p className="text-2xl font-extrabold text-danger">
                {summary.totalExpenses.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </p>
              <p className="text-[10px] text-muted mt-1 font-medium">Repairs & property overheads</p>
            </div>

            <div className="bg-white border border-border p-5 rounded-xl shadow-sm">
              <div className="flex justify-between items-center text-xs font-bold text-muted uppercase tracking-wider mb-2">
                <span>Net Operating Income</span>
                <DollarSign className="h-4.5 w-4.5 text-primary" />
              </div>
              <p className={`text-2xl font-extrabold ${summary.netOperatingIncome >= 0 ? "text-primary" : "text-danger"}`}>
                {summary.netOperatingIncome.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </p>
              <p className="text-[10px] text-muted mt-1 font-medium">Recorded income minus expenses</p>
            </div>
          </div>
        ) : null}

        {/* Transactions Table */}
        <h3 className="font-bold text-foreground mb-4">Portfolio Cash Ledger</h3>
        {recordsLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 bg-white border border-border rounded-xl">
            <DollarSign className="h-8 w-8 text-muted mx-auto mb-2" />
            <p className="text-xs font-semibold text-foreground">No ledger records</p>
            <p className="text-[11px] text-muted mt-0.5">Log rent payouts and contractor invoices to populate the ledger.</p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted font-bold bg-background/50">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-background/20">
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {new Date(r.date).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 leading-normal text-muted">
                        {r.propertyNickname} {r.unitNumber ? `• Unit ${r.unitNumber}` : ""}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {categoryLabels[r.category] || r.category}
                      </td>
                      <td className="py-3.5 px-4 leading-relaxed text-muted truncate max-w-[150px]">
                        {r.notes || "—"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-[4px] font-bold text-[8.5px] uppercase tracking-wider ${
                          r.type === "income" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                        }`}>
                          {r.type}
                        </span>
                      </td>
                      <td className={`py-3.5 px-4 font-extrabold text-sm ${
                        r.type === "income" ? "text-success" : "text-danger"
                      }`}>
                        {r.type === "income" ? "+" : "-"}
                        {r.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!isReadOnly && (
                          <button
                            onClick={() => {
                              if (confirm("Delete ledger record?")) archiveRecordMutation.mutate(r.id);
                            }}
                            className="text-muted hover:text-danger p-1 rounded transition-colors"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Log Transaction Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-sm overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Log Financial Transaction</h4>
              </div>
              <form onSubmit={handleCreateRecord}>
                <div className="p-4 space-y-3">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Select Property</label>
                    <select
                      required
                      value={fPropId}
                      onChange={(e) => {
                        setFPropId(e.target.value);
                        setFUnitId("");
                      }}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                    >
                      <option value="">Choose Property...</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                        </option>
                      ))}
                    </select>
                  </div>

                  {fPropId && selectedProperty && (
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Relate to Unit (Optional)</label>
                      <select
                        value={fUnitId}
                        onChange={(e) => setFUnitId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">Portfolio Level (No Unit)</option>
                        {selectedProperty.units?.map((u) => (
                          <option key={u.id} value={u.id}>
                            Unit {u.unitNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Transaction Type</label>
                      <select
                        value={fType}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setFType(val);
                          setFCategory(val === "income" ? "rent" : "maintenance_repair");
                        }}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="income">Income (+)</option>
                        <option value="expense">Expense (-)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Amount ($ USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={fAmount}
                        onChange={(e) => setFAmount(e.target.value)}
                        placeholder="e.g. 1200.00"
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Transaction Date</label>
                    <input
                      type="date"
                      required
                      value={fDate}
                      onChange={(e) => setFDate(e.target.value)}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Category</label>
                    <select
                      value={fCategory}
                      onChange={(e) => setFCategory(e.target.value)}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                    >
                      {fType === "income" ? (
                        <>
                          <option value="rent">Rental Income</option>
                          <option value="other">Other Income</option>
                        </>
                      ) : (
                        <>
                          <option value="maintenance_repair">Maintenance & Repair</option>
                          <option value="utility_water">Utilities (Water)</option>
                          <option value="utility_electricity">Utilities (Electricity)</option>
                          <option value="utility_gas">Utilities (Gas)</option>
                          <option value="utility_internet">Utilities (Internet)</option>
                          <option value="insurance">Insurance Premium</option>
                          <option value="property_tax">Property Taxes</option>
                          <option value="mortgage">Mortgage Payment</option>
                          <option value="management_fee">Management Fees</option>
                          <option value="other">Other Expense</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Transaction Notes</label>
                    <textarea
                      value={fNotes}
                      onChange={(e) => setFNotes(e.target.value)}
                      placeholder="e.g. Invoice #2282 from Apex Plumbing"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      rows={2}
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createRecordMutation.isPending}
                    className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold flex items-center gap-1"
                  >
                    {createRecordMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Log ledger
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
