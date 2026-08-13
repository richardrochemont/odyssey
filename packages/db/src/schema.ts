import { pgTable, uuid, varchar, text, integer, boolean, timestamp, date, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Organizations (Multi-tenant scope)
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  organizationsSlugUnique: uniqueIndex("organizations_slug_unique").on(table.slug),
}));

// 2. Users (Role-based access within Organization)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("read_only"), // 'owner' | 'manager' | 'maintenance' | 'read_only'
  tokenVersion: integer("token_version").notNull().default(1),
  lastActiveOrgId: uuid("last_active_org_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 2b. Organization Memberships (Multi-workspace membership and RBAC)
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    role: varchar("role", { length: 50 }).notNull(), // 'owner' | 'manager' | 'accountant' | 'maintenance' | 'read_only'
    status: varchar("status", { length: 50 }).notNull().default("active"), // 'active' | 'suspended'
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => ({
    uniqueOrgUser: uniqueIndex("unique_org_user_membership").on(table.orgId, table.userId),
  })
);

// 2c. Organization Invitations (Team onboarding with token hashing)
export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(), // 'owner' | 'manager' | 'accountant' | 'maintenance' | 'read_only'
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    note: text("note"),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // 'draft' | 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked'
    deliveryStatus: varchar("delivery_status", { length: 50 }).notNull().default("not_sent"), // 'not_sent' | 'skipped' | 'accepted' | 'delivered' | 'bounced' | 'complained' | 'failed'
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    sentAt: timestamp("sent_at"),
    lastDeliveryError: text("last_delivery_error"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

// Import Engine Schema
export const importSources = pgTable("import_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(), // 'csv_upload' | 'bank_feed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  sourceId: uuid("source_id").references(() => importSources.id).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  importType: varchar("import_type", { length: 100 }).notNull(), // 'properties' | 'units' | 'tenants' | 'leases' | 'payments' | 'expenses' | 'transactions'
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  errorSummary: text("error_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

export const importRows = pgTable("import_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  runId: uuid("run_id").references(() => importRuns.id).notNull(),
  rowNumber: integer("row_number").notNull(),
  rawData: jsonb("raw_data").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending' | 'validated' | 'imported' | 'failed' | 'needs_review'
  validationErrors: jsonb("validation_errors"), // string[]
  targetEntityId: uuid("target_entity_id"),
  rowFingerprint: varchar("row_fingerprint", { length: 64 }),
  duplicateClassification: varchar("duplicate_classification", { length: 50 }), // 'exact_duplicate' | 'conflicting_reference' | 'possible_cross_source_duplicate'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 3. Properties
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  externalKey: varchar("external_key", { length: 255 }),
  propertyName: varchar("property_name", { length: 255 }),
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 255 }),
  postalCode: varchar("postal_code", { length: 50 }),
  address: varchar("address", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 255 }).notNull(),
  propertyType: varchar("property_type", { length: 50 }).notNull(), // 'single_family', 'multi_family', 'condo', etc.
  ownershipPercentage: integer("ownership_percentage").notNull().default(100), // e.g. 100
  acquisitionDate: timestamp("acquisition_date").notNull(),
  notes: text("notes"),
  estimatedValue: integer("estimated_value").notNull().default(0),
  valuationDate: timestamp("valuation_date"),
  valuationSource: varchar("valuation_source", { length: 255 }),
  valuationNotes: text("valuation_notes"),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  uniqueOrgExtKey: uniqueIndex("unique_properties_org_ext_key").on(table.orgId, table.externalKey),
}));

// 4. Buildings (Properties can contain buildings, which contain units)
export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: varchar("address", { length: 255 }),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
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
  externalKey: varchar("external_key", { length: 255 }),
  unitNumber: varchar("unit_number", { length: 50 }).notNull(),
  bedrooms: integer("bedrooms"),
  bathrooms: varchar("bathrooms", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull().default("vacant"), // 'occupied' | 'vacant' | 'notice_given' | 'offline'
  type: varchar("type", { length: 50 }).notNull().default("residential"),
  monthlyRent: integer("monthly_rent").notNull(), // stored in cents
  marketRentCents: integer("market_rent_cents").notNull().default(0),
  sizeSqFt: integer("size_sq_ft"),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  uniqueOrgExtKey: uniqueIndex("unique_units_org_ext_key").on(table.orgId, table.externalKey),
}));

