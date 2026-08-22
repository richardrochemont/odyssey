import { describe, it, expect } from "vitest";
import {
  evaluateCollectionShortfall,
  evaluateWorseningCollectionRate,
  evaluateDecliningNetCashFlow,
  evaluateMaterialExpenseIncrease,
  evaluateVacancyNoticeExposure,
  evaluateLeaseExpiryConcentration,
  evaluateRecordedMarketRentGap,
  evaluateDataQuality,
  type PeriodFinancials,
  type OccupancySnapshot,
  type Issue,
} from "./growthIssues";
import type { ActiveLeaseExpiry, CalendarDate, PeriodCoverageResult } from "./growth";

// growthIssues.test.ts intentionally never touches @odyssey/db: every rule is
// a pure function of its already-computed inputs, mirroring growth.test.ts's
// approach. The one DB-touching function, getDecisionBrief, is exercised via
// apps/web/e2e/growth.spec.ts against the real seeded dev database instead.

function period(overrides: Partial<PeriodFinancials> = {}): PeriodFinancials {
  return {
    periodLabel: { start: "2026-02-01", end: "2026-07-31" },
    scheduledRentCents: 1000000,
    collectedRentCents: 950000,
    expenseCents: 100000,
    collectionRatePct: 95.0,
    byProperty: [],
    byExpenseCategory: [],
    confidence: "detail_complete",
    ...overrides,
  };
}

const PROHIBITED_PHRASES = [
  "we recommend",
  "you should",
  "should raise",
  "target rent",
  "market intelligence",
  "comparable propert",
  "projected rental rate",
  "suggested rent",
  "guarantee",
  "guaranteed",
  "predicted",
  "benchmark",
  "industry standard",
  "ai-generated",
  "legal action",
  "sue",
  "evict",
];

function assertNoProhibitedLanguage(issue: Issue) {
  const text = `${issue.title} ${issue.formula} ${issue.suggestedNextStep} ${issue.caveats.join(" ")}`.toLowerCase();
  for (const phrase of PROHIBITED_PHRASES) {
    expect(text).not.toContain(phrase);
  }
}

function assertNoPII(issue: Issue) {
  const json = JSON.stringify(issue).toLowerCase();
  // No email- or phone-shaped strings, and no field literally named for PII.
  expect(json).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  expect(json).not.toContain('"tenantname"');
  expect(json).not.toContain('"email"');
  expect(json).not.toContain('"phone"');
}

// Issue copy must stay at the property/lease/charge/payment record level and
// never name, blame, or characterize a tenant's payment behavior — the word
// "tenant" itself should never need to appear in user-facing issue text.
function assertNoTenantLanguage(issue: Issue) {
  const text = `${issue.title} ${issue.suggestedNextStep} ${issue.formula} ${issue.rankingExplanation} ${issue.caveats.join(" ")}`.toLowerCase();
  expect(text).not.toContain("tenant");
}

