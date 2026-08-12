"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Play, RefreshCw, BarChart2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ImportRun {
  id: string;
  fileName: string;
  importType: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  failedRows: number;
  errorSummary: string | null;
  createdAt: string;
}

export default function ImportPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [importType, setImportType] = useState<"properties" | "units" | "tenants" | "leases" | "payments" | "expenses">("properties");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Default expected fields per import type
  const expectedFieldsMap: Record<string, string[]> = {
    properties: ["address", "nickname", "propertyType", "ownershipPercentage", "acquisitionDate", "estimatedValue", "notes"],
    units: ["propertyNickname", "unitNumber", "monthlyRent", "sizeSqFt", "status"],
    tenants: ["name", "email", "phone", "notes"],
    leases: ["propertyNickname", "unitNumber", "tenantEmail", "startDate", "endDate", "monthlyRent", "securityDeposit", "status"],
    payments: ["tenantEmail", "amount", "receivedDate", "method", "memo"],
    expenses: ["propertyNickname", "amount", "date", "category", "notes", "vendorName", "isHistoricalSummary"],
  };

  const fetchWithAuth = async (path: string, options: RequestInit = {}) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  };

  // Queries
  const { data: defaultSource } = useQuery({
    queryKey: ["import-source-default", token],
    queryFn: () => fetchWithAuth("/imports/sources/default"),
    enabled: !!token,
  });

  const { data: runs = [], refetch: refetchRuns } = useQuery<ImportRun[]>({
    queryKey: ["import-runs", token],
    queryFn: () => fetchWithAuth("/imports/runs"),
    enabled: !!token,
    refetchInterval: 3000, // Poll progress every 3s
  });

  // Mutations
  const previewMutation = useMutation({
    mutationFn: async (csv: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/imports/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to parse CSV preview");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setHeaders(data.headers);
      setPreviewRows(data.previewRows);
      // Auto-suggest mapping based on matching strings
      const initialMap: Record<string, string> = {};
      const expected = expectedFieldsMap[importType] || [];
      data.headers.forEach((h: string) => {
        const match = expected.find(f => f.toLowerCase() === h.toLowerCase().trim().replace(/[\s_]+/g, ""));
        if (match) {
          initialMap[h] = match;
        } else {
          initialMap[h] = "";
        }
      });
      setColumnMapping(initialMap);
    },
    onError: (err: any) => setError(err.message),
  });

  const triggerImportMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/imports/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to trigger import run");
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccessMsg("CSV Onboarding import successfully scheduled in background!");
      queryClient.invalidateQueries({ queryKey: ["import-runs", token] });
      // Reset staging
      setCsvContent("");
      setFileName("");
      setHeaders([]);
      setPreviewRows([]);
    },
    onError: (err: any) => setError(err.message),
  });

  // Handles raw CSV loading
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      previewMutation.mutate(text);
    };
    reader.readAsText(file);
  };

  const handleTriggerImport = () => {
    if (!csvContent || !defaultSource) return;
    setError(null);
    setSuccessMsg(null);

    // Verify all columns mapped or alert
    triggerImportMutation.mutate({
      sourceId: defaultSource.id,
      fileName,
      importType,
      csv: csvContent,
      columnMapping,
    });
  };

  return (
    <div className="min-h-screen bg-[#0D0E12] text-slate-100 flex">
      {/* Main Panel */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0F1015]">
        <Header title="Imports Dashboard" />

        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
          
          {/* Main card upload grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* CSV Upload Dropzone */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-8 backdrop-blur-md shadow-xl flex flex-col justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white mb-2">Upload Historical Ledger</h2>
                  <p className="text-slate-400 text-sm mb-6">Select the asset layout, map custom headers, and stream real estate records safely.</p>
                  
                  {/* Select Import Type */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                    {Object.keys(expectedFieldsMap).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setImportType(type as any);
                          setHeaders([]);
                          setPreviewRows([]);
                        }}
                        className={`px-4 py-3 rounded-xl border text-xs font-semibold capitalize transition-all duration-300 ${
                          importType === type
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-400 shadow-indigo-900/30"
                            : "bg-[#181A25] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  {/* Dropzone area */}
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-slate-700 bg-[#171923] rounded-2xl p-10 cursor-pointer group transition-all duration-300">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Upload className="w-10 h-10 text-slate-500 group-hover:text-indigo-400 mb-4 transition-all duration-300" />
                    <span className="text-sm font-semibold text-slate-300 mb-1">
                      {fileName ? fileName : "Choose CSV File"}
                    </span>
                    <span className="text-xs text-slate-500">Maximum size 10MB</span>
                  </label>
                </div>

                {error && (
                  <div className="mt-4 p-4 bg-red-950/30 border border-red-900 text-red-400 rounded-xl text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="mt-4 p-4 bg-emerald-950/30 border border-emerald-900 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}
              </div>

              {/* CSV Columns mapping & preview */}
              {headers.length > 0 && (
                <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-8 backdrop-blur-md shadow-xl space-y-6">
                  <h3 className="text-lg font-bold text-white">Interactive Column Mapper</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {headers.map((header) => (
                      <div key={header} className="flex flex-col bg-[#1A1C28] border border-slate-800 rounded-xl p-4">
                        <span className="text-xs text-slate-400 font-medium mb-2">CSV Column: <strong className="text-slate-200">{header}</strong></span>
                        <select
                          value={columnMapping[header] || ""}
                          onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                          className="bg-[#12131A] border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Ignored Column --</option>
                          {expectedFieldsMap[importType]?.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={handleTriggerImport}
                      disabled={triggerImportMutation.isPending}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/30 transition-all duration-300 disabled:opacity-50"
                    >
                      <Play className="w-4 h-4" />
                      {triggerImportMutation.isPending ? "Starting Import..." : "Initiate Import Run"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Run Progress Logs Side Panel */}
            <div className="bg-[#151720]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6 h-fit">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-400" />
                  Execution Center
                </h3>
                <button
                  onClick={() => refetchRuns()}
                  className="p-2 hover:bg-[#1C1F2E] rounded-lg transition-all"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {runs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">No import execution records found.</p>
                ) : (
                  runs.map((run) => (
                    <div key={run.id} className="bg-[#181A25] border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-white truncate max-w-[150px]">{run.fileName}</p>
                          <p className="text-[10px] text-slate-500 capitalize">{run.importType} • {new Date(run.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${
                          run.status === "completed" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                          run.status === "processing" ? "bg-indigo-950/40 text-indigo-400 border border-indigo-900 animate-pulse" :
                          run.status === "failed" ? "bg-red-950/40 text-red-400 border border-red-900" :
                          "bg-amber-950/40 text-amber-400 border border-amber-900"
                        }`}>
                          {run.status}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>Rows: {run.processedRows} / {run.totalRows}</span>
                          {run.failedRows > 0 && <span className="text-red-400">Errors: {run.failedRows}</span>}
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              run.status === "failed" ? "bg-red-500" : "bg-indigo-500"
                            }`}
                            style={{ width: `${(run.processedRows / (run.totalRows || 1)) * 100}%` }}
                          />
                        </div>
                      </div>

                      {run.errorSummary && (
                        <div className="text-[9px] bg-red-950/20 text-red-400 p-2 rounded border border-red-950/50 max-h-[80px] overflow-y-auto whitespace-pre-wrap">
                          {run.errorSummary}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
