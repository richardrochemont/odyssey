"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { Plus, Archive, Search, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface Property {
  id: string;
  nickname: string;
}

interface Expense {
  id: string;
  propertyId: string;
  unitId: string | null;
  type: string;
  amount: number;
  date: string;
  category: string;
  notes: string | null;
  propertyNickname: string;
  unitNumber: string | null;
}

export default function ExpensesPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = () => setShowModal(true);
    window.addEventListener("open-add-expense-modal", handleOpen);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "add-expense") {
        setShowModal(true);
        // Clear param
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        router.replace(url.pathname);
      }
    }

    return () => {
      window.removeEventListener("open-add-expense-modal", handleOpen);
    };
  }, [router]);

  // Form states
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [category, setCategory] = useState("repairs_and_maintenance");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  };

  // Queries
  const { data: expenses = [], isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["expenses", token],
    queryFn: () => fetchWithAuth("/financials/records"),
    enabled: !!token,
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  // Mutations
  const createExpenseMutation = useMutation({
    mutationFn: async (newExpense: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newExpense),
      });
      if (!res.ok) throw new Error("Failed to create expense record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", token] });
      setShowModal(false);
      resetForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const archiveExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/records/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive expense record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", token] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    createExpenseMutation.mutate({
      propertyId,
      unitId: unitId || null,
      type: "expense",
      amount: parseFloat(amount),
      date,
      category,
      notes,
    });
  };

  const resetForm = () => {
    setPropertyId("");
    setUnitId("");
    setCategory("repairs_and_maintenance");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setError(null);
  };

  // Category Taxonomy Label Maps
  const categoryLabels: Record<string, string> = {
    repairs_and_maintenance: "Repairs & Maintenance",
    utilities: "Utilities",
    insurance: "Insurance",
    taxes: "Taxes",
    mortgage: "Mortgage Interest",
    management: "Management Fee",
    cleaning: "Cleaning",
    supplies: "Supplies",
    capital_improvement: "Capital Improvement",
    other: "Other Operating Cost",
  };

  // Summaries
  const totalExpensesYTD = expenses.reduce((sum, e) => sum + e.amount, 0);

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  const totalExpensesMonth = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d >= startOfThisMonth && d <= endOfThisMonth;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Filters
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = (e.notes || "").toLowerCase().includes(search.toLowerCase()) || 
                          e.propertyNickname.toLowerCase().includes(search.toLowerCase());
    const matchesProperty = filterProperty === "all" || e.propertyId === filterProperty;
    const matchesCategory = filterCategory === "all" || e.category === filterCategory;
    return matchesSearch && matchesProperty && matchesCategory;
  });

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-border gap-4">
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight">Operating Expenses</h1>
            <p className="text-xs text-muted font-sans mt-0.5">
              Portfolio Ledger • <span className="font-semibold text-danger font-sans">Operational view — not accounting</span>
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
              Add Expense
            </button>
          )}
        </div>

        {/* Expense Summaries */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Expenses This Month</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">
              ${(totalExpensesMonth / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Current calendar month outflows</p>
          </div>

          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Total Operating Expenses (YTD)</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">
              ${(totalExpensesYTD / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Accumulated operating ledger costs</p>
          </div>
        </div>

        {/* Ledger Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search memo or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-border pl-10 pr-4 py-2 text-sm rounded-md outline-none focus:border-primary font-sans"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm font-sans">
            {/* Filter Property */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted font-bold uppercase tracking-wider">Property:</span>
              <select
                value={filterProperty}
                onChange={(e) => setFilterProperty(e.target.value)}
                className="bg-white border border-border px-3 py-2 rounded-md outline-none focus:border-primary text-xs font-semibold"
              >
                <option value="all">All Properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Category */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted font-bold uppercase tracking-wider">Category:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-white border border-border px-3 py-2 rounded-md outline-none focus:border-primary text-xs font-semibold"
              >
                <option value="all">All Categories</option>
                {Object.entries(categoryLabels).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        {expensesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="bg-white border border-border rounded-md shadow-sm overflow-hidden font-sans">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border text-[10px] font-bold text-muted uppercase tracking-widest">
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Property & Unit</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4">Memo</th>
                    {user?.role !== "read_only" && <th className="px-6 py-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExpenses.length > 0 ? (
                    filteredExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground">
                          {categoryLabels[e.category] || e.category}
                        </td>
                        <td className="px-6 py-4">
                          {e.propertyNickname} {e.unitNumber ? `• Unit ${e.unitNumber}` : ""}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold">
                          ${(e.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted max-w-[200px] truncate">{e.notes || "—"}</td>
                        {user?.role !== "read_only" && (
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => {
                                if (confirm("Are you sure you want to archive this expense?")) {
                                  archiveExpenseMutation.mutate(e.id);
                                }
                              }}
                              className="p-1 hover:bg-neutral-100 text-danger rounded"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={user?.role !== "read_only" ? 6 : 5} className="text-center py-8 text-sm text-muted">
                        No expenses logged matching the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Record Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans text-sm">
          <div className="bg-white border border-border p-8 rounded-md max-w-md w-full shadow-lg">
            <h3 className="text-lg font-serif font-bold mb-4">Record Operating Expense</h3>
            {error && <div className="bg-danger/10 border border-danger/25 text-danger p-3 rounded-md mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Property
                </label>
                <select
                  required
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                >
                  <option value="">Select Property</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Category
                </label>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                >
                  {Object.entries(categoryLabels).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="450.00"
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Paid Date
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Notes / Memo
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Apex plumbing faucet replacement..."
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary h-20 resize-none"
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
                  disabled={createExpenseMutation.isPending}
                  className="px-4 py-2 bg-primary hover:bg-neutral-800 text-white rounded-md text-xs font-semibold shadow-sm transition-all font-sans"
                >
                  Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
