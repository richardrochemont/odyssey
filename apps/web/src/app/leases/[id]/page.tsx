"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FileText,
  BrainCircuit,
  Sparkles,
  ClipboardCopy
} from "lucide-react";
import Link from "next/link";

interface LeaseDetails {
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
  tenantEmail: string;
  tenantPhone: string;
  unitNumber: string;
  propertyNickname: string;
  daysUntilExpiry: number;
  isExpiringSoon: boolean;
}

interface Payment {
  id: string;
  leaseId: string;
  amountDue: number;
  amountReceived: number;
  dueDate: string;
  paidDate: string | null;
  status: "upcoming" | "paid" | "partial" | "overdue" | "waived";
  paymentMethod: string | null;
  memo: string | null;
}

export default function LeaseDetailsPage({ params }: { params: { id: string } }) {
  const { id: leaseId } = params;
  const { token } = useAuth();
  const [copied, setCopied] = useState(false);
  const [draftOffer, setDraftOffer] = useState("");

  const fetchLease = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}/leases/${leaseId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load lease details");
    return res.json();
  };

  const fetchPayments = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load payments");
    return res.json();
  };

  const { data: lease, isLoading: leaseLoading } = useQuery<LeaseDetails>({
    queryKey: ["lease-details", leaseId, token],
    queryFn: fetchLease,
    enabled: !!token,
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["payments", token],
    queryFn: fetchPayments,
    enabled: !!token,
  });

  const generateAIDraftMutation = useMutation({
    mutationFn: async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/ai/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          context: "lease",
          text: `Draft a renewal offer for tenant ${lease?.tenantName} whose lease ends on ${lease ? new Date(lease.endDate).toLocaleDateString() : ""}. Monthly rent is currently $${lease ? lease.monthlyRent.toLocaleString() : ""}.`,
        }),
      });
      if (!res.ok) throw new Error("Failed to draft AI renewal offer");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.card && data.card.intent === "draft_renewal_offer") {
        setDraftOffer(data.card.data.draftBody);
      } else {
        setDraftOffer(data.message);
      }
    },
  });

  if (leaseLoading || paymentsLoading) {
    return (
      <div className="flex flex-col bg-background min-h-screen">
        <div className="h-[68px] bg-white border-b border-border w-full" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="flex flex-col bg-background min-h-screen text-foreground">
        <div className="h-[68px] bg-white border-b border-border w-full" />
        <div className="flex-1 p-8">
          <p className="text-danger font-semibold font-sans">Lease details could not be found.</p>
        </div>
      </div>
    );
  }

  // Filter payments for this lease
  const leasePayments = payments.filter((p) => p.leaseId === leaseId);
  const outstandingBalance = leasePayments
    .filter((p) => p.status === "overdue" || p.status === "partial")
    .reduce((sum, p) => sum + (p.amountDue - p.amountReceived), 0);

  const totalCollectedInvoices = leasePayments.filter((p) => p.status === "paid").length;
  const totalDueInvoices = leasePayments.filter((p) => p.status !== "upcoming").length;

  // Calculators for renewal review range (+5% to +10%)
  const currentRentDollars = lease.monthlyRent;
  const suggestedMin = Math.round(currentRentDollars * 1.05);
  const suggestedMax = Math.round(currentRentDollars * 1.10);

  const handleCopy = () => {
    navigator.clipboard.writeText(draftOffer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link href="/leases" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary mb-6 font-sans">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Tenants & Leases
        </Link>

        {/* Expiry Alert Banner */}
        {lease.isExpiringSoon && (
          <div className="bg-danger/5 border border-danger/20 text-danger p-4 rounded-md flex items-start gap-3 mb-6 font-sans">
            <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground font-serif">Renewal Review Recommended</p>
              <p className="text-xs mt-1 text-muted">
                Lease agreement ends in <span className="font-semibold text-danger">{lease.daysUntilExpiry} days</span> on {new Date(lease.endDate).toLocaleDateString()}.
              </p>
            </div>
          </div>
        )}

        {/* Title Header */}
        <div className="pb-6 mb-8 border-b border-border flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold bg-neutral-100 border border-border px-3 py-1 rounded-full uppercase tracking-wider font-sans">
              Agreement • {lease.status}
            </span>
            <h2 className="text-3xl font-serif font-bold tracking-tight text-foreground mt-3">
              {lease.tenantName}
            </h2>
            <p className="text-sm text-muted font-sans mt-1">
              {lease.propertyNickname} • Unit {lease.unitNumber}
            </p>
          </div>

          <div className="bg-white border border-border px-6 py-4 rounded-md shadow-sm text-right">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider font-sans">Outstanding Balance</p>
            <p className={`text-xl font-serif font-bold ${outstandingBalance > 0 ? "text-danger" : "text-foreground"}`}>
              ${outstandingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Agreement Parameters & Contact Profile */}
          <div className="lg:col-span-6 space-y-6">
            {/* Details */}
            <div className="bg-white border border-border rounded-md p-6 shadow-sm space-y-5 font-sans text-sm">
              <h3 className="font-bold text-foreground font-serif text-base border-b border-border pb-3">Agreement Parameters</h3>
              
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs leading-relaxed">
                <div>
                  <p className="font-bold text-muted uppercase tracking-wider text-[9px]">Monthly Rent</p>
                  <p className="text-base font-bold text-primary mt-1 font-serif">
                    {currentRentDollars.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-muted uppercase tracking-wider text-[9px]">Security Deposit</p>
                  <p className="text-base font-semibold text-foreground mt-1 font-serif">
                    {lease.securityDeposit.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </div>

                <div>
                  <p className="font-bold text-muted uppercase tracking-wider text-[9px]">Start Date</p>
                  <p className="font-medium text-foreground mt-1">{new Date(lease.startDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="font-bold text-muted uppercase tracking-wider text-[9px]">End Date</p>
                  <p className="font-medium text-foreground mt-1">{new Date(lease.endDate).toLocaleDateString()}</p>
                </div>

                <div>
                  <p className="font-bold text-muted uppercase tracking-wider text-[9px]">Renewal Option</p>
                  <p className="font-semibold text-foreground mt-1">
                    {lease.renewalOption ? "Yes (Contracted)" : "No"}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-muted uppercase tracking-wider text-[9px]">Days Remaining</p>
                  <p className={`font-bold mt-1 ${lease.isExpiringSoon ? "text-danger" : "text-foreground"}`}>
                    {lease.daysUntilExpiry} days
                  </p>
                </div>
              </div>

              {lease.notes && (
                <div className="bg-background border border-border p-4 rounded-md mt-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mb-1.5">
                    <FileText className="h-4 w-4 text-primary" /> Notes & Clauses
                  </div>
                  <p className="text-xs text-muted leading-relaxed italic">{lease.notes}</p>
                </div>
              )}
            </div>

            {/* Tenant details card */}
            <div className="bg-white border border-border rounded-md p-6 shadow-sm space-y-4 font-sans text-sm">
              <h3 className="font-bold text-foreground font-serif text-base border-b border-border pb-3">Contact Profile</h3>
              <div className="text-xs space-y-2 text-muted">
                <p>Primary Occupant: <span className="font-semibold text-foreground">{lease.tenantName}</span></p>
                <p>Email: <span className="font-semibold text-foreground">{lease.tenantEmail}</span></p>
                <p>Phone: <span className="font-semibold text-foreground">{lease.tenantPhone}</span></p>
              </div>
            </div>

            {/* Payment history */}
            <div className="bg-white border border-border rounded-md p-6 shadow-sm space-y-4 font-sans text-sm">
              <h3 className="font-bold text-foreground font-serif text-base border-b border-border pb-3">Payment History</h3>
              {leasePayments.length > 0 ? (
                <div className="space-y-2 text-xs">
                  {leasePayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 bg-background border border-border rounded-md">
                      <div>
                        <p className="font-semibold text-foreground">
                          {new Date(p.dueDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </p>
                        <p className="text-[10px] text-muted">Due date: {new Date(p.dueDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="font-semibold text-foreground">${p.amountReceived.toLocaleString()}</p>
                          <p className="text-[9px] text-muted">Received</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${p.status === "paid" ? "bg-neutral-100 text-foreground" : "bg-danger/10 text-danger"}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">No historical payments logged for this lease agreement.</p>
              )}
            </div>

            {/* Documents */}
            <div className="bg-white border border-border rounded-md p-6 shadow-sm space-y-4 font-sans text-sm">
              <h3 className="font-bold text-foreground font-serif text-base border-b border-border pb-3">Key Documents</h3>
              <div className="flex items-center gap-2 p-3 border border-border bg-background hover:bg-neutral-50 rounded-md transition-colors cursor-pointer">
                <FileText className="h-5 w-5 text-neutral-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">Lease_Agreement_{lease.tenantName.replace(/\s+/g, "_")}.pdf</p>
                  <p className="text-[10px] text-muted">Signed & Encrypted • 2.4 MB</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI renewal proposal & evaluations */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-border rounded-md p-6 shadow-sm space-y-6 font-sans text-sm">
              <div>
                <h3 className="font-bold text-foreground font-serif text-base border-b border-border pb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> Lease Renewal Review
                </h3>
                <p className="text-xs text-muted mt-2">
                  Review lease terms and generate a draft renewal offer. Changes will not be committed until you execute them.
                </p>
              </div>

              {/* Stats Review */}
              <div className="grid grid-cols-2 gap-4 bg-background p-4 border border-border rounded-md text-xs">
                <div>
                  <p className="font-bold text-muted uppercase text-[9px] tracking-wider">Current Rent</p>
                  <p className="text-base font-bold text-primary font-serif mt-0.5">${currentRentDollars.toLocaleString()}</p>
                </div>
                <div>
                  <p className="font-bold text-muted uppercase text-[9px] tracking-wider">Suggested Renewal Range</p>
                  <p className="text-base font-bold text-foreground font-serif mt-0.5">
                    ${suggestedMin.toLocaleString()} - ${suggestedMax.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 border-t border-border pt-3 mt-1 text-[11px] text-muted space-y-1.5 leading-relaxed">
                  <p>
                    • <strong>Occupancy Context</strong>: Portfolio occupancy is currently <strong>87%</strong>. Vacancy exposure is medium.
                  </p>
                  <p>
                    • <strong>Payment Compliance</strong>: Tenant paid <strong>{totalCollectedInvoices} of {totalDueInvoices}</strong> invoices on time.
                  </p>
                </div>
              </div>

              {/* Generate AI Draft Offer */}
              <div className="space-y-4">
                {draftOffer ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">AI Drafted Renewal Offer</span>
                      <button
                        onClick={handleCopy}
                        className="text-xs text-primary font-semibold hover:underline flex items-center gap-1.5"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        {copied ? "Copied!" : "Copy Offer Text"}
                      </button>
                    </div>
                    <textarea
                      value={draftOffer}
                      onChange={(e) => setDraftOffer(e.target.value)}
                      className="w-full border border-border p-3 rounded-md text-xs font-mono h-56 focus:border-primary outline-none resize-none leading-relaxed bg-background"
                    />
                    <p className="text-[10px] text-muted italic">
                      *Verify rent levels and date fields before sending to tenant.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-12 border border-dashed border-border rounded-md bg-background/50">
                    <BrainCircuit className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                    <h4 className="text-xs font-semibold">No Draft Renewal Generated</h4>
                    <p className="text-[11px] text-muted mt-1 max-w-xs mx-auto">
                      Generate a draft proposal letter based on active rent range and occupancy indexes.
                    </p>
                    <button
                      onClick={() => generateAIDraftMutation.mutate()}
                      disabled={generateAIDraftMutation.isPending}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-neutral-800 rounded-md transition-all shadow-sm"
                    >
                      {generateAIDraftMutation.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Drafting Offer...
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="h-3.5 w-3.5" /> Draft Renewal Offer
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
