"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Header from "@/components/Header";
import { useAuth } from "@/context/auth-context";
import { formatCents } from "@/lib/format";
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types mirror the API response exactly. This page renders API-provided
// facts, formulas, dates, caveats, and labels — it never recomputes any
// financial logic.
// ---------------------------------------------------------------------------

interface RelatedRecord {
  type: string;
  id: string;
  path: string;
}

type Confidence = "no_data" | "needs_review" | "summary_only" | "partial_detail" | "detail_complete" | "unavailable";
type Severity = "critical" | "warning" | "watch";
type Impact = "low" | "medium" | "high";
type Effort = "low" | "medium";
type ScorecardStatus = "strong" | "watch" | "needs_attention" | "critical" | "insufficient_data";

interface Issue {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  priorityScore: number;
  rankingMagnitude: number;
  rankingExplanation: string;
  sourcePeriod: { start: string; end: string };
  comparisonPeriod: { start: string; end: string } | null;
  metrics: Record<string, unknown>;
  formula: string;
  confidence: Confidence;
  comparisonConfidence: Confidence | null;
  caveats: string[];
  relatedRecords: RelatedRecord[];
  suggestedNextStep: string;
  impact: Impact;
  effort: Effort;
}

interface SuppressedRule {
  id: string;
  category: string;
  reason: string;
}

interface Scorecard {
  id: string;
  title: string;
  status: ScorecardStatus;
  metrics: Record<string, unknown>;
  confidence: Confidence;
  relatedIssueIds: string[];
}

interface DecisionBriefResponse {
  organization: { id: string };
  period: { start: string; end: string; label: string; months: string[] };
  comparisonPeriod: { start: string; end: string; label: string; months: string[] };
  calculatedAt: string;
  disclosure: string;
  scorecards: Scorecard[];
  whereToStart: Issue[];
  criticalIssues: Issue[];
  warnings: Issue[];
  watchItems: Issue[];
  suppressed: SuppressedRule[];
}

// Growth Facts v1 shape, reused for the supporting evidence layer.
interface Insight {
  id: string;
  title: string;
  kind: "fact" | "calculation";
  sourcePeriod: { start: string; end: string } | null;
  comparisonPeriod: { start: string; end: string } | null;
  metrics: Record<string, unknown>;
  comparisonMetrics: Record<string, unknown> | null;
  formula: string | null;
  relatedRecords: RelatedRecord[];
  confidence: Confidence;
  caveats: string[];
  unavailableReason: string | null;
}
interface GrowthSummaryResponse {
  insights: Insight[];
  omitted: { category: string; reason: string }[];
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  detail_complete: "Complete",
  partial_detail: "Partial detail",
  summary_only: "Summary only",
  needs_review: "Needs review",
  no_data: "No data",
  unavailable: "Not applicable",
};

const SEVERITY_LABELS: Record<Severity, string> = { critical: "Critical", warning: "Needs attention", watch: "Watch" };

const CATEGORY_LABELS: Record<string, string> = {
  collections: "Collections",
  cash_flow: "Cash Flow",
  expenses: "Expenses",
  vacancy: "Vacancy",
  lease_expiry: "Lease Expiry",
  recorded_market_rent: "Recorded Market Rent",
  data_quality: "Data Quality",
};

