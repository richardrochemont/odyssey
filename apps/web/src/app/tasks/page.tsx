"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Filter, Loader2, Plus } from "lucide-react";
import Header from "@/components/Header";
import { useAuth } from "@/context/auth-context";
import { compareTaskCalendarDates, formatTaskCalendarDate, todayCalendarDate } from "@/lib/task-date";
import { TaskItem, TaskPriority, TaskStatus } from "@/lib/task-types";

interface ListResponse { items: TaskItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
interface AssigneeResponse { items: Array<{ id: string; name: string; role: string }> }
interface Property { id: string; nickname: string }

const statuses: TaskStatus[] = ["inbox", "planned", "in_progress", "waiting", "completed", "cancelled"];
const priorities: TaskPriority[] = ["urgent", "high", "normal", "low"];

const initialForm = {
  title: "", description: "", status: "inbox" as TaskStatus, priority: "normal" as TaskPriority,
  dueDate: "", assigneeUserId: "", propertyId: "", unitId: "", tenantId: "", leaseId: "",
  paymentId: "", financialRecordId: "", reconciliationMonth: "",
};

export default function TasksPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [due, setDue] = useState("");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [filtersReady, setFiltersReady] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");

  const canCreate = user && user.role !== "read_only";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const fetchJson = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  };

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: "25", sort });
    if (status) query.set("status", status);
    if (priority) query.set("priority", priority);
    if (assignee === "me") query.set("assignee", "me");
    else if (assignee === "unassigned") query.set("unassigned", "true");
    else if (assignee) query.set("assigneeId", assignee);
    if (propertyId) query.set("propertyId", propertyId);
    if (due) query.set("due", due);
    return query.toString();
  }, [assignee, due, page, priority, propertyId, sort, status]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setStatus(query.get("status") || ""); setPriority(query.get("priority") || "");
    setAssignee(query.get("assignee") === "me" ? "me" : query.get("unassigned") === "true" ? "unassigned" : query.get("assigneeId") || "");
    setPropertyId(query.get("propertyId") || ""); setDue(query.get("due") || ""); setSort(query.get("sort") || "updated");
    setPage(Math.max(Number(query.get("page") || 1), 1)); setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    window.history.replaceState(null, "", `/tasks?${queryString}`);
  }, [filtersReady, queryString]);

  useEffect(() => {
    if (!showCreate) return;
    const first = dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setShowCreate(false); triggerRef.current?.focus(); }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'));
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showCreate]);

  const taskQuery = useQuery<ListResponse>({ queryKey: ["tasks", queryString, token], queryFn: () => fetchJson(`/tasks?${queryString}`), enabled: !!token });
  const assigneeQuery = useQuery<AssigneeResponse>({ queryKey: ["task-assignees", token], queryFn: () => fetchJson("/tasks/assignees?pageSize=100"), enabled: !!token && !!canCreate });
  const propertyQuery = useQuery<Property[]>({ queryKey: ["properties", token], queryFn: () => fetchJson("/properties"), enabled: !!token });

  const createMutation = useMutation({
    mutationFn: (payload: object) => fetchJson("/tasks", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-summary"] });
      setShowCreate(false); setForm(initialForm); setMessage("Task created."); triggerRef.current?.focus();
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const optional = (value: string) => value || null;
    createMutation.mutate({
      title: form.title, description: optional(form.description), status: form.status, priority: form.priority,
      dueDate: optional(form.dueDate), assigneeUserId: optional(form.assigneeUserId), propertyId: optional(form.propertyId),
      unitId: optional(form.unitId), tenantId: optional(form.tenantId), leaseId: optional(form.leaseId),
      paymentId: optional(form.paymentId), financialRecordId: optional(form.financialRecordId),
      reconciliationMonth: optional(form.reconciliationMonth),
    });
  };

  const today = todayCalendarDate();
  const updateFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between border-b border-border pb-6">
          <div><h1 className="text-2xl font-bold">Task Center</h1><p className="mt-1 text-sm text-muted">Manually create and track internal work.</p></div>
          {canCreate ? <button ref={triggerRef} onClick={() => { setMessage(""); setShowCreate(true); }} className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Create task</button> : null}
        </div>

        <div className="mb-6 rounded-xl border border-border bg-white p-4 shadow-sm" aria-label="Task filters">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Filter className="h-4 w-4 text-primary" />Filters</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <label className="text-xs">Status<select aria-label="Filter by status" value={status} onChange={(e) => updateFilter(setStatus, e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">All</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="text-xs">Priority<select aria-label="Filter by priority" value={priority} onChange={(e) => updateFilter(setPriority, e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">All</option>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="text-xs">Assignee<select aria-label="Filter by assignee" value={assignee} onChange={(e) => updateFilter(setAssignee, e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">All</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{assigneeQuery.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs">Property<select aria-label="Filter by property" value={propertyId} onChange={(e) => updateFilter(setPropertyId, e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">All</option>{propertyQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select></label>
            <label className="text-xs">Due<select aria-label="Filter by due date" value={due} onChange={(e) => updateFilter(setDue, e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">Any</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="next_7_days">Next 7 days</option><option value="none">No due date</option></select></label>
            <label className="text-xs">Sort<select aria-label="Sort tasks" value={sort} onChange={(e) => updateFilter(setSort, e.target.value)} className="mt-1 w-full rounded border p-2"><option value="due_date">Due date</option><option value="priority">Priority</option><option value="newest">Newest</option><option value="updated">Updated</option></select></label>
          </div>
        </div>

        <div aria-live="polite" className="sr-only">{message}</div>
        {taskQuery.isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          : taskQuery.isError ? <div role="alert" className="rounded-xl border border-danger/30 bg-white p-8 text-center text-danger">{(taskQuery.error as Error).message}</div>
          : !taskQuery.data?.items.length ? <div className="rounded-xl border border-border bg-white py-20 text-center"><CheckSquare className="mx-auto mb-3 h-12 w-12 text-muted" /><h2 className="font-bold">No tasks match this view</h2><p className="mt-1 text-sm text-muted">Clear filters or create a manual task.</p></div>
          : <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <ul>{taskQuery.data.items.map((task) => {
              const overdue = !!task.dueDate && compareTaskCalendarDates(task.dueDate, today) < 0 && !["completed", "cancelled"].includes(task.status);
              return <li key={task.id} className="border-b border-border p-4 last:border-0 hover:bg-background/40">
                <Link href={`/tasks/${task.id}`} className="block rounded focus:outline-none focus:ring-2 focus:ring-primary">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0"><h2 className="font-bold">{task.title}</h2><p className="mt-1 text-xs text-muted">{task.assignee?.name || "Unassigned"} · {formatTaskCalendarDate(task.dueDate)} {overdue ? <span className="font-bold text-danger">· Overdue</span> : null}</p></div>
                    <div className="flex gap-2"><span className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold">{task.status.replaceAll("_", " ")}</span><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{task.priority}</span></div>
                  </div>
                </Link>
              </li>;
            })}</ul>
          </div>}

        {(taskQuery.data?.pagination.totalPages || 0) > 1 ? <nav aria-label="Task pages" className="mt-5 flex items-center justify-center gap-3"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded border px-4 disabled:opacity-50">Previous</button><span className="text-sm">Page {page} of {taskQuery.data?.pagination.totalPages}</span><button disabled={page === taskQuery.data?.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded border px-4 disabled:opacity-50">Next</button></nav> : null}
      </main>

      {showCreate ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-task-title" className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
          <form onSubmit={handleCreate}>
            <div className="border-b p-5"><h2 id="create-task-title" className="text-lg font-bold">Create task</h2><p className="text-sm text-muted">Tasks are created manually and remain internal.</p></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm">Title<input autoFocus required maxLength={255} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded border p-2" /></label>
              <label className="sm:col-span-2 text-sm">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded border p-2" rows={3} /></label>
              <label className="text-sm">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })} className="mt-1 w-full rounded border p-2">{statuses.filter((item) => !["completed", "cancelled"].includes(item)).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm">Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })} className="mt-1 w-full rounded border p-2">{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm">Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 w-full rounded border p-2" /></label>
              <label className="text-sm">Assignee<select value={form.assigneeUserId} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })} className="mt-1 w-full rounded border p-2"><option value="">Unassigned</option>{assigneeQuery.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="text-sm">Property<select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value, reconciliationMonth: e.target.value ? form.reconciliationMonth : "" })} className="mt-1 w-full rounded border p-2"><option value="">None</option>{propertyQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select></label>
              <label className="text-sm">Reconciliation month<input type="month" disabled={!form.propertyId} value={form.reconciliationMonth} onChange={(e) => setForm({ ...form, reconciliationMonth: e.target.value })} className="mt-1 w-full rounded border p-2 disabled:opacity-50" /></label>
              {(["unitId", "tenantId", "leaseId", "paymentId", "financialRecordId"] as const).map((field) => <label key={field} className="text-sm">{field.replace("Id", " ID")}<input placeholder="Optional UUID" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="mt-1 w-full rounded border p-2" /></label>)}
              {message ? <p role="alert" className="sm:col-span-2 text-sm text-danger">{message}</p> : null}
            </div>
            <div className="flex justify-end gap-3 border-t p-5"><button type="button" onClick={() => { setShowCreate(false); triggerRef.current?.focus(); }} className="min-h-11 rounded border px-4">Cancel</button><button disabled={createMutation.isPending} className="min-h-11 rounded bg-primary px-4 font-semibold text-white disabled:opacity-50">{createMutation.isPending ? "Creating…" : "Create task"}</button></div>
          </form>
        </div>
      </div> : null}
    </div>
  );
}
