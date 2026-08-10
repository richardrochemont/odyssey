import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import * as dotenv from "dotenv";
import * as schema from "./schema";

dotenv.config({ path: "../../.env" });

const databaseUrl = process.env.DATABASE_URL || "postgres://jake@localhost:5432/hearthlane";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function main() {
  console.log("Seeding database...");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  // Clear existing data
  console.log("Clearing existing data...");
  await db.delete(schema.auditLogs);
  await db.delete(schema.payments);
  await db.delete(schema.financialRecords);
  await db.delete(schema.tasks);
  await db.delete(schema.workOrders);
  await db.delete(schema.maintenanceRequests);
  await db.delete(schema.vendors);
  await db.delete(schema.leases);
  await db.delete(schema.tenants);
  await db.delete(schema.units);
  await db.delete(schema.buildings);
  await db.delete(schema.properties);
  await db.delete(schema.users);
  await db.delete(schema.organizations);

  // 1. Create Organization
  console.log("Creating organization...");
  const [org] = await db.insert(schema.organizations).values({
    name: "Odyssey Capital LLC",
  }).returning();

  // 2. Create Users (Owner, Manager, Maintenance, Read Only)
  console.log("Creating users...");
  const passwordHash = hashPassword("password123");
  
  const [ownerUser] = await db.insert(schema.users).values({
    orgId: org.id,
    email: "owner@odyssey.com",
    passwordHash,
    name: "Genevieve Hearth",
    role: "owner",
  }).returning();

  const [managerUser] = await db.insert(schema.users).values({
    orgId: org.id,
    email: "manager@odyssey.com",
    passwordHash,
    name: "Marcus Lane",
    role: "manager",
  }).returning();

  const [_maintenanceUser] = await db.insert(schema.users).values({
    orgId: org.id,
    email: "maintenance@odyssey.com",
    passwordHash,
    name: "Dave Fixer",
    role: "maintenance",
  }).returning();

  await db.insert(schema.users).values({
    orgId: org.id,
    email: "readonly@odyssey.com",
    passwordHash,
    name: "Investor Bob",
    role: "read_only",
  });

  // 3. Create Properties
  console.log("Creating properties...");
  const [propOakridge] = await db.insert(schema.properties).values({
    orgId: org.id,
    nickname: "Oakridge Manor",
    address: "128 Oakridge Ave, Austin, TX 78704",
    propertyType: "apartment_building",
    ownershipPercentage: 100,
    acquisitionDate: new Date("2021-03-15"),
    notes: "Primary multi-family asset. Good condition.",
  }).returning();

  const [propMaple] = await db.insert(schema.properties).values({
    orgId: org.id,
    nickname: "Maple Heights",
    address: "412 N Maple St, Seattle, WA 98103",
    propertyType: "multi_family",
    ownershipPercentage: 80,
    acquisitionDate: new Date("2022-07-20"),
    notes: "Joint venture with Pine Partners.",
  }).returning();

  const [propPinecrest] = await db.insert(schema.properties).values({
    orgId: org.id,
    nickname: "Pinecrest Cottage",
    address: "880 Woodlawn Rd, Lake Tahoe, CA 96150",
    propertyType: "single_family",
    ownershipPercentage: 100,
    acquisitionDate: new Date("2023-11-01"),
    notes: "Premium vacation rental unit.",
  }).returning();

  // 4. Create Buildings
  console.log("Creating buildings...");
  const [bldOakEast] = await db.insert(schema.buildings).values({
    orgId: org.id,
    propertyId: propOakridge.id,
    name: "East Wing",
    address: "128 Oakridge Ave East, Austin, TX 78704",
  }).returning();

  const [bldOakWest] = await db.insert(schema.buildings).values({
    orgId: org.id,
    propertyId: propOakridge.id,
    name: "West Wing",
    address: "128 Oakridge Ave West, Austin, TX 78704",
  }).returning();

  // 5. Create Units
  console.log("Creating units...");
  const oakUnits = [];
  // East Wing Units
  for (let i = 101; i <= 103; i++) {
    const [u] = await db.insert(schema.units).values({
      orgId: org.id,
      propertyId: propOakridge.id,
      buildingId: bldOakEast.id,
      unitNumber: `${i}`,
      status: "occupied",
      monthlyRent: 120000 + (i - 101) * 5000, // stored in cents (1200, 1250, 1300)
    }).returning();
    oakUnits.push(u);
  }
  // West Wing Units
  for (let i = 201; i <= 202; i++) {
    const [u] = await db.insert(schema.units).values({
      orgId: org.id,
      propertyId: propOakridge.id,
      buildingId: bldOakWest.id,
      unitNumber: `${i}`,
      status: i === 201 ? "occupied" : "vacant",
      monthlyRent: 140000,
    }).returning();
    oakUnits.push(u);
  }

  // Maple Heights Units
  const mapleUnits = [];
  const mapleUnitNames = ["A", "B", "C"];
  for (let i = 0; i < 3; i++) {
    const [u] = await db.insert(schema.units).values({
      orgId: org.id,
      propertyId: propMaple.id,
      unitNumber: mapleUnitNames[i],
      status: i === 2 ? "vacant" : "occupied",
      monthlyRent: 150000 + i * 5000,
    }).returning();
    mapleUnits.push(u);
  }

  // Pinecrest Cottage Unit (Single Family)
  const [pinecrestUnit] = await db.insert(schema.units).values({
    orgId: org.id,
    propertyId: propPinecrest.id,
    unitNumber: "1",
    status: "occupied",
    monthlyRent: 200000,
  }).returning();

  // 6. Create Tenants
  console.log("Creating tenants...");
  const tenantsList = [
    { name: "Alice Vance", email: "alice@vance.net", phone: "5125550192", notes: "Tenant since 2021. Excellent payment history." },
    { name: "Bob Miller", email: "bob.miller@gmail.com", phone: "5125550183" },
    { name: "Charlie Smith", email: "charlie@smithco.com", phone: "5125559811" },
    { name: "David Green", email: "david@greenwood.org", phone: "5125552399" },
    { name: "Emma Watson", email: "emma@watson.co", phone: "2065551212" },
    { name: "Frank Castle", email: "frank@punisher.org", phone: "2065557766", notes: "Military veteran. Prefers communication via email." },
    { name: "Grace Hopper", email: "grace@hopper.edu", phone: "2065558833" },
    { name: "Henry David", email: "henry@walden.org", phone: "5305550122", notes: "Leased Lake Tahoe cottage." }
  ];

  const createdTenants = [];
  for (const t of tenantsList) {
    const [tenant] = await db.insert(schema.tenants).values({
      orgId: org.id,
      name: t.name,
      email: t.email,
      phone: t.phone,
      notes: t.notes,
    }).returning();
    createdTenants.push(tenant);
  }

  // Helper date function
  const addDays = (d: Date, days: number) => {
    const res = new Date(d);
    res.setDate(res.getDate() + days);
    return res;
  };
  const subDays = (d: Date, days: number) => {
    const res = new Date(d);
    res.setDate(res.getDate() - days);
    return res;
  };

  // 7. Create Leases
  console.log("Creating leases...");
  const [lease1] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: oakUnits[0].id,
    primaryTenantId: createdTenants[0].id,
    startDate: subDays(new Date(), 200),
    endDate: addDays(new Date(), 165),
    monthlyRent: 120000,
    securityDeposit: 120000,
    status: "active",
    renewalOption: true,
    notes: "Signed standard 1-year agreement.",
  }).returning();

  const [lease2] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: oakUnits[1].id,
    primaryTenantId: createdTenants[1].id,
    startDate: subDays(new Date(), 100),
    endDate: addDays(new Date(), 265),
    monthlyRent: 125000,
    securityDeposit: 125000,
    status: "active",
    renewalOption: false,
    notes: "No pets lease amendment included.",
  }).returning();

  const [lease3] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: oakUnits[2].id,
    primaryTenantId: createdTenants[2].id,
    startDate: subDays(new Date(), 320),
    endDate: addDays(new Date(), 45),
    monthlyRent: 130000,
    securityDeposit: 130000,
    status: "active",
    renewalOption: true,
    notes: "Lease entering 90-day renewal cycle. Review needed.",
  }).returning();

  const [lease4] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: oakUnits[3].id,
    primaryTenantId: createdTenants[3].id,
    startDate: subDays(new Date(), 350),
    endDate: addDays(new Date(), 15),
    monthlyRent: 140000,
    securityDeposit: 140000,
    status: "active",
    renewalOption: true,
  }).returning();

  const [lease5] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: mapleUnits[0].id,
    primaryTenantId: createdTenants[4].id,
    startDate: subDays(new Date(), 50),
    endDate: addDays(new Date(), 315),
    monthlyRent: 150000,
    securityDeposit: 150000,
    status: "active",
    renewalOption: true,
  }).returning();

  const [lease6] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: mapleUnits[1].id,
    primaryTenantId: createdTenants[5].id,
    startDate: subDays(new Date(), 285),
    endDate: addDays(new Date(), 80),
    monthlyRent: 155000,
    securityDeposit: 155000,
    status: "active",
    renewalOption: false,
    notes: "Tenant submitted notice of non-renewal.",
  }).returning();

  const [lease7] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: mapleUnits[2].id,
    primaryTenantId: createdTenants[6].id,
    startDate: subDays(new Date(), 365),
    endDate: subDays(new Date(), 5),
    monthlyRent: 160000,
    securityDeposit: 160000,
    status: "ended",
    renewalOption: false,
  }).returning();

  const [lease8] = await db.insert(schema.leases).values({
    orgId: org.id,
    unitId: pinecrestUnit.id,
    primaryTenantId: createdTenants[7].id,
    startDate: subDays(new Date(), 90),
    endDate: addDays(new Date(), 275),
    monthlyRent: 200000,
    securityDeposit: 200000,
    status: "active",
    renewalOption: true,
  }).returning();

  // 8. Create Vendors
  console.log("Creating vendors...");
  const [_vendor1] = await db.insert(schema.vendors).values({
    orgId: org.id,
    name: "Apex Plumbing & Drain",
    specialty: "Plumbing",
    email: "service@apexplumbing.com",
    phone: "5125558832",
    notes: "24/7 service. Highly reliable.",
  }).returning();

  const [vendor2] = await db.insert(schema.vendors).values({
    orgId: org.id,
    name: "Precision HVAC Services",
    specialty: "HVAC",
    email: "office@precisionhvac.com",
    phone: "2065559981",
  }).returning();

  const [_vendor3] = await db.insert(schema.vendors).values({
    orgId: org.id,
    name: "HandyPro General Services",
    specialty: "General Repair",
    email: "jobs@handypro.com",
    phone: "3035552399",
  }).returning();

  // 9. Create Maintenance Requests
  console.log("Creating maintenance requests...");
  const [req1] = await db.insert(schema.maintenanceRequests).values({
    orgId: org.id,
    propertyId: propOakridge.id,
    unitId: oakUnits[0].id,
    tenantId: createdTenants[0].id,
    title: "Leaky Kitchen Faucet",
    description: "Kitchen faucet drips constantly when turned off. Water pressure is fine.",
    priority: "medium",
    status: "triaged",
  }).returning();

  await db.insert(schema.maintenanceRequests).values({
    orgId: org.id,
    propertyId: propOakridge.id,
    unitId: oakUnits[1].id,
    tenantId: createdTenants[1].id,
    title: "Clogged Shower Drain",
    description: "Shower drains extremely slow. Standing water takes 30 mins to drain.",
    priority: "low",
    status: "triaged",
  });

  const [req3] = await db.insert(schema.maintenanceRequests).values({
    orgId: org.id,
    propertyId: propMaple.id,
    unitId: mapleUnits[0].id,
    tenantId: createdTenants[4].id,
    title: "HVAC Heating Failure",
    description: "Heat does not turn on. Air is blowing cold. Thermostat screen is active.",
    priority: "urgent",
    status: "assigned",
  }).returning();

  await db.insert(schema.workOrders).values({
    orgId: org.id,
    maintenanceRequestId: req3.id,
    vendorId: vendor2.id,
    notes: "Precision is dispatched. Standard rate applies.",
    status: "assigned",
    scheduledAt: addDays(new Date(), 1),
  });

  await db.insert(schema.maintenanceRequests).values({
    orgId: org.id,
    propertyId: propMaple.id,
    unitId: mapleUnits[1].id,
    tenantId: createdTenants[5].id,
    title: "Loose Window Latch",
    description: "Bedroom window latch is loose and doesn't lock securely.",
    priority: "low",
    status: "completed",
  });

  await db.insert(schema.maintenanceRequests).values({
    orgId: org.id,
    propertyId: propPinecrest.id,
    unitId: pinecrestUnit.id,
    tenantId: createdTenants[7].id,
    title: "Ceiling Water Spot - Roof Leak",
    description: "Water spot appeared on living room ceiling after heavy storm.",
    priority: "high",
    status: "closed",
  });

  // 10. Create Tasks
  console.log("Creating tasks...");
  await db.insert(schema.tasks).values({
    orgId: org.id,
    title: "Inspect Oakridge Unit 202 vacancy",
    description: "Walkthrough unit 202 to confirm shape and prep for cleaning schedule.",
    dueDate: new Date(),
    ownerId: managerUser.id,
    status: "todo",
    priority: "medium",
    type: "inspection",
    propertyId: propOakridge.id,
    unitId: oakUnits[4].id,
  });

  await db.insert(schema.tasks).values({
    orgId: org.id,
    title: "Lease Renewal Review: David Green",
    description: "Review current lease terms. Lease expires soon (in 15 days). Send proposal.",
    dueDate: addDays(new Date(), 2),
    ownerId: ownerUser.id,
    status: "todo",
    priority: "high",
    type: "lease_renewal",
    propertyId: propOakridge.id,
    unitId: oakUnits[3].id,
    tenantId: createdTenants[3].id,
    leaseId: lease4.id,
  });

  await db.insert(schema.tasks).values({
    orgId: org.id,
    title: "Coordinate Apex plumbing quote",
    description: "Follow up with Apex regarding invoice and warranty terms for Oakridge 101 sink.",
    dueDate: subDays(new Date(), 2),
    ownerId: managerUser.id,
    status: "in_progress",
    priority: "medium",
    type: "maintenance",
    propertyId: propOakridge.id,
    maintenanceRequestId: req1.id,
  });

  // 11. Create Payments Ledger (Operational payments view)
  console.log("Creating payments ledger...");
  const createdLeases = [lease1, lease2, lease3, lease4, lease5, lease6, lease7, lease8];
  const paymentsToInsert = [];

  for (const l of createdLeases) {
    const start = new Date(l.startDate);
    const end = new Date(l.endDate);

    // Seed past 6 months up to next 3 months (9 months total)
    for (let m = 0; m < 9; m++) {
      const monthOffset = m - 6; // -6 to 2
      const dueDate = new Date();
      dueDate.setDate(1);
      dueDate.setMonth(dueDate.getMonth() + monthOffset);

      if (dueDate >= start && dueDate <= end) {
        let status = "paid";
        let amountReceived = l.monthlyRent;
        let paidDate: Date | null = new Date(dueDate);
        paidDate.setDate(paidDate.getDate() + Math.floor(Math.random() * 5));

        if (monthOffset > 0) {
          status = "upcoming";
          amountReceived = 0;
          paidDate = null;
        } else if (monthOffset === 0) {
          // Current month splits
          if (l.id === lease3.id) {
            status = "overdue";
            amountReceived = 0;
            paidDate = null;
          } else if (l.id === lease4.id) {
            status = "partial";
            amountReceived = Math.floor(l.monthlyRent / 2);
            paidDate = new Date();
          } else {
            status = "paid";
            amountReceived = l.monthlyRent;
          }
        } else if (monthOffset === -1 && l.id === lease3.id) {
          status = "overdue";
          amountReceived = 0;
          paidDate = null;
        }

        paymentsToInsert.push({
          orgId: org.id,
          tenantId: l.primaryTenantId,
          leaseId: l.id,
          propertyId: l.id === lease8.id ? propPinecrest.id : (l.id === lease5.id || l.id === lease6.id || l.id === lease7.id ? propMaple.id : propOakridge.id),
          unitId: l.unitId,
          amountDue: l.monthlyRent,
          amountReceived,
          dueDate,
          paidDate,
          status,
          paymentMethod: status === "paid" || status === "partial" ? "ach" : null,
          memo: status === "paid" ? "Monthly rent payment" : (status === "partial" ? "Partial payment — promised balance" : null),
        });
      }
    }
  }

  if (paymentsToInsert.length > 0) {
    await db.insert(schema.payments).values(paymentsToInsert);
  }

  // 12. Create Operational Expenses (Seeded taxonomy)
  console.log("Creating operational expenses...");
  const expenses = [
    // Repairs & Maintenance
    {
      orgId: org.id,
      propertyId: propMaple.id,
      unitId: mapleUnits[0].id,
      type: "expense",
      amount: 42500, // $425
      date: subDays(new Date(), 10),
      category: "repairs_and_maintenance",
      notes: "HVAC condenser relay repair - Precision HVAC",
    },
    {
      orgId: org.id,
      propertyId: propOakridge.id,
      unitId: oakUnits[0].id,
      type: "expense",
      amount: 15000, // $150
      date: subDays(new Date(), 60),
      category: "repairs_and_maintenance",
      notes: "Faucet replacement in kitchen - Apex Plumbing",
    },
    // Utilities
    {
      orgId: org.id,
      propertyId: propOakridge.id,
      type: "expense",
      amount: 45000, // $450
      date: subDays(new Date(), 15),
      category: "utilities",
      notes: "Common area electricity bill",
    },
    {
      orgId: org.id,
      propertyId: propMaple.id,
      type: "expense",
      amount: 28000, // $280
      date: subDays(new Date(), 20),
      category: "utilities",
      notes: "Water and waste management bill",
    },
    // Insurance
    {
      orgId: org.id,
      propertyId: propPinecrest.id,
      type: "expense",
      amount: 12000, // $120
      date: subDays(new Date(), 25),
      category: "insurance",
      notes: "Tahoe Cottage property fire insurance premium",
    },
    {
      orgId: org.id,
      propertyId: propOakridge.id,
      type: "expense",
      amount: 54000, // $540
      date: subDays(new Date(), 90),
      category: "insurance",
      notes: "Oakridge Manor liability insurance",
    },
    // Taxes
    {
      orgId: org.id,
      propertyId: propOakridge.id,
      type: "expense",
      amount: 150000, // $1500
      date: subDays(new Date(), 45),
      category: "taxes",
      notes: "Austin county property tax",
    },
    // Mortgage payments (seeded monthly)
    {
      orgId: org.id,
      propertyId: propOakridge.id,
      type: "expense",
      amount: 220000, // $2200
      date: subDays(new Date(), 30),
      category: "mortgage",
      notes: "Monthly commercial mortgage payment",
    },
    {
      orgId: org.id,
      propertyId: propMaple.id,
      type: "expense",
      amount: 180000, // $1800
      date: subDays(new Date(), 30),
      category: "mortgage",
      notes: "Monthly commercial mortgage payment",
    },
    {
      orgId: org.id,
      propertyId: propPinecrest.id,
      type: "expense",
      amount: 110000, // $1100
      date: subDays(new Date(), 30),
      category: "mortgage",
      notes: "Cottage mortgage payment",
    },
    // Cleaning
    {
      orgId: org.id,
      propertyId: propMaple.id,
      unitId: mapleUnits[2].id,
      type: "expense",
      amount: 18000, // $180
      date: subDays(new Date(), 3),
      category: "cleaning",
      notes: "Deep clean post-tenancy for Unit C",
    }
  ];

  await db.insert(schema.financialRecords).values(expenses);

  // 13. Audit Logs (Initial setup trace)
  console.log("Creating initial audit log traces...");
  await db.insert(schema.auditLogs).values([
    {
      orgId: org.id,
      userId: ownerUser.id,
      entityType: "organization",
      entityId: org.id,
      action: "create",
      newState: { name: org.name },
    },
    {
      orgId: org.id,
      userId: ownerUser.id,
      entityType: "property",
      entityId: propOakridge.id,
      action: "create",
      newState: { nickname: propOakridge.nickname, address: propOakridge.address },
    },
    {
      orgId: org.id,
      userId: ownerUser.id,
      entityType: "maintenance_request",
      entityId: req3.id,
      action: "create",
      newState: { title: req3.title, priority: req3.priority },
    },
    {
      orgId: org.id,
      userId: managerUser.id,
      entityType: "maintenance_request",
      entityId: req3.id,
      action: "status_transition",
      previousState: { status: "new" },
      newState: { status: "assigned", assignedVendorId: vendor2.id },
    }
  ]);

  console.log("Seeding completed successfully!");
  pool.end();
}

main().catch((err) => {
  console.error("Seeding failed:");
  console.error(err);
  process.exit(1);
});
