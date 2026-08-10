"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import {
  Plus,
  CheckSquare,
  Loader2,
  WrenchIcon,
} from "lucide-react";

interface Request {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "new" | "triaged" | "assigned" | "scheduled" | "completed" | "closed";
  createdAt: string;
  propertyNickname: string;
  unitNumber: string;
  tenantName: string | null;
}

interface Vendor {
  id: string;
  name: string;
  specialty: string;
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

interface Tenant {
  id: string;
  name: string;
}

export default function MaintenancePage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const isReadOnly = user?.role === "read_only";

  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request Form States
  const [reqTitle, setReqTitle] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [reqPriority, setReqPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [reqPropId, setReqPropId] = useState("");
  const [reqUnitId, setReqUnitId] = useState("");
  const [reqTenantId, setReqTenantId] = useState("");

  // Assign Form States
  const [assignVendorId, setAssignVendorId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignScheduledAt, setAssignScheduledAt] = useState("");

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  };

  const { data: requests = [], isLoading: requestsLoading } = useQuery<Request[]>({
    queryKey: ["maintenance-requests", token],
    queryFn: () => fetchWithAuth("/maintenance/requests"),
    enabled: !!token,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors", token],
    queryFn: () => fetchWithAuth("/maintenance/vendors"),
    enabled: !!token,
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["properties", token],
    queryFn: () => fetchWithAuth("/properties"),
    enabled: !!token,
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["tenants", token],
    queryFn: () => fetchWithAuth("/leases/tenants"),
    enabled: !!token,
  });

  const selectedProperty = properties.find((p) => p.id === reqPropId);

