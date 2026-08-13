"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import Header from "@/components/Header";
import { formatDate } from "@/lib/format";
import {
  CheckSquare,
  Plus,
  Filter,
  Calendar,
  User,
  Building,
  CheckCircle,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  ownerId: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  type: string;
  propertyId: string | null;
  unitId: string | null;
  tenantId: string | null;
  leaseId: string | null;
  maintenanceRequestId: string | null;
  notes: string | null;
  ownerName: string;
  propertyNickname: string | null;
  unitNumber: string | null;
  tenantName: string | null;
}

interface UserChoice {
  id: string;
  name: string;
  role: string;
}

interface Property {
  id: string;
  nickname: string;
}

interface Tenant {
  id: string;
  name: string;
}

export default function TasksPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const isReadOnly = user?.role === "read_only";

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tDueDate, setTDueDate] = useState("");
  const [tOwnerId, setTOwnerId] = useState("");
  const [tStatus, setTStatus] = useState<"todo" | "in_progress" | "completed">("todo");
  const [tPriority, setTPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [tType, setTType] = useState("general");
  
  // Relations
  const [tPropertyId, setTPropertyId] = useState("");
  const [tTenantId, setTTenantId] = useState("");
  const [tNotes, setTNotes] = useState("");

  const fetchWithAuth = async (path: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  };

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["tasks", statusFilter, token],
    queryFn: () => {
      const url = `/tasks${statusFilter ? `?status=${statusFilter}` : ""}`;
      return fetchWithAuth(url);
    },
    enabled: !!token,
  });

  const { data: usersList = [] } = useQuery<UserChoice[]>({
    queryKey: ["users-auth", token],
    queryFn: () => fetchWithAuth("/auth/users"),
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

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: async (payload: any) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", statusFilter, token] });
      setShowModal(false);
      resetTaskForm();
    },
    onError: (err: any) => setError(err.message),
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/tasks/${taskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update task status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", statusFilter, token] });
    },
  });

  const archiveTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to archive task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", statusFilter, token] });
    },
  });

  const resetTaskForm = () => {
    setTTitle("");
    setTDesc("");
    setTDueDate("");
    setTOwnerId("");
    setTStatus("todo");
    setTPriority("medium");
    setTType("general");
    setTPropertyId("");
    setTTenantId("");
    setTNotes("");
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createTaskMutation.mutate({
      title: tTitle,
      description: tDesc || undefined,
      dueDate: tDueDate,
      ownerId: tOwnerId,
      status: tStatus,
      priority: tPriority,
      type: tType,
      propertyId: tPropertyId || null,
      tenantId: tTenantId || null,
      notes: tNotes || undefined,
    });
  };

  const priorityColors = {
    urgent: "bg-danger text-white",
    high: "bg-warning/20 text-warning-dark",
    medium: "bg-primary/10 text-primary",
    low: "bg-slate-100 text-muted",
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col bg-background min-h-screen text-foreground">
      <Header />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 mb-8 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Tasks Workspace</h2>
            <p className="text-sm text-muted mt-1">Review operations checklist, renewal reviews, and general to-dos.</p>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => {
                resetTaskForm();
                // Set default assignee to current user
                if (user) setTOwnerId(user.id);
                setShowModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="h-4.5 w-4.5" /> Add Task
            </button>
          )}
        </div>

        {/* Filters and Search */}
        <div className="flex items-center justify-between bg-white border border-border p-4 rounded-xl shadow-sm mb-6 gap-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4.5 w-4.5 text-primary" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Filter Tasks</span>
          </div>

          <div className="flex gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-border p-2 rounded-lg bg-background font-semibold"
            >
              <option value="">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {tasksLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20 bg-white border border-border rounded-xl">
            <CheckSquare className="h-12 w-12 text-muted mx-auto mb-3" />
            <h3 className="font-bold text-foreground">No tasks matching filters</h3>
            <p className="text-sm text-muted mt-1">Resolve outstanding tasks or create a new todo checklist.</p>
          </div>
        ) : (
          /* Tasks List */
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            {tasks.map((task) => {
              const isOverdue = task.status !== "completed" && task.status !== "cancelled" && new Date(task.dueDate).toISOString().split("T")[0] < todayStr;
              const isDueToday = task.status !== "completed" && task.status !== "cancelled" && new Date(task.dueDate).toISOString().split("T")[0] === todayStr;

              return (
                <div
                  key={task.id}
                  className="p-4 border-b border-border hover:bg-background/20 transition-colors flex items-center justify-between gap-4 text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      disabled={isReadOnly}
                      onClick={() =>
                        updateTaskStatusMutation.mutate({
                          taskId: task.id,
                          status: task.status === "completed" ? "todo" : "completed",
                        })
                      }
                      className="p-1 text-muted hover:text-primary rounded"
                    >
                      <CheckCircle
                        className={`h-5 w-5 ${
                          task.status === "completed" ? "text-success fill-success/10" : "text-muted"
                        }`}
                      />
                    </button>

                    <div className="min-w-0">
                      <h4
                        className={`font-bold text-sm text-foreground truncate ${
                          task.status === "completed" ? "line-through text-muted" : ""
                        }`}
                      >
                        {task.title}
                      </h4>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted mt-1 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> Assignee: {task.ownerName}
                        </span>

                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Due: {formatDate(task.dueDate)}
                          {isOverdue && <span className="text-danger font-extrabold">(OVERDUE)</span>}
                          {isDueToday && <span className="text-warning font-extrabold">(TODAY)</span>}
                        </span>

                        {task.propertyNickname && (
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3" /> Property: {task.propertyNickname}
                          </span>
                        )}

                        {task.tenantName && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> Tenant: {task.tenantName}
                          </span>
                        )}

                        {task.type !== "general" && (
                          <span className="bg-primary/5 border border-primary/10 px-1.5 py-0.5 rounded-[4px] uppercase text-[8px] font-bold">
                            {task.type.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-[11px] text-muted mt-2 leading-relaxed italic max-w-xl">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>

                    {!isReadOnly && (
                      <button
                        onClick={() => {
                          if (confirm("Archive this task checklist item?")) {
                            archiveTaskMutation.mutate(task.id);
                          }
                        }}
                        className="text-muted hover:text-danger p-1 rounded transition-colors"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Task Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl border border-border w-full max-w-md overflow-hidden shadow-lg animate-in fade-in duration-150">
              <div className="p-4 border-b border-border bg-background">
                <h4 className="font-bold text-foreground">Create Task Checklist Item</h4>
              </div>
              <form onSubmit={handleCreateTask}>
                <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
                  {error && (
                    <div className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-xs">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Task Title</label>
                    <input
                      type="text"
                      required
                      value={tTitle}
                      onChange={(e) => setTTitle(e.target.value)}
                      placeholder="e.g. Schedule gutter repair quote"
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted uppercase mb-1">Description (Optional)</label>
                    <textarea
                      value={tDesc}
                      onChange={(e) => setTDesc(e.target.value)}
                      placeholder="Operational checklist notes..."
                      className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Due Date</label>
                      <input
                        type="date"
                        required
                        value={tDueDate}
                        onChange={(e) => setTDueDate(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Assignee</label>
                      <select
                        required
                        value={tOwnerId}
                        onChange={(e) => setTOwnerId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">Select User...</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Priority</label>
                      <select
                        value={tPriority}
                        onChange={(e) => setTPriority(e.target.value as any)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-muted uppercase mb-1">Task Type</label>
                      <select
                        value={tType}
                        onChange={(e) => setTType(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="general">General</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="lease_renewal">Lease Renewal</option>
                        <option value="inspection">Inspection</option>
                        <option value="financial">Financial</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 mt-3 grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold text-muted uppercase mb-1.5">Relate to (Optional)</p>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-muted uppercase mb-1">Property Link</label>
                      <select
                        value={tPropertyId}
                        onChange={(e) => setTPropertyId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">None</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nickname}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-muted uppercase mb-1">Tenant Link</label>
                      <select
                        value={tTenantId}
                        onChange={(e) => setTTenantId(e.target.value)}
                        className="w-full text-xs border border-border p-2 rounded-lg bg-background focus:outline-primary h-8.5"
                      >
                        <option value="">None</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-border bg-background flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 border border-border text-xs rounded hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTaskMutation.isPending}
                    className="px-3 py-1.5 bg-primary text-white text-xs rounded font-semibold flex items-center gap-1"
                  >
                    {createTaskMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Add Checklist Item
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