// 6. Tenants
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  externalKey: varchar("external_key", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }), // optional
  phone: varchar("phone", { length: 50 }), // optional
  notes: text("notes"),
  portalStatus: varchar("portal_status", { length: 50 }).notNull().default("inactive"), // 'invited' | 'active' | 'inactive'
  inviteToken: varchar("invite_token", { length: 255 }),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  uniqueOrgExtKey: uniqueIndex("unique_tenants_org_ext_key").on(table.orgId, table.externalKey),
}));

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
  importRunId: uuid("import_run_id").references(() => importRuns.id),
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
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  status: varchar("status", { length: 50 }).notNull().default("new"),
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
  status: varchar("status", { length: 50 }).notNull().default("assigned"),
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
  status: varchar("status", { length: 50 }).notNull().default("todo"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  type: varchar("type", { length: 50 }).notNull().default("general"),
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

// 12. Financial Records (Expenses & Historical Summaries)
export const financialRecords = pgTable("financial_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id),
  type: varchar("type", { length: 50 }).notNull(), // 'income' | 'expense'
  amount: integer("amount").notNull(), // stored in cents
  date: timestamp("date").notNull(),
  paidDate: date("paid_date"),
  transactionDate: date("transaction_date"),
  category: varchar("category", { length: 100 }).notNull(),
  notes: text("notes"),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  sourceTransactionRef: varchar("source_transaction_ref", { length: 255 }),
  externalReference: varchar("external_reference", { length: 255 }),
  state: varchar("state", { length: 50 }).notNull().default("approved"), // 'approved' | 'review'
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 13. Charges
export const charges = pgTable("charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  leaseId: uuid("lease_id").references(() => leases.id).notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'rent' | 'fee' | 'credit' | 'adjustment'
  amount: integer("amount").notNull(), // stored in cents
  dueDate: timestamp("due_date").notNull(),
  balance: integer("balance").notNull(), // stored in cents (remaining unpaid obligation)
  status: varchar("status", { length: 50 }).notNull().default("upcoming"), // 'upcoming' | 'paid' | 'partial' | 'overdue' | 'waived' | 'void'
  notes: text("notes"),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 14. Payments Ledger (Received Cash)
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
  leaseId: uuid("lease_id").references(() => leases.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  unitId: uuid("unit_id").references(() => units.id).notNull(),
  
  // Legacy / Compatibility Columns
  amountDue: integer("amount_due").notNull().default(0), // legacy column
  amountReceived: integer("amount_received").notNull().default(0), // received cash amount in cents
  dueDate: timestamp("due_date").notNull().defaultNow(), // legacy column
  paidDate: timestamp("paid_date"), // date transaction cleared
  status: varchar("status", { length: 50 }).notNull().default("upcoming"), // legacy status/provider status: 'pending' | 'paid' | 'failed' | 'refunded' | 'disputed'
  paymentMethod: varchar("payment_method", { length: 100 }), // 'ach' | 'card' | 'check' | 'cash'
  memo: text("memo"),
  
  // New Integration & Import Columns
  providerId: varchar("provider_id", { length: 255 }),
  source: varchar("source", { length: 50 }).notNull().default("manual"), // 'manual' | 'imported' | 'provider'
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  coverageMonth: varchar("coverage_month", { length: 7 }), // YYYY-MM
  externalReference: varchar("external_reference", { length: 255 }),
  allocationMethod: varchar("allocation_method", { length: 50 }), // 'coverage_month' | 'single_charge_match' | 'unallocated' | 'needs_review'
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 15. Monthly Financial Summaries (Imported Data Model Only)
export const monthlyFinancialSummaries = pgTable("monthly_financial_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  scheduledRentCents: integer("scheduled_rent_cents").notNull().default(0),
  collectedRentCents: integer("collected_rent_cents").notNull().default(0),
  expenseCents: integer("expense_cents").notNull().default(0),
  sourceNote: text("source_note"),
  importRunId: uuid("import_run_id").references(() => importRuns.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  uniqueOrgPropMonthSummary: uniqueIndex("unique_org_property_month_summary").on(table.orgId, table.propertyId, table.month),
}));

// 16. Property Month Financial Coverages (Coverage State & Attestation Model)
export const propertyMonthFinancialCoverages = pgTable("property_month_financial_coverages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  state: varchar("state", { length: 50 }).notNull().default("summary_only"), // 'summary_only' | 'partial_detail' | 'detail_complete' | 'needs_review'
  attestedByUserId: uuid("attested_by_user_id").references(() => users.id),
  attestedAt: timestamp("attested_at"),
  attestationReason: text("attestation_reason"),
  invalidatedAt: timestamp("invalidated_at"),
  invalidatedByEntityType: varchar("invalidated_by_entity_type", { length: 100 }),
  invalidatedByEntityId: uuid("invalidated_by_entity_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  uniqueOrgPropMonthCoverage: uniqueIndex("unique_org_property_month_coverage").on(table.orgId, table.propertyId, table.month),
}));


// 15. Payment Allocations
export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  paymentId: uuid("payment_id").references(() => payments.id).notNull(),
  chargeId: uuid("charge_id").references(() => charges.id).notNull(),
  amount: integer("amount").notNull(), // amount allocated in cents
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

// 16. Audit Logs (Immutable)
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations Definitions
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  memberships: many(organizationMemberships),
  invitations: many(organizationInvitations),
  properties: many(properties),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  lastActiveOrganization: one(organizations, {
    fields: [users.lastActiveOrgId],
    references: [organizations.id],
  }),
  memberships: many(organizationMemberships),
  tasks: many(tasks),
}));

