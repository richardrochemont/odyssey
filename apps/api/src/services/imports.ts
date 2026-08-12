import { db, importSources, importRuns, importRows, properties, units, tenants, leases, payments, charges, paymentAllocations, financialRecords, vendors } from "@odyssey/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logAction } from "./audit";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let importQueue: Queue | null = null;

try {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  importQueue = new Queue("odyssey-jobs", { connection });
  console.log(`[Imports Service] Initialized BullMQ queue 'odyssey-jobs' connected to Redis at ${REDIS_URL}`);
} catch (e) {
  console.error("[Imports Service] Failed to connect to Redis/BullMQ. Mocks will run synchronously.", e);
}

// Simple robust CSV parser that handles quotes and commas
export function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  return lines.map(line => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ""));
    return result;
  });
}

export async function createImportSource(orgId: string, userId: string, name: string, type: "csv_upload" | "bank_feed") {
  const [source] = await db.insert(importSources).values({
    orgId,
    name,
    type,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "import_source",
    entityId: source.id,
    action: "create",
    newState: source,
  });

  return source;
}

export async function getOrCreateDefaultCSVSource(orgId: string, userId: string) {
  const [existing] = await db.select()
    .from(importSources)
    .where(and(eq(importSources.orgId, orgId), eq(importSources.type, "csv_upload"), isNull(importSources.archivedAt)))
    .limit(1);

  if (existing) return existing;
  return createImportSource(orgId, userId, "Default CSV Import Upload", "csv_upload");
}

export async function listImportSources(orgId: string) {
  return db.select()
    .from(importSources)
    .where(and(eq(importSources.orgId, orgId), isNull(importSources.archivedAt)));
}

export async function listImportRuns(orgId: string) {
  return db.select()
    .from(importRuns)
    .where(and(eq(importRuns.orgId, orgId), isNull(importRuns.archivedAt)));
}

export async function getImportRunDetails(orgId: string, runId: string) {
  const [run] = await db.select()
    .from(importRuns)
    .where(and(eq(importRuns.orgId, orgId), eq(importRuns.id, runId), isNull(importRuns.archivedAt)));
  
  if (!run) return null;

  const rows = await db.select()
    .from(importRows)
    .where(eq(importRows.runId, runId))
    .orderBy(importRows.rowNumber);

  return { run, rows };
}

// Generate columns mappings and first 5 rows preview
export async function getCSVPreview(csvContent: string) {
  const parsed = parseCSV(csvContent);
  if (parsed.length === 0) {
    throw new Error("CSV file is empty");
  }
  const headers = parsed[0];
  const previewRows = parsed.slice(1, 6).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] || "";
    });
    return obj;
  });
  return { headers, previewRows };
}

export async function createImportRun(
  orgId: string,
  userId: string,
  sourceId: string,
  fileName: string,
  importType: "properties" | "units" | "tenants" | "leases" | "payments" | "expenses" | "transactions",
  csvContent: string,
  columnMapping: Record<string, string>
) {
  const parsed = parseCSV(csvContent);
  if (parsed.length < 2) {
    throw new Error("CSV contains no rows to import");
  }

  const headers = parsed[0];
  const dataRows = parsed.slice(1);

  // 1. Insert Import Run
  const [run] = await db.insert(importRuns).values({
    orgId,
    sourceId,
    fileName,
    importType,
    status: "pending",
    totalRows: dataRows.length,
    processedRows: 0,
    failedRows: 0,
  }).returning();

  // 2. Insert Import Rows (mapped)
  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i];
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      // Map based on matching headers
      const targetColumn = columnMapping[h];
      if (targetColumn) {
        rowObj[targetColumn] = rawRow[idx] || "";
      } else {
        rowObj[h] = rawRow[idx] || "";
      }
    });

    await db.insert(importRows).values({
      orgId,
      runId: run.id,
      rowNumber: i + 2, // 1-indexed, line 1 is header
      rawData: rowObj,
      status: "pending",
    });
  }

  // 3. Dispatch worker job or execute synchronously if worker is unavailable
  if (importQueue) {
    await importQueue.add("data-import", { runId: run.id, orgId, userId });
    console.log(`[Imports Service] Dispatched background import job for run ${run.id}`);
  } else {
    console.log(`[Imports Service] Worker Queue unavailable. Running synchronous import fallback...`);
    // Run sync fallback
    setTimeout(() => {
      processImportRunJob(run.id, orgId, userId).catch(err => {
        console.error(`[Imports Service] Synchronous fallback import job failed:`, err);
      });
    }, 100);
  }

  await logAction({
    orgId,
    userId,
    entityType: "import_run",
    entityId: run.id,
    action: "create",
    newState: run,
  });

  return run;
}

