"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { formatTaskCalendarDate } from "@/lib/task-date";
import { TaskItem } from "@/lib/task-types";

interface Summary { overdue: number; dueToday: number; assignedToMe: number; waiting: number; items: TaskItem[] }

export default function TaskSummaryWidget() {
  const { token } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const query = useQuery<Summary>({
    queryKey: ["task-summary", token],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/tasks/summary`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Task summary unavailable");
      return response.json();
    },
    enabled: !!token,
  });
  if (query.isError) return null;
  return <section aria-labelledby="task-summary-title" className="mb-8 rounded-md border border-border bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between"><div><h2 id="task-summary-title" className="font-serif text-lg font-bold">Task Center</h2><p className="text-xs text-muted">Your manually assigned work</p></div><Link href="/tasks?assignee=me" className="text-sm font-semibold text-primary">View all tasks</Link></div>
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([ ["Overdue", query.data?.overdue], ["Due today", query.data?.dueToday], ["Assigned to me", query.data?.assignedToMe], ["Waiting", query.data?.waiting] ] as const).map(([label, value]) => <div key={label} className="rounded bg-background p-3"><p className="text-xs text-muted">{label}</p><p className="text-xl font-bold">{value ?? "—"}</p></div>)}</div>
    {query.data?.items.length ? <ul className="divide-y">{query.data.items.map((task) => <li key={task.id}><Link href={`/tasks/${task.id}`} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm"><span className="font-semibold">{task.title}</span><span className="text-muted">{formatTaskCalendarDate(task.dueDate)}</span></Link></li>)}</ul> : <p className="text-sm text-muted">No tasks assigned to you.</p>}
  </section>;
}
