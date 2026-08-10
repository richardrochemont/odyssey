import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Organizations (Multi-tenant scope)
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 2. Users (Role-based access within Organization)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("read_only"), // 'owner' | 'manager' | 'maintenance' | 'read_only'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 3. Properties
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 255 }).notNull(),
  propertyType: varchar("property_type", { length: 50 }).notNull(), // 'single_family', 'multi_family', 'condo', etc.
  ownershipPercentage: integer("ownership_percentage").notNull().default(100), // e.g. 100
  acquisitionDate: timestamp("acquisition_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 4. Buildings (Properties can contain buildings, which contain units)
export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: varchar("address", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 5. Units
export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  buildingId: uuid("building_id").references(() => buildings.id),
  unitNumber: varchar("unit_number", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("vacant"), // 'occupied' | 'vacant' | 'notice_given' | 'offline'
  type: varchar("type", { length: 50 }).notNull().default("residential"),
  monthlyRent: integer("monthly_rent").notNull(), // stored in cents
  sizeSqFt: integer("size_sq_ft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 6. Tenants
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 7. Leases
export const leases = pgTable("leases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id).notNull(),
  primaryTenantId: uuid("primary_tenant_id").references(() => tenants.id).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  monthlyRent: integer("monthly_rent").notNull(), // stored in cents
  securityDeposit: integer("security_deposit").notNull(), // stored in cents
  status: varchar("status", { length: 50 }).notNull().default("draft"), // 'draft' | 'active' | 'ended' | 'renewed'
  renewalOption: boolean("renewal_option").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 8. Vendors
export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  specialty: varchar("specialty", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 9. Maintenance Requests
export const maintenanceRequests = pgTable("maintenance_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id).notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"), // 'low' | 'medium' | 'high' | 'urgent'
  status: varchar("status", { length: 50 }).notNull().default("new"), // 'new' | 'triaged' | 'assigned' | 'scheduled' | 'completed' | 'closed'
  attachmentPlaceholder: varchar("attachment_placeholder", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 10. Work Orders (Assigned to Vendors)
export const workOrders = pgTable("work_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  maintenanceRequestId: uuid("maintenance_request_id").references(() => maintenanceRequests.id).notNull(),
  vendorId: uuid("vendor_id").references(() => vendors.id).notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).notNull().default("assigned"), // 'draft' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 11. Tasks
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: timestamp("due_date").notNull(),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("todo"), // 'todo' | 'in_progress' | 'completed' | 'cancelled'
  priority: varchar("priority", { length: 50 }).notNull().default("medium"), // 'low' | 'medium' | 'high' | 'urgent'
  type: varchar("type", { length: 50 }).notNull().default("general"), // 'general' | 'maintenance' | 'lease_renewal' | 'inspection' | 'financial'
  
  // Relations (optional references)
  propertyId: uuid("property_id").references(() => properties.id),
  unitId: uuid("unit_id").references(() => units.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  leaseId: uuid("lease_id").references(() => leases.id),
  maintenanceRequestId: uuid("maintenance_request_id").references(() => maintenanceRequests.id),
  workOrderId: uuid("work_order_id").references(() => workOrders.id),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 12. Financial Records
export const financialRecords = pgTable("financial_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id),
  type: varchar("type", { length: 50 }).notNull(), // 'income' | 'expense'
  amount: integer("amount").notNull(), // stored in cents
  date: timestamp("date").notNull(),
  category: varchar("category", { length: 100 }).notNull(), // 'rent', 'maintenance_repair', 'utility_water', etc.
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 13. Payments Ledger
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  leaseId: uuid("lease_id").references(() => leases.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id).notNull(),
  amountDue: integer("amount_due").notNull(), // stored in cents
  amountReceived: integer("amount_received").notNull().default(0), // stored in cents
  dueDate: timestamp("due_date").notNull(),
  paidDate: timestamp("paid_date"),
  status: varchar("status", { length: 50 }).notNull().default("upcoming"), // 'upcoming' | 'paid' | 'partial' | 'overdue' | 'waived'
  paymentMethod: varchar("payment_method", { length: 100 }), // 'ach' | 'check' | 'cash'
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 14. Audit Logs (Immutable)
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(), // 'property' | 'lease' | 'maintenance_request' | 'task' | etc.
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(), // 'create' | 'update' | 'archive' | 'status_transition'
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations definitions for Drizzle ORM queries
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  properties: many(properties),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  tasks: many(tasks),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [properties.orgId],
    references: [organizations.id],
  }),
  buildings: many(buildings),
  units: many(units),
  financialRecords: many(financialRecords),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  property: one(properties, {
    fields: [buildings.propertyId],
    references: [properties.id],
  }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  building: one(buildings, {
    fields: [units.buildingId],
    references: [buildings.id],
  }),
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
  financialRecords: many(financialRecords),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
}));

export const leasesRelations = relations(leases, ({ one }) => ({
  unit: one(units, {
    fields: [leases.unitId],
    references: [units.id],
  }),
  tenant: one(tenants, {
    fields: [leases.primaryTenantId],
    references: [tenants.id],
  }),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  workOrders: many(workOrders),
}));

export const maintenanceRequestsRelations = relations(maintenanceRequests, ({ one, many }) => ({
  property: one(properties, {
    fields: [maintenanceRequests.propertyId],
    references: [properties.id],
  }),
  unit: one(units, {
    fields: [maintenanceRequests.unitId],
    references: [units.id],
  }),
  tenant: one(tenants, {
    fields: [maintenanceRequests.tenantId],
    references: [tenants.id],
  }),
  workOrders: many(workOrders),
}));

export const workOrdersRelations = relations(workOrders, ({ one }) => ({
  maintenanceRequest: one(maintenanceRequests, {
    fields: [workOrders.maintenanceRequestId],
    references: [maintenanceRequests.id],
  }),
  vendor: one(vendors, {
    fields: [workOrders.vendorId],
    references: [vendors.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  owner: one(users, {
    fields: [tasks.ownerId],
    references: [users.id],
  }),
}));

export const financialRecordsRelations = relations(financialRecords, ({ one }) => ({
  property: one(properties, {
    fields: [financialRecords.propertyId],
    references: [properties.id],
  }),
  unit: one(units, {
    fields: [financialRecords.unitId],
    references: [units.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organizations, {
    fields: [payments.orgId],
    references: [organizations.id],
  }),
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
  lease: one(leases, {
    fields: [payments.leaseId],
    references: [leases.id],
  }),
  property: one(properties, {
    fields: [payments.propertyId],
    references: [properties.id],
  }),
  unit: one(units, {
    fields: [payments.unitId],
    references: [units.id],
  }),
}));