// Background process handler (invoked by Worker or sync fallback)
export async function processImportRunJob(runId: string, orgId: string, userId: string) {
  const [run] = await db.select()
    .from(importRuns)
    .where(and(eq(importRuns.orgId, orgId), eq(importRuns.id, runId)));

  if (!run || run.status !== "pending") return;

  console.log(`[Worker - Import] Processing import run ${runId} (Type: ${run.importType})`);
  
  await db.update(importRuns)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(importRuns.id, runId));

  const rows = await db.select()
    .from(importRows)
    .where(eq(importRows.runId, runId));

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const data = row.rawData as Record<string, string>;
      const targetId = await processImportRow(orgId, userId, run.importType, data, runId);
      
      await db.update(importRows)
        .set({ status: "imported", targetEntityId: targetId, updatedAt: new Date() })
        .where(eq(importRows.id, row.id));

      succeeded++;
    } catch (e: any) {
      console.error(`[Worker - Import] Row ${row.rowNumber} failed:`, e.message);
      await db.update(importRows)
        .set({ status: "failed", validationErrors: [e.message], updatedAt: new Date() })
        .where(eq(importRows.id, row.id));

      failed++;
      errors.push(`Row ${row.rowNumber}: ${e.message}`);
    }

    // Progress updates
    await db.update(importRuns)
      .set({
        processedRows: succeeded + failed,
        failedRows: failed,
        updatedAt: new Date(),
      })
      .where(eq(importRuns.id, runId));
  }

  const finalStatus = failed === run.totalRows ? "failed" : "completed";
  const errorSummary = errors.slice(0, 10).join("\n") + (errors.length > 10 ? `\n...and ${errors.length - 10} more` : "");

  const [updatedRun] = await db.update(importRuns)
    .set({
      status: finalStatus,
      errorSummary: errors.length > 0 ? errorSummary : null,
      updatedAt: new Date(),
    })
    .where(eq(importRuns.id, runId))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "import_run",
    entityId: runId,
    action: "update",
    newState: updatedRun,
  });

  console.log(`[Worker - Import] Finished run ${runId}. Success: ${succeeded}, Failed: ${failed}`);
}

