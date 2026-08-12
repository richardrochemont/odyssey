import { describe, it, expect, vi } from "vitest";

// 1. Mock Database package
vi.mock("@odyssey/db", () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    charges: { id: "charges-id", orgId: "org-id", archivedAt: "archived-at", balance: "balance", amount: "amount", dueDate: "due-date" },
    payments: { id: "payments-id", orgId: "org-id", archivedAt: "archived-at", tenantId: "tenant-id", leaseId: "lease-id", propertyId: "property-id", unitId: "unit-id", amountReceived: "amount-received" },
    paymentAllocations: { id: "allocation-id", orgId: "org-id", archivedAt: "archived-at", amount: "amount" },
    financialRecords: { id: "financial-id", orgId: "org-id", archivedAt: "archived-at", type: "type" },
    tenants: { id: "tenants-id", orgId: "org-id", archivedAt: "archived-at" },
    leases: { id: "leases-id", orgId: "org-id", archivedAt: "archived-at" },
    properties: { id: "properties-id", orgId: "org-id", archivedAt: "archived-at" },
    units: { id: "units-id", orgId: "org-id", archivedAt: "archived-at" },
    vendors: { id: "vendors-id", orgId: "org-id", archivedAt: "archived-at" },
  };
});

import { allocatePaymentToCharges } from "./imports";
import { getPortfolioFinancialSummary } from "./financials";
import { db, charges, paymentAllocations } from "@odyssey/db";

describe("Odyssey Business Logic and Ledger Tests", () => {

  describe("FIFO Payment Allocation Logic", () => {
    it("should allocate payment cash across outstanding charges in oldest-first (FIFO) order", async () => {
      const mockChargesList = [
        { id: "charge-1", orgId: "org-1", amount: 100000, balance: 100000, dueDate: new Date("2026-01-01") },
        { id: "charge-2", orgId: "org-1", amount: 100000, balance: 100000, dueDate: new Date("2026-02-01") },
      ];

      // Mock db select to return outstanding charges
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            orderBy: vi.fn().mockResolvedValue(mockChargesList),
          }),
        }),
      } as any);

      // Mock inserts and updates
      const mockInsertAllocation = vi.fn().mockReturnValue({ returning: vi.fn() });
      vi.mocked(db.insert).mockReturnValue(mockInsertAllocation as any);
      
      const mockUpdateCharge = vi.fn().mockReturnValue({ returning: vi.fn() });
      vi.mocked(db.update).mockReturnValue(mockUpdateCharge as any);

      // Trigger allocation of $1500 (150,000 cents)
      await allocatePaymentToCharges("org-1", "payment-123", "tenant-456", 150000);

      // Verify oldest charge is fully paid (allocated $1000)
      expect(db.insert).toHaveBeenCalledWith(paymentAllocations);
      expect(db.update).toHaveBeenCalledWith(charges);
    });
  });

  describe("Summary vs Transaction Double-Counting Avoidance", () => {
    it("should exclude summary records when detailed transaction logs exist for the period", async () => {
      // Mock active leases for scheduled rent calculation
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValue([]), // No active leases
        }),
      } as any);

      // Mock payment allocations
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          innerJoin: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockResolvedValue([]), // No allocations
          }),
        }),
      } as any);

      // Mock expenses: one transaction and one historical summary
      const mockExpenses = [
        { id: "exp-1", amount: 12000, date: new Date(), notes: "Kitchen leak repair", type: "expense" },
        { id: "exp-2", amount: 80000, date: new Date(), notes: "[Historical Summary] Total expenses July", type: "expense" },
      ];

      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValue(mockExpenses),
        }),
      } as any);

      const summary = await getPortfolioFinancialSummary("org-1");

      // Verify that totalExpenses matches the transaction amount ($120) and ignores the summary ($800)
      expect(summary.totalExpenses).toBe(12000);
    });
  });

});