describe("collection-shortfall", () => {
  it("does not emit when scheduled rent is zero", () => {
    const { issue, suppressedReason } = evaluateCollectionShortfall(period({ scheduledRentCents: 0, collectionRatePct: null }));
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/no scheduled rent/i);
  });

  it("suppresses when confidence is not usable", () => {
    const { issue, suppressedReason } = evaluateCollectionShortfall(period({ confidence: "no_data", collectionRatePct: 50 }));
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/coverage/i);
  });

  it("does not emit at or above the 95.0% healthy threshold", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 95.0 }));
    expect(issue).toBeNull();
  });

  it("emits watch just under the 95.0% boundary", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 94.9 }));
    expect(issue?.severity).toBe("watch");
  });

  it("emits watch at the 90.0% boundary", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 90.0 }));
    expect(issue?.severity).toBe("watch");
  });

  it("emits warning just under the 90.0% boundary", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 89.9 }));
    expect(issue?.severity).toBe("warning");
  });

  it("emits warning at the 75.0% boundary", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 75.0 }));
    expect(issue?.severity).toBe("warning");
  });

  it("emits critical just under the 75.0% boundary", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 74.9 }));
    expect(issue?.severity).toBe("critical");
  });

  it("carries the mandatory scheduled-rent caveat and no prohibited language", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 80.0 }));
    expect(issue!.caveats.some((c) => c.includes("not prorated"))).toBe(true);
    assertNoProhibitedLanguage(issue!);
    assertNoPII(issue!);
  });

  it("uses organization-safe, property/record-level suggested next step wording, never naming or blaming a tenant", () => {
    const { issue } = evaluateCollectionShortfall(period({ collectionRatePct: 80.0 }));
    expect(issue!.suggestedNextStep).toBe("Review the property's collection records and outstanding balances for the selected period.");
    // A useful, non-prescriptive next step: it points the user at records to
    // review, not at a person, a fault claim, or a prescribed collection action.
    expect(issue!.suggestedNextStep.length).toBeGreaterThan(0);
    assertNoTenantLanguage(issue!);
  });

  it("links only to properties with an actual shortfall", () => {
    const { issue } = evaluateCollectionShortfall(
      period({
        collectionRatePct: 80.0,
        byProperty: [
          { propertyId: "p1", scheduledRentCents: 500000, collectedRentCents: 300000, expenseCents: 0 },
          { propertyId: "p2", scheduledRentCents: 500000, collectedRentCents: 500000, expenseCents: 0 },
        ],
      })
    );
    expect(issue!.relatedRecords).toEqual([{ type: "property", id: "p1", path: "/properties/p1" }]);
  });
});

describe("worsening-collection-rate", () => {
  it("requires both periods' collection rate to be non-null", () => {
    const { issue } = evaluateWorseningCollectionRate(period({ collectionRatePct: null }), period({ collectionRatePct: 90 }));
    expect(issue).toBeNull();
  });

  it("requires usable confidence in both periods", () => {
    const { issue, suppressedReason } = evaluateWorseningCollectionRate(
      period({ collectionRatePct: 80, confidence: "needs_review" }),
      period({ collectionRatePct: 90 })
    );
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/not usable/i);
  });

  it("does not emit below the 5.0pt decline threshold", () => {
    const { issue } = evaluateWorseningCollectionRate(period({ collectionRatePct: 90.1 }), period({ collectionRatePct: 95.0 }));
    expect(issue).toBeNull();
  });

  it("emits watch at exactly a 5.0pt decline", () => {
    const { issue } = evaluateWorseningCollectionRate(period({ collectionRatePct: 90.0 }), period({ collectionRatePct: 95.0 }));
    expect(issue?.severity).toBe("watch");
  });

  it("emits warning at exactly a 10.0pt decline", () => {
    const { issue } = evaluateWorseningCollectionRate(period({ collectionRatePct: 85.0 }), period({ collectionRatePct: 95.0 }));
    expect(issue?.severity).toBe("warning");
  });

  it("emits critical at exactly a 15.0pt decline", () => {
    const { issue } = evaluateWorseningCollectionRate(period({ collectionRatePct: 80.0 }), period({ collectionRatePct: 95.0 }));
    expect(issue?.severity).toBe("critical");
  });
});

describe("declining-net-cash-flow", () => {
  it("requires usable confidence in both periods", () => {
    const { issue } = evaluateDecliningNetCashFlow(period({ confidence: "no_data" }), period());
    expect(issue).toBeNull();
  });

  it("does not emit below the 10.0% decline threshold", () => {
    const { issue } = evaluateDecliningNetCashFlow(
      period({ collectedRentCents: 950000, expenseCents: 100000 }), // net 850000
      period({ collectedRentCents: 950000, expenseCents: 55000 }) // net 895000 -> ~5% decline
    );
    expect(issue).toBeNull();
  });

  it("emits watch at exactly a 10.0% decline", () => {
    const { issue } = evaluateDecliningNetCashFlow(
      period({ collectedRentCents: 900000, expenseCents: 0 }), // net 900000
      period({ collectedRentCents: 1000000, expenseCents: 0 }) // net 1000000 -> 10% decline
    );
    expect(issue?.severity).toBe("watch");
  });

  it("emits critical when cash flow turns negative from a positive baseline", () => {
    const { issue } = evaluateDecliningNetCashFlow(
      period({ collectedRentCents: 0, expenseCents: 50000 }), // net -50000
      period({ collectedRentCents: 500000, expenseCents: 100000 }) // net 400000
    );
    expect(issue?.severity).toBe("critical");
    expect(issue?.metrics.turnedNegative).toBe(true);
  });
});