// Maps and imports individual row entities with validation & deduplication
async function processImportRow(
  orgId: string,
  userId: string,
  importType: string,
  data: Record<string, string>,
  runId: string
): Promise<string> {
  if (importType === "properties") {
    const address = data.address?.trim();
    const nickname = data.nickname?.trim();
    const propertyType = data.propertyType?.trim() || "single_family";
    const ownership = parseInt(data.ownershipPercentage || "100", 10);
    const value = parseInt(data.estimatedValue || "0", 10);
    const dateStr = data.acquisitionDate?.trim();

    if (!address || !nickname || !dateStr) {
      throw new Error("Address, nickname, and acquisition date are required fields");
    }

    const acquisitionDate = new Date(dateStr);
    if (isNaN(acquisitionDate.getTime())) {
      throw new Error(`Invalid acquisition date format: ${dateStr}`);
    }

    // Deduplication check
    const [existing] = await db.select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.nickname, nickname), isNull(properties.archivedAt)))
      .limit(1);

    if (existing) {
      // Return existing ID instead of creating duplicate
      return existing.id;
    }

    const [prop] = await db.insert(properties).values({
      orgId,
      address,
      nickname,
      propertyType,
      ownershipPercentage: ownership,
      acquisitionDate,
      estimatedValue: value * 100, // store in cents
      importRunId: runId,
    }).returning();

    await logAction({
      orgId,
      userId,
      entityType: "property",
      entityId: prop.id,
      action: "create",
      newState: prop,
    });

    return prop.id;
  }

  if (importType === "units") {
    const propNickname = data.propertyNickname?.trim();
    const unitNumber = data.unitNumber?.trim();
    const rentVal = parseFloat(data.monthlyRent || "0");
    const sqft = data.sizeSqFt ? parseInt(data.sizeSqFt, 10) : null;
    const status = data.status?.trim() || "vacant";

    if (!propNickname || !unitNumber) {
      throw new Error("Property nickname and unit number are required");
    }

    // Resolve property reference
    const [prop] = await db.select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.nickname, propNickname), isNull(properties.archivedAt)))
      .limit(1);

    if (!prop) {
      throw new Error(`Referenced property nickname not found: ${propNickname}`);
    }

    // Deduplication check
    const [existing] = await db.select()
      .from(units)
      .where(and(eq(units.orgId, orgId), eq(units.propertyId, prop.id), eq(units.unitNumber, unitNumber), isNull(units.archivedAt)))
      .limit(1);

    if (existing) return existing.id;

    const [unit] = await db.insert(units).values({
      orgId,
      propertyId: prop.id,
      unitNumber,
      status,
      monthlyRent: Math.round(rentVal * 100),
      sizeSqFt: sqft,
      importRunId: runId,
    }).returning();

    await logAction({
      orgId,
      userId,
      entityType: "unit",
      entityId: unit.id,
      action: "create",
      newState: unit,
    });

    return unit.id;
  }

  if (importType === "tenants") {
    const name = data.name?.trim();
    const email = data.email?.trim()?.toLowerCase();
    const phone = data.phone?.trim();
    const notes = data.notes?.trim();

    if (!name || !email || !phone) {
      throw new Error("Name, email, and phone number are required");
    }

    // Deduplication check
    const [existing] = await db.select()
      .from(tenants)
      .where(and(eq(tenants.orgId, orgId), eq(tenants.email, email), isNull(tenants.archivedAt)))
      .limit(1);

    if (existing) return existing.id;

    const [tenant] = await db.insert(tenants).values({
      orgId,
      name,
      email,
      phone,
      notes,
      importRunId: runId,
    }).returning();

    await logAction({
      orgId,
      userId,
      entityType: "tenant",
      entityId: tenant.id,
      action: "create",
      newState: tenant,
    });

    return tenant.id;
  }

  if (importType === "leases") {
    const unitNumber = data.unitNumber?.trim();
    const propNickname = data.propertyNickname?.trim();
    const tenantEmail = data.tenantEmail?.trim()?.toLowerCase();
    const startStr = data.startDate?.trim();
    const endStr = data.endDate?.trim();
    const rentVal = parseFloat(data.monthlyRent || "0");
    const depositVal = parseFloat(data.securityDeposit || "0");

    if (!unitNumber || !propNickname || !tenantEmail || !startStr || !endStr) {
      throw new Error("Unit number, property nickname, tenant email, start date, and end date are required");
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error("Invalid start or end date formats");
    }

    // Resolve property and unit
    const [prop] = await db.select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.nickname, propNickname), isNull(properties.archivedAt)))
      .limit(1);

    if (!prop) throw new Error(`Property ${propNickname} not found`);

    const [unit] = await db.select()
      .from(units)
      .where(and(eq(units.orgId, orgId), eq(units.propertyId, prop.id), eq(units.unitNumber, unitNumber), isNull(units.archivedAt)))
      .limit(1);

    if (!unit) throw new Error(`Unit ${unitNumber} not found in property ${propNickname}`);

    // Resolve tenant
    const [tenant] = await db.select()
      .from(tenants)
      .where(and(eq(tenants.orgId, orgId), eq(tenants.email, tenantEmail), isNull(tenants.archivedAt)))
      .limit(1);

    if (!tenant) throw new Error(`Renter with email ${tenantEmail} not found`);

    // Deduplication check
    const [existing] = await db.select()
      .from(leases)
      .where(and(
        eq(leases.orgId, orgId),
        eq(leases.unitId, unit.id),
        eq(leases.primaryTenantId, tenant.id),
        eq(leases.startDate, startDate),
        isNull(leases.archivedAt)
      ))
      .limit(1);

    if (existing) return existing.id;

    const [lease] = await db.insert(leases).values({
      orgId,
      unitId: unit.id,
      primaryTenantId: tenant.id,
      startDate,
      endDate,
      monthlyRent: Math.round(rentVal * 100),
      securityDeposit: Math.round(depositVal * 100),
      status: data.status || "active",
      importRunId: runId,
    }).returning();

    await logAction({
      orgId,
      userId,
      entityType: "lease",
      entityId: lease.id,
      action: "create",
      newState: lease,
    });

    // Generate monthly charges based on lease rent schedule
    let currentDate = new Date(startDate);
    while (currentDate < endDate) {
      const chargeDate = new Date(currentDate);
      await db.insert(charges).values({
        orgId,
        leaseId: lease.id,
        tenantId: tenant.id,
        propertyId: prop.id,
        unitId: unit.id,
        type: "rent",
        amount: lease.monthlyRent,
        dueDate: chargeDate,
        balance: lease.monthlyRent,
        status: "upcoming",
        importRunId: runId,
      });
      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return lease.id;
  }

  if (importType === "payments") {
    const tenantEmail = data.tenantEmail?.trim()?.toLowerCase();
    const amountVal = parseFloat(data.amount || "0");
    const dateStr = data.receivedDate?.trim() || data.paidDate?.trim();
    const method = data.method?.trim() || "cash";
    const memo = data.memo?.trim() || "";

    if (!tenantEmail || amountVal <= 0 || !dateStr) {
      throw new Error("Tenant email, non-zero amount, and transaction date are required");
    }

    const receivedDate = new Date(dateStr);
    if (isNaN(receivedDate.getTime())) {
      throw new Error(`Invalid payment date format: ${dateStr}`);
    }

    // Resolve tenant
    const [tenant] = await db.select()
      .from(tenants)
      .where(and(eq(tenants.orgId, orgId), eq(tenants.email, tenantEmail), isNull(tenants.archivedAt)))
      .limit(1);

    if (!tenant) throw new Error(`Renter ${tenantEmail} not found`);

    // Find active lease to associate
    const [lease] = await db.select()
      .from(leases)
      .where(and(eq(leases.orgId, orgId), eq(leases.primaryTenantId, tenant.id), eq(leases.status, "active"), isNull(leases.archivedAt)))
      .limit(1);

    if (!lease) throw new Error(`No active lease found for renter ${tenant.name}`);

    const [unit] = await db.select()
      .from(units)
      .where(eq(units.id, lease.unitId))
      .limit(1);
    if (!unit) throw new Error("Unit referenced by lease not found");

    // Deduplication matching
    const amountCents = Math.round(amountVal * 100);
    const [existing] = await db.select()
      .from(payments)
      .where(and(
        eq(payments.orgId, orgId),
        eq(payments.tenantId, tenant.id),
        eq(payments.amountReceived, amountCents),
        eq(payments.paidDate, receivedDate),
        isNull(payments.archivedAt)
      ))
      .limit(1);

    if (existing) return existing.id;

    // Create payment
    const [payment] = await db.insert(payments).values({
      orgId,
      tenantId: tenant.id,
      leaseId: lease.id,
      propertyId: unit.propertyId,
      unitId: lease.unitId,
      amountReceived: amountCents,
      paidDate: receivedDate,
      paymentMethod: method,
      memo,
      source: "imported",
      status: "paid",
      importRunId: runId,
    }).returning();

    // Allocate payment automatically
    await allocatePaymentToCharges(orgId, payment.id, tenant.id, amountCents);

    await logAction({
      orgId,
      userId,
      entityType: "payment",
      entityId: payment.id,
      action: "create",
      newState: payment,
    });

    return payment.id;
  }

  if (importType === "expenses") {
    const propNickname = data.propertyNickname?.trim();
    const amountVal = parseFloat(data.amount || "0");
    const dateStr = data.date?.trim();
    const category = data.category?.trim() || "other";
    const notes = data.notes?.trim() || "";
    const vendorName = data.vendorName?.trim();

    if (!propNickname || amountVal <= 0 || !dateStr) {
      throw new Error("Property nickname, non-zero amount, and expense date are required");
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid expense date format: ${dateStr}`);
    }

    // Resolve property
    const [prop] = await db.select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.nickname, propNickname), isNull(properties.archivedAt)))
      .limit(1);

    if (!prop) throw new Error(`Property ${propNickname} not found`);

    // Get or create vendor if name provided
    let vendorId = null;
    if (vendorName) {
      const [existingVendor] = await db.select()
        .from(vendors)
        .where(and(eq(vendors.orgId, orgId), eq(vendors.name, vendorName), isNull(vendors.archivedAt)))
        .limit(1);

      if (existingVendor) {
        vendorId = existingVendor.id;
      } else {
        const [vendor] = await db.insert(vendors).values({
          orgId,
          name: vendorName,
          specialty: "general",
        }).returning();
        vendorId = vendor.id;
      }
    }

    // Deduplication check
    const amountCents = Math.round(amountVal * 100);
    const [existing] = await db.select()
      .from(financialRecords)
      .where(and(
        eq(financialRecords.orgId, orgId),
        eq(financialRecords.propertyId, prop.id),
        eq(financialRecords.amount, amountCents),
        eq(financialRecords.date, date),
        eq(financialRecords.category, category),
        isNull(financialRecords.archivedAt)
      ))
      .limit(1);

    if (existing) return existing.id;

    // Check if this is explicitly summary data to prevent double-counting
    const isSummary = data.isHistoricalSummary === "true" || data.is_historical_summary === "true" || data.isSummary === "true";

    const [record] = await db.insert(financialRecords).values({
      orgId,
      propertyId: prop.id,
      type: "expense",
      amount: amountCents,
      date,
      category,
      notes: isSummary ? `[Historical Summary] ${notes}` : notes,
      vendorId,
      state: "approved",
      importRunId: runId,
    }).returning();

    await logAction({
      orgId,
      userId,
      entityType: "financial_record",
      entityId: record.id,
      action: "create",
      newState: record,
    });

    return record.id;
  }

  throw new Error(`Unsupported import type: ${importType}`);
}

// Allocates incoming cash across outstanding charges in FIFO order
export async function allocatePaymentToCharges(orgId: string, paymentId: string, tenantId: string, initialAmountCents: number) {
  let remainingAmount = initialAmountCents;

  // Query all unpaid / partially paid charges for this tenant ordered by due date (FIFO)
  const outstandingCharges = await db.select()
    .from(charges)
    .where(and(
      eq(charges.orgId, orgId),
      eq(charges.tenantId, tenantId),
      sql`${charges.balance} > 0`,
      isNull(charges.archivedAt)
    ))
    .orderBy(charges.dueDate);

  for (const charge of outstandingCharges) {
    if (remainingAmount <= 0) break;

    const allocationAmount = Math.min(charge.balance, remainingAmount);
    remainingAmount -= allocationAmount;

    // Insert allocation
    await db.insert(paymentAllocations).values({
      orgId,
      paymentId,
      chargeId: charge.id,
      amount: allocationAmount,
    });

    // Update charge balance & status
    const newBalance = charge.balance - allocationAmount;
    const newStatus = newBalance === 0 ? "paid" : "partial";

    await db.update(charges)
      .set({ balance: newBalance, status: newStatus, updatedAt: new Date() })
      .where(eq(charges.id, charge.id));
  }
}

// Computes reconciliation statistics matching payments/expenses with charges
export async function getReconciliationStatus(orgId: string) {
  const activeLeases = await db.select({ id: leases.id, monthlyRent: leases.monthlyRent }).from(leases).where(and(eq(leases.orgId, orgId), eq(leases.status, "active"), isNull(leases.archivedAt)));
  const totalLeaseRent = activeLeases.reduce((sum, l) => sum + l.monthlyRent, 0);

  const rentCharges = await db.select().from(charges).where(and(eq(charges.orgId, orgId), eq(charges.type, "rent"), isNull(charges.archivedAt)));
  const totalRentBilled = rentCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRentCollected = rentCharges.reduce((sum, c) => sum + (c.amount - c.balance), 0);

  const rawPayments = await db.select().from(payments).where(and(eq(payments.orgId, orgId), isNull(payments.archivedAt)));
  const totalReceivedCash = rawPayments.reduce((sum, p) => sum + p.amountReceived, 0);

  const rawExpenses = await db.select().from(financialRecords).where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.type, "expense"), isNull(financialRecords.archivedAt)));
  const totalExpenses = rawExpenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    scheduledMonthlyRent: totalLeaseRent / 100,
    totalRentBilled: totalRentBilled / 100,
    totalRentCollected: totalRentCollected / 100,
    totalReceivedCash: totalReceivedCash / 100,
    totalExpenses: totalExpenses / 100,
    unallocatedCash: Math.max(0, totalReceivedCash - totalRentCollected) / 100,
    unpaidBalance: rentCharges.reduce((sum, c) => sum + c.balance, 0) / 100,
  };
}
