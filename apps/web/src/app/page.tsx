"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import {
  Building2,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  FileText,
  Plus
} from "lucide-react";
import Link from "next/link";

interface Unit {
  id: string;
  status: "occupied" | "vacant" | "notice_given" | "offline";
  unitNumber: string;
}

interface Property {
  id: string;
  nickname: string;
  propertyType: string;
  units: Unit[];
}

interface Lease {
  id: string;
  unitNumber: string;
  tenantName: string;
  propertyNickname: string;
  endDate: string;
  status: string;
  daysUntilExpiry: number;
  isExpiringSoon: boolean;
  monthlyRent: number;
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

interface Trend {
  month: string;
  collected: number;
  projected: number;
  expenses: number;
}

export default function PortfolioOverviewPage() {
  const { token, user, isLoading: authLoading } = useAuth();
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    propertyId: "",
    unitId: "",
    category: "repairs_and_maintenance",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    const handleOpen = () => setShowAddExpenseModal(true);
    window.addEventListener("open-add-expense-modal", handleOpen);
    return () => window.removeEventListener("open-add-expense-modal", handleOpen);
  }, []);

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    return res.json();
  };

  const { data: properties = [], isLoading: propsLoading } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  const { data: leases = [], isLoading: leasesLoading } = useQuery<Lease[]>({
    queryKey: ["leases", token],
    queryFn: () => fetchWithAuth("/leases"),
    enabled: !!token,
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["payments", token],
    queryFn: () => fetchWithAuth("/payments"),
    enabled: !!token,
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["expenses", token],
    queryFn: () => fetchWithAuth("/financials/records"),
    enabled: !!token,
  });

  const { data: trends = [], isLoading: trendsLoading, refetch: refetchTrends } = useQuery<Trend[]>({
    queryKey: ["trends", token],
    queryFn: () => fetchWithAuth("/financials/trends"),
    enabled: !!token,
  });

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.propertyId || !expenseForm.amount) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: expenseForm.propertyId,
          unitId: expenseForm.unitId || null,
          type: "expense",
          amount: parseFloat(expenseForm.amount),
          date: expenseForm.date,
          category: expenseForm.category,
          notes: expenseForm.notes,
        }),
      });

      if (res.ok) {
        setShowAddExpenseModal(false);
        setExpenseForm({
          propertyId: "",
          unitId: "",
          category: "repairs_and_maintenance",
          amount: "",
          date: new Date().toISOString().split("T")[0],
          notes: "",
        });
        refetchTrends();
      }
    } catch (err) {
      console.error("Failed to create expense", err);
    }
  };

  if (authLoading || propsLoading || leasesLoading || paymentsLoading || expensesLoading || trendsLoading) {
    return (
      <div className="flex flex-col bg-background min-h-screen">
        <div className="h-[68px] bg-white border-b border-border w-full" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-sm text-muted font-semibold font-sans">Loading command center...</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Calculations ---

  // 1. Portfolio Value (Acquisition baseline: $4.2M)
  const portfolioValue = "$4,250,000";

  // 2. Monthly Rental Income (active leases rent sum)
  const activeLeases = leases.filter((l) => l.status === "active");
  const monthlyRentalIncome = activeLeases.reduce((sum, l) => sum + (l.monthlyRent || 0), 0);

  // 3. Net Cash Flow (this month's collected rents minus this month's recorded expenses)
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const collectedThisMonth = payments
    .filter((p) => {
      const d = new Date(p.dueDate);
      return d >= startOfThisMonth && d <= endOfThisMonth;
    })
    .reduce((sum, p) => sum + p.amountReceived, 0);

  const expensesThisMonth = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d >= startOfThisMonth && d <= endOfThisMonth;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const netCashFlow = collectedThisMonth - expensesThisMonth;

  // 4. Occupancy Rate
  const allUnits = properties.flatMap((p) => p.units || []);
  const totalUnits = allUnits.length;
  const occupiedUnits = allUnits.filter((u) => u.status === "occupied" || u.status === "notice_given").length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

  // 5. Briefings and Decisions lists
  const overdueRents = payments.filter((p) => p.status === "overdue");
  const expiringLeases = leases.filter((l) => l.status === "active" && l.daysUntilExpiry <= 90);
  const vacantUnits = allUnits.filter((u) => u.status === "vacant");
  const recentSpikes = expenses.filter((e) => e.amount > 30000); // over $300

  // Count decisions needed
  const decisionsCount = overdueRents.length + expiringLeases.length + vacantUnits.length;

  // Render chart scales
  const maxChartVal = Math.max(...trends.flatMap((t) => [t.collected, t.projected, t.expenses]), 1000) || 5000;

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-border gap-4">
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight">Portfolio Overview</h1>
            <p className="text-sm text-muted font-sans mt-1">
              Active profile: <span className="font-medium text-foreground">{user?.name}</span> • Odyssey Portfolio Operator
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddExpenseModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-neutral-800 rounded-md shadow-sm transition-all font-sans"
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </button>
            <span className="text-xs font-semibold bg-white border border-border px-3 py-2 rounded-md text-muted shadow-sm font-sans">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </div>
        </div>

        {/* 5 Premium Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          {/* Portfolio Value */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Portfolio Value</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">{portfolioValue}</h3>
            <p className="text-[11px] text-muted font-sans mt-1">Estimated asset base</p>
          </div>

          {/* Monthly Rental Income */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Monthly Rent</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">
              ${(monthlyRentalIncome / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Active lease values</p>
          </div>

          {/* Net Cash Flow */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Net Cash Flow</p>
            <h3 className={`text-2xl font-serif font-bold ${netCashFlow < 0 ? "text-danger" : "text-foreground"}`}>
              ${(netCashFlow / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">This month cash basis</p>
          </div>

          {/* Occupancy */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Occupancy</p>
            <h3 className="text-2xl font-serif font-bold text-foreground">{occupancyRate}%</h3>
            <p className="text-[11px] text-muted font-sans mt-1">
              {occupiedUnits} of {totalUnits} units active
            </p>
          </div>

          {/* Attention Needed */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest font-sans mb-1">Decisions Needed</p>
            <h3 className={`text-2xl font-serif font-bold ${decisionsCount > 0 ? "text-danger" : "text-foreground"}`}>
              {decisionsCount}
            </h3>
            <p className="text-[11px] text-muted font-sans mt-1">Requires user attention</p>
          </div>
        </div>

        {/* Central 9-Month Cash-Flow Visualization */}
        <div className="bg-white border border-border p-6 rounded-md shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
            <div>
              <h2 className="text-lg font-serif font-bold text-foreground">Operational Cash Flow</h2>
              <p className="text-xs text-muted font-sans mt-0.5">
                9-month timeline • Actual rent, projected rent, and operating expenses
              </p>
            </div>
            {/* Chart Legend */}
            <div className="flex items-center gap-4 text-xs font-sans">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 bg-foreground rounded-sm" />
                <span>Rents Collected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 border border-foreground border-dashed rounded-sm bg-transparent" />
                <span>Projected Rents</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 bg-secondary rounded-sm" />
                <span>Expenses</span>
              </div>
            </div>
          </div>

          {/* Premium CSS Bar Chart */}
          <div className="h-72 w-full flex items-end justify-between pt-4 border-b border-neutral-200 px-4 font-sans text-xs">
            {trends.map((t) => {
              const colHeight = `${(t.collected / maxChartVal) * 100}%`;
              const projHeight = `${(t.projected / maxChartVal) * 100}%`;
              const expHeight = `${(t.expenses / maxChartVal) * 100}%`;

              return (
                <div key={t.month} className="flex-1 flex flex-col items-center max-w-[80px] h-full group">
                  <div className="flex-1 w-full flex items-end justify-center gap-1.5 relative h-full">
                    {/* Tooltip Overlay */}
                    <div className="absolute hidden group-hover:flex flex-col bg-neutral-900 text-white text-[10px] p-2.5 rounded-md -top-12 z-10 shadow-lg pointer-events-none min-w-[120px] font-sans">
                      <p className="font-bold border-b border-neutral-700 pb-1 mb-1">{t.month}</p>
                      <p>Collected: ${t.collected.toLocaleString()}</p>
                      <p>Projected: ${t.projected.toLocaleString()}</p>
                      <p>Expenses: ${t.expenses.toLocaleString()}</p>
                    </div>

                    {/* Expenses Bar */}
                    <div
                      style={{ height: expHeight }}
                      className="w-4 bg-secondary hover:brightness-90 transition-all rounded-t-sm"
                    />

                    {/* Rent Collected Bar */}
                    <div
                      style={{ height: colHeight }}
                      className="w-4 bg-foreground hover:brightness-75 transition-all rounded-t-sm"
                    />

                    {/* Projected Rent Bar */}
                    <div
                      style={{ height: projHeight }}
                      className="w-4 border border-dashed border-foreground bg-transparent hover:bg-neutral-100 transition-all rounded-t-sm"
                    />
                  </div>
                  <span className="text-[10px] text-muted mt-2 font-medium">{t.month}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted font-sans mt-3 text-right">
            *Projections assume active lease values. Operational view — not accounting.
          </p>
        </div>

        {/* Dashboard Split: Briefing & Decisions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Portfolio Briefing Panel */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <h2 className="text-lg font-serif font-bold text-foreground mb-4">Portfolio Briefing</h2>
            
            <div className="space-y-4">
              {/* Leases Brief */}
              {expiringLeases.length > 0 ? (
                expiringLeases.map((l) => (
                  <div key={l.id} className="p-4 bg-background border border-border rounded-md flex items-start gap-3">
                    <FileText className="h-5 w-5 text-neutral-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold font-sans">Lease Expiry Horizon</h4>
                      <p className="text-xs text-muted font-sans mt-1">
                        The agreement with <strong>{l.tenantName}</strong> at {l.propertyNickname} Unit {l.unitNumber} expires in <strong>{l.daysUntilExpiry} days</strong>.
                      </p>
                      <Link
                        href={`/leases`}
                        className="text-xs text-foreground font-semibold inline-flex items-center gap-1 mt-2 hover:underline font-sans"
                      >
                        Evaluate Renewal Offer <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-background border border-border rounded-md text-sm text-muted font-sans text-center">
                  All active lease timelines are outside the 90-day expiry horizon.
                </div>
              )}

              {/* Expense spikes Brief */}
              {recentSpikes.length > 0 ? (
                recentSpikes.map((e) => (
                  <div key={e.id} className="p-4 bg-background border border-border rounded-md flex items-start gap-3">
                    <TrendingUp className="h-5 w-5 text-neutral-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold font-sans">Operating Expense Spikes</h4>
                      <p className="text-xs text-muted font-sans mt-1">
                        A large expense of <strong>${(e.amount / 100).toLocaleString()}</strong> was recorded for <strong>{e.category.replace(/_/g, ' ')}</strong> at {e.propertyNickname}.
                      </p>
                      <Link
                        href={`/expenses`}
                        className="text-xs text-foreground font-semibold inline-flex items-center gap-1 mt-2 hover:underline font-sans"
                      >
                        Inspect Operating Expenses <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : null}
            </div>
          </div>

          {/* Decisions Needed Panel */}
          <div className="bg-white border border-border p-6 rounded-md shadow-sm">
            <h2 className="text-lg font-serif font-bold text-foreground mb-4">Decisions Needed</h2>
            
            <div className="space-y-3">
              {/* Late Payments */}
              {overdueRents.length > 0 ? (
                overdueRents.map((p) => (
                  <div key={p.id} className="p-4 border border-danger/30 bg-danger/5 rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-danger" />
                      <div>
                        <p className="text-sm font-semibold font-sans text-foreground">Rent Overdue</p>
                        <p className="text-xs text-muted font-sans">
                          {p.tenantName} • Unit {p.unitNumber} ({p.propertyNickname})
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-danger font-serif">
                        +${((p.amountDue - p.amountReceived) / 100).toLocaleString()}
                      </p>
                      <Link
                        href="/cashflow"
                        className="text-[11px] text-foreground font-semibold hover:underline font-sans"
                      >
                        Ledger
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-background border border-border rounded-md text-sm text-muted font-sans text-center">
                  No overdue balances or late rent reports active.
                </div>
              )}

              {/* Vacancy Exposure */}
              {vacantUnits.length > 0 ? (
                vacantUnits.map((u) => {
                  const prop = properties.find((p) => p.units?.some((unit) => unit.id === u.id));
                  return (
                    <div key={u.id} className="p-4 border border-border bg-background rounded-md flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-neutral-500" />
                        <div>
                          <p className="text-sm font-semibold font-sans text-foreground">Vacancy Exposure</p>
                          <p className="text-xs text-muted font-sans">
                            Unit {u.unitNumber} • {prop?.nickname || "Portfolio"}
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/properties"
                        className="text-xs text-foreground font-semibold hover:underline font-sans"
                      >
                        List Unit
                      </Link>
                    </div>
                  );
                })
              ) : null}
            </div>
          </div>
        </div>

        {/* Supporting Portfolio and Expense Insights */}
        <div className="bg-white border border-border p-6 rounded-md shadow-sm mt-8">
          <h2 className="text-lg font-serif font-bold text-foreground mb-4">Supporting Portfolio & Expense Insights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            {/* Asset Composition */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider font-sans">Asset Composition</h4>
              <div className="divide-y divide-border">
                {Object.entries(
                  properties.reduce((acc: Record<string, number>, p) => {
                    const typeFormatted = p.propertyType.replace(/_/g, " ");
                    acc[typeFormatted] = (acc[typeFormatted] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([type, count]) => (
                  <div key={type} className="flex justify-between py-2 text-xs font-sans">
                    <span className="capitalize text-muted">{type}</span>
                    <span className="font-semibold text-foreground">{count as number} {count === 1 ? "asset" : "assets"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider font-sans">Current Month Expense Allocation</h4>
              <div className="divide-y divide-border">
                {Object.entries(
                  expenses
                    .filter((e) => {
                      const d = new Date(e.date);
                      return d >= startOfThisMonth && d <= endOfThisMonth;
                    })
                    .reduce((acc: Record<string, number>, e) => {
                      const catFormatted = e.category.replace(/_/g, " ");
                      acc[catFormatted] = (acc[catFormatted] || 0) + e.amount;
                      return acc;
                    }, {})
                ).map(([category, amount]) => (
                  <div key={category} className="flex justify-between py-2 text-xs font-sans">
                    <span className="capitalize text-muted">{category}</span>
                    <span className="font-semibold text-foreground">${(amount as number / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {expenses.filter(e => {
                  const d = new Date(e.date);
                  return d >= startOfThisMonth && d <= endOfThisMonth;
                }).length === 0 && (
                  <p className="text-xs text-muted py-2 font-sans italic">No expenses recorded for this reporting period.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Quick Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white border border-border p-8 rounded-md max-w-md w-full shadow-lg">
            <h3 className="text-lg font-serif font-bold mb-4">Quick Add Operating Expense</h3>
            <form onSubmit={handleCreateExpense} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Property
                </label>
                <select
                  required
                  value={expenseForm.propertyId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, propertyId: e.target.value })}
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
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                >
                  <option value="repairs_and_maintenance">Repairs & Maintenance</option>
                  <option value="utilities">Utilities</option>
                  <option value="insurance">Insurance</option>
                  <option value="taxes">Taxes</option>
                  <option value="mortgage">Mortgage</option>
                  <option value="management">Management Fee</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="supplies">Supplies</option>
                  <option value="capital_improvement">Capital Improvement</option>
                  <option value="other">Other</option>
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
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    placeholder="250.00"
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
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="w-full border border-border p-2 rounded-md outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Notes
                </label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  placeholder="Apex plumbing service call..."
                  className="w-full border border-border p-2 rounded-md outline-none focus:border-primary h-20 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 border border-border rounded-md hover:bg-neutral-50 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-neutral-800 text-white rounded-md text-xs font-semibold shadow-sm"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
