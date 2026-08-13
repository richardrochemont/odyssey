import { describe, it, expect, beforeEach } from "vitest";
import { db, organizations, users, properties, units, tenants, leases, payments, charges, financialRecords, monthlyFinancialSummaries, propertyMonthFinancialCoverages } from "@odyssey/db";
import { parseCurrencyToCents } from "@odyssey/validation";
import { createCanonicalFingerprint } from "./imports";
import { getOrCalculatePropertyMonthCoverage, attestCoverageForMonth, invalidateCoverageForMonth } from "./monthlySummaries";
import { getPortfolioFinancialSummary } from "./financials";
import { generateCSVContent, CSV_TEMPLATES } from "./templates";

describe("Real Owner-Only CSV Onboarding Pilot Safeguards", () => {
  let testOrgId: string;
  let ownerUserId: string;
  let managerUserId: string;

  beforeEach(async () => {
    // Clean tables for isolated tests
    await db.delete(propertyMonthFinancialCoverages);
    await db.delete(monthlyFinancialSummaries);
    await db.delete(financialRecords);
    await db.delete(payments);
    await db.delete(charges);
    await db.delete(leases);
    await db.delete(units);
    await db.delete(tenants);
    await db.delete(properties);
    await db.delete(users);
    await db.delete(organizations);

    // Create test org and users
    const [org] = await db.insert(organizations).values({ name: "Pilot Test Org", slug: `pilot-test-${Date.now()}` }).returning();
    testOrgId = org.id;

    const [owner] = await db.insert(users).values({
      orgId: testOrgId,
      email: "owner@pilot.com",
      passwordHash: "hash123",
      name: "Owner User",
      role: "owner"
    }).returning();
    ownerUserId = owner.id;

    const [manager] = await db.insert(users).values({
      orgId: testOrgId,
      email: "manager@pilot.com",
      passwordHash: "hash123",
      name: "Manager User",
      role: "manager"
    }).returning();
    managerUserId = manager.id;
  });

  // 1. Currency Parser Tests
  describe("parseCurrencyToCents Utility", () => {
    it("parses clean currency strings to integer cents", () => {
      expect(parseCurrencyToCents("1850")).toBe(185000);
      expect(parseCurrencyToCents("1850.50")).toBe(185050);
      expect(parseCurrencyToCents("1,850.50")).toBe(185050);
      expect(parseCurrencyToCents("$1,850.50")).toBe(185050);
      expect(parseCurrencyToCents("  $ 1,850.5 ")).toBe(185050);
    });

    it("rejects invalid or unsafe currency formats", () => {
      expect(() => parseCurrencyToCents("1850.555")).toThrow(); // >2 decimals
      expect(() => parseCurrencyToCents("abc")).toThrow();
      expect(() => parseCurrencyToCents("-100")).toThrow(); // negative when not allowed
      expect(() => parseCurrencyToCents("")).toThrow();
    });
  });

  // 2. Canonical Fingerprint Tests
  describe("Canonical Fingerprinting & Idempotency", () => {
    it("produces identical SHA-256 fingerprint regardless of whitespace or key ordering", () => {
      const rowA = { propertyExternalKey: "PROP_01", amount: "$1,850.50", tenantEmail: "JOHN.DOE@EXAMPLE.COM " };
      const rowB = { tenantEmail: "john.doe@example.com", amount: "1850.50", propertyExternalKey: " PROP_01 " };
      expect(createCanonicalFingerprint(rowA)).toBe(createCanonicalFingerprint(rowB));
    });
  });

  // 3. no_data Presentation & Coverage States
  describe("Coverage State Machine & Financial Summary Calculations", () => {
    it("returns status no_data and NULL metrics when no summary or transactions exist", async () => {
      const [prop] = await db.insert(properties).values({
        orgId: testOrgId,
        externalKey: "PROP_TEST",
        propertyName: "Test Prop",
        addressLine1: "123 Main St",
        city: "Delray Beach",
        state: "FL",
        postalCode: "33483",
        address: "123 Main St",
        nickname: "Test Prop",
        propertyType: "multi_family",
        acquisitionDate: new Date(),
      }).returning();

      const summary = await getPortfolioFinancialSummary(testOrgId, prop.id, new Date(2026, 4, 1), new Date(2026, 4, 31));
      expect(summary.status).toBe("no_data");
      expect(summary.scheduledRent).toBeNull();
      expect(summary.recordedRent).toBeNull();
      expect(summary.totalExpenses).toBeNull();
      expect(summary.netOperatingIncome).toBeNull();
      expect(summary.notes).toContain("No financial data available");
    });

    it("retains summary baseline ($4,000) when partial $15 transaction exists without wiping summary", async () => {
      const [prop] = await db.insert(properties).values({
        orgId: testOrgId,
        externalKey: "PROP_TEST_2",
        propertyName: "Test Prop 2",
        addressLine1: "456 Ocean Ave",
        city: "Delray Beach",
        state: "FL",
        postalCode: "33483",
        address: "456 Ocean Ave",
        nickname: "Test Prop 2",
        propertyType: "multi_family",
        acquisitionDate: new Date(),
      }).returning();

      const monthStr = "2026-05";
      const startOfMonth = new Date("2026-05-01");

      // Insert summary ($4,000)
      await db.insert(monthlyFinancialSummaries).values({
        orgId: testOrgId,
        propertyId: prop.id,
        month: monthStr,
        scheduledRentCents: 500000,
        collectedRentCents: 500000,
        expenseCents: 400000,
      });

      // Insert 1 small $15 detailed expense
      await db.insert(financialRecords).values({
        orgId: testOrgId,
        propertyId: prop.id,
        type: "expense",
        amount: 1500, // $15
        date: new Date("2026-05-10"),
        category: "supplies",
      });

      const coverage = await getOrCalculatePropertyMonthCoverage(testOrgId, prop.id, monthStr);
      expect(coverage.state).toBe("partial_detail");

      const summary = await getPortfolioFinancialSummary(testOrgId, prop.id, startOfMonth, new Date("2026-05-31"));
      expect(summary.status).toBe("partial_detail");
      expect(summary.totalExpenses).toBe(400000); // 400000 cents ($4,000), NOT 1500 cents ($15)!
    });

    it("automatically invalidates coverage to needs_review when new transaction is added to detail_complete month", async () => {
      const [prop] = await db.insert(properties).values({
        orgId: testOrgId,
        externalKey: "PROP_TEST_3",
        propertyName: "Test Prop 3",
        addressLine1: "789 Atlantic Ave",
        city: "Delray Beach",
        state: "FL",
        postalCode: "33483",
        address: "789 Atlantic Ave",
        nickname: "Test Prop 3",
        propertyType: "multi_family",
        acquisitionDate: new Date(),
      }).returning();

      const monthStr = "2026-05";

      // Owner attests coverage complete
      await attestCoverageForMonth(testOrgId, ownerUserId, "owner", prop.id, monthStr, "detail_complete", "Verified by audit");
      
      let coverage = await getOrCalculatePropertyMonthCoverage(testOrgId, prop.id, monthStr);
      expect(coverage.state).toBe("detail_complete");

      // Now invalidate via new payment trigger
      await invalidateCoverageForMonth(testOrgId, prop.id, monthStr, "payment", "dummy-payment-id", ownerUserId);

      coverage = await getOrCalculatePropertyMonthCoverage(testOrgId, prop.id, monthStr);
      expect(coverage.state).toBe("needs_review");
    });
  });

  // 4. RBAC & Attestation Security Tests
  describe("Owner Attestation RBAC", () => {
    it("allows Owner to attest coverage complete but rejects Manager role with 403 error", async () => {
      const [prop] = await db.insert(properties).values({
        orgId: testOrgId,
        externalKey: "PROP_TEST_RBAC",
        propertyName: "RBAC Prop",
        addressLine1: "100 Atlantic Ave",
        city: "Delray Beach",
        state: "FL",
        postalCode: "33483",
        address: "100 Atlantic Ave",
        nickname: "RBAC Prop",
        propertyType: "multi_family",
        acquisitionDate: new Date(),
      }).returning();

      await expect(
        attestCoverageForMonth(testOrgId, managerUserId, "manager", prop.id, "2026-05", "detail_complete", "Manager attempt")
      ).rejects.toThrow(/authorized workspace Owner/);

      const success = await attestCoverageForMonth(testOrgId, ownerUserId, "owner", prop.id, "2026-05", "detail_complete", "Owner signoff");
      expect(success.state).toBe("detail_complete");
    });
  });

  // 5. Template Generation Tests
  describe("CSV Template Generator", () => {
    it("generates downloadable CSV headers and sample data for all 7 CSV types", () => {
      Object.keys(CSV_TEMPLATES).forEach((type) => {
        const t = CSV_TEMPLATES[type];
        const csvStr = generateCSVContent(t);
        expect(csvStr).toContain(t.headers.join(","));
        expect(csvStr.split("\n").length).toBeGreaterThan(1);
      });
    });
  });
});
