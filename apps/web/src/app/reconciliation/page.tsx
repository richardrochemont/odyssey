"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { ShieldCheck, AlertTriangle, Calendar, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

interface SummaryData {
  status: "no_data" | "summary_only" | "partial_detail" | "detail_complete" | "needs_review";
  scheduledRent: number | null;
  recordedRent: number | null;
  outstandingRent: number | null;
  totalIncome: number | null;
  totalExpenses: number | null;
  netOperatingIncome: number | null;
  notes: string;
}

interface PropertyOption {
  id: string;
  nickname: string;
  externalKey: string | null;
}

export default function ReconciliationPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-05");
  const [attestReason, setAttestReason] = useState<string>("");
  const [showAttestModal, setShowAttestModal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch reconciliation data");
    return res.json();
  };

  // Queries
  const { data: propertiesList = [] } = useQuery<PropertyOption[]>({
    queryKey: ["properties-list", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  const { data: summary, isLoading, refetch } = useQuery<SummaryData>({
    queryKey: ["reconciliation-summary", selectedPropertyId, selectedMonth, token],
    queryFn: () => fetchWithAuth(`/financials/summary?${selectedPropertyId ? `propertyId=${selectedPropertyId}&` : ""}startDate=${selectedMonth}-01&endDate=${selectedMonth}-31`),
    enabled: !!token,
  });

  // Owner Attestation Mutation
  const attestMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/coverage/attest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to attest coverage");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowAttestModal(false);
      setAttestReason("");
      queryClient.invalidateQueries({ queryKey: ["reconciliation-summary"] });
    },
    onError: (err: any) => setErrorMsg(err.message),
  });

  const handleAttest = (targetState: "detail_complete" | "needs_review") => {
    if (!selectedPropertyId) {
      setErrorMsg("Please select a specific property to attest coverage.");
      return;
    }
    attestMutation.mutate({
      propertyId: selectedPropertyId,
      month: selectedMonth,
      targetState,
      reason: attestReason,
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "detail_complete":
        return <span className="px-3 py-1 bg-emerald-950/60 border border-emerald-800 text-emerald-400 rounded-lg text-xs font-semibold flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Detail Complete</span>;
      case "partial_detail":
        return <span className="px-3 py-1 bg-amber-950/60 border border-amber-800 text-amber-400 rounded-lg text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Partial Detail (Summary Baseline)</span>;
      case "summary_only":
        return <span className="px-3 py-1 bg-indigo-950/60 border border-indigo-800 text-indigo-400 rounded-lg text-xs font-semibold flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Summary Only</span>;
      case "needs_review":
        return <span className="px-3 py-1 bg-red-950/60 border border-red-800 text-red-400 rounded-lg text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Needs Owner Review</span>;
      case "no_data":
      default:
        return <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-xs font-semibold">No Data Available</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0E12] text-slate-100 flex">
      <main className="flex-1 flex flex-col min-w-0 bg-[#0F1015]">
        <Header />

        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Financial Reconciliation & Coverage</h1>
              <p className="text-slate-400 text-sm">Property-month coverage state machine, double-counting audit, and owner attestations.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => refetch()}
                className="p-2.5 bg-[#181A25] border border-slate-800 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {user?.role === "owner" && selectedPropertyId && summary?.status !== "no_data" && (
                <button
                  onClick={() => setShowAttestModal(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/30 flex items-center gap-2 transition-all"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Attest Coverage</span>
                </button>
              )}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-4 backdrop-blur-md shadow-xl flex flex-wrap items-center gap-4">
            <div className="flex flex-col">
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">Select Property</label>
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="bg-[#12131A] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 min-w-[200px]"
              >
                <option value="">-- All Properties Portfolio --</option>
                {propertiesList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname} {p.externalKey ? `(${p.externalKey})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">Select Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-[#12131A] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Coverage Status:</span>
              {getStatusBadge(summary?.status)}
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-950/30 border border-red-900 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : summary?.status === "no_data" ? (
            <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-16 text-center space-y-4 shadow-xl">
              <div className="w-12 h-12 bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">No financial data available for this month.</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">No historical monthly summary or transaction-level payments/expenses have been recorded for the selected property and month.</p>
              {user?.role === "owner" && (
                <Link href="/import" className="inline-block text-xs text-indigo-400 hover:text-indigo-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-sm">
                  Import data to reconcile this month
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              
              {summary?.status === "partial_detail" && (
                <div className="p-4 bg-amber-950/30 border border-amber-900 text-amber-300 rounded-2xl text-xs flex items-start gap-3 shadow-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Data Quality Warning: Partial Transactions Detected</p>
                    <p className="text-slate-400 mt-1">Both historical monthly summary and individual transaction records exist for this month. The summary baseline is currently retained for calculation safety until an Owner confirms transaction completeness.</p>
                  </div>
                </div>
              )}

              {/* Financial Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="text-slate-400 text-xs font-semibold">Scheduled Rent</div>
                  <div>
                    <div className="text-3xl font-extrabold text-white">
                      {formatCurrency(summary?.scheduledRent)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Gross scheduled obligation</div>
                  </div>
                </div>

                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="text-slate-400 text-xs font-semibold">Collected Rent</div>
                  <div>
                    <div className="text-3xl font-extrabold text-indigo-400">
                      {formatCurrency(summary?.recordedRent)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Actual received cash</div>
                  </div>
                </div>

                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="text-slate-400 text-xs font-semibold">Operating Expenses</div>
                  <div>
                    <div className="text-3xl font-extrabold text-amber-400">
                      {formatCurrency(summary?.totalExpenses)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Approved operating expenses</div>
                  </div>
                </div>

              </div>

              {/* Net Operating Income Panel */}
              <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex justify-between items-center">
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Net Operating Income</span>
                  <div className="text-2xl font-bold text-white mt-1">
                    {formatCurrency(summary?.netOperatingIncome)}
                  </div>
                </div>
                <div className="text-xs text-slate-500 italic max-w-xs text-right">
                  {summary?.notes}
                </div>
              </div>

            </div>
          )}

          {/* Attestation Modal */}
          {showAttestModal && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-[#151720] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-6 shadow-2xl">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  Owner Coverage Attestation
                </h3>
                <p className="text-xs text-slate-400">Attesting <strong>detail_complete</strong> certifies that transaction-level records for {selectedMonth} are accurate and should override the summary baseline.</p>

                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-medium">Attestation Audit Reason (Optional)</label>
                  <textarea
                    value={attestReason}
                    onChange={(e) => setAttestReason(e.target.value)}
                    placeholder="Verified against bank statement reconciliation..."
                    className="w-full bg-[#12131A] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 h-24"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    onClick={() => setShowAttestModal(false)}
                    className="px-4 py-2 bg-[#1C1F2E] text-slate-400 hover:text-white text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAttest("needs_review")}
                    className="px-4 py-2 bg-red-950/60 border border-red-800 text-red-400 text-xs font-semibold rounded-xl hover:bg-red-900/60"
                  >
                    Mark Needs Review
                  </button>
                  <button
                    onClick={() => handleAttest("detail_complete")}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-900/30"
                  >
                    Confirm Detail Complete
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
