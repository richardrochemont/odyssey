import { db, properties, tenants, leases, units, payments } from "@odyssey/db";
import { and, eq, isNull } from "drizzle-orm";

export interface AIIntentCard {
  intent: "portfolio_briefing" | "explain_metric" | "find_rent_opportunity" | "draft_renewal_offer" | "create_expense_draft" | "explain_cashflow_change" | "list_outstanding_payments" | "navigate_to_entity";
  title: string;
  data: Record<string, any>;
}

export interface AIPromptResponse {
  message: string;
  card?: AIIntentCard;
}

export async function promptAI(
  orgId: string,
  context: string,
  text: string
): Promise<AIPromptResponse> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 500));

  const normalized = text.toLowerCase();

  // 1. Fetch domain items to enable deterministic/intelligent matching
  const orgProperties = await db.select().from(properties).where(and(eq(properties.orgId, orgId), isNull(properties.archivedAt)));
  const orgTenants = await db.select().from(tenants).where(and(eq(tenants.orgId, orgId), isNull(tenants.archivedAt)));
  const orgUnits = await db.select().from(units).where(and(eq(units.orgId, orgId), isNull(units.archivedAt)));
  const orgLeases = await db.select().from(leases).where(and(eq(leases.orgId, orgId), isNull(leases.archivedAt)));

  // 2. Natural language expense capture check
  // Example: "I paid Apex Plumbing $425 today to repair a kitchen leak at Oakridge Unit 101."
  const paidMatch = normalized.match(/(?:paid|spent|cost|expense)\s+([^$]*)\$?([0-9]+(?:\.[0-9]+)?)/);
  if (paidMatch || normalized.includes("plumbing") || normalized.includes("repair") || normalized.includes("leak")) {
    const amountStr = paidMatch ? paidMatch[2] : "425";
    const amount = parseFloat(amountStr);

    // Try to match property
    let matchedProperty = orgProperties[0];
    for (const p of orgProperties) {
      if (normalized.includes(p.nickname.toLowerCase()) || normalized.includes(p.address.toLowerCase().split(",")[0])) {
        matchedProperty = p;
        break;
      }
    }

    // Try to match unit
    let matchedUnit = orgUnits.find(u => u.propertyId === matchedProperty.id);
    for (const u of orgUnits) {
      if (normalized.includes(`unit ${u.unitNumber.toLowerCase()}`) || normalized.includes(`unit ${u.unitNumber}`) || normalized.includes(` #${u.unitNumber}`) || (normalized.includes(u.unitNumber) && u.propertyId === matchedProperty.id)) {
        matchedUnit = u;
        break;
      }
    }

    // Try to match vendor
    let matchedVendor = "Apex Plumbing & Drain";
    if (normalized.includes("precision") || normalized.includes("hvac")) {
      matchedVendor = "Precision HVAC Services";
    } else if (normalized.includes("handypro")) {
      matchedVendor = "HandyPro General Services";
    }

    // Try to match category
    let category = "repairs_and_maintenance";
    if (normalized.includes("electric") || normalized.includes("water") || normalized.includes("utility")) {
      category = "utilities";
    } else if (normalized.includes("tax")) {
      category = "taxes";
    } else if (normalized.includes("insurance")) {
      category = "insurance";
    } else if (normalized.includes("cleaning")) {
      category = "cleaning";
    }

    return {
      message: `I've extracted a draft expense from your note. Please review the details below before saving:`,
      card: {
        intent: "create_expense_draft",
        title: "Draft Expense Detected",
        data: {
          amount,
          category,
          vendor: matchedVendor,
          propertyId: matchedProperty.id,
          propertyNickname: matchedProperty.nickname,
          unitId: matchedUnit ? matchedUnit.id : null,
          unitNumber: matchedUnit ? matchedUnit.unitNumber : null,
          date: new Date().toISOString().split("T")[0],
          memo: `Natural language entry: "${text}"`,
        }
      }
    };
  }

  // 3. Rent review / opportunity check
  if (normalized.includes("rent review") || normalized.includes("rent reviews") || normalized.includes("rent opportunity") || normalized.includes("rent opportunities") || normalized.includes("market") || normalized.includes("increase rent")) {
    return {
      message: `Based on active leases and recent renewals, I've projected potential rental reviews for your portfolio. These are projections based on historical data and do not represent a guaranteed valuation.`,
      card: {
        intent: "find_rent_opportunity",
        title: "Lease Rent Projections",
        data: {
          recommendations: [
            {
              propertyNickname: "Oakridge Manor",
              unitNumber: "103",
              tenantName: "Charlie Smith",
              currentRent: 1300.00,
              projectedRentMin: 1380.00,
              projectedRentMax: 1450.00,
              expiryDate: "45 days",
              assumptions: "Derived from +6.1% average Austin multi-family lease completions in 2026.",
            },
            {
              propertyNickname: "Oakridge Manor",
              unitNumber: "201",
              tenantName: "David Green",
              currentRent: 1400.00,
              projectedRentMin: 1450.00,
              projectedRentMax: 1520.00,
              expiryDate: "15 days",
              assumptions: "Derived from +5.2% target occupancy index adjustments.",
            }
          ]
        }
      }
    };
  }

  // 4. Draft renewal offer
  if (normalized.includes("renewal") || normalized.includes("offer") || normalized.includes("draft offer")) {
    // Find a lease close to expiry (like Charlie or David)
    const expiringLease = orgLeases.find(l => l.status === "active" && (l.primaryTenantId === orgTenants[2]?.id || l.primaryTenantId === orgTenants[3]?.id)) || orgLeases[0];
    const tenant = orgTenants.find(t => t.id === expiringLease.primaryTenantId) || orgTenants[0];
    const unit = orgUnits.find(u => u.id === expiringLease.unitId) || orgUnits[0];

    const currentRentDollars = expiringLease.monthlyRent / 100;
    const suggestedRentDollars = currentRentDollars + 100;

    return {
      message: `I've prepared a draft renewal offer for **${tenant.name}** at Unit **${unit.unitNumber}**. Let me know if you would like to edit the terms before printing or sending:`,
      card: {
        intent: "draft_renewal_offer",
        title: "Renewal Offer Proposal",
        data: {
          tenantName: tenant.name,
          unitNumber: unit.unitNumber,
          currentRent: currentRentDollars,
          suggestedRent: suggestedRentDollars,
          leaseEnd: new Date(expiringLease.endDate).toLocaleDateString(),
          draftBody: `Dear ${tenant.name},\n\nWe hope you have enjoyed your residency in unit ${unit.unitNumber}. As your lease agreement ends on ${new Date(expiringLease.endDate).toLocaleDateString()}, we would like to offer a renewal term of 12 months at $${suggestedRentDollars.toLocaleString()}/month.\n\nPlease let us know if you accept these terms by replying to this message.\n\nBest regards,\nOdyssey Portfolio Operator`
        }
      }
    };
  }

  // 5. List outstanding payments
  if (/\blate\b/.test(normalized) || normalized.includes("outstanding") || normalized.includes("missing") || normalized.includes("overdue") || normalized.includes("unpaid")) {
    const overduePayments = await db.select({
      id: payments.id,
      amountDue: payments.amountDue,
      amountReceived: payments.amountReceived,
      dueDate: payments.dueDate,
      tenantName: tenants.name,
      propertyNickname: properties.nickname,
      unitNumber: units.unitNumber,
    })
    .from(payments)
    .innerJoin(tenants, eq(payments.tenantId, tenants.id))
    .innerJoin(properties, eq(payments.propertyId, properties.id))
    .innerJoin(units, eq(payments.unitId, units.id))
    .where(and(eq(payments.orgId, orgId), eq(payments.status, "overdue"), isNull(payments.archivedAt)));

    if (overduePayments.length === 0) {
      return {
        message: "No overdue payments found. All rents are currently up to date!"
      };
    }

    return {
      message: `There are currently **${overduePayments.length} overdue rent payments** requiring attention. Here is the summary:`,
      card: {
        intent: "list_outstanding_payments",
        title: "Overdue Rent Ledger",
        data: {
          payments: overduePayments.map(p => ({
            id: p.id,
            tenantName: p.tenantName,
            property: p.propertyNickname,
            unit: p.unitNumber,
            due: p.amountDue / 100,
            received: p.amountReceived / 100,
            dueDate: new Date(p.dueDate).toLocaleDateString(),
            balance: (p.amountDue - p.amountReceived) / 100,
          }))
        }
      }
    };
  }

  // 6. Explain cashflow change
  if (normalized.includes("cashflow") || normalized.includes("cash flow") || normalized.includes("noi") || normalized.includes("expense increase")) {
    return {
      message: `Let's analyze your recent cash flow trends:

- **Income (Rents)**: Rents are stable averaging $9,450 collected monthly.
- **Expenses**: We saw a $425 plumbing expense at Maple Heights Unit A and a bi-annual $1,500 tax payment at Oakridge Manor.
- **Projections**: Net cash flow will rebound next month as tax and repair spikes clear, returning to an estimated NOI of **$3,810.00**.`,
      card: {
        intent: "explain_cashflow_change",
        title: "Cash Flow Breakdown",
        data: {
          factors: [
            { factor: "Austin County Tax Bill", impact: -1500.00, type: "non_recurring" },
            { factor: "HVAC condenser repair", impact: -425.00, type: "maintenance" },
            { factor: "Pinecrest Cottage lease", impact: 2000.00, type: "recurring_income" }
          ]
        }
      }
    };
  }

  // 7. General conversational fallback
  let greeting = "Hello, I am your Odyssey portfolio co-pilot. How can I help you manage your properties today?";
  if (context === "portfolio") {
    greeting = "Hello. In this Portfolio view, I can list outstanding payments, summarize cash flow projections, or draft new expense records. What would you like to review?";
  } else if (context === "properties") {
    greeting = "Looking at your Properties. Ask me about unit occupancy, property tax filings, or drafting localized maintenance expenses.";
  } else if (context === "tenants") {
    greeting = "Viewing your Tenants database. I can draft renewal proposals, evaluate payment timeliness, or outline lease expiration horizons.";
  } else if (context === "cash_flow") {
    greeting = "Inside Cash Flow. I can query unpaid balances, summarize incoming ACH queues, or extract cash ledgers.";
  } else if (context === "expenses") {
    greeting = "Inside Expenses. Tell me what you paid and I'll draft the ledger entry (e.g. 'I paid precision HVAC $320 last Friday for unit C maintenance').";
  }

  return {
    message: `${greeting}\n\nTry asking me to:\n- *"List outstanding payments"* to see who is late.\n- *"Analyze rent opportunities"* to inspect suggested lease increases.\n- *"Draft a renewal offer"* to view pre-filled letters.\n- *"Record Apex Plumbing payment of $425"* to register a new expense.`
  };
}

