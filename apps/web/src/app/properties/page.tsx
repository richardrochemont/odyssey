"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { Building2, Plus, Calendar, MapPin, Percent, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Unit {
  id: string;
  unitNumber: string;
  status: string;
}

interface Property {
  id: string;
  nickname: string;
  address: string;
  propertyType: string;
  ownershipPercentage: number;
  acquisitionDate: string;
  notes: string | null;
  units: Unit[];
}

export default function PropertiesPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "add-property") {
        setShowModal(true);
        // Clear param
        const url = new URL(window.location.href);
        url.searchParams.delete("action");
        router.replace(url.pathname);
      }
    }
  }, [router]);

  // Form states
  const [nickname, setNickname] = useState("");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("apartment_building");
  const [ownershipPercentage, setOwnershipPercentage] = useState(100);
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [valuationDate, setValuationDate] = useState("");
  const [valuationSource, setValuationSource] = useState("");
  const [valuationNotes, setValuationNotes] = useState("");

  const fetchProperties = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}/properties`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load properties");
    return res.json();
  };

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: fetchProperties,
    enabled: !!token,
  });

  const createPropertyMutation = useMutation({
    mutationFn: async (newProp: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newProp),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create property");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties", token] });
      setShowModal(false);
      // Reset form
      setNickname("");
      setAddress("");
      setPropertyType("apartment_building");
      setOwnershipPercentage(100);
      setAcquisitionDate("");
      setNotes("");
      setEstimatedValue("");
      setValuationDate("");
      setValuationSource("");
      setValuationNotes("");
    },
    onError: (err: any) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createPropertyMutation.mutate({
      nickname,
      address,
      propertyType,
      ownershipPercentage: Number(ownershipPercentage),
      acquisitionDate,
      notes,
      estimatedValue: estimatedValue ? Number(estimatedValue) : 0,
      valuationDate: valuationDate || null,
      valuationSource: valuationSource || null,
      valuationNotes: valuationNotes || null,
    });
  };

  const typeLabels: Record<string, string> = {
    single_family: "Single Family",
    multi_family: "Multi Family",
    condo: "Condominium",
    townhouse: "Townhouse",
    apartment_building: "Apartment Building",
  };

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Properties</h2>
            <p className="text-sm text-muted mt-1">Manage buildings, units, and portfolios ownership.</p>
          </div>
          {user?.role !== "read_only" && user?.role !== "maintenance" && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="h-4.5 w-4.5" /> Add Property
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20 bg-white border border-border rounded-xl">
            <Building2 className="h-12 w-12 text-muted mx-auto mb-3" />
            <h3 className="font-bold text-foreground">No properties yet</h3>
            <p className="text-sm text-muted mt-1">Get started by creating your first property.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((p) => {
              const totalUnits = p.units?.length || 0;
              const occupiedUnits = p.units?.filter((u) => u.status === "occupied" || u.status === "notice_given").length || 0;
              const vacantUnits = p.units?.filter((u) => u.status === "vacant").length || 0;

              return (
                <div key={p.id} className="bg-white border border-border rounded-xl overflow-hidden shadow-sm flex flex-col justify-between">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                          {typeLabels[p.propertyType] || p.propertyType}
                        </span>
                        <h3 className="text-lg font-bold text-foreground mt-2">{p.nickname}</h3>
                      </div>
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>

                    <div className="space-y-2.5 text-xs text-muted mb-6">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">{p.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4 text-primary shrink-0" />
                        <span>Ownership: {p.ownershipPercentage}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary shrink-0" />
                        <span>Acquired: {new Date(p.acquisitionDate).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                      <div>
                        <p className="text-base font-bold text-foreground">{totalUnits}</p>
                        <p className="text-[10px] text-muted uppercase font-semibold">Total Units</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-success">{occupiedUnits}</p>
                        <p className="text-[10px] text-muted uppercase font-semibold">Occupied</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-warning">{vacantUnits}</p>
                        <p className="text-[10px] text-muted uppercase font-semibold">Vacant</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background px-6 py-3 border-t border-border flex items-center justify-between">
                    <span className="text-[10px] text-muted font-mono truncate max-w-[150px]">ID: {p.id.substring(0, 8)}</span>
                    <Link
                      href={`/properties/${p.id}`}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      View Details <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Property Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-lg overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-border bg-background">
                <h3 className="font-bold text-lg text-foreground">Add New Property</h3>
                <p className="text-xs text-muted">Add a new building assets to your portfolio cockpit.</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Nickname</label>
                      <input
                        type="text"
                        required
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. Oakridge Manor"
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Address</label>
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Full Street Address"
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Property Type</label>
                      <select
                        value={propertyType}
                        onChange={(e) => setPropertyType(e.target.value)}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary h-9.5"
                      >
                        <option value="apartment_building">Apartment Building</option>
                        <option value="multi_family">Multi Family</option>
                        <option value="single_family">Single Family</option>
                        <option value="condo">Condo</option>
                        <option value="townhouse">Townhouse</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Ownership %</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        required
                        value={ownershipPercentage}
                        onChange={(e) => setOwnershipPercentage(Number(e.target.value))}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Acquisition Date</label>
                      <input
                        type="date"
                        required
                        value={acquisitionDate}
                        onChange={(e) => setAcquisitionDate(e.target.value)}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2 border-t border-border pt-4 mt-2">
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Property Valuation</h4>
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-foreground uppercase mb-1">Estimated Value ($)</label>
                        <input
                          type="number"
                          min="0"
                          value={estimatedValue}
                          onChange={(e) => setEstimatedValue(e.target.value)}
                          placeholder="e.g. 1200000"
                          className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground uppercase mb-1">Valuation Date</label>
                        <input
                          type="date"
                          value={valuationDate}
                          onChange={(e) => setValuationDate(e.target.value)}
                          className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                        />
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Valuation Source</label>
                      <input
                        type="text"
                        value={valuationSource}
                        onChange={(e) => setValuationSource(e.target.value)}
                        placeholder="e.g. Zillow, Appraisal"
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Valuation Notes</label>
                      <textarea
                        value={valuationNotes}
                        onChange={(e) => setValuationNotes(e.target.value)}
                        placeholder="Optional valuation context..."
                        rows={2}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Notes</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional operational details..."
                        rows={3}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-border bg-background flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-border text-sm font-semibold rounded-lg hover:bg-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createPropertyMutation.isPending}
                    className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-1.5"
                  >
                    {createPropertyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create Property
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