const SCORECARD_STATUS_LABELS: Record<ScorecardStatus, string> = {
  strong: "Strong",
  watch: "Watch",
  needs_attention: "Needs attention",
  critical: "Critical",
  insufficient_data: "Insufficient data",
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const Icon = confidence === "detail_complete" ? CheckCircle2 : confidence === "unavailable" ? HelpCircle : AlertCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground"
      data-testid={`confidence-badge-${confidence}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const Icon = severity === "critical" ? AlertCircle : severity === "warning" ? AlertTriangle : HelpCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground"
      data-testid={`severity-badge-${severity}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

function ScorecardStatusBadge({ status }: { status: ScorecardStatus }) {
  const Icon =
    status === "strong" ? CheckCircle2 : status === "insufficient_data" ? HelpCircle : status === "critical" ? AlertCircle : AlertTriangle;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground"
      data-testid={`scorecard-status-${status}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {SCORECARD_STATUS_LABELS[status]}
    </span>
  );
}

// Presentation-only formatting: renders numbers the API already computed.
function formatMetricValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key.toLowerCase().endsWith("cents")) return formatCents(value as number);
  if (key.toLowerCase().endsWith("pct")) return `${value}%`;
  if (Array.isArray(value)) return `${value.length}`;
  if (typeof value === "object") return "—";
  return String(value);
}

function humanizeKey(key: string): string {
  const withoutSuffix = key.replace(/Cents$|Pct$/i, "");
  return withoutSuffix.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

function MetricsList({ metrics }: { metrics: Record<string, unknown> }) {
  const scalarEntries = Object.entries(metrics).filter(([, v]) => !Array.isArray(v) && typeof v !== "object");
  if (scalarEntries.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {scalarEntries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{humanizeKey(key)}</dt>
          <dd className="font-semibold text-foreground">{formatMetricValue(key, value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function IssueCard({ issue, anchorId }: { issue: Issue; anchorId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm" id={anchorId} data-testid={`issue-card-${issue.id}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{CATEGORY_LABELS[issue.category] ?? issue.category}</p>
          <h3 className="font-serif text-lg font-bold text-foreground">{issue.title}</h3>
        </div>
        <SeverityBadge severity={issue.severity} />
      </div>

      <p className="mb-3 text-xs text-muted">
        Period: <strong>{issue.sourcePeriod.start}</strong> to <strong>{issue.sourcePeriod.end}</strong>
        {issue.comparisonPeriod && (
          <>
            {" "}
            · Comparison: <strong>{issue.comparisonPeriod.start}</strong> to <strong>{issue.comparisonPeriod.end}</strong>
          </>
        )}
      </p>

      <MetricsList metrics={issue.metrics} />

      <p className="mt-3 rounded-md bg-background px-3 py-2 font-mono text-[11px] text-muted">{issue.formula}</p>

      <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Suggested next step</p>
        <p className="mt-0.5 text-sm text-foreground">{issue.suggestedNextStep}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
        <span className="rounded-full border border-border px-2.5 py-1 text-foreground" data-testid={`impact-${issue.impact}`}>
          Impact: {issue.impact}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-foreground" data-testid={`effort-${issue.effort}`}>
          Effort: {issue.effort}
        </span>
        <ConfidenceBadge confidence={issue.confidence} />
      </div>

      {issue.caveats.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-muted">
          {issue.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      {issue.relatedRecords.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted">Evidence</h4>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {issue.relatedRecords.map((r, i) => (
              <li key={`${r.type}-${r.id}-${i}`}>
                <Link href={r.path} className="text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded">
                  {r.type} record
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScorecardCard({ scorecard, issues }: { scorecard: Scorecard; issues: Issue[] }) {
  const related = issues.filter((i) => scorecard.relatedIssueIds.includes(i.id));
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm" data-testid={`scorecard-${scorecard.id}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="font-serif text-base font-bold text-foreground">{scorecard.title}</h2>
        <ScorecardStatusBadge status={scorecard.status} />
      </div>
      {scorecard.status === "insufficient_data" ? (
        <p className="text-xs text-muted" data-testid={`scorecard-unavailable-${scorecard.id}`}>
          Not enough recorded data to assess this yet.
        </p>
      ) : (
        <MetricsList metrics={scorecard.metrics} />
      )}
      <div className="mt-2 flex items-center justify-between">
        <ConfidenceBadge confidence={scorecard.confidence} />
        {related.length > 0 && (
          <a href={`#issue-${related[0].id}`} className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded">
            View {related.length} issue{related.length > 1 ? "s" : ""}
          </a>
        )}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm" data-testid={`insight-card-${insight.id}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-base font-bold text-foreground">{insight.title}</h3>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{insight.kind === "fact" ? "Fact" : "Calculation"}</p>
        </div>
        <ConfidenceBadge confidence={insight.confidence} />
      </div>
      {insight.unavailableReason ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{insight.unavailableReason}</div>
      ) : (
        <>
          <MetricsList metrics={insight.metrics} />
          {insight.formula && <p className="mt-3 rounded-md bg-background px-3 py-2 font-mono text-[11px] text-muted">{insight.formula}</p>}
        </>
      )}
    </div>
  );
}

function lastDayOfMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function IssueSection({ id, title, issues }: { id: string; title: string; issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-lg font-bold">
        {title} <span className="text-sm font-normal text-muted">({issues.length})</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} anchorId={`issue-${issue.id}`} />
        ))}
      </div>
    </section>
  );
}

export default function GrowthPage() {
  const { token } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const [appliedRange, setAppliedRange] = useState<{ periodStart: string; periodEnd: string } | null>(null);
  const [monthStartInput, setMonthStartInput] = useState("");
  const [monthEndInput, setMonthEndInput] = useState("");
  const [showFacts, setShowFacts] = useState(false);

  const queryString = useMemo(() => {
    if (!appliedRange) return "";
    const params = new URLSearchParams({ periodStart: appliedRange.periodStart, periodEnd: appliedRange.periodEnd });
    return `?${params.toString()}`;
  }, [appliedRange]);

  const briefQuery = useQuery<DecisionBriefResponse>({
    queryKey: ["growth-decision-brief", token, queryString],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/growth/decision-brief${queryString}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load the Growth Intelligence decision brief");
      }
      return res.json();
    },
    enabled: !!token,
  });

  const factsQuery = useQuery<GrowthSummaryResponse>({
    queryKey: ["growth-summary", token, queryString],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/growth/summary${queryString}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load underlying facts");
      return res.json();
    },
    enabled: !!token && showFacts,
  });

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthStartInput || !monthEndInput) return;
    setAppliedRange({
      periodStart: `${monthStartInput}-01`,
      periodEnd: `${monthEndInput}-${String(lastDayOfMonth(monthEndInput)).padStart(2, "0")}`,
    });
  };

  const handleResetRange = () => {
    setAppliedRange(null);
    setMonthStartInput("");
    setMonthEndInput("");
  };

  const data = briefQuery.data;
  const allIssues = data ? [...data.criticalIssues, ...data.warnings, ...data.watchItems] : [];
  const hasAnyIssues = allIssues.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* 1. Page heading and internal-data disclosure */}
        <div className="mb-6 border-b border-border pb-6">
          <h1 className="text-2xl font-bold">Growth Intelligence</h1>
          <p className="mt-1 text-sm font-semibold text-muted">Portfolio decision brief</p>
          <p className="mt-2 max-w-2xl text-sm text-muted" data-testid="growth-disclosure">
            Based on internal Odyssey data. This view is built only from records already stored in Odyssey — it does not
            use external market data and does not make pricing recommendations.
          </p>
        </div>

        <form
          onSubmit={handleApplyCustomRange}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
          aria-label="Growth period selection"
        >
          <label className="text-xs">
            Period start month
            <input
              type="month"
              aria-label="Period start month"
              value={monthStartInput}
              onChange={(e) => setMonthStartInput(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded border border-border p-2"
            />
          </label>
          <label className="text-xs">
            Period end month
            <input
              type="month"
              aria-label="Period end month"
              value={monthEndInput}
              onChange={(e) => setMonthEndInput(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded border border-border p-2"
            />
          </label>
          <button
            type="submit"
            disabled={!monthStartInput || !monthEndInput}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Apply custom range
          </button>
          {appliedRange && (
            <button
              type="button"
              onClick={handleResetRange}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset to default
            </button>
          )}
          {data && (
            <p className="w-full text-xs text-muted" data-testid="growth-period-display">
              Showing <strong>{data.period.label}</strong>: {data.period.start} to {data.period.end}. Comparing to{" "}
              <strong>{data.comparisonPeriod.label}</strong>: {data.comparisonPeriod.start} to {data.comparisonPeriod.end}.
            </p>
          )}
        </form>

        <div aria-live="polite" className="sr-only">
          {briefQuery.isLoading ? "Loading decision brief" : briefQuery.isError ? "Decision brief failed to load" : "Decision brief loaded"}
        </div>

        {briefQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : briefQuery.isError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger" data-testid="growth-error-state">
            {(briefQuery.error as Error)?.message || "Unable to load the Growth Intelligence decision brief. Please try again."}
          </div>
        ) : !data ? null : (
          <>
            {/* 2. Four scorecards */}
            <section aria-labelledby="scorecards-heading">
              <h2 id="scorecards-heading" className="sr-only">
                Executive scorecards
              </h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="scorecards-row">
                {data.scorecards.map((sc) => (
                  <ScorecardCard key={sc.id} scorecard={sc} issues={allIssues} />
                ))}
              </div>
            </section>

            {!hasAnyIssues ? (
              <div className="mt-8 rounded-xl border border-border bg-white py-16 text-center" data-testid="growth-empty-state">
                <TrendingUp className="mx-auto mb-3 h-12 w-12 text-muted" aria-hidden="true" />
                <h2 className="font-bold">No issues found for this period</h2>
                <p className="mt-1 text-sm text-muted">Nothing crossed a review threshold based on the data currently recorded.</p>
              </div>
            ) : (
              <>
                {/* 3. Where to start */}
                {data.whereToStart.length > 0 && (
                  <section className="mt-8" aria-labelledby="where-to-start-heading">
                    <h2 id="where-to-start-heading" className="mb-3 text-lg font-bold">
                      Where to start
                    </h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="where-to-start">
                      {data.whereToStart.map((issue) => (
                        <IssueCard key={`start-${issue.id}`} issue={issue} />
                      ))}
                    </div>
                  </section>
                )}

                {/* 4-6. Critical / Warnings / Watch */}
                <IssueSection id="critical-issues-heading" title="Critical Issues" issues={data.criticalIssues} />
                <IssueSection id="warnings-heading" title="Warnings" issues={data.warnings} />
                <IssueSection id="watch-items-heading" title="Watch Items" issues={data.watchItems} />
              </>
            )}

            {/* 7. Supporting evidence layer (existing Growth Facts) */}
            <section className="mt-10 border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setShowFacts((v) => !v)}
                aria-expanded={showFacts}
                aria-controls="underlying-facts"
                className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded"
                data-testid="toggle-underlying-facts"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showFacts ? "rotate-180" : ""}`} aria-hidden="true" />
                Underlying portfolio facts
              </button>
              {showFacts && (
                <div id="underlying-facts" className="mt-4">
                  {factsQuery.isLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                    </div>
                  ) : factsQuery.isError ? (
                    <p className="text-sm text-danger">Unable to load underlying facts.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {factsQuery.data?.insights.map((insight) => (
                        <InsightCard key={insight.id} insight={insight} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
