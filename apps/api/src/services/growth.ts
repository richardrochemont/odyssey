import { db, properties, units, leases, charges, paymentAllocations, payments, financialRecords } from "@odyssey/db";
import { and, eq, gte, lte, inArray, isNull } from "drizzle-orm";
import { getOrCalculatePropertyMonthCoverage } from "./monthlySummaries";
import type { GrowthSummaryQueryInput } from "@odyssey/validation";

// ---------------------------------------------------------------------------
// Calendar-date utilities.
//
// These never call `new Date(dateString)` and never read local getFullYear /
// getMonth / getDate. "Today" and every period boundary are derived purely
// from integer year/month/day arithmetic (via Date.UTC, read back with the
// getUTC* accessors), so results cannot shift with the server's local
// timezone. This is deliberately scoped to Growth only — it does not touch
// how any other service constructs or compares dates.
// ---------------------------------------------------------------------------

export interface CalendarDate {
  y: number;
  m: number; // 1-12
  d: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysInMonth(y: number, m: number): number {
  // Day 0 of the next month is the last day of month `m`.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  return true;
}

export function parseISODateStrict(s: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) throw new Error(`Invalid date format (expected YYYY-MM-DD): ${s}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!isValidCalendarDate(y, m, d)) throw new Error(`Invalid calendar date: ${s}`);
  return { y, m, d };
}

export function cdToISODate(cd: CalendarDate): string {
  return `${String(cd.y).padStart(4, "0")}-${String(cd.m).padStart(2, "0")}-${String(cd.d).padStart(2, "0")}`;
}

export function monthKeyOf(cd: CalendarDate): string {
  return `${String(cd.y).padStart(4, "0")}-${String(cd.m).padStart(2, "0")}`;
}

// Returns a UTC-midnight JS Date for use as a query boundary. This is the
// only place calendar dates are converted to JS Date objects, and it is
// exact (no ambiguity, no local-timezone involvement).
export function cdToUTCDate(cd: CalendarDate, endOfDay = false): Date {
  return endOfDay
    ? new Date(Date.UTC(cd.y, cd.m - 1, cd.d, 23, 59, 59, 999))
    : new Date(Date.UTC(cd.y, cd.m - 1, cd.d, 0, 0, 0, 0));
}

function cdTimestamp(cd: CalendarDate): number {
  return Date.UTC(cd.y, cd.m - 1, cd.d);
}

export function firstOfMonth(y: number, m: number): CalendarDate {
  return { y, m, d: 1 };
}

export function lastOfMonth(y: number, m: number): CalendarDate {
  return { y, m, d: daysInMonth(y, m) };
}

// delta may be negative. Returns a {y, m} pair (1-12).
export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return { y: ny, m: nm };
}

// Inclusive list of YYYY-MM keys between two month-aligned calendar dates.
export function monthsBetween(start: CalendarDate, end: CalendarDate): string[] {
  const keys: string[] = [];
  let cursor = { y: start.y, m: start.m };
  const endKey = monthKeyOf({ ...end, d: 1 });
  // Bounded loop: refuse to run away on bad input.
  for (let i = 0; i < 1000; i++) {
    const key = `${String(cursor.y).padStart(4, "0")}-${String(cursor.m).padStart(2, "0")}`;
    keys.push(key);
    if (key === endKey) break;
    cursor = addMonths(cursor.y, cursor.m, 1);
  }
  return keys;
}

export function todayUTC(): CalendarDate {
  const now = new Date();
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

// ---------------------------------------------------------------------------
// Period resolution.
// ---------------------------------------------------------------------------

export interface PeriodRange {
  start: CalendarDate;
  end: CalendarDate;
  months: string[]; // YYYY-MM, inclusive, chronological
}

const MAX_PERIOD_MONTHS = 24;

// Trailing six *completed* calendar months, excluding whatever month `today`
// falls in. If today is 2026-08-19, the last completed month is 2026-07, and
// the trailing 6 are 2026-02..2026-07.
export function computeDefaultPeriod(today: CalendarDate): PeriodRange {
  const lastCompleted = addMonths(today.y, today.m, -1);
  const start = addMonths(lastCompleted.y, lastCompleted.m, -5);
  const startCd = firstOfMonth(start.y, start.m);
  const endCd = lastOfMonth(lastCompleted.y, lastCompleted.m);
  return { start: startCd, end: endCd, months: monthsBetween(startCd, endCd) };
}

export function computeComparisonPeriod(period: PeriodRange): PeriodRange {
  const numMonths = period.months.length;
  const periodStartMonth = { y: period.start.y, m: period.start.m };
  const comparisonEndMonth = addMonths(periodStartMonth.y, periodStartMonth.m, -1);
  const comparisonStartMonth = addMonths(comparisonEndMonth.y, comparisonEndMonth.m, -(numMonths - 1));
  const startCd = firstOfMonth(comparisonStartMonth.y, comparisonStartMonth.m);
  const endCd = lastOfMonth(comparisonEndMonth.y, comparisonEndMonth.m);
  return { start: startCd, end: endCd, months: monthsBetween(startCd, endCd) };
}

function assertMonthAligned(cd: CalendarDate, label: string) {
  if (cd.d !== 1 && cd !== undefined) {
    // Only the start date is required to be day 1; end is checked separately.
  }
  if (label.endsWith("Start") && cd.d !== 1) {
    throw new Error(`${label} must be the first day of a calendar month (got day ${cd.d})`);
  }
  if (label.endsWith("End") && cd.d !== daysInMonth(cd.y, cd.m)) {
    throw new Error(`${label} must be the last day of a calendar month (got day ${cd.d} of a ${daysInMonth(cd.y, cd.m)}-day month)`);
  }
}

function assertCompletedMonth(cd: CalendarDate, today: CalendarDate, label: string) {
  const currentMonthStartTs = cdTimestamp(firstOfMonth(today.y, today.m));
  if (cdTimestamp(cd) >= currentMonthStartTs) {
    throw new Error(`${label} must fall within a completed calendar month (before ${monthKeyOf(today)})`);
  }
}

function rangesOverlap(a: PeriodRange, b: PeriodRange): boolean {
  return cdTimestamp(a.start) <= cdTimestamp(b.end) && cdTimestamp(b.start) <= cdTimestamp(a.end);
}

// Validates and resolves the full period + comparisonPeriod from raw query
// input. Throws a plain Error (never silently normalizes) on anything
// malformed, misaligned, out-of-range, or overlapping.
export function validateAndResolveRange(
  query: GrowthSummaryQueryInput,
  today: CalendarDate = todayUTC()
): { period: PeriodRange; comparisonPeriod: PeriodRange } {
  if (!query.periodStart || !query.periodEnd) {
    const period = computeDefaultPeriod(today);
    const comparisonPeriod = computeComparisonPeriod(period);
    return { period, comparisonPeriod };
  }

  const periodStartCd = parseISODateStrict(query.periodStart);
  const periodEndCd = parseISODateStrict(query.periodEnd);
  assertMonthAligned(periodStartCd, "periodStart");
  assertMonthAligned(periodEndCd, "periodEnd");

  if (cdTimestamp(periodStartCd) > cdTimestamp(periodEndCd)) {
    throw new Error("periodStart must be on or before periodEnd");
  }
  assertCompletedMonth(periodEndCd, today, "periodEnd");

  const period: PeriodRange = {
    start: periodStartCd,
    end: periodEndCd,
    months: monthsBetween(periodStartCd, periodEndCd),
  };
  if (period.months.length > MAX_PERIOD_MONTHS) {
    throw new Error(`period may not span more than ${MAX_PERIOD_MONTHS} months (got ${period.months.length})`);
  }

  let comparisonPeriod: PeriodRange;
  if (query.comparisonStart && query.comparisonEnd) {
    const comparisonStartCd = parseISODateStrict(query.comparisonStart);
    const comparisonEndCd = parseISODateStrict(query.comparisonEnd);
    assertMonthAligned(comparisonStartCd, "comparisonStart");
    assertMonthAligned(comparisonEndCd, "comparisonEnd");
    if (cdTimestamp(comparisonStartCd) > cdTimestamp(comparisonEndCd)) {
      throw new Error("comparisonStart must be on or before comparisonEnd");
    }
    assertCompletedMonth(comparisonEndCd, today, "comparisonEnd");
    comparisonPeriod = {
      start: comparisonStartCd,
      end: comparisonEndCd,
      months: monthsBetween(comparisonStartCd, comparisonEndCd),
    };
    if (comparisonPeriod.months.length > MAX_PERIOD_MONTHS) {
      throw new Error(`comparison period may not span more than ${MAX_PERIOD_MONTHS} months (got ${comparisonPeriod.months.length})`);
    }
  } else {
    comparisonPeriod = computeComparisonPeriod(period);
  }

  if (rangesOverlap(period, comparisonPeriod)) {
    throw new Error("period and comparisonPeriod may not overlap");
  }

  return { period, comparisonPeriod };
}

// ---------------------------------------------------------------------------
// Lease-expiry (UTC-explicit; scoped to Growth only, does not alter the
// existing /leases route's own daysUntilExpiry calculation).
// ---------------------------------------------------------------------------

// Both inputs are calendar dates (already stripped of time-of-day), so the
// difference in days is an exact integer with no rounding ambiguity.
export function daysUntilExpiryUTC(today: CalendarDate, endDate: CalendarDate): number {
  return Math.round((cdTimestamp(endDate) - cdTimestamp(today)) / MS_PER_DAY);
}

export function dateToCalendarDateUTC(date: Date): CalendarDate {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

// ---------------------------------------------------------------------------
// Ledger-source selection (per organization, per calendar month).
//
// Rule: if any non-archived rent charge exists in the month, collected rent
// for that month comes ONLY from payment allocations attached to those
// charges ("charges" source). Otherwise it comes ONLY from non-archived
// legacy payments.amountReceived rows with paidDate in that month
// ("legacy_payments" source). The two sources are never summed for the same
// month.
// ---------------------------------------------------------------------------

export type LedgerSource = "charges" | "legacy_payments";

export function selectMonthlyCollectedRent(
  rentChargeRows: { id: string; amount: number }[],
  allocationRows: { chargeId: string; amount: number }[],
  legacyPaymentRows: { amountReceived: number }[]
): { source: LedgerSource; collectedRentCents: number } {
  if (rentChargeRows.length > 0) {
    const chargeIds = new Set(rentChargeRows.map((c) => c.id));
    const collectedRentCents = allocationRows
      .filter((a) => chargeIds.has(a.chargeId))
      .reduce((sum, a) => sum + a.amount, 0);
    return { source: "charges", collectedRentCents };
  }
  const collectedRentCents = legacyPaymentRows.reduce((sum, p) => sum + p.amountReceived, 0);
  return { source: "legacy_payments", collectedRentCents };
}

// ---------------------------------------------------------------------------
// Scheduled rent (leases-based, no proration).
//
// A lease counts toward a given month when it is not in draft status and its
// term overlaps the month at all: startDate <= monthEnd AND endDate >=
// monthStart. Partial-month starts/ends are intentionally not prorated.
// ---------------------------------------------------------------------------

const SCHEDULED_RENT_STATUSES = new Set(["active", "ended", "renewed"]);

export interface LeaseTermRow {
  monthlyRent: number;
  startDate: Date;
  endDate: Date;
  status: string;
}

export function computeScheduledRentCentsForMonth(
  monthStart: CalendarDate,
  monthEnd: CalendarDate,
  leaseRows: LeaseTermRow[]
): number {
  const monthStartTs = cdTimestamp(monthStart);
  const monthEndTs = cdTimestamp(monthEnd);
  return leaseRows
    .filter((l) => SCHEDULED_RENT_STATUSES.has(l.status))
    .filter((l) => {
      const leaseStartTs = cdTimestamp(dateToCalendarDateUTC(l.startDate));
      const leaseEndTs = cdTimestamp(dateToCalendarDateUTC(l.endDate));
      return leaseStartTs <= monthEndTs && leaseEndTs >= monthStartTs;
    })
    .reduce((sum, l) => sum + l.monthlyRent, 0);
}

export const SCHEDULED_RENT_CAVEAT =
  "Scheduled rent is estimated from lease terms. Partial-month starts and ends are not prorated in this view.";

// ---------------------------------------------------------------------------
// Data-quality / confidence aggregation.
//
// `unavailable` is reserved for insights the coverage-state model does not
// apply to at all (e.g. a point-in-time occupancy snapshot). It is distinct
// from the real coverage state `no_data`, which means coverage WAS checked
// for a property-month and genuinely nothing is recorded there.
//
// Severity order (worst to best), deliberately documented here because it is
// a judgment call, not something given verbatim by the schema:
//   needs_review  — something was recorded but has been flagged/invalidated;
//                   treated as worse than no_data because a stale or
//                   contradicted number is more misleading than an honest gap.
//   no_data       — nothing recorded at all for that property-month.
//   summary_only  — an imported aggregate exists with no transaction detail.
//   partial_detail— both an aggregate and some transaction detail exist.
//   detail_complete — owner-attested as complete.
// ---------------------------------------------------------------------------

export type CoverageState = "no_data" | "needs_review" | "summary_only" | "partial_detail" | "detail_complete";
export type Confidence = CoverageState | "unavailable";

const COVERAGE_SEVERITY: Record<CoverageState, number> = {
  needs_review: 0,
  no_data: 1,
  summary_only: 2,
  partial_detail: 3,
  detail_complete: 4,
};

export function worstCoverageState(states: CoverageState[]): Confidence {
  if (states.length === 0) return "unavailable";
  return states.reduce((worst, s) => (COVERAGE_SEVERITY[s] < COVERAGE_SEVERITY[worst] ? s : worst), states[0]);
}

// ---------------------------------------------------------------------------
// Response types.
// ---------------------------------------------------------------------------

export interface RelatedRecord {
  type: string;
  id: string;
  path: string;
}

export interface Insight {
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

export interface GrowthSummaryResponse {
  organization: { id: string };
  period: { start: string; end: string; label: string; months: string[] };
  comparisonPeriod: { start: string; end: string; label: string; months: string[] };
  calculatedAt: string;
  insights: Insight[];
  omitted: { category: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Orchestration — the only part of this file that touches the database.
// Every query below is scoped by the orgId passed in (never taken from a
// request parameter by the caller) and filtered server-side; no unbounded
// row sets are ever returned to the frontend.
// ---------------------------------------------------------------------------

export interface PropertyMonthlyBreakdown {
  propertyId: string;
  scheduledRentCents: number;
  collectedRentCents: number;
  expenseCents: number;
}

export interface ExpenseCategoryBreakdown {
  category: string;
  expenseCents: number;
}

async function fetchMonthlyFacts(orgId: string, monthStart: CalendarDate, monthEnd: CalendarDate) {
  const startDate = cdToUTCDate(monthStart, false);
  const endDate = cdToUTCDate(monthEnd, true);

  const rentCharges = await db
    .select({ id: charges.id, amount: charges.amount, propertyId: charges.propertyId })
    .from(charges)
    .where(and(eq(charges.orgId, orgId), eq(charges.type, "rent"), gte(charges.dueDate, startDate), lte(charges.dueDate, endDate), isNull(charges.archivedAt)));

  const allocations = rentCharges.length
    ? await db
        .select({ chargeId: paymentAllocations.chargeId, amount: paymentAllocations.amount })
        .from(paymentAllocations)
        .where(and(inArray(paymentAllocations.chargeId, rentCharges.map((c) => c.id)), isNull(paymentAllocations.archivedAt)))
    : [];

  const legacyPayments = await db
    .select({ amountReceived: payments.amountReceived, propertyId: payments.propertyId })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), gte(payments.paidDate, startDate), lte(payments.paidDate, endDate), isNull(payments.archivedAt)));

  const leaseRows = await db
    .select({ monthlyRent: leases.monthlyRent, startDate: leases.startDate, endDate: leases.endDate, status: leases.status, propertyId: units.propertyId })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .where(and(eq(leases.orgId, orgId), isNull(leases.archivedAt), lte(leases.startDate, endDate), gte(leases.endDate, startDate)));

  const expenseRows = await db
    .select({ amount: financialRecords.amount, propertyId: financialRecords.propertyId, category: financialRecords.category })
    .from(financialRecords)
    .where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.type, "expense"), gte(financialRecords.date, startDate), lte(financialRecords.date, endDate), isNull(financialRecords.archivedAt)));

  const { source, collectedRentCents } = selectMonthlyCollectedRent(rentCharges, allocations, legacyPayments);
  const scheduledRentCents = computeScheduledRentCentsForMonth(monthStart, monthEnd, leaseRows);
  const expenseCents = expenseRows.reduce((sum, e) => sum + e.amount, 0);

  // Per-property attribution for evidence — grouped in JS from the same rows
  // already fetched above rather than issuing one query per property.
  const byPropertyMap = new Map<string, PropertyMonthlyBreakdown>();
  const ensureProperty = (propertyId: string) => {
    if (!byPropertyMap.has(propertyId)) byPropertyMap.set(propertyId, { propertyId, scheduledRentCents: 0, collectedRentCents: 0, expenseCents: 0 });
    return byPropertyMap.get(propertyId)!;
  };
  const monthStartTs = cdTimestamp(monthStart);
  const monthEndTs = cdTimestamp(monthEnd);
  for (const l of leaseRows) {
    if (!SCHEDULED_RENT_STATUSES.has(l.status)) continue;
    const leaseStartTs = cdTimestamp(dateToCalendarDateUTC(l.startDate));
    const leaseEndTs = cdTimestamp(dateToCalendarDateUTC(l.endDate));
    if (leaseStartTs <= monthEndTs && leaseEndTs >= monthStartTs) {
      ensureProperty(l.propertyId).scheduledRentCents += l.monthlyRent;
    }
  }
  if (source === "charges") {
    const chargeIdToProperty = new Map(rentCharges.map((c) => [c.id, c.propertyId]));
    for (const a of allocations) {
      const propertyId = chargeIdToProperty.get(a.chargeId);
      if (propertyId) ensureProperty(propertyId).collectedRentCents += a.amount;
    }
  } else {
    for (const p of legacyPayments) {
      ensureProperty(p.propertyId).collectedRentCents += p.amountReceived;
    }
  }
  for (const e of expenseRows) {
    ensureProperty(e.propertyId).expenseCents += e.amount;
  }
  const byProperty = Array.from(byPropertyMap.values());

  const byExpenseCategoryMap = new Map<string, number>();
  for (const e of expenseRows) {
    byExpenseCategoryMap.set(e.category, (byExpenseCategoryMap.get(e.category) || 0) + e.amount);
  }
  const byExpenseCategory: ExpenseCategoryBreakdown[] = Array.from(byExpenseCategoryMap.entries()).map(([category, expenseCents]) => ({ category, expenseCents }));

  return { source, collectedRentCents, scheduledRentCents, expenseCents, byProperty, byExpenseCategory };
}

export async function totalsForPeriod(orgId: string, period: PeriodRange) {
  const perMonth = await Promise.all(
    period.months.map(async (monthKey) => {
      const [y, m] = monthKey.split("-").map(Number);
      const monthStart = firstOfMonth(y, m);
      const monthEnd = lastOfMonth(y, m);
      const facts = await fetchMonthlyFacts(orgId, monthStart, monthEnd);
      return { month: monthKey, ...facts };
    })
  );
  const totals = perMonth.reduce(
    (acc, mo) => ({
      scheduledRentCents: acc.scheduledRentCents + mo.scheduledRentCents,
      collectedRentCents: acc.collectedRentCents + mo.collectedRentCents,
      expenseCents: acc.expenseCents + mo.expenseCents,
    }),
    { scheduledRentCents: 0, collectedRentCents: 0, expenseCents: 0 }
  );

  const byPropertyMap = new Map<string, PropertyMonthlyBreakdown>();
  for (const mo of perMonth) {
    for (const p of mo.byProperty) {
      const existing = byPropertyMap.get(p.propertyId) || { propertyId: p.propertyId, scheduledRentCents: 0, collectedRentCents: 0, expenseCents: 0 };
      byPropertyMap.set(p.propertyId, {
        propertyId: p.propertyId,
        scheduledRentCents: existing.scheduledRentCents + p.scheduledRentCents,
        collectedRentCents: existing.collectedRentCents + p.collectedRentCents,
        expenseCents: existing.expenseCents + p.expenseCents,
      });
    }
  }
  const byProperty = Array.from(byPropertyMap.values());

  const byExpenseCategoryMap = new Map<string, number>();
  for (const mo of perMonth) {
    for (const c of mo.byExpenseCategory) {
      byExpenseCategoryMap.set(c.category, (byExpenseCategoryMap.get(c.category) || 0) + c.expenseCents);
    }
  }
  const byExpenseCategory: ExpenseCategoryBreakdown[] = Array.from(byExpenseCategoryMap.entries()).map(([category, expenseCents]) => ({ category, expenseCents }));

  return { perMonth, totals, byProperty, byExpenseCategory };
}

export interface CoverageDetail {
  propertyId: string;
  month: string;
  state: CoverageState;
}

export interface PeriodCoverageResult {
  worst: Confidence;
  details: CoverageDetail[];
}

export async function worstCoverageForPeriod(orgId: string, period: PeriodRange): Promise<PeriodCoverageResult> {
  const orgProperties = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.orgId, orgId), isNull(properties.archivedAt)));
  if (orgProperties.length === 0) return { worst: "unavailable", details: [] };

  const details: CoverageDetail[] = [];
  for (const property of orgProperties) {
    for (const monthKey of period.months) {
      const coverage = await getOrCalculatePropertyMonthCoverage(orgId, property.id, monthKey);
      details.push({ propertyId: property.id, month: monthKey, state: coverage.state as CoverageState });
    }
  }
  const worst = worstCoverageState(details.map((d) => d.state));
  return { worst, details };
}

export interface ActiveLeaseExpiry {
  id: string;
  unitId: string;
  propertyId: string;
  unitNumber: string;
  daysUntilExpiry: number;
}

// Unfiltered — both the /growth/summary 90-day view and the Decision Brief's
// 30/60/90 bucket counts read from this single shared source.
export async function fetchActiveLeaseExpiries(orgId: string, today: CalendarDate): Promise<ActiveLeaseExpiry[]> {
  const activeLeases = await db
    .select({
      id: leases.id,
      unitId: leases.unitId,
      propertyId: units.propertyId,
      endDate: leases.endDate,
      unitNumber: units.unitNumber,
    })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .where(and(eq(leases.orgId, orgId), eq(leases.status, "active"), isNull(leases.archivedAt)));

  return activeLeases.map((l) => ({
    id: l.id,
    unitId: l.unitId,
    propertyId: l.propertyId,
    unitNumber: l.unitNumber,
    daysUntilExpiry: daysUntilExpiryUTC(today, dateToCalendarDateUTC(l.endDate)),
  }));
}

export interface OrgUnitStatus {
  id: string;
  unitNumber: string;
  propertyId: string;
  status: string;
}

export async function fetchOrgUnits(orgId: string): Promise<{ allUnits: OrgUnitStatus[]; vacantOrNotice: OrgUnitStatus[] }> {
  const allUnits = await db
    .select({ id: units.id, status: units.status, propertyId: units.propertyId, unitNumber: units.unitNumber })
    .from(units)
    .where(and(eq(units.orgId, orgId), isNull(units.archivedAt)));

  const vacantOrNotice = allUnits.filter((u) => u.status === "vacant" || u.status === "notice_given");
  return { allUnits, vacantOrNotice };
}

export async function getGrowthSummary(orgId: string, query: GrowthSummaryQueryInput): Promise<GrowthSummaryResponse> {
  const { period, comparisonPeriod } = validateAndResolveRange(query);

  const [periodData, comparisonData, periodCoverage] = await Promise.all([
    totalsForPeriod(orgId, period),
    totalsForPeriod(orgId, comparisonPeriod),
    worstCoverageForPeriod(orgId, period),
  ]);
  const confidence = periodCoverage.worst;

  const sourcesByMonth = periodData.perMonth.map((mo) => `${mo.month}: ${mo.source}`);

  const insights: Insight[] = [];

  // 1. Net cash flow trend.
  insights.push({
    id: "cashflow-trend",
    title: "Net Cash Flow Trend",
    kind: "calculation",
    sourcePeriod: { start: cdToISODate(period.start), end: cdToISODate(period.end) },
    comparisonPeriod: { start: cdToISODate(comparisonPeriod.start), end: cdToISODate(comparisonPeriod.end) },
    metrics: {
      collectedRentCents: periodData.totals.collectedRentCents,
      expenseCents: periodData.totals.expenseCents,
      netCashFlowCents: periodData.totals.collectedRentCents - periodData.totals.expenseCents,
      monthly: periodData.perMonth.map((mo) => ({
        month: mo.month,
        collectedRentCents: mo.collectedRentCents,
        expenseCents: mo.expenseCents,
        netCashFlowCents: mo.collectedRentCents - mo.expenseCents,
        source: mo.source,
      })),
    },
    comparisonMetrics: {
      collectedRentCents: comparisonData.totals.collectedRentCents,
      expenseCents: comparisonData.totals.expenseCents,
      netCashFlowCents: comparisonData.totals.collectedRentCents - comparisonData.totals.expenseCents,
    },
    formula: "netCashFlowCents = collectedRentCents - expenseCents, summed per completed calendar month. Expense totals are independent of the collected-rent ledger source.",
    relatedRecords: [],
    confidence,
    caveats: [`Monthly collected-rent source: ${sourcesByMonth.join("; ")}.`],
    unavailableReason: null,
  });

  // 2. Collections.
  const collectionRatePct = periodData.totals.scheduledRentCents > 0
    ? Math.round((periodData.totals.collectedRentCents / periodData.totals.scheduledRentCents) * 1000) / 10
    : null;
  const comparisonCollectionRatePct = comparisonData.totals.scheduledRentCents > 0
    ? Math.round((comparisonData.totals.collectedRentCents / comparisonData.totals.scheduledRentCents) * 1000) / 10
    : null;
  insights.push({
    id: "collections",
    title: "Rent Collection Rate",
    kind: "calculation",
    sourcePeriod: { start: cdToISODate(period.start), end: cdToISODate(period.end) },
    comparisonPeriod: { start: cdToISODate(comparisonPeriod.start), end: cdToISODate(comparisonPeriod.end) },
    metrics: {
      scheduledRentCents: periodData.totals.scheduledRentCents,
      collectedRentCents: periodData.totals.collectedRentCents,
      collectionRatePct,
    },
    comparisonMetrics: {
      scheduledRentCents: comparisonData.totals.scheduledRentCents,
      collectedRentCents: comparisonData.totals.collectedRentCents,
      collectionRatePct: comparisonCollectionRatePct,
    },
    formula: "collectionRatePct = collectedRentCents / scheduledRentCents * 100. scheduledRentCents is derived from active/ended/renewed lease terms overlapping each month (not from the payment ledger).",
    relatedRecords: [],
    confidence,
    caveats: [SCHEDULED_RENT_CAVEAT, `Monthly collected-rent source: ${sourcesByMonth.join("; ")}.`],
    unavailableReason: collectionRatePct === null ? "No leases with scheduled rent in this period; collection rate cannot be computed." : null,
  });

  // 3. Occupancy.
  const { allUnits: orgUnits } = await fetchOrgUnits(orgId);
  const occupancyCounts = { occupied: 0, vacant: 0, notice_given: 0, offline: 0 };
  for (const u of orgUnits) {
    if (u.status in occupancyCounts) (occupancyCounts as Record<string, number>)[u.status] += 1;
  }
  insights.push({
    id: "occupancy",
    title: "Occupancy & Vacancy",
    kind: "fact",
    sourcePeriod: { start: cdToISODate(period.end), end: cdToISODate(period.end) },
    comparisonPeriod: null,
    comparisonMetrics: null,
    metrics: {
      occupied: occupancyCounts.occupied,
      vacant: occupancyCounts.vacant,
      noticeGiven: occupancyCounts.notice_given,
      offline: occupancyCounts.offline,
      totalUnits: orgUnits.length,
    },
    formula: null,
    relatedRecords: [],
    confidence: "unavailable",
    caveats: ["Occupancy is a current point-in-time snapshot, not a coverage-tracked financial figure; the confidence label does not apply to it."],
    unavailableReason: orgUnits.length === 0 ? "No units recorded for this organization." : null,
  });

  // 4. Lease-expiry exposure (UTC-explicit, active leases only).
  const today = todayUTC();
  const activeLeaseExpiries = await fetchActiveLeaseExpiries(orgId, today);

  const expiryWindowDays = 90;
  const expiring = activeLeaseExpiries.filter((l) => l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= expiryWindowDays);

  insights.push({
    id: "lease-expiry-exposure",
    title: "Lease Expiry Exposure",
    kind: "fact",
    sourcePeriod: { start: cdToISODate(today), end: cdToISODate(today) },
    comparisonPeriod: null,
    comparisonMetrics: null,
    metrics: {
      expiringWithinWindow: expiring.length,
      windowDays: expiryWindowDays,
      leases: expiring.map((l) => ({ id: l.id, unitNumber: l.unitNumber, daysUntilExpiry: l.daysUntilExpiry })),
    },
    formula: "daysUntilExpiry = UTC calendar-day difference between lease.endDate and today; active leases only, 0-90 day window.",
    relatedRecords: expiring.map((l) => ({ type: "lease", id: l.id, path: `/leases/${l.id}` })),
    confidence: "unavailable",
    caveats: ["Lease expiry exposure uses explicit UTC calendar-date arithmetic scoped to this view; it does not change the existing /leases page's own calculation."],
    unavailableReason: activeLeaseExpiries.length === 0 ? "No active leases recorded for this organization." : null,
  });

  // 5. Recorded market rent (optional, per qualifying unit).
  const marketRentUnits = await db
    .select({ id: units.id, unitNumber: units.unitNumber, propertyId: units.propertyId, marketRentCents: units.marketRentCents })
    .from(units)
    .where(and(eq(units.orgId, orgId), isNull(units.archivedAt), gte(units.marketRentCents, 1)));

  let marketRentOmittedCount = 0;
  for (const unit of marketRentUnits) {
    const [effectiveLease] = await db
      .select({ id: leases.id, monthlyRent: leases.monthlyRent })
      .from(leases)
      .where(and(eq(leases.unitId, unit.id), eq(leases.orgId, orgId), eq(leases.status, "active"), isNull(leases.archivedAt)))
      .limit(1);

    if (!effectiveLease) {
      marketRentOmittedCount += 1;
      continue;
    }

    const recordedGapCents = unit.marketRentCents - effectiveLease.monthlyRent;
    insights.push({
      id: `recorded-market-rent-${unit.id}`,
      title: "Recorded market rent",
      kind: "calculation",
      sourcePeriod: { start: cdToISODate(period.end), end: cdToISODate(period.end) },
      comparisonPeriod: null,
      comparisonMetrics: null,
      metrics: {
        currentMonthlyRentCents: effectiveLease.monthlyRent,
        recordedMarketRentCents: unit.marketRentCents,
        recordedGapCents,
      },
      formula: "recorded market rent - current rent = recorded gap",
      relatedRecords: [
        { type: "unit", id: unit.id, path: `/properties/${unit.propertyId}` },
        { type: "lease", id: effectiveLease.id, path: `/leases/${effectiveLease.id}` },
      ],
      confidence: "unavailable",
      caveats: ["Recorded market rent is owner-entered directly in Odyssey and is not independently sourced or verified against any external market data."],
      unavailableReason: null,
    });
  }
  // 6. Valuation (optional, per qualifying property).
  const orgProperties = await db
    .select({ id: properties.id, nickname: properties.nickname, estimatedValue: properties.estimatedValue, valuationDate: properties.valuationDate, valuationSource: properties.valuationSource })
    .from(properties)
    .where(and(eq(properties.orgId, orgId), isNull(properties.archivedAt)));

  let valuationOmittedCount = 0;
  for (const property of orgProperties) {
    if (property.estimatedValue > 0 && property.valuationDate !== null) {
      insights.push({
        id: `valuation-${property.id}`,
        title: "Owner-recorded valuation",
        kind: "fact",
        sourcePeriod: null,
        comparisonPeriod: null,
        comparisonMetrics: null,
        metrics: {
          estimatedValueCents: property.estimatedValue,
          valuationDate: property.valuationDate.toISOString().slice(0, 10),
          valuationSource: property.valuationSource || null,
        },
        formula: null,
        relatedRecords: [{ type: "property", id: property.id, path: `/properties/${property.id}` }],
        confidence: "unavailable",
        caveats: ["This is owner-recorded valuation data, not an independent appraisal. No equity is calculated — Odyssey does not currently track debt or loan balances."],
        unavailableReason: null,
      });
    } else {
      valuationOmittedCount += 1;
    }
  }

  const omitted: { category: string; reason: string }[] = [];
  if (marketRentOmittedCount > 0) {
    omitted.push({
      category: "recorded-market-rent",
      reason: `${marketRentOmittedCount} unit(s) have a recorded market rent but no currently active lease to compare it against.`,
    });
  }
  if (valuationOmittedCount > 0) {
    omitted.push({
      category: "valuation",
      reason: `${valuationOmittedCount} of ${orgProperties.length} properties have no owner-recorded valuation (estimated value not set or valuation date missing).`,
    });
  }

  return {
    organization: { id: orgId },
    period: { start: cdToISODate(period.start), end: cdToISODate(period.end), label: "Trailing 6 completed calendar months", months: period.months },
    comparisonPeriod: { start: cdToISODate(comparisonPeriod.start), end: cdToISODate(comparisonPeriod.end), label: "Preceding 6 completed calendar months", months: comparisonPeriod.months },
    calculatedAt: new Date().toISOString(),
    insights,
    omitted,
  };
}