  // Mutations
  const createRequestMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/maintenance/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create maintenance request");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests", token] });
      setShowRequestModal(false);
      resetRequestForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ reqId, status }: { reqId: string; status: string }) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/maintenance/requests/${reqId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests", token] });
      if (selectedRequest && selectedRequest.id === data.id) {
        setSelectedRequest({ ...selectedRequest, status: data.status });
      }
    },
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/maintenance/work-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to assign vendor work order");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance-requests", token] });
      setShowAssignModal(false);
      setAssignVendorId("");
      setAssignNotes("");
      setAssignScheduledAt("");
      setSelectedRequest(null);
    },
    onError: (err: any) => setError(err.message),
  });

  const resetRequestForm = () => {
    setReqTitle("");
    setReqDesc("");
    setReqPriority("medium");
    setReqPropId("");
    setReqUnitId("");
    setReqTenantId("");
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createRequestMutation.mutate({
      propertyId: reqPropId,
      unitId: reqUnitId,
      tenantId: reqTenantId || null,
      title: reqTitle,
      description: reqDesc,
      priority: reqPriority,
      status: "new",
    });
  };

  const handleAssignVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setError(null);
    createWorkOrderMutation.mutate({
      maintenanceRequestId: selectedRequest.id,
      vendorId: assignVendorId,
      notes: assignNotes,
      scheduledAt: assignScheduledAt || undefined,
    });
  };

  const columns = [
    { id: "new", name: "New Requests" },
    { id: "triaged", name: "Triaged" },
    { id: "assigned", name: "Assigned" },
    { id: "scheduled", name: "Scheduled" },
    { id: "completed", name: "Completed" },
    { id: "closed", name: "Closed" },
  ];

  const priorityColors = {
    urgent: "bg-danger text-white",
    high: "bg-warning/20 text-warning-dark font-bold",
    medium: "bg-primary/10 text-primary font-semibold",
    low: "bg-slate-100 text-muted font-medium",
  };

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Maintenance Board</h2>
            <p className="text-sm text-muted mt-1">Track request lifecycles, assign work orders, and log audit history.</p>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="h-4.5 w-4.5" /> File Request
            </button>
          )}
        </div>

        {requestsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          /* Kanban Board Layout */
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start">
            {columns.map((col) => {
              const colRequests = requests.filter((r) => r.status === col.id);

              return (
                <div key={col.id} className="bg-white border border-border rounded-xl p-3 shadow-xs min-h-[400px]">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-border">
                    <h3 className="font-bold text-xs text-foreground tracking-tight uppercase truncate mr-2">{col.name}</h3>
                    <span className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded font-bold text-muted">
                      {colRequests.length}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {colRequests.map((req) => (
                      <div
                        key={req.id}
                        onClick={() => setSelectedRequest(req)}
                        className="bg-background border border-border p-3 rounded-lg hover:border-primary cursor-pointer transition-all space-y-2 text-left group"
                      >
                        <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded font-bold ${priorityColors[req.priority]}`}>
                          {req.priority}
                        </span>
                        <h4 className="font-bold text-xs text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {req.title}
                        </h4>
                        <p className="text-[9px] text-muted">
                          {req.propertyNickname} • Unit {req.unitNumber}
                        </p>
                      </div>
                    ))}

                    {colRequests.length === 0 && (
                      <p className="text-[10px] text-muted italic text-center py-4 bg-background/30 border border-dashed border-border rounded">
                        No requests
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Request Details Sidebar Panel */}
        {selectedRequest && (
          <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-border shadow-2xl z-50 p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className={`text-[8px] uppercase px-2 py-0.5 rounded font-bold ${priorityColors[selectedRequest.priority]}`}>
                    {selectedRequest.priority} Priority
                  </span>
                  <h3 className="font-bold text-lg text-foreground mt-2">{selectedRequest.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-xs text-muted hover:text-foreground font-bold p-1"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <p className="font-bold text-muted uppercase text-[9px] tracking-wider">Property Location</p>
                  <p className="font-medium text-foreground mt-0.5">
                    {selectedRequest.propertyNickname} • Unit {selectedRequest.unitNumber}
                  </p>
                </div>

                <div>
                  <p className="font-bold text-muted uppercase text-[9px] tracking-wider">Tenant Filer</p>
                  <p className="font-medium text-foreground mt-0.5">{selectedRequest.tenantName || "Reported by manager"}</p>
                </div>

                <div>
                  <p className="font-bold text-muted uppercase text-[9px] tracking-wider">Description</p>
                  <p className="text-muted leading-relaxed mt-1 bg-background p-3 rounded-lg border border-border">
                    {selectedRequest.description}
                  </p>
                </div>

                <div>
                  <p className="font-bold text-muted uppercase text-[9px] tracking-wider mb-2">Progress Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {columns.map((col) => (
                      <button
                        key={col.id}
                        disabled={isReadOnly}
                        onClick={() => updateStatusMutation.mutate({ reqId: selectedRequest.id, status: col.id })}
                        className={`px-2 py-1 rounded text-[9.5px] font-bold border transition-colors ${
                          selectedRequest.status === col.id
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-border text-muted hover:bg-background"
                        }`}
                      >
                        {col.id.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar actions: Assign vendor work order */}
            <div className="border-t border-border pt-4 mt-6">
              {selectedRequest.status === "new" || selectedRequest.status === "triaged" ? (
                !isReadOnly && user?.role !== "maintenance" ? (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors"
                  >
                    <WrenchIcon className="h-4 w-4" /> Convert to Work Order
                  </button>
                ) : (
                  <p className="text-[11px] text-muted italic text-center">Awaiting dispatch by owner-manager.</p>
                )
              ) : selectedRequest.status === "assigned" || selectedRequest.status === "scheduled" ? (
                <div className="bg-primary/5 border border-primary/10 p-3 rounded-lg flex items-center gap-2 text-xs">
                  <CheckSquare className="h-4.5 w-4.5 text-primary shrink-0" />
                  <p className="text-muted leading-snug">
                    Work order active. Assignee vendor is working on details.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted italic text-center">This maintenance request is completed or closed.</p>
              )}
            </div>
          </div>
        )}

        {/* Assign Vendor Modal */}
        {showAssignModal && selectedRequest && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-sm overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Dispatch Vendor Work Order</h4>
                <p className="text-[10px] text-muted mt-0.5">Convert request: "{selectedRequest.title}"</p>
              </div>
              <form onSubmit={handleAssignVendor}>
                <div className="p-4 space-y-3">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Select Vendor</label>
                    <select
                      required
                      value={assignVendorId}
                      onChange={(e) => setAssignVendorId(e.target.value)}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                    >
                      <option value="">Choose Vendor...</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.specialty})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Scheduled Date</label>
                    <input
                      type="datetime-local"
                      value={assignScheduledAt}
                      onChange={(e) => setAssignScheduledAt(e.target.value)}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Dispatch Notes</label>
                    <textarea
                      value={assignNotes}
                      onChange={(e) => setAssignNotes(e.target.value)}
                      placeholder="e.g. Approved standard diagnostic rate of $95..."
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createWorkOrderMutation.isPending}
                    className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold flex items-center gap-1"
                  >
                    {createWorkOrderMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Issue Work Order
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* File Request Modal */}
        {showRequestModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-md overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">File Maintenance Request</h4>
              </div>
              <form onSubmit={handleCreateRequest}>
                <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Select Property</label>
                    <select
                      required
                      value={reqPropId}
                      onChange={(e) => {
                        setReqPropId(e.target.value);
                        setReqUnitId(""); // reset unit selection
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

                  {reqPropId && selectedProperty && (
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Select Unit</label>
                      <select
                        required
                        value={reqUnitId}
                        onChange={(e) => setReqUnitId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">Choose Unit...</option>
                        {selectedProperty.units?.map((u) => (
                          <option key={u.id} value={u.id}>
                            Unit {u.unitNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Reporting Tenant (Optional)</label>
                    <select
                      value={reqTenantId}
                      onChange={(e) => setReqTenantId(e.target.value)}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                    >
                      <option value="">Select Tenant...</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Issue Title</label>
                    <input
                      type="text"
                      required
                      value={reqTitle}
                      onChange={(e) => setReqTitle(e.target.value)}
                      placeholder="e.g. Toilet running continuously"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Description</label>
                    <textarea
                      required
                      value={reqDesc}
                      onChange={(e) => setReqDesc(e.target.value)}
                      placeholder="Detail the issue, location, and severity level..."
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Priority Level</label>
                    <select
                      value={reqPriority}
                      onChange={(e) => setReqPriority(e.target.value as any)}
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                    >
                      <option value="low">Low (Cosmetic / Minor)</option>
                      <option value="medium">Medium (Standard Repair)</option>
                      <option value="high">High (Affecting Occupancy)</option>
                      <option value="urgent">Urgent (Safety / Damage risk)</option>
                    </select>
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRequestModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createRequestMutation.isPending}
                    className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold flex items-center gap-1"
                  >
                    {createRequestMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Submit Request
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