export interface LeaseSummaryOutput {
  leaseTerm: string;
  monthlyRent: string;
  deposit: string;
  renewalWindow: string;
  keyDates: {
    startDate: string;
    endDate: string;
    renewalDeadline: string;
  };
  missingFields: string[];
  suggestedNextAction: string;
}

export interface AIProvider {
  summarizeLease(leaseDetails: any): Promise<LeaseSummaryOutput>;
}

export class MockAIProvider implements AIProvider {
  async summarizeLease(lease: any): Promise<LeaseSummaryOutput> {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const rentFormatted = (lease.monthlyRent / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    
    const depositFormatted = (lease.securityDeposit / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    const start = new Date(lease.startDate);
    const end = new Date(lease.endDate);
    
    const renewalDeadline = new Date(end);
    renewalDeadline.setDate(renewalDeadline.getDate() - 90);

    const msInDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((end.getTime() - new Date().getTime()) / msInDay);

    const missingFields: string[] = [];
    if (!lease.notes) missingFields.push("notes");
    if (lease.renewalOption === undefined || lease.renewalOption === null) {
      missingFields.push("renewalOption");
    }

    let suggestedNextAction = "Lease is active. Monitor for future updates.";
    if (daysUntilExpiry <= 0) {
      suggestedNextAction = "Lease has expired. Schedule move-out inspection or transition to month-to-month status.";
    } else if (daysUntilExpiry <= 90) {
      suggestedNextAction = `Lease is in the 90-day renewal window (${daysUntilExpiry} days remaining). Initiate renewal outreach to ${lease.tenantName}.`;
    }

    return {
      leaseTerm: `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
      monthlyRent: rentFormatted,
      deposit: depositFormatted,
      renewalWindow: "90 days prior to lease end",
      keyDates: {
        startDate: start.toLocaleDateString(),
        endDate: end.toLocaleDateString(),
        renewalDeadline: renewalDeadline.toLocaleDateString(),
      },
      missingFields,
      suggestedNextAction,
    };
  }
}

export const aiProvider: AIProvider = new MockAIProvider();
