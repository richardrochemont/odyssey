"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import {
  Building2,
  MapPin,
  Calendar,
  Percent,
  Plus,
  Trash2,
  Edit,
  Loader2,
  ArrowLeft,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";

interface Unit {
  id: string;
  unitNumber: string;
  status: "occupied" | "vacant" | "notice_given" | "offline";
  monthlyRent: number;
  type: string;
  sizeSqFt: number | null;
  buildingId: string | null;
}

interface Building {
  id: string;
  name: string;
  address: string | null;
}

interface PropertyDetails {
  id: string;
  nickname: string;
  address: string;
  propertyType: string;
  ownershipPercentage: number;
  acquisitionDate: string;
  notes: string | null;
  buildings: Building[];
  units: Unit[];
  estimatedValue?: number;
  valuationDate?: string | null;
  valuationSource?: string | null;
  valuationNotes?: string | null;
}

export default function PropertyDetailsPage({ params }: { params: { id: string } }) {
  const { id: propertyId } = params;
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const isReadOnly = user?.role === "read_only";
  const isMaintenance = user?.role === "maintenance";

  // Modal views
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  // Form states
  const [bldName, setBldName] = useState("");
  const [bldAddress, setBldAddress] = useState("");

  const [unitNumber, setUnitNumber] = useState("");
  const [unitStatus, setUnitStatus] = useState<"occupied" | "vacant" | "notice_given" | "offline">("vacant");
  const [unitType, setUnitType] = useState("residential");
  const [unitRent, setUnitRent] = useState("");
  const [unitSize, setUnitSize] = useState("");
  const [unitBuildingId, setUnitBuildingId] = useState("");

  const [error, setError] = useState<string | null>(null);

  // Edit Property Form states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPropertyType, setEditPropertyType] = useState("");
  const [editOwnership, setEditOwnership] = useState(100);
  const [editAcquisitionDate, setEditAcquisitionDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editEstimatedValue, setEditEstimatedValue] = useState("");
  const [editValuationDate, setEditValuationDate] = useState("");
  const [editValuationSource, setEditValuationSource] = useState("");
  const [editValuationNotes, setEditValuationNotes] = useState("");

  const fetchDetails = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}/properties/${propertyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load property details");
    return res.json();
  };

  const { data: details, isLoading } = useQuery<PropertyDetails>({
    queryKey: ["property-details", propertyId, token],
    queryFn: fetchDetails,
    enabled: !!token,
  });

  // Mutators
  const archivePropertyMutation = useMutation({
    mutationFn: async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/${propertyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive property");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties", token] });
      router.push("/properties");
    },
  });

  const createBuildingMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/buildings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create building");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-details", propertyId, token] });
      setShowBuildingModal(false);
      setBldName("");
      setBldAddress("");
    },
    onError: (err: any) => setError(err.message),
  });

  const archiveBuildingMutation = useMutation({
    mutationFn: async (bldId: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/buildings/${bldId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive building");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-details", propertyId, token] });
    },
  });

  const updatePropertyMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/${propertyId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update property details");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-details", propertyId, token] });
      setShowEditModal(false);
    },
    onError: (err: any) => setError(err.message),
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    updatePropertyMutation.mutate({
      nickname: editNickname,
      address: editAddress,
      propertyType: editPropertyType,
      ownershipPercentage: Number(editOwnership),
      acquisitionDate: editAcquisitionDate,
      notes: editNotes,
      estimatedValue: editEstimatedValue ? Number(editEstimatedValue) : 0,
      valuationDate: editValuationDate || null,
      valuationSource: editValuationSource || null,
      valuationNotes: editValuationNotes || null,
    });
  };

  const createUnitMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/units`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create unit");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-details", propertyId, token] });
      setShowUnitModal(false);
      resetUnitForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const updateUnitMutation = useMutation({
    mutationFn: async ({ unitId, payload }: { unitId: string; payload: any }) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/units/${unitId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update unit");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-details", propertyId, token] });
      setEditingUnit(null);
      resetUnitForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const archiveUnitMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/properties/units/${unitId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive unit");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-details", propertyId, token] });
    },
  });

  const resetUnitForm = () => {
    setUnitNumber("");
    setUnitStatus("vacant");
    setUnitType("residential");
    setUnitRent("");
    setUnitSize("");
    setUnitBuildingId("");
  };

  const handleEditUnitClick = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitNumber(unit.unitNumber);
    setUnitStatus(unit.status);
    setUnitType(unit.type);
    setUnitRent(String(unit.monthlyRent));
    setUnitSize(unit.sizeSqFt ? String(unit.sizeSqFt) : "");
    setUnitBuildingId(unit.buildingId || "");
  };

  const unitStatusColors = {
    occupied: "bg-success/15 text-success",
    vacant: "bg-primary/10 text-primary",
    notice_given: "bg-warning/15 text-warning",
    offline: "bg-danger/15 text-danger",
  };

  const unitStatusLabels = {
    occupied: "Occupied",
    vacant: "Vacant",
    notice_given: "Notice Given",
    offline: "Offline / Repairs",
  };

  if (isLoading) {
    return (
      <div className="flex flex-col bg-background min-h-screen">
        <div className="h-[68px] bg-white border-b border-border w-full" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex flex-col bg-background min-h-screen">
        <div className="h-[68px] bg-white border-b border-border w-full" />
        <div className="flex-1 p-8">
          <p className="text-danger font-semibold">Property details could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link href="/properties" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Properties
        </Link>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 mb-8 border-b border-border gap-4">
          <div>
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-3 py-1 rounded-full uppercase">
              {details.propertyType.replace("_", " ")}
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-foreground mt-2">{details.nickname}</h2>
          </div>

          <div className="flex gap-3">
            {!isReadOnly && !isMaintenance && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to archive this property? All child units will be hidden.")) {
                    archivePropertyMutation.mutate();
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-danger/25 bg-danger/5 hover:bg-danger hover:text-white rounded-lg text-xs font-semibold text-danger transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Archive Property
              </button>
            )}
          </div>
        </div>

        {/* Dashboard Split Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Metadata & Notes & Buildings */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-4 text-sm">
              <h3 className="font-bold text-foreground">Operational Details</h3>

              <div className="space-y-3.5 text-xs text-muted">
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4.5 w-4.5 text-primary shrink-0" />
                  <span className="leading-normal">{details.address}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Percent className="h-4.5 w-4.5 text-primary shrink-0" />
                  <span>Ownership percentage: {details.ownershipPercentage}%</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4.5 w-4.5 text-primary shrink-0" />
                  <span>Acquisition Date: {formatDate(details.acquisitionDate)}</span>
                </div>
              </div>

              {details.notes && (
                <div className="bg-background p-3 rounded-lg border border-border mt-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground mb-1">
                    <FileText className="h-3.5 w-3.5 text-primary" /> Notes
                  </div>
                  <p className="text-xs text-muted italic leading-relaxed">{details.notes}</p>
                </div>
              )}
            </div>

            {/* Property Valuation Card */}
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-4 text-sm">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <h3 className="font-bold text-foreground">Property Valuation</h3>
                {!isReadOnly && !isMaintenance && (
                  <button
                    onClick={() => {
                      setEditNickname(details.nickname);
                      setEditAddress(details.address);
                      setEditPropertyType(details.propertyType);
                      setEditOwnership(details.ownershipPercentage);
                      setEditAcquisitionDate(details.acquisitionDate ? new Date(details.acquisitionDate).toISOString().split('T')[0] : "");
                      setEditNotes(details.notes || "");
                      setEditEstimatedValue(details.estimatedValue ? String(details.estimatedValue) : "");
                      setEditValuationDate(details.valuationDate ? new Date(details.valuationDate).toISOString().split('T')[0] : "");
                      setEditValuationSource(details.valuationSource || "");
                      setEditValuationNotes(details.valuationNotes || "");
                      setShowEditModal(true);
                    }}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Edit className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>

              <div className="space-y-3.5 text-xs text-muted">
                <div className="flex justify-between">
                  <span>Estimated Value</span>
                  <span className="font-semibold text-foreground">
                    {details.estimatedValue 
                      ? formatCurrency(details.estimatedValue)
                      : "—"}
                  </span>
                </div>
                {details.valuationDate && (
                  <div className="flex justify-between">
                    <span>Valuation Date</span>
                    <span className="text-foreground">{formatDate(details.valuationDate)}</span>
                  </div>
                )}
                {details.valuationSource && (
                  <div className="flex justify-between">
                    <span>Valuation Source</span>
                    <span className="text-foreground">{details.valuationSource}</span>
                  </div>
                )}
                {details.valuationNotes && (
                  <div className="bg-background p-3 rounded-lg border border-border mt-2 w-full col-span-2">
                    <p className="font-bold text-foreground text-[10px] uppercase mb-1">Valuation Notes</p>
                    <p className="text-xs italic leading-relaxed text-muted">{details.valuationNotes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Buildings Section */}
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground">Buildings</h3>
                {!isReadOnly && !isMaintenance && (
                  <button
                    onClick={() => setShowBuildingModal(true)}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Add Building
                  </button>
                )}
              </div>

              {details.buildings.length === 0 ? (
                <p className="text-xs text-muted italic text-center py-4 bg-background/50 border border-dashed border-border rounded-lg">
                  No buildings mapped. Add buildings to group units.
                </p>
              ) : (
                <div className="space-y-2">
                  {details.buildings.map((b) => (
                    <div key={b.id} className="p-3 bg-background border border-border rounded-lg text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-foreground">{b.name}</p>
                        {b.address && <p className="text-[10px] text-muted mt-0.5">{b.address}</p>}
                      </div>
                      {!isReadOnly && !isMaintenance && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove building ${b.name}?`)) archiveBuildingMutation.mutate(b.id);
                          }}
                          className="text-muted hover:text-danger p-1 rounded transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Units List */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-foreground">Property Units ({details.units.length})</h3>
                {!isReadOnly && !isMaintenance && (
                  <button
                    onClick={() => setShowUnitModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Unit
                  </button>
                )}
              </div>

              {details.units.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-lg bg-background/30">
                  <Building2 className="h-8 w-8 text-muted mx-auto mb-2" />
                  <p className="text-xs font-semibold text-foreground">No units created</p>
                  <p className="text-[11px] text-muted mt-0.5">Scaffold units to start tracking rentals.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted font-bold">
                        <th className="py-2.5 px-3">Unit Number</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Monthly Rent</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.units.map((unit) => {
                        const isThisEditing = editingUnit?.id === unit.id;
                        
                        return (
                          <tr key={unit.id} className="border-b border-border hover:bg-background/40">
                            <td className="py-3 px-3 font-semibold text-foreground">
                              {isThisEditing ? (
                                <input
                                  type="text"
                                  value={unitNumber}
                                  onChange={(e) => setUnitNumber(e.target.value)}
                                  className="w-16 border border-border p-1 rounded bg-white text-xs"
                                />
                              ) : (
                                `Unit ${unit.unitNumber}`
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {isThisEditing ? (
                                <select
                                  value={unitStatus}
                                  onChange={(e) => setUnitStatus(e.target.value as any)}
                                  className="border border-border p-1 rounded bg-white text-xs"
                                >
                                  <option value="occupied">Occupied</option>
                                  <option value="vacant">Vacant</option>
                                  <option value="notice_given">Notice Given</option>
                                  <option value="offline">Offline</option>
                                </select>
                              ) : (
                                <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${unitStatusColors[unit.status]}`}>
                                  {unitStatusLabels[unit.status]}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-muted">
                              {isThisEditing ? (
                                <input
                                  type="text"
                                  value={unitType}
                                  onChange={(e) => setUnitType(e.target.value)}
                                  className="w-24 border border-border p-1 rounded bg-white text-xs"
                                />
                              ) : (
                                unit.type
                              )}
                            </td>
                            <td className="py-3 px-3 text-foreground font-medium">
                              {isThisEditing ? (
                                <input
                                  type="number"
                                  value={unitRent}
                                  onChange={(e) => setUnitRent(e.target.value)}
                                  className="w-20 border border-border p-1 rounded bg-white text-xs"
                                />
                              ) : (
                                formatCurrency(unit.monthlyRent)
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {isReadOnly ? (
                                <span className="text-[10px] text-muted italic">View only</span>
                              ) : isThisEditing ? (
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    onClick={() => setEditingUnit(null)}
                                    className="px-2 py-1 border border-border rounded text-[10px] hover:bg-white"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      updateUnitMutation.mutate({
                                        unitId: unit.id,
                                        payload: {
                                          unitNumber,
                                          status: unitStatus,
                                          type: unitType,
                                          monthlyRent: Number(unitRent),
                                          sizeSqFt: unitSize ? Number(unitSize) : null,
                                          buildingId: unitBuildingId || null,
                                        },
                                      });
                                    }}
                                    className="px-2 py-1 bg-primary text-white rounded text-[10px] font-semibold"
                                  >
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => handleEditUnitClick(unit)}
                                    className="text-muted hover:text-primary p-0.5 transition-colors"
                                    title="Edit Unit"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  {!isMaintenance && (
                                    <button
                                      onClick={() => {
                                        if (confirm(`Archive Unit ${unit.unitNumber}?`)) {
                                          archiveUnitMutation.mutate(unit.id);
                                        }
                                      }}
                                      className="text-muted hover:text-danger p-0.5 transition-colors"
                                      title="Archive Unit"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Add Building Modal */}
        {showBuildingModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-sm overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Add Building</h4>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createBuildingMutation.mutate({ propertyId, name: bldName, address: bldAddress });
                }}
              >
                <div className="p-4 space-y-3">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Building Name</label>
                    <input
                      type="text"
                      required
                      value={bldName}
                      onChange={(e) => setBldName(e.target.value)}
                      placeholder="e.g. Building A, East Wing"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Street Address</label>
                    <input
                      type="text"
                      value={bldAddress}
                      onChange={(e) => setBldAddress(e.target.value)}
                      placeholder="Optional, defaults to property"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBuildingModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold">
                    Add Building
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Unit Modal */}
        {showUnitModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-md overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Add Rental Unit</h4>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createUnitMutation.mutate({
                    propertyId,
                    unitNumber,
                    status: unitStatus,
                    type: unitType,
                    monthlyRent: Number(unitRent),
                    sizeSqFt: unitSize ? Number(unitSize) : null,
                    buildingId: unitBuildingId || null,
                  });
                }}
              >
                <div className="p-4 space-y-3">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Unit Number</label>
                      <input
                        type="text"
                        required
                        value={unitNumber}
                        onChange={(e) => setUnitNumber(e.target.value)}
                        placeholder="e.g. 104, B"
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Unit Status</label>
                      <select
                        value={unitStatus}
                        onChange={(e) => setUnitStatus(e.target.value as any)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                        <option value="notice_given">Notice Given</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Rent (Monthly $)</label>
                      <input
                        type="number"
                        required
                        value={unitRent}
                        onChange={(e) => setUnitRent(e.target.value)}
                        placeholder="e.g. 1250"
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Size (Sq Ft)</label>
                      <input
                        type="number"
                        value={unitSize}
                        onChange={(e) => setUnitSize(e.target.value)}
                        placeholder="e.g. 850"
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Unit Type</label>
                      <input
                        type="text"
                        value={unitType}
                        onChange={(e) => setUnitType(e.target.value)}
                        placeholder="e.g. Apartment, House"
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Building Group</label>
                      <select
                        value={unitBuildingId}
                        onChange={(e) => setUnitBuildingId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">No Building (Direct to Property)</option>
                        {details.buildings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUnitModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold">
                    Add Unit
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Edit Property Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-lg overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-border bg-background">
                <h3 className="font-bold text-lg text-foreground">Edit Property</h3>
                <p className="text-xs text-muted">Update details and valuations for {details.nickname}.</p>
              </div>

              <form onSubmit={handleEditSubmit}>
                <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto font-sans">
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
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        placeholder="e.g. Oakridge Manor"
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Address</label>
                      <input
                        type="text"
                        required
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Full Street Address"
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Property Type</label>
                      <select
                        value={editPropertyType}
                        onChange={(e) => setEditPropertyType(e.target.value)}
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
                        value={editOwnership}
                        onChange={(e) => setEditOwnership(Number(e.target.value))}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Acquisition Date</label>
                      <input
                        type="date"
                        required
                        value={editAcquisitionDate}
                        onChange={(e) => setEditAcquisitionDate(e.target.value)}
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
                          value={editEstimatedValue}
                          onChange={(e) => setEditEstimatedValue(e.target.value)}
                          placeholder="e.g. 1200000"
                          className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground uppercase mb-1">Valuation Date</label>
                        <input
                          type="date"
                          value={editValuationDate}
                          onChange={(e) => setEditValuationDate(e.target.value)}
                          className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                        />
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Valuation Source</label>
                      <input
                        type="text"
                        value={editValuationSource}
                        onChange={(e) => setEditValuationSource(e.target.value)}
                        placeholder="e.g. Zillow, Appraisal"
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Valuation Notes</label>
                      <textarea
                        value={editValuationNotes}
                        onChange={(e) => setEditValuationNotes(e.target.value)}
                        placeholder="Optional valuation context..."
                        rows={2}
                        className="w-full text-sm border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-foreground uppercase mb-1">Notes</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
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
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 border border-border text-sm font-semibold rounded-lg hover:bg-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatePropertyMutation.isPending}
                    className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-1.5"
                  >
                    {updatePropertyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Changes
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