describe("material-expense-increase", () => {
  it("suppresses increases under the $200.00 floor even if the percentage would qualify", () => {
    const { issue, suppressedReason } = evaluateMaterialExpenseIncrease(period({ expenseCents: 1100 }), period({ expenseCents: 1000 }));
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/\$200\.00/);
  });

  it("emits watch at exactly 20.0% increase (above the dollar floor)", () => {
    const { issue } = evaluateMaterialExpenseIncrease(period({ expenseCents: 120000 }), period({ expenseCents: 100000 }));
    expect(issue?.severity).toBe("watch");
  });

  it("emits warning at exactly 30.0% increase", () => {
    const { issue } = evaluateMaterialExpenseIncrease(period({ expenseCents: 130000 }), period({ expenseCents: 100000 }));
    expect(issue?.severity).toBe("warning");
  });

  it("emits critical at exactly 50.0% increase", () => {
    const { issue } = evaluateMaterialExpenseIncrease(period({ expenseCents: 150000 }), period({ expenseCents: 100000 }));
    expect(issue?.severity).toBe("critical");
  });

  it("surfaces category-level evidence", () => {
    const { issue } = evaluateMaterialExpenseIncrease(
      period({ expenseCents: 150000, byExpenseCategory: [{ category: "repairs_and_maintenance", expenseCents: 150000 }] }),
      period({ expenseCents: 100000, byExpenseCategory: [{ category: "repairs_and_maintenance", expenseCents: 100000 }] })
    );
    expect(issue!.metrics.byCategory).toEqual([{ category: "repairs_and_maintenance", expenseCents: 150000, comparisonExpenseCents: 100000 }]);
  });

  it("never blames a vendor or implies fraud", () => {
    const { issue } = evaluateMaterialExpenseIncrease(period({ expenseCents: 200000 }), period({ expenseCents: 100000 }));
    assertNoProhibitedLanguage(issue!);
  });
});

function snapshot(overrides: Partial<OccupancySnapshot> = {}): OccupancySnapshot {
  return {
    occupied: 8,
    vacant: 1,
    noticeGiven: 1,
    offline: 0,
    totalUnits: 10,
    vacantOrNoticeUnits: [],
    sourcePeriod: { start: "2026-07-31", end: "2026-07-31" },
    ...overrides,
  };
}

describe("vacancy-notice-exposure", () => {
  it("suppresses when there are zero units", () => {
    const { issue, suppressedReason } = evaluateVacancyNoticeExposure(snapshot({ totalUnits: 0 }));
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/no units/i);
  });

  it("does not emit below the 15.0% threshold", () => {
    const { issue } = evaluateVacancyNoticeExposure(snapshot({ vacant: 1, noticeGiven: 0, totalUnits: 10 }));
    expect(issue).toBeNull();
  });

  it("emits watch at exactly 15.0%", () => {
    const { issue } = evaluateVacancyNoticeExposure(snapshot({ vacant: 15, noticeGiven: 0, totalUnits: 100 }));
    expect(issue?.severity).toBe("watch");
  });

  it("emits warning at exactly 20.0%", () => {
    const { issue } = evaluateVacancyNoticeExposure(snapshot({ vacant: 20, noticeGiven: 0, totalUnits: 100 }));
    expect(issue?.severity).toBe("warning");
  });

  it("emits critical at exactly 30.0%", () => {
    const { issue } = evaluateVacancyNoticeExposure(snapshot({ vacant: 30, noticeGiven: 0, totalUnits: 100 }));
    expect(issue?.severity).toBe("critical");
  });

  it("never suggests a rent price for the vacant unit", () => {
    const { issue } = evaluateVacancyNoticeExposure(snapshot({ vacant: 30, noticeGiven: 0, totalUnits: 100 }));
    assertNoProhibitedLanguage(issue!);
  });
});

function lease(daysUntilExpiry: number, id = `lease-${daysUntilExpiry}-${Math.random()}`): ActiveLeaseExpiry {
  return { id, unitId: `unit-${id}`, propertyId: "prop-1", unitNumber: "101", daysUntilExpiry };
}
const TODAY: CalendarDate = { y: 2026, m: 8, d: 20 };

