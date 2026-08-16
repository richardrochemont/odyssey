"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { useAuth } from "@/context/auth-context";
import { formatTaskCalendarDate } from "@/lib/task-date";
import { TaskItem, TaskPriority, TaskStatus } from "@/lib/task-types";

interface AuditResponse { items: Array<{ id: string; action: string; userId: string; createdAt: string }> }
const activeStatuses: TaskStatus[] = ["inbox", "planned", "in_progress", "waiting"];
const priorities: TaskPriority[] = ["urgent", "high", "normal", "low"];

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [form, setForm] = useState({ title: "", description: "", status: "inbox" as TaskStatus, priority: "normal" as TaskPriority, dueDate: "" });
  const [message, setMessage] = useState("");

  const fetchJson = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  };
  const taskQuery = useQuery<TaskItem>({ queryKey: ["task", id, token], queryFn: () => fetchJson(`/tasks/${id}`), enabled: !!token && !!id });
  const auditQuery = useQuery<AuditResponse>({ queryKey: ["task-audit", id, token], queryFn: () => fetchJson(`/tasks/${id}/audit`), enabled: !!token && !!id && !!taskQuery.data?.permissions.viewAudit });

  useEffect(() => {
    if (!taskQuery.data) return;
    setForm({ title: taskQuery.data.title, description: taskQuery.data.description || "", status: taskQuery.data.status, priority: taskQuery.data.priority, dueDate: taskQuery.data.dueDate || "" });
  }, [taskQuery.data]);

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ["task", id] }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); queryClient.invalidateQueries({ queryKey: ["task-audit", id] }); queryClient.invalidateQueries({ queryKey: ["task-summary"] }); };
  const mutation = useMutation({
    mutationFn: ({ path, method = "POST", body }: { path: string; method?: string; body?: object }) => fetchJson(path, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => { setMessage("Task updated."); refresh(); },
    onError: (error: Error) => setMessage(error.message),
  });

  if (taskQuery.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!taskQuery.data) return <div className="p-10" role="alert">Task not found.</div>;
  const task = taskQuery.data;

  return <div className="min-h-screen bg-background"><Header /><main className="mx-auto max-w-5xl px-4 py-8">
    <Link href="/tasks" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" />Task Center</Link>
    <div className="mb-6 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-start">
      <div><h1 className="text-2xl font-bold">{task.title}</h1><p className="mt-1 text-sm text-muted">Created by {task.createdBy.name} · Due {formatTaskCalendarDate(task.dueDate)}</p>{task.status === "completed" && !task.completedAt ? <p className="mt-1 text-xs text-muted">Completion time unavailable for this legacy task.</p> : null}</div>
      <div className="flex flex-wrap gap-2">
        {task.permissions.complete ? <button onClick={() => mutation.mutate({ path: `/tasks/${id}/complete` })} className="min-h-11 rounded bg-primary px-3 text-sm font-semibold text-white">Complete</button> : null}
        {task.permissions.reopen ? <button onClick={() => mutation.mutate({ path: `/tasks/${id}/reopen`, body: { status: "inbox" } })} className="min-h-11 rounded border px-3 text-sm">Reopen</button> : null}
        {task.permissions.cancel ? <button onClick={() => { if (window.confirm("Cancel this task?")) mutation.mutate({ path: `/tasks/${id}/cancel` }); }} className="min-h-11 rounded border px-3 text-sm text-danger">Cancel</button> : null}
        {task.permissions.archive ? <button onClick={() => { if (window.confirm("Archive this task?")) mutation.mutate({ path: `/tasks/${id}`, method: "DELETE" }, { onSuccess: () => router.push("/tasks") }); }} className="min-h-11 rounded border px-3 text-sm text-danger">Archive</button> : null}
      </div>
    </div>

    <div aria-live="polite" className="mb-3 text-sm">{message}</div>
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="rounded-xl border bg-white p-5" aria-labelledby="task-fields">
        <h2 id="task-fields" className="mb-4 font-bold">Task details</h2>
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate({ path: `/tasks/${id}`, method: "PATCH", body: { title: form.title, description: form.description || null, priority: form.priority, dueDate: form.dueDate || null, ...(activeStatuses.includes(task.status) ? { status: form.status } : {}) } }); }} className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm">Title<input disabled={!task.permissions.edit} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded border p-2 disabled:bg-slate-50" /></label>
          <label className="sm:col-span-2 text-sm">Description<textarea disabled={!task.permissions.edit} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded border p-2 disabled:bg-slate-50" rows={5} /></label>
          <label className="text-sm">Status<select disabled={!task.permissions.edit} value={activeStatuses.includes(form.status) ? form.status : "inbox"} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })} className="mt-1 w-full rounded border p-2 disabled:bg-slate-50">{activeStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-sm">Priority<select disabled={!task.permissions.edit} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })} className="mt-1 w-full rounded border p-2 disabled:bg-slate-50">{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-sm">Due date<input disabled={!task.permissions.edit} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 w-full rounded border p-2 disabled:bg-slate-50" /></label>
          <div className="text-sm">Assignee<p className="mt-1 rounded border p-2">{task.assignee?.name || "Unassigned"}</p></div>
          {task.permissions.edit ? <button disabled={mutation.isPending} className="min-h-11 rounded bg-primary px-4 font-semibold text-white sm:col-span-2 disabled:opacity-50">Save changes</button> : null}
        </form>
      </section>

      <aside className="space-y-6">
        <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 font-bold">Related context</h2><dl className="space-y-2 text-sm"><div><dt className="text-muted">Property</dt><dd>{task.propertyId || "—"}</dd></div><div><dt className="text-muted">Unit</dt><dd>{task.unitId || "—"}</dd></div><div><dt className="text-muted">Tenant</dt><dd>{task.tenantId || "—"}</dd></div><div><dt className="text-muted">Lease</dt><dd>{task.leaseId || "—"}</dd></div><div><dt className="text-muted">Reconciliation</dt><dd>{task.reconciliationMonth || "—"}</dd></div></dl></section>
        {task.permissions.viewAudit ? <section className="rounded-xl border bg-white p-5"><h2 className="mb-3 font-bold">Audit history</h2>{auditQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ol className="space-y-3">{auditQuery.data?.items.map((entry) => <li key={entry.id} className="border-l-2 border-primary pl-3 text-sm"><span className="font-semibold capitalize">{entry.action}</span><br /><span className="text-xs text-muted">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</span></li>)}</ol>}</section> : null}
      </aside>
    </div>
  </main></div>;
}
