import { db, importSources, importRuns, importRows, properties, units, tenants, leases, payments, charges, paymentAllocations, financialRecords, vendors, monthlyFinancialSummaries } from "@odyssey/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logAction } from "./audit";
import { parseCurrencyToCents, PropertiesCSVSchema, UnitsCSVSchema, TenantsCSVSchema, LeasesCSVSchema, HistoricalPaymentsCSVSchema, HistoricalExpensesCSVSchema, MonthlySummaryCSVSchema } from "@odyssey/validation";
import { invalidateCoverageForMonth } from "./monthlySummaries";
import crypto from "crypto";

// --- Date Parser & Timezone Safety Helpers ---
export function parseCalendarDateToNoonUTC(dateStr: string): Date {
  const clean = dateStr.trim();
  const match = clean.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) throw new Error(`Invalid calendar date format (expected YYYY-MM-DD): "${dateStr}"`);
  
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date values (out of bounds for calendar month): "${dateStr}"`);
  }
  return d;
}

export function formatCalendarDateToYYYYMMDD(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCalendarDateToCoverageMonth(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function allocatePaymentToCharges(orgId: string, paymentId: string, tenantId: string, initialAmountCents: number) {
  let remainingAmount = initialAmountCents;

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

    await db.insert(paymentAllocations).values({
      orgId,
      paymentId,
      chargeId: charge.id,
      amount: allocationAmount,
    });

    const newBalance = charge.balance - allocationAmount;
    const newStatus = newBalance === 0 ? "paid" : "partial";

    await db.update(charges)
      .set({ balance: newBalance, status: newStatus, updatedAt: new Date() })
      .where(eq(charges.id, charge.id));
  }
}

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

export function createCanonicalFingerprint(row: Record<string, any>): string {
  const sortedKeys = Object.keys(row).sort();
  const normalized: Record<string, string> = {};
  for (const key of sortedKeys) {
    let val = String(row[key] ?? "").trim();
    if (key.toLowerCase().includes("email")) val = val.toLowerCase();
    if (key.toLowerCase().includes("date")) {
      try {
        val = formatCalendarDateToYYYYMMDD(parseCalendarDateToNoonUTC(val));
      } catch {
        // preserve original if not a valid calendar date string
      }
    }
    if (key.toLowerCase().includes("amount") || key.toLowerCase().includes("rent") || key.toLowerCase().includes("value") || key.toLowerCase().includes("expense")) {
      try {
        val = String(parseCurrencyToCents(val, true));
      } catch {
        // preserve original if not valid currency
      }
    }
    normalized[key] = val;
  }
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function getOrCreateDefaultCSVSource(orgId: string, _userId: string) {
  const [existing] = await db.select()
    .from(importSources)
    .where(and(
      eq(importSources.orgId, orgId),
      eq(importSources.type, "csv_upload"),
      isNull(importSources.archivedAt)
    ))
    .limit(1);

  if (existing) return existing;

  const [source] = await db.insert(importSources).values({
    orgId,
    name: "CSV Manual Upload",
    type: "csv_upload",
  }).returning();

  return source;
}

export async function getCSVPreview(csvContent: string) {
  const parsed = parseCSV(csvContent);
  if (parsed.length === 0) throw new Error("CSV file is empty");
  const headers = parsed[0];
  const sampleRows = parsed.slice(1, 6);
  return { headers, sampleRows, totalRows: parsed.length - 1 };
}

export async function createImportRun(
  orgId: string,
  userId: string,
  sourceId: string,
  fileName: string,
  importType: string,
  csvContent: string,
  columnMapping: Record<string, string>
) {
  const parsed = parseCSV(csvContent);
  if (parsed.length < 2) throw new Error("CSV must contain a header row and at least one data row");

  const headers = parsed[0];
  const dataRows = parsed.slice(1);

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

  for (let i = 0; i < dataRows.length; i++) {
    const rowValues = dataRows[i];
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      const mappedField = columnMapping[header];
      if (mappedField) {
        rowObj[mappedField] = rowValues[idx] || "";
      }
    });

    const fingerprint = createCanonicalFingerprint(rowObj);

    await db.insert(importRows).values({
      orgId,
      runId: run.id,
      rowNumber: i + 1,
      rawData: rowObj,
      rowFingerprint: fingerprint,
      status: "pending",
    });
  }

  await processImportRunJob(run.id, orgId, userId);

  await logAction({
    orgId,
    userId,
    entityType: "import_run",
    entityId: run.id,
    action: "create",
    newState: run,
  });

  return getImportRunDetails(orgId, run.id);
}

export async function processImportRunJob(runId: string, orgId: string, userId: string) {
  const [run] = await db.select()
    .from(importRuns)
    .where(and(eq(importRuns.orgId, orgId), eq(importRuns.id, runId)));

  if (!run || run.status !== "pending") return;

  await db.update(importRuns)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(importRuns.id, runId));

  const rows = await db.select()
    .from(importRows)
    .where(eq(importRows.runId, runId))
    .orderBy(importRows.rowNumber);

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const data = row.rawData as Record<string, string>;
      const result = await processImportRow(orgId, userId, run.importType, data, run.id, run.sourceId, row.rowFingerprint || "");

      await db.update(importRows)
        .set({
          status: result.status,
          targetEntityId: result.entityId || null,
          duplicateClassification: result.duplicateClassification || null,
          validationErrors: result.errors && result.errors.length > 0 ? result.errors : null,
          updatedAt: new Date(),
        })
        .where(eq(importRows.id, row.id));

      if (result.status === "failed") {
        failed++;
        errors.push(`Row ${row.rowNumber}: ${(result.errors || []).join(", ")}`);
      } else {
        succeeded++;
      }
    } catch (e: any) {
      await db.update(importRows)
        .set({ status: "failed", validationErrors: [e.message], updatedAt: new Date() })
        .where(eq(importRows.id, row.id));

      failed++;
      errors.push(`Row ${row.rowNumber}: ${e.message}`);
    }

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

  await db.update(importRuns)
    .set({
      status: finalStatus,
      errorSummary: errors.length > 0 ? errorSummary : null,
      updatedAt: new Date(),
    })
    .where(eq(importRuns.id, runId));
}

export async function listImportRuns(orgId: string) {
  return db.select()
    .from(importRuns)
    .where(and(eq(importRuns.orgId, orgId)))
    .orderBy(importRuns.createdAt);
}

export async function getImportRunDetails(orgId: string, runId: string) {
  const [run] = await db.select()
    .from(importRuns)
    .where(and(eq(importRuns.orgId, orgId), eq(importRuns.id, runId)));

  if (!run) return null;

  const rows = await db.select()
    .from(importRows)
    .where(and(eq(importRows.orgId, orgId), eq(importRows.runId, runId)))
    .orderBy(importRows.rowNumber);

  return { ...run, rows };
}

// Handler result type
interface ProcessRowResult {
  status: "imported" | "needs_review" | "failed";
  entityId?: string;
  duplicateClassification?: "exact_duplicate" | "conflicting_reference" | "possible_cross_source_duplicate";
  errors?: string[];
}

async function processImportRow(
  orgId: string,
  userId: string,
  importType: string,
  data: Record<string, string>,
  runId: string,
  sourceId: string,
  rowFingerprint: string
): Promise<ProcessRowResult> {
  // 1. Check Exact Duplicate within same source & fingerprint
  if (rowFingerprint) {
    const [existingRow] = await db.select()
      .from(importRows)
      .innerJoin(importRuns, eq(importRows.runId, importRuns.id))
      .where(and(
        eq(importRows.orgId, orgId),
        eq(importRuns.sourceId, sourceId),
        eq(importRows.rowFingerprint, rowFingerprint),
        eq(importRows.status, "imported")
      ))
      .limit(1);

    if (existingRow && existingRow.import_rows.targetEntityId) {
      return {
        status: "imported",
        entityId: existingRow.import_rows.targetEntityId,
        duplicateClassification: "exact_duplicate",
      };
    }
  }

  // --- Handlers ---

  if (importType === "properties") {
    const validated = PropertiesCSVSchema.parse(data);
    const extKey = validated.propertyExternalKey?.trim();

    const [existingKey] = await db.select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.externalKey, extKey), isNull(properties.archivedAt)))
      .limit(1);

    if (existingKey) {
      // On upsert, update non-key metadata while preserving acquisitionDate if omitted
      const updatedAcquisitionDate = validated.acquisitionDate 
        ? parseCalendarDateToNoonUTC(validated.acquisitionDate) 
        : existingKey.acquisitionDate;

      const [updated] = await db.update(properties)
        .set({
          propertyName: validated.propertyName,
          addressLine1: validated.addressLine1,
          addressLine2: validated.addressLine2 || null,
          city: validated.city,
          state: validated.state,
          postalCode: validated.postalCode,
          address: `${validated.addressLine1}, ${validated.city}, ${validated.state} ${validated.postalCode}`,
          nickname: validated.propertyName,
          propertyType: validated.propertyType,
          acquisitionDate: updatedAcquisitionDate,
          estimatedValue: validated.estimatedValue || 0,
          updatedAt: new Date(),
        })
        .where(eq(properties.id, existingKey.id))
        .returning();

      return { status: "imported", entityId: updated.id, duplicateClassification: "exact_duplicate" };
    }

    const acqDate = validated.acquisitionDate 
      ? parseCalendarDateToNoonUTC(validated.acquisitionDate) 
      : new Date();

    const [prop] = await db.insert(properties).values({
      orgId,
      externalKey: extKey,
      propertyName: validated.propertyName,
      addressLine1: validated.addressLine1,
      addressLine2: validated.addressLine2 || null,
      city: validated.city,
      state: validated.state,
      postalCode: validated.postalCode,
      address: `${validated.addressLine1}, ${validated.city}, ${validated.state} ${validated.postalCode}`,
      nickname: validated.propertyName,
      propertyType: validated.propertyType,
      acquisitionDate: acqDate,
      estimatedValue: validated.estimatedValue || 0,
      importRunId: runId,
    }).returning();

    await logAction({ orgId, userId, entityType: "property", entityId: prop.id, action: "create", newState: prop });
    return { status: "imported", entityId: prop.id };
  }

  if (importType === "units") {
    const validated = UnitsCSVSchema.parse(data);
    const propKey = validated.propertyExternalKey.trim();
    const unitKey = validated.unitExternalKey.trim();

    const [prop] = await db.select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.externalKey, propKey), isNull(properties.archivedAt)))
      .limit(1);

    if (!prop) {
      return { status: "needs_review", errors: [`Property external key "${propKey}" not found in organization`] };
    }

    const [existingUnit] = await db.select()
      .from(units)
      .where(and(eq(units.orgId, orgId), eq(units.externalKey, unitKey), isNull(units.archivedAt)))
      .limit(1);

    if (existingUnit) {
      const isConflictingProp = existingUnit.propertyId !== prop.id;
      return { 
        status: "imported", 
        entityId: existingUnit.id, 
        duplicateClassification: isConflictingProp ? "conflicting_reference" : "exact_duplicate" 
      };
    }

    const [unit] = await db.insert(units).values({
      orgId,
      propertyId: prop.id,
      externalKey: unitKey,
      unitNumber: validated.unitNumber,
      bedrooms: validated.bedrooms || null,
      bathrooms: validated.bathrooms || null,
      status: validated.status,
      monthlyRent: validated.marketRent || 0,
      marketRentCents: validated.marketRent || 0,
      importRunId: runId,
    }).returning();

    await logAction({ orgId, userId, entityType: "unit", entityId: unit.id, action: "create", newState: unit });
    return { status: "imported", entityId: unit.id };
  }

  if (importType === "tenants") {
    const validated = TenantsCSVSchema.parse(data);
    const extKey = validated.externalTenantKey?.trim();
    const email = validated.email?.trim()?.toLowerCase();

    if (extKey) {
      const [existingKey] = await db.select()
        .from(tenants)
        .where(and(eq(tenants.orgId, orgId), eq(tenants.externalKey, extKey), isNull(tenants.archivedAt)))
        .limit(1);
      if (existingKey) {
        return { status: "imported", entityId: existingKey.id, duplicateClassification: "exact_duplicate" };
      }
    }

    if (email) {
      const emailMatches = await db.select()
        .from(tenants)
        .where(and(eq(tenants.orgId, orgId), eq(tenants.email, email), isNull(tenants.archivedAt)));

      if (emailMatches.length > 1) {
        return { status: "needs_review", errors: [`Ambiguous tenant email match: multiple tenants (${emailMatches.length}) exist for email "${email}" in organization`] };
      }
      if (emailMatches.length === 1) {
        return { status: "imported", entityId: emailMatches[0].id, duplicateClassification: "exact_duplicate" };
      }
    }

    const fullName = `${validated.firstName} ${validated.lastName}`;
    const [tenant] = await db.insert(tenants).values({
      orgId,
      externalKey: extKey || null,
      firstName: validated.firstName,
      lastName: validated.lastName,
      name: fullName,
      email: email || null,
      phone: validated.phone || null,
      importRunId: runId,
    }).returning();

    await logAction({ orgId, userId, entityType: "tenant", entityId: tenant.id, action: "create", newState: tenant });
    return { status: "imported", entityId: tenant.id };
  }

  if (importType === "leases") {
    const validated = LeasesCSVSchema.parse(data);
    const unitKey = validated.unitExternalKey.trim();
    const tenantKey = validated.tenantExternalKey?.trim();
    const tenantEmail = validated.tenantEmail?.trim()?.toLowerCase();

    const [unit] = await db.select()
      .from(units)
      .where(and(eq(units.orgId, orgId), eq(units.externalKey, unitKey), isNull(units.archivedAt)))
      .limit(1);

    if (!unit) return { status: "needs_review", errors: [`Unit external key "${unitKey}" not found in organization`] };

    let tenantId: string | null = null;

    if (tenantKey) {
      const [t] = await db.select().from(tenants).where(and(eq(tenants.orgId, orgId), eq(tenants.externalKey, tenantKey), isNull(tenants.archivedAt))).limit(1);
      if (t) tenantId = t.id;
    }

    if (!tenantId && tenantEmail) {
      const emailMatches = await db.select()
        .from(tenants)
        .where(and(eq(tenants.orgId, orgId), eq(tenants.email, tenantEmail), isNull(tenants.archivedAt)));

      if (emailMatches.length > 1) {
        return { status: "needs_review", errors: [`Ambiguous tenant email match: multiple tenants (${emailMatches.length}) exist for email "${tenantEmail}" in organization`] };
      }
      if (emailMatches.length === 1) {
        tenantId = emailMatches[0].id;
      }
    }

    if (!tenantId) {
      return { status: "needs_review", errors: [`Tenant reference (${tenantKey || tenantEmail}) could not be resolved to exactly one tenant in organization`] };
    }

    const startDate = parseCalendarDateToNoonUTC(validated.startDate);
    const endDate = parseCalendarDateToNoonUTC(validated.endDate);

    const [lease] = await db.insert(leases).values({
      orgId,
      unitId: unit.id,
      primaryTenantId: tenantId,
      startDate,
      endDate,
      monthlyRent: validated.monthlyRent,
      securityDeposit: validated.securityDeposit || 0,
      status: validated.leaseStatus,
      importRunId: runId,
    }).returning();

    await logAction({ orgId, userId, entityType: "lease", entityId: lease.id, action: "create", newState: lease });
    return { status: "imported", entityId: lease.id };
  }

  if (importType === "payments") {
    const validated = HistoricalPaymentsCSVSchema.parse(data);
    const propKey = validated.propertyExternalKey.trim();
    const unitKey = validated.unitExternalKey.trim();
    const tenantKey = validated.tenantExternalKey?.trim();
    const tenantEmail = validated.tenantEmail?.trim()?.toLowerCase();
    const extRef = validated.externalReference?.trim();

    // 1. Resolve Property
    const [prop] = await db.select().from(properties).where(and(eq(properties.orgId, orgId), eq(properties.externalKey, propKey), isNull(properties.archivedAt))).limit(1);
    if (!prop) return { status: "needs_review", errors: [`Property external key "${propKey}" not found in organization`] };

    // 2. Resolve Unit and Verify Property Ownership
    const [unit] = await db.select().from(units).where(and(eq(units.orgId, orgId), eq(units.externalKey, unitKey), isNull(units.archivedAt))).limit(1);
    if (!unit) return { status: "needs_review", errors: [`Unit external key "${unitKey}" not found in organization`] };
    if (unit.propertyId !== prop.id) {
      return { status: "needs_review", errors: [`Unit property mismatch: unit "${unitKey}" belongs to property "${unit.propertyId}", not specified property "${prop.id}"`] };
    }

    // 3. Resolve Tenant with Ambiguity Protection
    let tenantId: string | null = null;
    if (tenantKey) {
      const [t] = await db.select().from(tenants).where(and(eq(tenants.orgId, orgId), eq(tenants.externalKey, tenantKey), isNull(tenants.archivedAt))).limit(1);
      if (t) tenantId = t.id;
    }
    if (!tenantId && tenantEmail) {
      const emailMatches = await db.select()
        .from(tenants)
        .where(and(eq(tenants.orgId, orgId), eq(tenants.email, tenantEmail), isNull(tenants.archivedAt)));

      if (emailMatches.length > 1) {
        return { status: "needs_review", errors: [`Ambiguous tenant email match: multiple tenants (${emailMatches.length}) exist for email "${tenantEmail}" in organization`] };
      }
      if (emailMatches.length === 1) {
        tenantId = emailMatches[0].id;
      }
    }

    if (!tenantId) return { status: "needs_review", errors: [`Tenant reference (${tenantKey || tenantEmail}) could not be resolved to exactly one tenant in organization`] };

    // 4. Check External Reference Duplicate Behavior
    if (extRef) {
      const [existingRef] = await db.select()
        .from(payments)
        .where(and(eq(payments.orgId, orgId), eq(payments.externalReference, extRef), isNull(payments.archivedAt)))
        .limit(1);

      if (existingRef) {
        const expectedDateStr = formatCalendarDateToYYYYMMDD(parseCalendarDateToNoonUTC(validated.paymentDate));
        const existingDateStr = existingRef.paidDate ? formatCalendarDateToYYYYMMDD(new Date(existingRef.paidDate)) : "";

        if (existingRef.amountReceived === validated.amount && existingDateStr === expectedDateStr) {
          return { status: "imported", entityId: existingRef.id, duplicateClassification: "exact_duplicate" };
        } else {
          return { status: "needs_review", duplicateClassification: "conflicting_reference", errors: [`External reference "${extRef}" exists with conflicting payment date or amount`] };
        }
      }
    }

    const paymentDateObj = parseCalendarDateToNoonUTC(validated.paymentDate);

    // 5. Find Active Lease for Unit & Tenant
    const [lease] = await db.select()
      .from(leases)
      .where(and(eq(leases.orgId, orgId), eq(leases.unitId, unit.id), eq(leases.primaryTenantId, tenantId), isNull(leases.archivedAt)))
      .limit(1);

    if (!lease) return { status: "needs_review", errors: ["No lease found matching unit and tenant in organization"] };

    // 6. Allocation Logic & Coverage Month Validation
    let allocMethod: "coverage_month" | "single_charge_match" | "unallocated" | "needs_review" = "unallocated";
    let isNeedsReview = false;

    if (validated.coverageMonth) {
      const covStart = parseCalendarDateToNoonUTC(`${validated.coverageMonth}-01`);
      const covEnd = new Date(Date.UTC(covStart.getUTCFullYear(), covStart.getUTCMonth() + 1, 0, 23, 59, 59));
      if (lease.startDate <= covEnd && lease.endDate >= covStart) {
        allocMethod = "coverage_month";
      } else {
        isNeedsReview = true;
        allocMethod = "needs_review";
      }
    }

    const [payment] = await db.insert(payments).values({
      orgId,
      tenantId,
      leaseId: lease.id,
      propertyId: prop.id,
      unitId: unit.id,
      amountReceived: validated.amount,
      paidDate: paymentDateObj,
      paymentMethod: validated.paymentMethod || "cash",
      memo: validated.memo || null,
      coverageMonth: validated.coverageMonth || null,
      externalReference: extRef || null,
      allocationMethod: allocMethod,
      source: "imported",
      status: "paid",
      importRunId: runId,
    }).returning();

    // Trigger automatic coverage invalidation for this month
    const monthStr = validated.coverageMonth || formatCalendarDateToCoverageMonth(paymentDateObj);
    await invalidateCoverageForMonth(orgId, prop.id, monthStr, "payment", payment.id, userId);

    await logAction({ orgId, userId, entityType: "payment", entityId: payment.id, action: "create", newState: payment });

    return {
      status: isNeedsReview ? "needs_review" : "imported",
      entityId: payment.id,
      errors: isNeedsReview ? [`Payment coverageMonth ${validated.coverageMonth} falls outside active lease period`] : undefined,
    };
  }

  if (importType === "expenses") {
    const validated = HistoricalExpensesCSVSchema.parse(data);
    const propKey = validated.propertyExternalKey.trim();
    const extRef = validated.externalReference?.trim();

    // 1. Resolve Property
    const [prop] = await db.select().from(properties).where(and(eq(properties.orgId, orgId), eq(properties.externalKey, propKey), isNull(properties.archivedAt))).limit(1);
    if (!prop) return { status: "needs_review", errors: [`Property external key "${propKey}" not found in organization`] };

    // 2. Resolve Optional Unit and Verify Ownership
    let unitId: string | null = null;
    if (validated.unitExternalKey) {
      const uKey = validated.unitExternalKey.trim();
      const [u] = await db.select().from(units).where(and(eq(units.orgId, orgId), eq(units.externalKey, uKey), isNull(units.archivedAt))).limit(1);
      if (!u) return { status: "needs_review", errors: [`Unit external key "${uKey}" not found in organization`] };
      if (u.propertyId !== prop.id) {
        return { status: "needs_review", errors: [`Unit property mismatch: unit "${uKey}" belongs to property "${u.propertyId}", not specified property "${prop.id}"`] };
      }
      unitId = u.id;
    }

    // 3. External Reference Duplicate Check
    if (extRef) {
      const [existingRef] = await db.select()
        .from(financialRecords)
        .where(and(eq(financialRecords.orgId, orgId), eq(financialRecords.externalReference, extRef), isNull(financialRecords.archivedAt)))
        .limit(1);

      if (existingRef) {
        if (existingRef.amount === validated.amount) {
          return { status: "imported", entityId: existingRef.id, duplicateClassification: "exact_duplicate" };
        } else {
          return { status: "needs_review", duplicateClassification: "conflicting_reference", errors: [`External reference "${extRef}" exists with conflicting expense data`] };
        }
      }
    }

    // 4. Resolve or Create Vendor in Current Org
    let vendorId: string | null = null;
    if (validated.vendorName) {
      const vName = validated.vendorName.trim();
      const [v] = await db.select().from(vendors).where(and(eq(vendors.orgId, orgId), sql`LOWER(${vendors.name}) = LOWER(${vName})`, isNull(vendors.archivedAt))).limit(1);
      if (v) {
        vendorId = v.id;
      } else {
        const [newV] = await db.insert(vendors).values({ orgId, name: vName, specialty: "general" }).returning();
        vendorId = newV.id;
      }
    }

    const paidDateObj = parseCalendarDateToNoonUTC(validated.paidDate);
    const paidDateStr = formatCalendarDateToYYYYMMDD(paidDateObj);
    const txDateStr = validated.transactionDate 
      ? formatCalendarDateToYYYYMMDD(parseCalendarDateToNoonUTC(validated.transactionDate)) 
      : paidDateStr;

    const [record] = await db.insert(financialRecords).values({
      orgId,
      propertyId: prop.id,
      unitId,
      type: "expense",
      amount: validated.amount,
      date: paidDateObj,
      paidDate: paidDateStr,
      transactionDate: txDateStr,
      category: validated.category,
      notes: validated.memo || null,
      vendorId,
      externalReference: extRef || null,
      state: "approved",
      importRunId: runId,
    }).returning();

    // Trigger coverage invalidation
    const monthStr = formatCalendarDateToCoverageMonth(paidDateObj);
    await invalidateCoverageForMonth(orgId, prop.id, monthStr, "financial_record", record.id, userId);

    await logAction({ orgId, userId, entityType: "financial_record", entityId: record.id, action: "create", newState: record });

    return { status: "imported", entityId: record.id };
  }

  if (importType === "monthly_summaries") {
    const validated = MonthlySummaryCSVSchema.parse(data);
    const propKey = validated.propertyExternalKey.trim();

    const [prop] = await db.select().from(properties).where(and(eq(properties.orgId, orgId), eq(properties.externalKey, propKey), isNull(properties.archivedAt))).limit(1);
    if (!prop) return { status: "needs_review", errors: [`Property external key "${propKey}" not found in organization`] };

    const [existing] = await db.select()
      .from(monthlyFinancialSummaries)
      .where(and(
        eq(monthlyFinancialSummaries.orgId, orgId),
        eq(monthlyFinancialSummaries.propertyId, prop.id),
        eq(monthlyFinancialSummaries.month, validated.month),
        isNull(monthlyFinancialSummaries.archivedAt)
      ))
      .limit(1);

    let summaryId: string;
    if (existing) {
      const [updated] = await db.update(monthlyFinancialSummaries)
        .set({
          scheduledRentCents: validated.scheduledRent,
          collectedRentCents: validated.collectedRent,
          expenseCents: validated.expenses,
          sourceNote: validated.sourceNote || null,
          importRunId: runId,
          updatedAt: new Date(),
        })
        .where(eq(monthlyFinancialSummaries.id, existing.id))
        .returning();
      summaryId = updated.id;
    } else {
      const [created] = await db.insert(monthlyFinancialSummaries).values({
        orgId,
        propertyId: prop.id,
        month: validated.month,
        scheduledRentCents: validated.scheduledRent,
        collectedRentCents: validated.collectedRent,
        expenseCents: validated.expenses,
        sourceNote: validated.sourceNote || null,
        importRunId: runId,
      }).returning();
      summaryId = created.id;
    }

    await logAction({ orgId, userId, entityType: "monthly_financial_summary", entityId: summaryId, action: "create", newState: { month: validated.month } });

    return { status: "imported", entityId: summaryId };
  }

  throw new Error(`Unsupported import type: ${importType}`);
}
