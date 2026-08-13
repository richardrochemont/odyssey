"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { formatCents, formatDate } from "@/lib/format";
import {
  Search,
  Building2,
  Users,
  FileText,
  Wrench,
  DollarSign,
  Receipt,
  FolderOpen,
  Loader2,
} from "lucide-react";

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "Property" | "Unit" | "Tenant" | "Lease" | "Vendor" | "Payment" | "Expense" | "Document";
  url: string;
}

export default function SearchPalette({ isOpen, onClose }: SearchPaletteProps) {
  const router = useRouter();
  const { token } = useAuth();
  
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    properties: any[];
    tenants: any[];
    leases: any[];
    vendors: any[];
    payments: any[];
    expenses: any[];
  }>({
    properties: [],
    tenants: [],
    leases: [],
    vendors: [],
    payments: [],
    expenses: [],
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape, handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch all searchable datasets once when palette opens
  useEffect(() => {
    if (!isOpen || !token) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const headers = { Authorization: `Bearer ${token}` };

        const [propsRes, tenantsRes, leasesRes, vendorsRes, paymentsRes, expensesRes] = await Promise.all([
          fetch(`${apiUrl}/properties`, { headers }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${apiUrl}/leases/tenants`, { headers }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${apiUrl}/leases`, { headers }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${apiUrl}/maintenance/vendors`, { headers }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${apiUrl}/payments`, { headers }).then((r) => (r.ok ? r.json() : [])),
          fetch(`${apiUrl}/financials/records`, { headers }).then((r) => (r.ok ? r.json() : [])),
        ]);

        setData({
          properties: Array.isArray(propsRes) ? propsRes : [],
          tenants: Array.isArray(tenantsRes) ? tenantsRes : [],
          leases: Array.isArray(leasesRes) ? leasesRes : [],
          vendors: Array.isArray(vendorsRes) ? vendorsRes : [],
          payments: Array.isArray(paymentsRes) ? paymentsRes : [],
          expenses: Array.isArray(expensesRes) ? expensesRes : [],
        });
      } catch (err) {
        console.error("Failed to load search data", err);
      } finally {
        setLoading(false);
        setActiveIndex(0);
      }
    };

    fetchData();
  }, [isOpen, token]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Search filter implementation
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const list: SearchResult[] = [];

    // Properties
    data.properties.forEach((p: any) => {
      if (p.nickname?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)) {
        list.push({
          id: p.id,
          title: p.nickname,
          subtitle: p.address,
          type: "Property",
          url: `/properties/${p.id}`,
        });
      }
      
      // Units inside Property
      if (p.units && Array.isArray(p.units)) {
        p.units.forEach((u: any) => {
          if (u.unitNumber?.toLowerCase().includes(q)) {
            list.push({
              id: u.id,
              title: `Unit ${u.unitNumber}`,
              subtitle: `${p.nickname} • Monthly rent ${formatCents(u.monthlyRent)}`,
              type: "Unit",
              url: `/properties/${p.id}`,
            });
          }
        });
      }
    });

    // Tenants
    data.tenants.forEach((t: any) => {
      if (
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q)
      ) {
        list.push({
          id: t.id,
          title: t.name,
          subtitle: `${t.email} • ${t.phone}`,
          type: "Tenant",
          url: `/leases`,
        });
      }
    });

    // Leases
    data.leases.forEach((l: any) => {
      if (
        l.tenantName?.toLowerCase().includes(q) ||
        l.propertyNickname?.toLowerCase().includes(q) ||
        l.unitNumber?.toLowerCase().includes(q) ||
        l.status?.toLowerCase().includes(q)
      ) {
        list.push({
          id: l.id,
          title: `${l.tenantName} - Unit ${l.unitNumber}`,
          subtitle: `${l.propertyNickname} • ${l.status.toUpperCase()} • ${formatCents(l.monthlyRent)}/mo`,
          type: "Lease",
          url: `/leases/${l.id}`,
        });
      }
    });

    // Vendors
    data.vendors.forEach((v: any) => {
      if (
        v.name?.toLowerCase().includes(q) ||
        v.specialty?.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q)
      ) {
        list.push({
          id: v.id,
          title: v.name,
          subtitle: `${v.specialty.replace(/_/g, " ")} • ${v.email || "No email"}`,
          type: "Vendor",
          url: `/maintenance`,
        });
      }
    });

    // Payments
    data.payments.forEach((p: any) => {
      const memoLower = p.memo ? p.memo.toLowerCase() : "";
      if (
        p.tenantName?.toLowerCase().includes(q) ||
        p.propertyNickname?.toLowerCase().includes(q) ||
        p.status?.toLowerCase().includes(q) ||
        memoLower.includes(q)
      ) {
        list.push({
          id: p.id,
          title: `Payment: ${p.tenantName}`,
          subtitle: `${p.propertyNickname} Unit ${p.unitNumber} • ${p.status.toUpperCase()} • ${formatCents(p.amountDue)}`,
          type: "Payment",
          url: `/cashflow`,
        });
      }
    });

    // Expenses
    data.expenses.forEach((e: any) => {
      const notesLower = e.notes ? e.notes.toLowerCase() : "";
      const catLower = e.category ? e.category.toLowerCase() : "";
      if (
        e.propertyNickname?.toLowerCase().includes(q) ||
        catLower.includes(q) ||
        notesLower.includes(q)
      ) {
        list.push({
          id: e.id,
          title: `Expense: ${e.category.replace(/_/g, " ")}`,
          subtitle: `${e.propertyNickname} • ${formatCents(e.amount)} • ${formatDate(e.date)}`,
          type: "Expense",
          url: `/expenses`,
        });
      }
    });

    return list;
  }, [query, data]);

  // Handle arrow and enter key down on input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const activeResult = results[activeIndex];
      if (activeResult) {
        router.push(activeResult.url);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const typeIcons: Record<SearchResult["type"], any> = {
    Property: Building2,
    Unit: Building2,
    Tenant: Users,
    Lease: FileText,
    Vendor: Wrench,
    Payment: DollarSign,
    Expense: Receipt,
    Document: FolderOpen,
  };

  const groupResults = (resList: SearchResult[]) => {
    const groups: Record<string, SearchResult[]> = {};
    resList.forEach((r) => {
      if (!groups[r.type]) {
        groups[r.type] = [];
      }
      groups[r.type].push(r);
    });
    return groups;
  };

  const grouped = groupResults(results);
  const typesOrder: SearchResult["type"][] = [
    "Property",
    "Unit",
    "Tenant",
    "Lease",
    "Vendor",
    "Payment",
    "Expense",
    "Document",
  ];

  // Flat list layout lookup for active index targeting
  const flatGroupedList: SearchResult[] = [];
  typesOrder.forEach((t) => {
    if (grouped[t]) {
      flatGroupedList.push(...grouped[t]);
    }
  });

  const getResultIndexInFlatList = (resultId: string, resultType: string) => {
    return flatGroupedList.findIndex((item) => item.id === resultId && item.type === resultType);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-foreground/40 backdrop-blur-sm"
      onClick={onClose}
      data-testid="search-palette"
    >
      <div
        className="w-full max-w-2xl bg-white border border-border rounded-lg shadow-2xl overflow-hidden max-h-[60vh] flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 border-b border-border bg-white h-14">
          <Search className="h-5 w-5 text-muted" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder-muted font-sans"
            placeholder="Search properties, tenants, leases, payments..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            data-testid="search-input"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          ) : (
            <kbd className="text-[10px] bg-neutral-100 text-muted border border-border px-1.5 py-0.5 rounded font-mono">
              ESC
            </kbd>
          )}
        </div>

        {/* Search Results Area */}
        <div className="flex-1 overflow-y-auto p-2" data-testid="search-results-container">
          {loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-xs">Accessing Odyssey ledger...</p>
            </div>
          )}

          {!loading && !query.trim() && (
            <div className="py-8 text-center text-muted">
              <p className="text-xs font-medium">Quick search command cockpit</p>
              <p className="text-[11px] mt-1">Type to search across properties, units, tenants, vendors, payments, and expenses.</p>
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className="py-8 text-center text-muted" data-testid="no-results-state">
              <p className="text-xs font-semibold">No records found</p>
              <p className="text-[11px] mt-1">No matching active database objects found in your organization workspace.</p>
            </div>
          )}

          {results.length > 0 &&
            typesOrder.map((type) => {
              const typeResults = grouped[type];
              if (!typeResults) return null;

              return (
                <div key={type} className="mb-3 last:mb-0">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted px-3 py-1 font-sans">
                    {type}s
                  </h4>
                  <div className="space-y-0.5 mt-1">
                    {typeResults.map((item) => {
                      const Icon = typeIcons[item.type];
                      const flatIndex = getResultIndexInFlatList(item.id, item.type);
                      const isHighlighted = flatIndex === activeIndex;

                      return (
                        <div
                          key={`${item.type}-${item.id}`}
                          onClick={() => {
                            router.push(item.url);
                            onClose();
                          }}
                          className={`flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                            isHighlighted
                              ? "bg-neutral-100 text-foreground"
                              : "text-foreground hover:bg-neutral-50"
                          }`}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          data-testid={`search-item-${item.type}`}
                          data-highlighted={isHighlighted ? "true" : "false"}
                        >
                          <div className={`p-1.5 rounded bg-neutral-100 text-neutral-600 ${isHighlighted ? "bg-white" : ""}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold font-sans truncate">{item.title}</p>
                            <p className="text-[10px] text-muted truncate mt-0.5">{item.subtitle}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
