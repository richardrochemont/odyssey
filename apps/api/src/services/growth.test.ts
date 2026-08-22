import { describe, it, expect } from "vitest";
import {
  isValidCalendarDate,
  parseISODateStrict,
  daysInMonth,
  monthsBetween,
  addMonths,
  computeDefaultPeriod,
  computeComparisonPeriod,
  validateAndResolveRange,
  daysUntilExpiryUTC,
  selectMonthlyCollectedRent,
  computeScheduledRentCentsForMonth,
  worstCoverageState,
  cdToISODate,
  firstOfMonth,
  lastOfMonth,
  type CalendarDate,
} from "./growth";
import type { GrowthSummaryQueryInput } from "@odyssey/validation";

// growth.test.ts intentionally never mocks @odyssey/db: every function under
// test here is a pure function of its inputs (no DB access), which is what
// makes date/timezone/ledger-source/confidence logic reliably testable
// without a live or mocked database. The only DB-touching function,
// getGrowthSummary, is exercised end-to-end by apps/web/e2e/growth.spec.ts
// against the real seeded dev database instead.

describe("calendar-date validation", () => {
  it("accepts valid dates including a leap-year Feb 29", () => {
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
  });

  it("rejects Feb 29 in a non-leap year", () => {
    expect(isValidCalendarDate(2026, 2, 29)).toBe(false);
  });

  it("rejects Feb 30 (impossible date) rather than rolling it over", () => {
    expect(isValidCalendarDate(2026, 2, 30)).toBe(false);
    expect(() => parseISODateStrict("2026-02-30")).toThrow(/Invalid calendar date/);
  });

  it("rejects month 13", () => {
    expect(isValidCalendarDate(2026, 13, 1)).toBe(false);
  });

  it("rejects malformed date strings", () => {
    expect(() => parseISODateStrict("2026/02/01")).toThrow(/Invalid date format/);
    expect(() => parseISODateStrict("not-a-date")).toThrow(/Invalid date format/);
    expect(() => parseISODateStrict("2026-2-1")).toThrow(/Invalid date format/);
  });

  it("computes days in month correctly, including December year-end", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("addMonths / monthsBetween", () => {
  it("carries year boundaries forward and backward", () => {
    expect(addMonths(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(addMonths(2025, 12, 1)).toEqual({ y: 2026, m: 1 });
    expect(addMonths(2026, 8, -6)).toEqual({ y: 2026, m: 2 });
  });

  it("returns an inclusive chronological month-key list", () => {
    const start: CalendarDate = { y: 2026, m: 2, d: 1 };
    const end: CalendarDate = { y: 2026, m: 7, d: 31 };
    expect(monthsBetween(start, end)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  });

  it("handles a range that crosses a calendar year", () => {
    const start: CalendarDate = { y: 2025, m: 8, d: 1 };
    const end: CalendarDate = { y: 2026, m: 1, d: 31 };
    expect(monthsBetween(start, end)).toEqual(["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
  });
});

describe("trailing-six-completed-months default period", () => {
  it("excludes the current in-progress month", () => {
    const today: CalendarDate = { y: 2026, m: 8, d: 19 };
    const period = computeDefaultPeriod(today);
    expect(cdToISODate(period.start)).toBe("2026-02-01");
    expect(cdToISODate(period.end)).toBe("2026-07-31");
    expect(period.months).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  });

  it("rolls back across a year boundary when today is early in the year", () => {
    const today: CalendarDate = { y: 2026, m: 2, d: 3 };
    const period = computeDefaultPeriod(today);
    // Last completed month is Jan 2026; trailing 6 = Aug 2025..Jan 2026.
    expect(cdToISODate(period.start)).toBe("2025-08-01");
    expect(cdToISODate(period.end)).toBe("2026-01-31");
  });

  it("computes a non-overlapping immediately-preceding comparison period", () => {
    const today: CalendarDate = { y: 2026, m: 8, d: 19 };
    const period = computeDefaultPeriod(today);
    const comparison = computeComparisonPeriod(period);
    expect(cdToISODate(comparison.start)).toBe("2025-08-01");
    expect(cdToISODate(comparison.end)).toBe("2026-01-31");
    expect(comparison.months.length).toBe(6);
  });
});

describe("validateAndResolveRange", () => {
  const today: CalendarDate = { y: 2026, m: 8, d: 19 };

  it("falls back to the default period when no range is supplied", () => {
    const { period } = validateAndResolveRange({}, today);
    expect(cdToISODate(period.end)).toBe("2026-07-31");
  });

  it("accepts a valid month-aligned custom period", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2026-04-01", periodEnd: "2026-06-30" };
    const { period, comparisonPeriod } = validateAndResolveRange(query, today);
    expect(period.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    // Auto-derived comparison: same length, immediately preceding.
    expect(comparisonPeriod.months).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("rejects a periodStart that is not the first day of a month", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2026-04-05", periodEnd: "2026-06-30" };
    expect(() => validateAndResolveRange(query, today)).toThrow(/first day of a calendar month/);
  });

  it("rejects a periodEnd that is not the last day of a month", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2026-04-01", periodEnd: "2026-06-15" };
    expect(() => validateAndResolveRange(query, today)).toThrow(/last day of a calendar month/);
  });

  it("rejects periodStart after periodEnd", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2026-06-01", periodEnd: "2026-04-30" };
    expect(() => validateAndResolveRange(query, today)).toThrow(/on or before/);
  });

  it("rejects a period ending in the current incomplete month", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2026-06-01", periodEnd: "2026-08-31" };
    expect(() => validateAndResolveRange(query, today)).toThrow(/completed calendar month/);
  });

  it("rejects impossible calendar dates rather than silently normalizing them", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2026-02-30", periodEnd: "2026-06-30" };
    expect(() => validateAndResolveRange(query, today)).toThrow(/Invalid calendar date/);
  });

  it("rejects an overlapping explicit comparison period", () => {
    const query: GrowthSummaryQueryInput = {
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      comparisonStart: "2026-05-01",
      comparisonEnd: "2026-07-31",
    };
    expect(() => validateAndResolveRange(query, today)).toThrow(/may not overlap/);
  });

  it("accepts a non-overlapping explicit comparison period", () => {
    const query: GrowthSummaryQueryInput = {
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      comparisonStart: "2025-10-01",
      comparisonEnd: "2025-12-31",
    };
    const { comparisonPeriod } = validateAndResolveRange(query, today);
    expect(comparisonPeriod.months).toEqual(["2025-10", "2025-11", "2025-12"]);
  });

  it("rejects a period longer than 24 months", () => {
    const query: GrowthSummaryQueryInput = { periodStart: "2024-01-01", periodEnd: "2026-06-30" };
    expect(() => validateAndResolveRange(query, today)).toThrow(/may not span more than/);
  });
});

describe("daysUntilExpiryUTC", () => {
  it("returns 0 when the lease ends today", () => {
    const today: CalendarDate = { y: 2026, m: 8, d: 19 };
    expect(daysUntilExpiryUTC(today, { y: 2026, m: 8, d: 19 })).toBe(0);
  });

  it("computes an exact day count across a month boundary", () => {
    const today: CalendarDate = { y: 2026, m: 8, d: 19 };
    // Aug has 31 days: 12 days remaining in August + 17 days in September = 29.
    expect(daysUntilExpiryUTC(today, { y: 2026, m: 9, d: 17 })).toBe(29);
  });

  it("returns a negative count for an already-expired end date", () => {
    const today: CalendarDate = { y: 2026, m: 8, d: 19 };
    expect(daysUntilExpiryUTC(today, { y: 2026, m: 8, d: 10 })).toBe(-9);
  });

  it("is unaffected by time-of-day, since inputs are calendar dates not timestamps", () => {
    // There is no time-of-day component to pass in the first place — this
    // test documents that guarantee rather than exercising a clock value.
    const today: CalendarDate = { y: 2026, m: 12, d: 31 };
    expect(daysUntilExpiryUTC(today, { y: 2027, m: 1, d: 1 })).toBe(1);
  });
});

describe("ledger-source selection (no double-counting)", () => {
  it("uses only charge allocations when a rent charge exists that month, ignoring legacy payments entirely", () => {
    const result = selectMonthlyCollectedRent(
      [{ id: "charge-1", amount: 150000 }],
      [{ chargeId: "charge-1", amount: 150000 }],
      [{ amountReceived: 999999 }] // present but must be ignored
    );
    expect(result).toEqual({ source: "charges", collectedRentCents: 150000 });
  });

  it("only sums allocations tied to the rent charges actually passed in", () => {
    const result = selectMonthlyCollectedRent(
      [{ id: "charge-1", amount: 150000 }],
      [
        { chargeId: "charge-1", amount: 100000 },
        { chargeId: "charge-unrelated", amount: 500000 },
      ],
      []
    );
    expect(result.collectedRentCents).toBe(100000);
  });

  it("falls back to legacy payments when no rent charge exists that month", () => {
    const result = selectMonthlyCollectedRent(
      [],
      [],
      [{ amountReceived: 140000 }, { amountReceived: 10000 }]
    );
    expect(result).toEqual({ source: "legacy_payments", collectedRentCents: 150000 });
  });

  it("returns zero, not an error, when neither source has data", () => {
    expect(selectMonthlyCollectedRent([], [], [])).toEqual({ source: "legacy_payments", collectedRentCents: 0 });
  });
});

describe("scheduled rent from lease terms (no proration)", () => {
  const monthStart = firstOfMonth(2026, 6);
  const monthEnd = lastOfMonth(2026, 6);

  it("excludes draft leases", () => {
    const total = computeScheduledRentCentsForMonth(monthStart, monthEnd, [
      { monthlyRent: 200000, startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"), status: "draft" },
    ]);
    expect(total).toBe(0);
  });

  it("includes active, ended, and renewed leases", () => {
    const total = computeScheduledRentCentsForMonth(monthStart, monthEnd, [
      { monthlyRent: 100000, startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"), status: "active" },
      { monthlyRent: 50000, startDate: new Date("2025-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"), status: "ended" },
      { monthlyRent: 75000, startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"), status: "renewed" },
    ]);
    expect(total).toBe(225000);
  });

  it("counts a lease starting mid-month at its full monthly rent (no proration)", () => {
    const total = computeScheduledRentCentsForMonth(monthStart, monthEnd, [
      { monthlyRent: 120000, startDate: new Date("2026-06-25T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"), status: "active" },
    ]);
    expect(total).toBe(120000);
  });

  it("includes a lease that overlaps only the very last day of the month", () => {
    const total = computeScheduledRentCentsForMonth(monthStart, monthEnd, [
      { monthlyRent: 90000, startDate: new Date("2026-06-30T00:00:00Z"), endDate: new Date("2026-07-15T00:00:00Z"), status: "active" },
    ]);
    expect(total).toBe(90000);
  });

  it("excludes a lease that ended before the month began", () => {
    const total = computeScheduledRentCentsForMonth(monthStart, monthEnd, [
      { monthlyRent: 90000, startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-05-31T00:00:00Z"), status: "ended" },
    ]);
    expect(total).toBe(0);
  });
});

describe("worst-coverage-state aggregation", () => {
  it("returns unavailable when no coverage records apply", () => {
    expect(worstCoverageState([])).toBe("unavailable");
  });

  it("returns detail_complete only when every included state is detail_complete", () => {
    expect(worstCoverageState(["detail_complete", "detail_complete"])).toBe("detail_complete");
  });

  it("downgrades to the worst state present, not an average", () => {
    expect(worstCoverageState(["detail_complete", "partial_detail", "summary_only"])).toBe("summary_only");
  });

  it("treats needs_review as worse than no_data", () => {
    expect(worstCoverageState(["no_data", "needs_review"])).toBe("needs_review");
  });

  it("still downgrades to no_data when nothing worse is present", () => {
    expect(worstCoverageState(["detail_complete", "no_data"])).toBe("no_data");
  });
});
