"use client";

import React from "react";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { DollarSign, ShieldCheck, AlertCircle, TrendingUp, HelpCircle, ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface RecStats {
  scheduledMonthlyRent: number;
  totalRentBilled: number;
  totalRentCollected: number;
  totalReceivedCash: number;
  totalExpenses: number;
  unallocatedCash: number;
  unpaidBalance: number;
}

export default function ReconciliationPage() {
  const { token } = useAuth();

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load reconciliation stats");
    return res.json();
  };

  const { data: stats, isLoading } = useQuery<RecStats>({
    queryKey: ["reconciliation-stats", token],
    queryFn: () => fetchWithAuth("/imports/reconciliation"),
    enabled: !!token,
  });

  return (
    <div className="min-h-screen bg-[#0D0E12] text-slate-100 flex">
      {/* Main Panel */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0F1015]">
        <Header />

        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Financial Reconciliation</h2>
              <p className="text-slate-400 text-sm">Review payments alignment, verify unallocated balances, and audit cash ledger records.</p>
            </div>
            
            <div className="bg-[#151720]/80 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Audit logs matching active</span>
            </div>
          </div>

          {isLoading || !stats ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* Core Ledger Totals Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Total Rent Billed */}
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start text-slate-400 text-xs">
                    <span>Rent Obligations Billed</span>
                    <DollarSign className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-white">${stats.totalRentBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Based on active charges schedule</div>
                  </div>
                </div>

                {/* Total Rent Collected */}
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start text-slate-400 text-xs">
                    <span>Obligation Payments Matched</span>
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-white">${stats.totalRentCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-indigo-400 mt-1 flex items-center gap-1 font-semibold">
                      <span>{stats.totalRentBilled > 0 ? ((stats.totalRentCollected / stats.totalRentBilled) * 100).toFixed(1) : 0}% Collection Rate</span>
                    </div>
                  </div>
                </div>

                {/* Unpaid Balance */}
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start text-slate-400 text-xs">
                    <span>Tenant Outstanding Balance</span>
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-white">${stats.unpaidBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Rent arrears pending allocation</div>
                  </div>
                </div>

                {/* Received Cash (Gross) */}
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col justify-between h-[150px]">
                  <div className="flex justify-between items-start text-slate-400 text-xs">
                    <span>Received Cash (Gross)</span>
                    <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-white">${stats.totalReceivedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Manual, imported, and provider cash</div>
                  </div>
                </div>

              </div>

              {/* Analysis and warning lists */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Ledger Integrity Analysis */}
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6">
                  <h3 className="text-lg font-bold text-white">Ledger Integrity Analysis</h3>
                  
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between py-3 border-b border-slate-800">
                      <span className="text-slate-400">Total Billed rent</span>
                      <span className="font-semibold text-white">${stats.totalRentBilled.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-800">
                      <span className="text-slate-400">Allocated rent payments</span>
                      <span className="font-semibold text-indigo-400">${stats.totalRentCollected.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-800">
                      <span className="text-slate-400">Arrears / Unpaid Charges</span>
                      <span className="font-semibold text-amber-500">${stats.unpaidBalance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-slate-400">Unallocated payments</span>
                      <span className="font-semibold text-slate-300">${stats.unallocatedCash.toFixed(2)}</span>
                    </div>
                  </div>

                  {stats.unallocatedCash > 0 && (
                    <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-xl text-xs text-amber-400 flex items-start gap-2">
                      <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Unallocated Payments Detected</p>
                        <p className="text-slate-400 mt-1">You have received payments that are not currently mapped to an active rent charge. Add unit charges or update the rent schedule to link these funds.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audit Readiness Check */}
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6">
                  <h3 className="text-lg font-bold text-white">Reconciliation Action Checklist</h3>
                  
                  <div className="space-y-4">
                    
                    <div className="flex items-start gap-3 bg-[#181A25] border border-slate-800 rounded-xl p-4">
                      <div className="p-2 bg-indigo-950/40 text-indigo-400 rounded-lg">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Audit Log Trails Enabled</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">All updates to payments, charges, or allocations generate persistent history records.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-[#181A25] border border-slate-800 rounded-xl p-4">
                      <div className="p-2 bg-emerald-950/40 text-emerald-400 rounded-lg">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Historical Summary Safe</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Summary imports are dynamically excluded if transaction details exist to prevent double-counting.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-[#181A25] border border-slate-800 rounded-xl p-4">
                      <div className="p-2 bg-indigo-950/40 text-indigo-400 rounded-lg">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">FIFO Allocation Matrix</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Imported cash payments automatically decrement outstanding unit charge balances in order of due dates.</p>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}