export const organizationMembershipsRelations = relations(organizationMemberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMemberships.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMemberships.userId],
    references: [users.id],
  }),
}));

export const organizationInvitationsRelations = relations(organizationInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvitations.orgId],
    references: [organizations.id],
  }),
  invitedByUser: one(users, {
    fields: [organizationInvitations.invitedByUserId],
    references: [users.id],
  }),
}));

export const importSourcesRelations = relations(importSources, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [importSources.orgId],
    references: [organizations.id],
  }),
  runs: many(importRuns),
}));

export const importRunsRelations = relations(importRuns, ({ one, many }) => ({
  source: one(importSources, {
    fields: [importRuns.sourceId],
    references: [importSources.id],
  }),
  rows: many(importRows),
}));

export const importRowsRelations = relations(importRows, ({ one }) => ({
  run: one(importRuns, {
    fields: [importRows.runId],
    references: [importRuns.id],
  }),
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

export const leasesRelations = relations(leases, ({ one, many }) => ({
  unit: one(units, {
    fields: [leases.unitId],
    references: [units.id],
  }),
  tenant: one(tenants, {
    fields: [leases.primaryTenantId],
    references: [tenants.id],
  }),
  charges: many(charges),
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
  vendor: one(vendors, {
    fields: [financialRecords.vendorId],
    references: [vendors.id],
  }),
}));

export const chargesRelations = relations(charges, ({ one, many }) => ({
  parentLease: one(leases, {
    fields: [charges.leaseId],
    references: [leases.id],
  }),
  tenant: one(tenants, {
    fields: [charges.tenantId],
    references: [tenants.id],
  }),
  property: one(properties, {
    fields: [charges.propertyId],
    references: [properties.id],
  }),
  unit: one(units, {
    fields: [charges.unitId],
    references: [units.id],
  }),
  allocations: many(paymentAllocations),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
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
  allocations: many(paymentAllocations),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentAllocations.paymentId],
    references: [payments.id],
  }),
  charge: one(charges, {
    fields: [paymentAllocations.chargeId],
    references: [charges.id],
  }),
}));