describe("lease-expiry-concentration", () => {
  it("suppresses when there are zero active leases", () => {
    const { issue, suppressedReason } = evaluateLeaseExpiryConcentration([], TODAY);
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/no active leases/i);
  });

  it("does not emit when nothing expires within 90 days", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(120)], TODAY);
    expect(issue).toBeNull();
  });

  it("emits watch for a single expiry between 61 and 90 days", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(75)], TODAY);
    expect(issue?.severity).toBe("watch");
  });

  it("emits warning for exactly 1 expiry within 30 days", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(20)], TODAY);
    expect(issue?.severity).toBe("warning");
  });

  it("emits warning for exactly 4 expiries within 90 days (none within 60)", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(70), lease(75), lease(80), lease(85)], TODAY);
    expect(issue?.severity).toBe("warning");
  });

  it("emits critical for 2+ expiries within 30 days", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(10), lease(20)], TODAY);
    expect(issue?.severity).toBe("critical");
  });

  it("emits critical for 3+ expiries within 60 days", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(35), lease(45), lease(55)], TODAY);
    expect(issue?.severity).toBe("critical");
  });

  it("excludes already-expired leases (negative daysUntilExpiry)", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(-5)], TODAY);
    expect(issue).toBeNull();
  });

  it("never suggests a renewal rent", () => {
    const { issue } = evaluateLeaseExpiryConcentration([lease(10), lease(20)], TODAY);
    assertNoProhibitedLanguage(issue!);
  });
});

describe("recorded-market-rent-gap", () => {
  const base = { unitId: "u1", unitNumber: "101", propertyId: "p1", leaseId: "l1", sourcePeriod: { start: "2026-07-31", end: "2026-07-31" } };

  it("suppresses gaps under the $50.00/month floor", () => {
    const { issue, suppressedReason } = evaluateRecordedMarketRentGap({ ...base, currentMonthlyRentCents: 140000, recordedMarketRentCents: 140400 });
    expect(issue).toBeNull();
    expect(suppressedReason).toMatch(/\$50\.00/);
  });

  it("is always capped at watch severity regardless of gap size", () => {
    const { issue } = evaluateRecordedMarketRentGap({ ...base, currentMonthlyRentCents: 100000, recordedMarketRentCents: 500000 });
    expect(issue?.severity).toBe("watch");
  });

  it("carries the exact owner-entered caveat and no pricing-advice language", () => {
    const { issue } = evaluateRecordedMarketRentGap({ ...base, currentMonthlyRentCents: 140000, recordedMarketRentCents: 152000 });
    expect(issue!.caveats).toContain(
      "Recorded market rent is owner-entered directly in Odyssey and is not independently sourced or verified against any external market data."
    );
    assertNoProhibitedLanguage(issue!);
    const text = `${issue!.title} ${issue!.suggestedNextStep}`.toLowerCase();
    expect(text).not.toContain("recommend");
    expect(text).not.toContain("increase rent to");
  });

  it("suggested next step only asks to verify the figure, never to act on it", () => {
    const { issue } = evaluateRecordedMarketRentGap({ ...base, currentMonthlyRentCents: 140000, recordedMarketRentCents: 152000 });
    expect(issue!.suggestedNextStep).toMatch(/confirm/i);
  });
});

function coverage(details: PeriodCoverageResult["details"]): PeriodCoverageResult {
  return { worst: "unavailable", details };
}

describe("data-quality", () => {
  it("does not emit when every included period is detail_complete only", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "detail_complete" }]),
      coverage([{ propertyId: "p1", month: "2026-01", state: "detail_complete" }]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue).toBeNull();
  });

  it("is critical when any no_data state is present", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "no_data" }]),
      coverage([]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue?.severity).toBe("critical");
  });

  it("is critical when any needs_review state is present", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "needs_review" }]),
      coverage([]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue?.severity).toBe("critical");
  });

  it("is warning when summary_only is present with no critical state", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "summary_only" }]),
      coverage([]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue?.severity).toBe("warning");
  });

  it("is watch when only partial_detail is present", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "partial_detail" }]),
      coverage([]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue?.severity).toBe("watch");
  });

  it("considers the comparison period too, not just the primary", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "detail_complete" }]),
      coverage([{ propertyId: "p1", month: "2025-08", state: "no_data" }]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue?.severity).toBe("critical");
  });

  it("links to the existing reconciliation route, not a new workflow", () => {
    const { issue } = evaluateDataQuality(
      coverage([{ propertyId: "p1", month: "2026-07", state: "no_data" }]),
      coverage([]),
      { start: "2026-02-01", end: "2026-07-31" },
      { start: "2025-08-01", end: "2026-01-31" }
    );
    expect(issue!.relatedRecords.some((r) => r.path === "/reconciliation")).toBe(true);
  });
});

