import { db, units, leases } from "@odyssey/db";
import { and, eq, isNull, gte } from "drizzle-orm";
import type { GrowthSummaryQueryInput } from "@odyssey/validation";
import {
  type CalendarDate,
  type Confidence,
  type CoverageDetail,
  type PeriodCoverageResult,
  type PeriodRange,
  type PropertyMonthlyBreakdown,
  type ExpenseCategoryBreakdown,
  type ActiveLeaseExpiry,
  type OrgUnitStatus,
  type RelatedRecord,
  validateAndResolveRange,
  todayUTC,
  cdToISODate,
  totalsForPeriod,
  worstCoverageForPeriod,
  fetchActiveLeaseExpiries,
  fetchOrgUnits,
  SCHEDULED_RENT_CAVEAT,
} from "./growth";

// ---------------------------------------------------------------------------
// This module is a deterministic rule engine only. There is no LLM, no
// external call, and no persistence — every function here is either a pure
// function of its inputs or a thin data-gathering wrapper around growth.ts's
// existing exported helpers (never the /growth HTTP endpoint itself).
// ---------------------------------------------------------------------------

export type Severity = "critical" | "warning" | "watch";
export type IssueCategory =
  | "collections"
  | "cash_flow"
  | "expenses"
  | "vacancy"
  | "lease_expiry"
  | "recorded_market_rent"
  | "data_quality";
export type Impact = "low" | "medium" | "high";
export type Effort = "low" | "medium";

// severity -> display label used in the UI ("warning" is shown as "Needs
// attention" to match the rule-threshold naming this feature was approved
// with; the API value itself stays the plain critical|warning|watch enum).
export const SEVERITY_DISPLAY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Needs attention",
  watch: "Watch",
};

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 4, warning: 3, watch: 2 };

const EFFORT_BY_CATEGORY: Record<IssueCategory, Effort> = {
  collections: "low",
  cash_flow: "medium",
  expenses: "medium",
  vacancy: "medium",
  lease_expiry: "medium",
  recorded_market_rent: "low",
  data_quality: "low",
};

function impactForSeverity(category: IssueCategory, severity: Severity): Impact {
  // Recorded market rent is capped at "low" impact regardless of severity —
  // deliberate, matching its always-"watch" severity cap: the underlying
  // figure is self-reported and unverified, so it should never read as a
  // high-stakes finding no matter the dollar gap.
  if (category === "recorded_market_rent") return "low";
  return severity === "critical" ? "high" : severity === "warning" ? "medium" : "low";
}

function isUsableConfidence(c: Confidence): boolean {
  return c === "summary_only" || c === "partial_detail" || c === "detail_complete";
}

function formatDollars(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface Issue {
  id: string;
  title: string;
  category: IssueCategory;
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

export interface SuppressedRule {
  id: string;
  category: IssueCategory;
  reason: string;
}

interface RuleResult {
  issue: Issue | null;
  suppressedReason: string | null;
}

// ---------------------------------------------------------------------------
// Rule 1 — collection shortfall
// ---------------------------------------------------------------------------

export interface PeriodFinancials {
  periodLabel: { start: string; end: string };
  scheduledRentCents: number;
  collectedRentCents: number;
  expenseCents: number;
  collectionRatePct: number | null;
  byProperty: PropertyMonthlyBreakdown[];
  byExpenseCategory: ExpenseCategoryBreakdown[];
  confidence: Confidence;
}

export function evaluateCollectionShortfall(period: PeriodFinancials): RuleResult {
  if (period.scheduledRentCents === 0) {
    return { issue: null, suppressedReason: "No scheduled rent in this period (no active/ended/renewed leases)." };
  }
  if (!isUsableConfidence(period.confidence)) {
    return { issue: null, suppressedReason: `Financial coverage for this period is ${period.confidence}; collection shortfall cannot be responsibly assessed.` };
  }
  const rate = period.collectionRatePct;
  if (rate === null) return { issue: null, suppressedReason: "Collection rate is unavailable for this period." };

  let severity: Severity | null = null;
  let band = "";
  if (rate < 75.0) { severity = "critical"; band = "below 75.0%"; }
  else if (rate < 90.0) { severity = "warning"; band = "75.0%–89.9%"; }
  else if (rate < 95.0) { severity = "watch"; band = "90.0%–94.9%"; }

  if (!severity) return { issue: null, suppressedReason: `Collection rate ${rate.toFixed(1)}% is at or above the 95.0% healthy threshold.` };

  const shortfallCents = Math.max(period.scheduledRentCents - period.collectedRentCents, 0);
  const relatedRecords: RelatedRecord[] = period.byProperty
    .filter((p) => p.scheduledRentCents > p.collectedRentCents)
    .map((p) => ({ type: "property", id: p.propertyId, path: `/properties/${p.propertyId}` }));

  return {
    issue: {
      id: "collection-shortfall",
      title: "Collections below target this period",
      category: "collections",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * shortfallCents,
      rankingMagnitude: shortfallCents,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × shortfall of ${formatDollars(shortfallCents)} between scheduled and collected rent`,
      sourcePeriod: period.periodLabel,
      comparisonPeriod: null,
      metrics: {
        scheduledRentCents: period.scheduledRentCents,
        collectedRentCents: period.collectedRentCents,
        collectionRatePct: rate,
        shortfallCents,
      },
      formula: `collectionRatePct = collectedRentCents / scheduledRentCents × 100. ${rate.toFixed(1)}% falls in the ${band} band.`,
      confidence: period.confidence,
      comparisonConfidence: null,
      caveats: [SCHEDULED_RENT_CAVEAT],
      relatedRecords,
      suggestedNextStep: "Review the property's collection records and outstanding balances for the selected period.",
      impact: impactForSeverity("collections", severity),
      effort: EFFORT_BY_CATEGORY.collections,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 2 — worsening collection rate
// ---------------------------------------------------------------------------

export function evaluateWorseningCollectionRate(period: PeriodFinancials, comparison: PeriodFinancials): RuleResult {
  if (period.collectionRatePct === null || comparison.collectionRatePct === null) {
    return { issue: null, suppressedReason: "Collection rate is unavailable for the primary or comparison period." };
  }
  if (!isUsableConfidence(period.confidence) || !isUsableConfidence(comparison.confidence)) {
    return { issue: null, suppressedReason: "Financial coverage is not usable for the primary or comparison period." };
  }

  const declinePts = comparison.collectionRatePct - period.collectionRatePct;
  let severity: Severity | null = null;
  if (declinePts >= 15.0) severity = "critical";
  else if (declinePts >= 10.0) severity = "warning";
  else if (declinePts >= 5.0) severity = "watch";

  if (!severity) return { issue: null, suppressedReason: `Collection rate change (${declinePts.toFixed(1)}pt) is below the 5.0pt watch threshold.` };

  const magnitude = Math.round(declinePts * period.scheduledRentCents);

  return {
    issue: {
      id: "worsening-collection-rate",
      title: "Collection rate declining vs. prior period",
      category: "collections",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * Math.abs(magnitude),
      rankingMagnitude: Math.abs(magnitude),
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × (decline of ${declinePts.toFixed(1)}pts × scheduled rent ${formatDollars(period.scheduledRentCents)})`,
      sourcePeriod: period.periodLabel,
      comparisonPeriod: comparison.periodLabel,
      metrics: {
        collectionRatePct: period.collectionRatePct,
        comparisonCollectionRatePct: comparison.collectionRatePct,
        declinePts: Math.round(declinePts * 10) / 10,
      },
      formula: `declinePts = comparisonCollectionRatePct − collectionRatePct. ${declinePts.toFixed(1)}pt decline falls in the ${severity === "critical" ? "15.0+" : severity === "warning" ? "10.0–14.9" : "5.0–9.9"}pt band.`,
      confidence: period.confidence,
      comparisonConfidence: comparison.confidence,
      caveats: [SCHEDULED_RENT_CAVEAT],
      relatedRecords: [],
      suggestedNextStep: `Compare payment timeliness between ${comparison.periodLabel.start}–${comparison.periodLabel.end} and ${period.periodLabel.start}–${period.periodLabel.end} to identify which properties shifted.`,
      impact: impactForSeverity("collections", severity),
      effort: EFFORT_BY_CATEGORY.collections,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 3 — declining net cash flow
// ---------------------------------------------------------------------------

export function evaluateDecliningNetCashFlow(period: PeriodFinancials, comparison: PeriodFinancials): RuleResult {
  if (!isUsableConfidence(period.confidence) || !isUsableConfidence(comparison.confidence)) {
    return { issue: null, suppressedReason: "Financial coverage is not usable for the primary or comparison period." };
  }

  const netCashFlow = period.collectedRentCents - period.expenseCents;
  const comparisonNetCashFlow = comparison.collectedRentCents - comparison.expenseCents;

  let severity: Severity | null = null;
  let declinePct = 0;
  const turnedNegative = comparisonNetCashFlow > 0 && netCashFlow <= 0;

  if (comparisonNetCashFlow > 0) {
    declinePct = ((comparisonNetCashFlow - netCashFlow) / comparisonNetCashFlow) * 100;
    if (turnedNegative || declinePct >= 30.0) severity = "critical";
    else if (declinePct >= 15.0) severity = "warning";
    else if (declinePct >= 10.0) severity = "watch";
  } else if (comparisonNetCashFlow <= 0 && netCashFlow < comparisonNetCashFlow) {
    // Baseline was already break-even/negative and it got worse in absolute terms.
    severity = "warning";
    declinePct = 0;
  }

  if (!severity) return { issue: null, suppressedReason: "Net cash flow did not decline enough to trigger a finding." };

  const magnitude = Math.abs(comparisonNetCashFlow - netCashFlow);

  return {
    issue: {
      id: "declining-net-cash-flow",
      title: "Net cash flow trending down",
      category: "cash_flow",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * magnitude,
      rankingMagnitude: magnitude,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × cash flow change of ${formatDollars(magnitude)}`,
      sourcePeriod: period.periodLabel,
      comparisonPeriod: comparison.periodLabel,
      metrics: {
        netCashFlowCents: netCashFlow,
        comparisonNetCashFlowCents: comparisonNetCashFlow,
        declinePct: Math.round(declinePct * 10) / 10,
        turnedNegative,
      },
      formula: turnedNegative
        ? "netCashFlowCents turned negative or zero after being positive in the comparison period."
        : `declinePct = (comparisonNetCashFlowCents − netCashFlowCents) / comparisonNetCashFlowCents × 100. ${declinePct.toFixed(1)}% decline.`,
      confidence: period.confidence,
      comparisonConfidence: comparison.confidence,
      caveats: [],
      relatedRecords: [],
      suggestedNextStep: "Review the monthly cash flow breakdown to identify which months or expense categories are driving the change.",
      impact: impactForSeverity("cash_flow", severity),
      effort: EFFORT_BY_CATEGORY.cash_flow,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 4 — material expense increase
// ---------------------------------------------------------------------------

export function evaluateMaterialExpenseIncrease(period: PeriodFinancials, comparison: PeriodFinancials): RuleResult {
  if (!isUsableConfidence(period.confidence) || !isUsableConfidence(comparison.confidence)) {
    return { issue: null, suppressedReason: "Financial coverage is not usable for the primary or comparison period." };
  }

  const deltaCents = period.expenseCents - comparison.expenseCents;
  if (deltaCents < 20000) {
    // $200.00 absolute floor, checked before any percentage band.
    return { issue: null, suppressedReason: `Expense increase of ${formatDollars(Math.max(deltaCents, 0))} is under the $200.00 materiality floor.` };
  }

  let severity: Severity | null = null;
  let increasePct: number;
  if (comparison.expenseCents > 0) {
    increasePct = (deltaCents / comparison.expenseCents) * 100;
    if (increasePct >= 50.0) severity = "critical";
    else if (increasePct >= 30.0) severity = "warning";
    else if (increasePct >= 20.0) severity = "watch";
  } else {
    // New expense activity where the comparison period had none recorded.
    increasePct = 100;
    severity = "watch";
  }

  if (!severity) return { issue: null, suppressedReason: `Expense increase of ${increasePct.toFixed(1)}% is below the 20.0% watch threshold.` };

  const categoryEvidence = period.byExpenseCategory
    .map((c) => {
      const comparisonCategory = comparison.byExpenseCategory.find((cc) => cc.category === c.category);
      return { category: c.category, expenseCents: c.expenseCents, comparisonExpenseCents: comparisonCategory?.expenseCents ?? 0 };
    })
    .filter((c) => c.expenseCents > c.comparisonExpenseCents)
    .sort((a, b) => (b.expenseCents - b.comparisonExpenseCents) - (a.expenseCents - a.comparisonExpenseCents));

  const relatedRecords: RelatedRecord[] = period.byProperty
    .filter((p) => p.expenseCents > 0)
    .map((p) => ({ type: "property", id: p.propertyId, path: `/properties/${p.propertyId}` }));

  return {
    issue: {
      id: "material-expense-increase",
      title: "Operating expenses up materially vs. prior period",
      category: "expenses",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * deltaCents,
      rankingMagnitude: deltaCents,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × expense increase of ${formatDollars(deltaCents)}`,
      sourcePeriod: period.periodLabel,
      comparisonPeriod: comparison.periodLabel,
      metrics: {
        expenseCents: period.expenseCents,
        comparisonExpenseCents: comparison.expenseCents,
        increasePct: Math.round(increasePct * 10) / 10,
        deltaCents,
        byCategory: categoryEvidence,
      },
      formula: `increasePct = (expenseCents − comparisonExpenseCents) / comparisonExpenseCents × 100. ${increasePct.toFixed(1)}% increase, ${formatDollars(deltaCents)} above the $200.00 floor.`,
      confidence: period.confidence,
      comparisonConfidence: comparison.confidence,
      caveats: [],
      relatedRecords,
      suggestedNextStep: `Review the expense ledger for ${period.periodLabel.start}–${period.periodLabel.end} to see which categories or properties changed.`,
      impact: impactForSeverity("expenses", severity),
      effort: EFFORT_BY_CATEGORY.expenses,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 5 — vacancy and notice exposure
// ---------------------------------------------------------------------------

export interface OccupancySnapshot {
  occupied: number;
  vacant: number;
  noticeGiven: number;
  offline: number;
  totalUnits: number;
  vacantOrNoticeUnits: OrgUnitStatus[];
  sourcePeriod: { start: string; end: string };
}

export function evaluateVacancyNoticeExposure(snapshot: OccupancySnapshot): RuleResult {
  if (snapshot.totalUnits === 0) {
    return { issue: null, suppressedReason: "No units recorded for this organization." };
  }

  const exposedCount = snapshot.vacant + snapshot.noticeGiven;
  const ratioPct = (exposedCount / snapshot.totalUnits) * 100;

  let severity: Severity | null = null;
  if (ratioPct >= 30.0) severity = "critical";
  else if (ratioPct >= 20.0) severity = "warning";
  else if (ratioPct >= 15.0) severity = "watch";

  if (!severity) return { issue: null, suppressedReason: `Vacancy/notice ratio ${ratioPct.toFixed(1)}% is below the 15.0% watch threshold.` };

  const relatedRecords: RelatedRecord[] = snapshot.vacantOrNoticeUnits.map((u) => ({ type: "unit", id: u.id, path: `/properties/${u.propertyId}` }));

  return {
    issue: {
      id: "vacancy-notice-exposure",
      title: "Vacancy and notice-given exposure",
      category: "vacancy",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * exposedCount,
      rankingMagnitude: exposedCount,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × ${exposedCount} vacant/notice-given unit(s)`,
      sourcePeriod: snapshot.sourcePeriod,
      comparisonPeriod: null,
      metrics: {
        occupied: snapshot.occupied,
        vacant: snapshot.vacant,
        noticeGiven: snapshot.noticeGiven,
        offline: snapshot.offline,
        totalUnits: snapshot.totalUnits,
        exposedRatioPct: Math.round(ratioPct * 10) / 10,
      },
      formula: `exposedRatioPct = (vacant + noticeGiven) / totalUnits × 100. ${ratioPct.toFixed(1)}% falls in the ${severity === "critical" ? "30.0+" : severity === "warning" ? "20.0–29.9" : "15.0–19.9"}% band.`,
      confidence: "unavailable",
      comparisonConfidence: null,
      caveats: ["Occupancy is a current point-in-time snapshot, not a coverage-tracked financial figure."],
      relatedRecords,
      suggestedNextStep: "Review vacant and notice-given units to plan re-listing or renewal outreach.",
      impact: impactForSeverity("vacancy", severity),
      effort: EFFORT_BY_CATEGORY.vacancy,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 6 — lease-expiry concentration
// ---------------------------------------------------------------------------

function bucketTag(days: number): "30" | "60" | "90" {
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  return "90";
}

export function evaluateLeaseExpiryConcentration(expiries: ActiveLeaseExpiry[], today: CalendarDate): RuleResult {
  if (expiries.length === 0) {
    return { issue: null, suppressedReason: "No active leases recorded for this organization." };
  }

  const upcoming = expiries.filter((l) => l.daysUntilExpiry >= 0);
  const within30 = upcoming.filter((l) => l.daysUntilExpiry <= 30);
  const within60 = upcoming.filter((l) => l.daysUntilExpiry <= 60);
  const within90 = upcoming.filter((l) => l.daysUntilExpiry <= 90);

  let severity: Severity | null = null;
  if (within30.length >= 2 || within60.length >= 3) severity = "critical";
  else if (within30.length === 1 || (within60.length >= 1 && within60.length <= 2) || within90.length >= 4) severity = "warning";
  else if (within90.length >= 1) severity = "watch";

  if (!severity) return { issue: null, suppressedReason: "No active leases expiring within the next 90 days." };

  const magnitude = within30.length * 3 + within60.length * 2 + within90.length * 1;
  const relatedRecords: RelatedRecord[] = within90.map((l) => ({ type: "lease", id: l.id, path: `/leases/${l.id}` }));

  return {
    issue: {
      id: "lease-expiry-concentration",
      title: "Multiple leases expiring soon",
      category: "lease_expiry",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * magnitude,
      rankingMagnitude: magnitude,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × weighted expiry concentration (${within30.length}×3 + ${within60.length}×2 + ${within90.length}×1)`,
      sourcePeriod: { start: cdToISODate(today), end: cdToISODate(today) },
      comparisonPeriod: null,
      metrics: {
        expiringWithin30: within30.length,
        expiringWithin60: within60.length,
        expiringWithin90: within90.length,
        leases: within90.map((l) => ({ id: l.id, unitNumber: l.unitNumber, daysUntilExpiry: l.daysUntilExpiry, bucket: bucketTag(l.daysUntilExpiry) })),
      },
      formula: "daysUntilExpiry uses explicit UTC calendar-date arithmetic (does not change the existing /leases page's own calculation); counts are cumulative (within 60 days includes leases within 30 days).",
      confidence: "unavailable",
      comparisonConfidence: null,
      caveats: [],
      relatedRecords,
      suggestedNextStep: "Begin renewal conversations for leases expiring within 30–60 days.",
      impact: impactForSeverity("lease_expiry", severity),
      effort: EFFORT_BY_CATEGORY.lease_expiry,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 7 — recorded market-rent gap (severity always capped at "watch")
// ---------------------------------------------------------------------------

const MARKET_RENT_CAVEAT =
  "Recorded market rent is owner-entered directly in Odyssey and is not independently sourced or verified against any external market data.";

export function evaluateRecordedMarketRentGap(input: {
  unitId: string;
  unitNumber: string;
  propertyId: string;
  leaseId: string;
  currentMonthlyRentCents: number;
  recordedMarketRentCents: number;
  sourcePeriod: { start: string; end: string };
}): RuleResult {
  const gapCents = input.recordedMarketRentCents - input.currentMonthlyRentCents;
  if (Math.abs(gapCents) < 5000) {
    return { issue: null, suppressedReason: `Recorded gap of ${formatDollars(gapCents)} is under the $50.00/month floor.` };
  }

  return {
    issue: {
      id: `recorded-market-rent-gap-${input.unitId}`,
      title: "Recorded market rent gap",
      category: "recorded_market_rent",
      severity: "watch",
      priorityScore: SEVERITY_WEIGHT.watch * Math.abs(gapCents) * 0.5,
      rankingMagnitude: Math.abs(gapCents) * 0.5,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT.watch}) × half-weighted gap of ${formatDollars(Math.abs(gapCents))} (down-weighted — figure is self-reported, not independently verified)`,
      sourcePeriod: input.sourcePeriod,
      comparisonPeriod: null,
      metrics: {
        currentMonthlyRentCents: input.currentMonthlyRentCents,
        recordedMarketRentCents: input.recordedMarketRentCents,
        recordedGapCents: gapCents,
      },
      formula: "recorded market rent − current rent = recorded gap",
      confidence: "unavailable",
      comparisonConfidence: null,
      caveats: [MARKET_RENT_CAVEAT],
      relatedRecords: [
        { type: "unit", id: input.unitId, path: `/properties/${input.propertyId}` },
        { type: "lease", id: input.leaseId, path: `/leases/${input.leaseId}` },
      ],
      suggestedNextStep: `Confirm the recorded market rent figure for unit ${input.unitNumber} is current before using it in any decision.`,
      impact: impactForSeverity("recorded_market_rent", "watch"),
      effort: EFFORT_BY_CATEGORY.recorded_market_rent,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Rule 8 — data quality
// ---------------------------------------------------------------------------

export function evaluateDataQuality(
  periodCoverage: PeriodCoverageResult,
  comparisonCoverage: PeriodCoverageResult,
  sourcePeriod: { start: string; end: string },
  comparisonPeriodLabel: { start: string; end: string }
): RuleResult {
  const allDetails: CoverageDetail[] = [...periodCoverage.details, ...comparisonCoverage.details];
  if (allDetails.length === 0) {
    return { issue: null, suppressedReason: "No properties recorded for this organization." };
  }

  const hasNeedsReview = allDetails.some((d) => d.state === "needs_review");
  const hasNoData = allDetails.some((d) => d.state === "no_data");
  const hasSummaryOnly = allDetails.some((d) => d.state === "summary_only");
  const hasPartialDetail = allDetails.some((d) => d.state === "partial_detail");

  let severity: Severity | null = null;
  let worstStates: string[] = [];
  if (hasNeedsReview || hasNoData) {
    severity = "critical";
    worstStates = [...(hasNeedsReview ? ["needs_review"] : []), ...(hasNoData ? ["no_data"] : [])];
  } else if (hasSummaryOnly) {
    severity = "warning";
    worstStates = ["summary_only"];
  } else if (hasPartialDetail) {
    severity = "watch";
    worstStates = ["partial_detail"];
  }

  if (!severity) return { issue: null, suppressedReason: "All included property-months are detail_complete." };

  const affected = allDetails.filter((d) => worstStates.includes(d.state));
  const affectedPropertyIds = Array.from(new Set(affected.map((d) => d.propertyId)));
  const relatedRecords: RelatedRecord[] = [
    { type: "reconciliation", id: "reconciliation", path: "/reconciliation" },
    ...affectedPropertyIds.map((id) => ({ type: "property", id, path: `/properties/${id}` })),
  ];

  return {
    issue: {
      id: "data-quality-gap",
      title: "Financial data needs review",
      category: "data_quality",
      severity,
      priorityScore: SEVERITY_WEIGHT[severity] * affected.length,
      rankingMagnitude: affected.length,
      rankingExplanation: `severity weight (${SEVERITY_WEIGHT[severity]}) × ${affected.length} affected property-month(s)`,
      sourcePeriod,
      comparisonPeriod: comparisonPeriodLabel,
      metrics: {
        affectedPropertyMonths: affected.length,
        states: worstStates,
        detail: affected.map((d) => ({ propertyId: d.propertyId, month: d.month, state: d.state })),
      },
      formula: "Severity reflects the worst coverage state found across the primary and comparison periods (needs_review and no_data are both critical).",
      confidence: "unavailable",
      comparisonConfidence: null,
      caveats: [],
      relatedRecords,
      suggestedNextStep: "Review reconciliation coverage for the affected months and properties.",
      impact: impactForSeverity("data_quality", severity),
      effort: EFFORT_BY_CATEGORY.data_quality,
    },
    suppressedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export type ScorecardStatus = "strong" | "watch" | "needs_attention" | "critical" | "insufficient_data";

export interface Scorecard {
  id: "portfolio-health" | "collections-risk" | "lease-vacancy-exposure" | "cash-flow-momentum";
  title: string;
  status: ScorecardStatus;
  metrics: Record<string, unknown>;
  confidence: Confidence;
  relatedIssueIds: string[];
}

const STATUS_RANK: Record<Exclude<ScorecardStatus, "insufficient_data">, number> = {
  strong: 0,
  watch: 1,
  needs_attention: 2,
  critical: 3,
};

function severityToStatus(s: Severity): Exclude<ScorecardStatus, "insufficient_data"> {
  return s === "critical" ? "critical" : s === "warning" ? "needs_attention" : "watch";
}

function worstStatus(statuses: Exclude<ScorecardStatus, "insufficient_data">[]): Exclude<ScorecardStatus, "insufficient_data"> {
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), "strong" as Exclude<ScorecardStatus, "insufficient_data">);
}

function buildCollectionsRiskScorecard(period: PeriodFinancials, comparison: PeriodFinancials, issues: Issue[]): Scorecard {
  const related = issues.filter((i) => i.id === "collection-shortfall" || i.id === "worsening-collection-rate");
  const insufficientData = period.scheduledRentCents === 0 || period.confidence === "no_data";

  return {
    id: "collections-risk",
    title: "Collections Risk",
    status: insufficientData ? "insufficient_data" : worstStatus(related.map((i) => severityToStatus(i.severity))),
    metrics: {
      collectionRatePct: period.collectionRatePct,
      comparisonCollectionRatePct: comparison.collectionRatePct,
    },
    confidence: period.confidence,
    relatedIssueIds: related.map((i) => i.id),
  };
}

function buildLeaseVacancyExposureScorecard(snapshot: OccupancySnapshot, expiring90: number, issues: Issue[]): Scorecard {
  const related = issues.filter((i) => i.id === "vacancy-notice-exposure" || i.id === "lease-expiry-concentration");
  const insufficientData = snapshot.totalUnits === 0;

  return {
    id: "lease-vacancy-exposure",
    title: "Lease & Vacancy Exposure",
    status: insufficientData ? "insufficient_data" : worstStatus(related.map((i) => severityToStatus(i.severity))),
    metrics: {
      occupied: snapshot.occupied,
      vacant: snapshot.vacant,
      noticeGiven: snapshot.noticeGiven,
      totalUnits: snapshot.totalUnits,
      expiringWithin90: expiring90,
    },
    confidence: "unavailable",
    relatedIssueIds: related.map((i) => i.id),
  };
}

function buildCashFlowMomentumScorecard(period: PeriodFinancials, comparison: PeriodFinancials, issues: Issue[]): Scorecard {
  const related = issues.filter((i) => i.id === "declining-net-cash-flow" || i.id === "material-expense-increase");
  const insufficientData = period.confidence === "no_data";

  return {
    id: "cash-flow-momentum",
    title: "Cash Flow Momentum",
    status: insufficientData ? "insufficient_data" : worstStatus(related.map((i) => severityToStatus(i.severity))),
    metrics: {
      netCashFlowCents: period.collectedRentCents - period.expenseCents,
      comparisonNetCashFlowCents: comparison.collectedRentCents - comparison.expenseCents,
      expenseCents: period.expenseCents,
      comparisonExpenseCents: comparison.expenseCents,
    },
    confidence: period.confidence,
    relatedIssueIds: related.map((i) => i.id),
  };
}

function buildPortfolioHealthScorecard(
  collectionsRisk: Scorecard,
  leaseVacancy: Scorecard,
  cashFlow: Scorecard,
  dataQualityIssue: Issue | null
): Scorecard {
  const componentStatuses = [collectionsRisk.status, leaseVacancy.status, cashFlow.status];
  if (componentStatuses.includes("insufficient_data")) {
    return {
      id: "portfolio-health",
      title: "Portfolio Health",
      status: "insufficient_data",
      metrics: { collectionsRisk: collectionsRisk.status, leaseVacancyExposure: leaseVacancy.status, cashFlowMomentum: cashFlow.status },
      confidence: "unavailable",
      relatedIssueIds: [],
    };
  }

  const ranks = componentStatuses.map((s) => STATUS_RANK[s as Exclude<ScorecardStatus, "insufficient_data">]);
  let rollup = ranks.reduce((worst, r) => Math.max(worst, r), STATUS_RANK.strong);

  // Explicit floor, defensive even though max-rollup already guarantees this:
  // a critical data-quality issue can never let Portfolio Health read better
  // than "Needs attention".
  if (dataQualityIssue?.severity === "critical") {
    rollup = Math.max(rollup, STATUS_RANK.needs_attention);
  }

  const statusEntries = Object.entries(STATUS_RANK) as [Exclude<ScorecardStatus, "insufficient_data">, number][];
  const status = statusEntries.find(([, rank]) => rank === rollup)![0];

  return {
    id: "portfolio-health",
    title: "Portfolio Health",
    status,
    metrics: { collectionsRisk: collectionsRisk.status, leaseVacancyExposure: leaseVacancy.status, cashFlowMomentum: cashFlow.status },
    confidence: "unavailable",
    relatedIssueIds: dataQualityIssue ? [dataQualityIssue.id] : [],
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface DecisionBriefResponse {
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

function toPeriodFinancials(
  totals: { totals: { scheduledRentCents: number; collectedRentCents: number; expenseCents: number }; byProperty: PropertyMonthlyBreakdown[]; byExpenseCategory: ExpenseCategoryBreakdown[] },
  coverage: PeriodCoverageResult,
  range: PeriodRange
): PeriodFinancials {
  const collectionRatePct =
    totals.totals.scheduledRentCents > 0 ? Math.round((totals.totals.collectedRentCents / totals.totals.scheduledRentCents) * 1000) / 10 : null;
  return {
    periodLabel: { start: cdToISODate(range.start), end: cdToISODate(range.end) },
    scheduledRentCents: totals.totals.scheduledRentCents,
    collectedRentCents: totals.totals.collectedRentCents,
    expenseCents: totals.totals.expenseCents,
    collectionRatePct,
    byProperty: totals.byProperty,
    byExpenseCategory: totals.byExpenseCategory,
    confidence: coverage.worst,
  };
}

export async function getDecisionBrief(orgId: string, query: GrowthSummaryQueryInput): Promise<DecisionBriefResponse> {
  const { period, comparisonPeriod } = validateAndResolveRange(query);
  const today = todayUTC();

  const [periodTotals, comparisonTotals, periodCoverage, comparisonCoverage, activeLeaseExpiries, orgUnitsResult, marketRentUnitLeases] =
    await Promise.all([
      totalsForPeriod(orgId, period),
      totalsForPeriod(orgId, comparisonPeriod),
      worstCoverageForPeriod(orgId, period),
      worstCoverageForPeriod(orgId, comparisonPeriod),
      fetchActiveLeaseExpiries(orgId, today),
      fetchOrgUnits(orgId),
      fetchMarketRentGapCandidates(orgId),
    ]);

  const periodFinancials = toPeriodFinancials(periodTotals, periodCoverage, period);
  const comparisonFinancials = toPeriodFinancials(comparisonTotals, comparisonCoverage, comparisonPeriod);

  const occupancyCounts = { occupied: 0, vacant: 0, notice_given: 0, offline: 0 };
  for (const u of orgUnitsResult.allUnits) {
    if (u.status in occupancyCounts) (occupancyCounts as Record<string, number>)[u.status] += 1;
  }
  const snapshot: OccupancySnapshot = {
    occupied: occupancyCounts.occupied,
    vacant: occupancyCounts.vacant,
    noticeGiven: occupancyCounts.notice_given,
    offline: occupancyCounts.offline,
    totalUnits: orgUnitsResult.allUnits.length,
    vacantOrNoticeUnits: orgUnitsResult.vacantOrNotice,
    sourcePeriod: { start: cdToISODate(period.end), end: cdToISODate(period.end) },
  };
  const expiringWithin90 = activeLeaseExpiries.filter((l) => l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= 90).length;

  const suppressed: SuppressedRule[] = [];
  const issues: Issue[] = [];

  const record = (id: string, category: IssueCategory, result: RuleResult) => {
    if (result.issue) issues.push(result.issue);
    else suppressed.push({ id, category, reason: result.suppressedReason ?? "Not triggered." });
  };

  record("collection-shortfall", "collections", evaluateCollectionShortfall(periodFinancials));
  record("worsening-collection-rate", "collections", evaluateWorseningCollectionRate(periodFinancials, comparisonFinancials));
  record("declining-net-cash-flow", "cash_flow", evaluateDecliningNetCashFlow(periodFinancials, comparisonFinancials));
  record("material-expense-increase", "expenses", evaluateMaterialExpenseIncrease(periodFinancials, comparisonFinancials));
  record("vacancy-notice-exposure", "vacancy", evaluateVacancyNoticeExposure(snapshot));
  record("lease-expiry-concentration", "lease_expiry", evaluateLeaseExpiryConcentration(activeLeaseExpiries, today));
  record(
    "data-quality-gap",
    "data_quality",
    evaluateDataQuality(periodCoverage, comparisonCoverage, periodFinancials.periodLabel, comparisonFinancials.periodLabel)
  );

  for (const candidate of marketRentUnitLeases) {
    const result = evaluateRecordedMarketRentGap({
      unitId: candidate.unitId,
      unitNumber: candidate.unitNumber,
      propertyId: candidate.propertyId,
      leaseId: candidate.leaseId,
      currentMonthlyRentCents: candidate.currentMonthlyRentCents,
      recordedMarketRentCents: candidate.recordedMarketRentCents,
      sourcePeriod: { start: cdToISODate(period.end), end: cdToISODate(period.end) },
    });
    record(`recorded-market-rent-gap-${candidate.unitId}`, "recorded_market_rent", result);
  }

  const dataQualityIssue = issues.find((i) => i.id === "data-quality-gap") ?? null;
  const collectionsRisk = buildCollectionsRiskScorecard(periodFinancials, comparisonFinancials, issues);
  const leaseVacancy = buildLeaseVacancyExposureScorecard(snapshot, expiringWithin90, issues);
  const cashFlow = buildCashFlowMomentumScorecard(periodFinancials, comparisonFinancials, issues);
  const portfolioHealth = buildPortfolioHealthScorecard(collectionsRisk, leaseVacancy, cashFlow, dataQualityIssue);

  const critical = issues.filter((i) => i.severity === "critical").sort((a, b) => b.priorityScore - a.priorityScore);
  const warning = issues.filter((i) => i.severity === "warning").sort((a, b) => b.priorityScore - a.priorityScore);
  const watch = issues.filter((i) => i.severity === "watch").sort((a, b) => b.priorityScore - a.priorityScore);
  const whereToStart = [...issues].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);

  return {
    organization: { id: orgId },
    period: { start: cdToISODate(period.start), end: cdToISODate(period.end), label: "Trailing 6 completed calendar months", months: period.months },
    comparisonPeriod: {
      start: cdToISODate(comparisonPeriod.start),
      end: cdToISODate(comparisonPeriod.end),
      label: "Preceding 6 completed calendar months",
      months: comparisonPeriod.months,
    },
    calculatedAt: new Date().toISOString(),
    disclosure: "Based on internal Odyssey data.",
    scorecards: [portfolioHealth, collectionsRisk, leaseVacancy, cashFlow],
    whereToStart,
    criticalIssues: critical,
    warnings: warning,
    watchItems: watch,
    suppressed,
  };
}

// growth.ts does not export a market-rent-candidate fetcher today, so this
// small, org-scoped query lives here, following the same query pattern
// (units.marketRentCents gate + active-lease join) already used by
// /growth/summary's own recorded-market-rent section.
interface MarketRentGapCandidate {
  unitId: string;
  unitNumber: string;
  propertyId: string;
  leaseId: string;
  currentMonthlyRentCents: number;
  recordedMarketRentCents: number;
}

async function fetchMarketRentGapCandidates(orgId: string): Promise<MarketRentGapCandidate[]> {
  const marketRentUnits = await db
    .select({ id: units.id, unitNumber: units.unitNumber, propertyId: units.propertyId, marketRentCents: units.marketRentCents })
    .from(units)
    .where(and(eq(units.orgId, orgId), isNull(units.archivedAt), gte(units.marketRentCents, 1)));

  const candidates: MarketRentGapCandidate[] = [];
  for (const unit of marketRentUnits) {
    const [effectiveLease] = await db
      .select({ id: leases.id, monthlyRent: leases.monthlyRent })
      .from(leases)
      .where(and(eq(leases.unitId, unit.id), eq(leases.orgId, orgId), eq(leases.status, "active"), isNull(leases.archivedAt)))
      .limit(1);
    if (!effectiveLease) continue;
    candidates.push({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      propertyId: unit.propertyId,
      leaseId: effectiveLease.id,
      currentMonthlyRentCents: effectiveLease.monthlyRent,
      recordedMarketRentCents: unit.marketRentCents,
    });
  }
  return candidates;
}