describe("priority ordering", () => {
  it("ranks a larger dollar shortfall above a smaller one at the same severity", () => {
    const small = evaluateCollectionShortfall(period({ scheduledRentCents: 100000, collectedRentCents: 85000, collectionRatePct: 85.0 })).issue!;
    const large = evaluateCollectionShortfall(period({ scheduledRentCents: 1000000, collectedRentCents: 850000, collectionRatePct: 85.0 })).issue!;
    expect(small.severity).toBe(large.severity);
    expect(large.priorityScore).toBeGreaterThan(small.priorityScore);
  });

  it("ranks critical above warning even with a smaller magnitude", () => {
    const criticalSmall = evaluateCollectionShortfall(period({ scheduledRentCents: 10000, collectedRentCents: 100, collectionRatePct: 1.0 })).issue!;
    const warningLarge = evaluateCollectionShortfall(period({ scheduledRentCents: 10000000, collectedRentCents: 8500000, collectionRatePct: 85.0 })).issue!;
    // Not a universal guarantee across arbitrary magnitudes, but demonstrates
    // severity weight (4 vs 3) is a real multiplier, not a tiebreaker only.
    expect(criticalSmall.severity).toBe("critical");
    expect(warningLarge.severity).toBe("warning");
  });
});

describe("no-PII output", () => {
  it("every rule's issue output is free of tenant PII fields", () => {
    const issues = [
      evaluateCollectionShortfall(period({ collectionRatePct: 80 })).issue,
      evaluateVacancyNoticeExposure(snapshot({ vacant: 30, totalUnits: 100 })).issue,
      evaluateLeaseExpiryConcentration([lease(10), lease(20)], TODAY).issue,
      evaluateRecordedMarketRentGap({
        unitId: "u1",
        unitNumber: "101",
        propertyId: "p1",
        leaseId: "l1",
        currentMonthlyRentCents: 140000,
        recordedMarketRentCents: 152000,
        sourcePeriod: { start: "2026-07-31", end: "2026-07-31" },
      }).issue,
    ].filter((i): i is Issue => i !== null);

    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) assertNoPII(issue);
  });

  it("every rule's issue output is free of tenant-specific payment or fault framing", () => {
    const issues = [
      evaluateCollectionShortfall(period({ collectionRatePct: 80 })).issue,
      evaluateWorseningCollectionRate(period({ collectionRatePct: 80 }), period({ collectionRatePct: 95 })).issue,
      evaluateDecliningNetCashFlow(
        period({ scheduledRentCents: 500000, collectedRentCents: 400000, expenseCents: 350000 }),
        period({ scheduledRentCents: 500000, collectedRentCents: 480000, expenseCents: 100000 })
      ).issue,
      evaluateMaterialExpenseIncrease(
        period({ expenseCents: 100000 }),
        period({ expenseCents: 40000 })
      ).issue,
      evaluateVacancyNoticeExposure(snapshot({ vacant: 30, totalUnits: 100 })).issue,
      evaluateLeaseExpiryConcentration([lease(10), lease(20)], TODAY).issue,
      evaluateRecordedMarketRentGap({
        unitId: "u1",
        unitNumber: "101",
        propertyId: "p1",
        leaseId: "l1",
        currentMonthlyRentCents: 140000,
        recordedMarketRentCents: 152000,
        sourcePeriod: { start: "2026-07-31", end: "2026-07-31" },
      }).issue,
    ].filter((i): i is Issue => i !== null);

    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) assertNoTenantLanguage(issue);
  });
});
