import { z } from "zod";

// Roles & Auth Enums
// Roles & Auth Enums
export const UserRoleEnum = z.enum(["owner", "manager", "accountant", "maintenance", "read_only"]);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const OrganizationMembershipRoleEnum = z.enum(["owner", "manager", "accountant", "maintenance", "read_only"]);
export type OrganizationMembershipRole = z.infer<typeof OrganizationMembershipRoleEnum>;

// Property & Unit Enums
export const PropertyTypeEnum = z.enum(["single_family", "multi_family", "condo", "townhouse", "apartment_building"]);
export type PropertyType = z.infer<typeof PropertyTypeEnum>;

export const UnitStatusEnum = z.enum(["occupied", "vacant", "notice_given", "offline"]);
export type UnitStatus = z.infer<typeof UnitStatusEnum>;

// Lease Enums
export const LeaseStatusEnum = z.enum(["draft", "active", "ended", "renewed"]);
export type LeaseStatus = z.infer<typeof LeaseStatusEnum>;

// Maintenance & Work Order Enums
export const MaintenancePriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
export type MaintenancePriority = z.infer<typeof MaintenancePriorityEnum>;

export const MaintenanceStatusEnum = z.enum([
  "new",
  "triaged",
  "assigned",
  "scheduled",
  "completed",
  "closed",
]);
export type MaintenanceStatus = z.infer<typeof MaintenanceStatusEnum>;

export const WorkOrderStatusEnum = z.enum([
  "draft",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusEnum>;

// Task Enums
export const TaskStatusEnum = z.enum(["todo", "in_progress", "completed", "cancelled"]);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

export const TaskTypeEnum = z.enum(["general", "maintenance", "lease_renewal", "inspection", "financial"]);
export type TaskType = z.infer<typeof TaskTypeEnum>;

// Financial Enums
export const FinancialRecordTypeEnum = z.enum(["income", "expense"]);
export type FinancialRecordType = z.infer<typeof FinancialRecordTypeEnum>;

export const FinancialCategoryEnum = z.enum([
  "repairs_and_maintenance",
  "utilities",
  "insurance",
  "taxes",
  "mortgage",
  "management",
  "cleaning",
  "supplies",
  "capital_improvement",
  "other",
]);
export type FinancialCategory = z.infer<typeof FinancialCategoryEnum>;

// Payment Enums
export const PaymentStatusEnum = z.enum(["upcoming", "paid", "partial", "overdue", "waived"]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

// --- Validation Schemas ---

// Auth/User
export const UserSignInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type UserSignInInput = z.infer<typeof UserSignInSchema>;

export const UserSignUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  orgName: z.string().min(2, "Organization name must be at least 2 characters").optional(),
  invitationToken: z.string().optional(),
}).refine((data) => !!data.invitationToken || (!!data.orgName && data.orgName.length >= 2), {
  message: "Organization name is required when not registering with an invitation",
  path: ["orgName"],
});
export type UserSignUpInput = z.infer<typeof UserSignUpSchema>;

export const UserChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string().min(1, "Password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
export type UserChangePasswordInput = z.infer<typeof UserChangePasswordSchema>;

// Workspace & Team Schemas
export const WorkspaceCreateSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters"),
  slug: z.string().min(2, "Slug must be at least 2 characters").optional(),
});
export type WorkspaceCreateInput = z.infer<typeof WorkspaceCreateSchema>;

export const WorkspaceSwitchSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
});
export type WorkspaceSwitchInput = z.infer<typeof WorkspaceSwitchSchema>;

export const InvitationCreateSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: OrganizationMembershipRoleEnum,
  note: z.string().optional(),
  confirmOwnerInvite: z.boolean().optional(),
});
export type InvitationCreateInput = z.infer<typeof InvitationCreateSchema>;

export const InvitationPreviewSchema = z.object({
  token: z.string().min(10, "Invalid invitation token"),
});
export type InvitationPreviewInput = z.infer<typeof InvitationPreviewSchema>;

export const InvitationAcceptSchema = z.object({
  token: z.string().min(10, "Invalid invitation token"),
});
export type InvitationAcceptInput = z.infer<typeof InvitationAcceptSchema>;

export const MemberRoleUpdateSchema = z.object({
  role: OrganizationMembershipRoleEnum,
});
export type MemberRoleUpdateInput = z.infer<typeof MemberRoleUpdateSchema>;

// Property
export const PropertyCreateSchema = z.object({
  address: z.string().min(5, "Address must be at least 5 characters"),
  nickname: z.string().min(2, "Nickname must be at least 2 characters"),
  propertyType: PropertyTypeEnum,
  ownershipPercentage: z.number().min(0).max(100).default(100),
  acquisitionDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid acquisition date"),
  notes: z.string().optional(),
  estimatedValue: z.number().min(0).optional().default(0),
  valuationDate: z.string().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid valuation date").optional().nullable(),
  valuationSource: z.string().max(255).optional().nullable(),
  valuationNotes: z.string().optional().nullable(),
});
export type PropertyCreateInput = z.infer<typeof PropertyCreateSchema>;

// Building
export const BuildingCreateSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  address: z.string().optional(),
});
export type BuildingCreateInput = z.infer<typeof BuildingCreateSchema>;

// Unit
export const UnitCreateSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  buildingId: z.string().uuid("Invalid building ID").nullable().optional(),
  unitNumber: z.string().min(1, "Unit number is required"),
  status: UnitStatusEnum.default("vacant"),
  type: z.string().default("residential"),
  monthlyRent: z.number().min(0, "Rent must be a positive number"),
  sizeSqFt: z.number().optional().nullable(),
});
export type UnitCreateInput = z.infer<typeof UnitCreateSchema>;

// Tenant
export const TenantCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  notes: z.string().optional(),
});
export type TenantCreateInput = z.infer<typeof TenantCreateSchema>;

// Lease
export const LeaseCreateBaseSchema = z.object({
  unitId: z.string().uuid("Invalid unit ID"),
  primaryTenantId: z.string().uuid("Invalid tenant ID"),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid start date"),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid end date"),
  monthlyRent: z.number().min(0, "Rent must be positive"),
  securityDeposit: z.number().min(0, "Deposit must be positive"),
  status: LeaseStatusEnum.default("draft"),
  renewalOption: z.boolean().default(false),
  notes: z.string().optional(),
});

export const LeaseCreateSchema = LeaseCreateBaseSchema.refine((data) => {
  return new Date(data.endDate) > new Date(data.startDate);
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});
export type LeaseCreateInput = z.infer<typeof LeaseCreateSchema>;

// Maintenance Request
export const MaintenanceRequestCreateSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID"),
  tenantId: z.string().uuid("Invalid tenant ID").optional().nullable(),
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  priority: MaintenancePriorityEnum.default("medium"),
  status: MaintenanceStatusEnum.default("new"),
});
export type MaintenanceRequestCreateInput = z.infer<typeof MaintenanceRequestCreateSchema>;

// Vendor
export const VendorCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  specialty: z.string().min(2, "Specialty is required"),
  email: z.string().email("Invalid email").optional().nullable(),
  phone: z.string().min(10, "Phone is required").optional().nullable(),
  notes: z.string().optional(),
});
export type VendorCreateInput = z.infer<typeof VendorCreateSchema>;

// Work Order
export const WorkOrderCreateSchema = z.object({
  maintenanceRequestId: z.string().uuid("Invalid maintenance request ID"),
  vendorId: z.string().uuid("Invalid vendor ID"),
  notes: z.string().optional(),
  scheduledAt: z.string().optional().nullable().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid scheduled date"),
});
export type WorkOrderCreateInput = z.infer<typeof WorkOrderCreateSchema>;

// Task
export const TaskCreateSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid due date"),
  ownerId: z.string().uuid("Invalid user ID"),
  status: TaskStatusEnum.default("todo"),
  priority: MaintenancePriorityEnum.default("medium"),
  type: TaskTypeEnum.default("general"),
  propertyId: z.string().uuid("Invalid ID").optional().nullable(),
  unitId: z.string().uuid("Invalid ID").optional().nullable(),
  tenantId: z.string().uuid("Invalid ID").optional().nullable(),
  leaseId: z.string().uuid("Invalid ID").optional().nullable(),
  maintenanceRequestId: z.string().uuid("Invalid ID").optional().nullable(),
  workOrderId: z.string().uuid("Invalid ID").optional().nullable(),
  notes: z.string().optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

// Financial Record
export const FinancialRecordCreateSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID").optional().nullable(),
  type: FinancialRecordTypeEnum,
  amount: z.number().min(0.01, "Amount must be greater than zero"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid record date"),
  category: FinancialCategoryEnum,
  notes: z.string().optional(),
  vendorId: z.string().uuid("Invalid vendor ID").optional().nullable(),
  sourceTransactionRef: z.string().optional().nullable(),
  state: z.enum(["approved", "review"]).default("approved"),
});
export type FinancialRecordCreateInput = z.infer<typeof FinancialRecordCreateSchema>;

// Payment
export const PaymentCreateSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  leaseId: z.string().uuid("Invalid lease ID"),
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID"),
  amountDue: z.number().min(0, "Amount due must be positive").default(0), // in dollars
  amountReceived: z.number().min(0, "Amount received must be non-negative").default(0), // in dollars
  dueDate: z.string().optional().nullable().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid due date"),
  paidDate: z.string().optional().nullable().refine((val) => !val || !isNaN(Date.parse(val)), "Invalid paid date"),
  status: z.string().default("upcoming"),
  paymentMethod: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  providerId: z.string().optional().nullable(),
  source: z.enum(["manual", "imported", "provider"]).default("manual"),
  idempotencyKey: z.string().optional().nullable(),
});
export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>;

// Charge
export const ChargeStatusEnum = z.enum(["upcoming", "paid", "partial", "overdue", "waived", "void"]);
export type ChargeStatus = z.infer<typeof ChargeStatusEnum>;

export const ChargeCreateSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID"),
  tenantId: z.string().uuid("Invalid tenant ID"),
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID"),
  type: z.enum(["rent", "fee", "credit", "adjustment"]),
  amount: z.number().min(0.01, "Amount must be positive"), // in dollars
  dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid due date"),
  balance: z.number().min(0, "Balance must be non-negative").optional(),
  status: ChargeStatusEnum.default("upcoming"),
  notes: z.string().optional().nullable(),
});
export type ChargeCreateInput = z.infer<typeof ChargeCreateSchema>;

// Payment Allocation
export const PaymentAllocationCreateSchema = z.object({
  paymentId: z.string().uuid("Invalid payment ID"),
  chargeId: z.string().uuid("Invalid charge ID"),
  amount: z.number().min(0.01, "Allocation amount must be positive"), // in dollars
});
export type PaymentAllocationCreateInput = z.infer<typeof PaymentAllocationCreateSchema>;

// Import Source
export const ImportSourceCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.enum(["csv_upload", "bank_feed"]),
});
export type ImportSourceCreateInput = z.infer<typeof ImportSourceCreateSchema>;

// Import Run
export const ImportRunCreateSchema = z.object({
  sourceId: z.string().uuid("Invalid source ID"),
  fileName: z.string().min(1, "File name is required"),
  importType: z.enum(["properties", "units", "tenants", "leases", "payments", "expenses", "monthly_summaries", "transactions"]),
  status: z.enum(["pending", "processing", "completed", "failed"]).default("pending"),
});
export type ImportRunCreateInput = z.infer<typeof ImportRunCreateSchema>;

// Coverage Status & Regex
export const DetailCoverageStatusEnum = z.enum([
  "summary_only",
  "partial_detail",
  "detail_complete",
  "needs_review",
]);
export type DetailCoverageStatus = z.infer<typeof DetailCoverageStatusEnum>;

export const CoverageMonthRegex = /^20[0-9]{2}-(0[1-9]|1[0-2])$/;

// Currency Parser Utility
export function parseCurrencyToCents(val: unknown, allowNegative = false): number {
  if (val === null || val === undefined) throw new Error("Currency value is missing");
  const str = String(val).trim();
  if (!str) throw new Error("Currency string is empty");

  const match = str.match(/^(-)?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\.([0-9]{1,2}))?$/);
  if (!match) throw new Error(`Invalid currency format: "${str}"`);

  const isNeg = !!match[1];
  if (isNeg && !allowNegative) throw new Error(`Negative currency value not allowed: "${str}"`);

  const wholeStr = match[2].replace(/,/g, "");
  const centsStr = (match[3] || "").padEnd(2, "0");

  const cents = parseInt(wholeStr, 10) * 100 + parseInt(centsStr, 10);
  if (!Number.isSafeInteger(cents)) throw new Error("Currency value out of integer range");

  return isNeg ? -cents : cents;
}

// CSV Onboarding Row Schemas
export const PropertiesCSVSchema = z.object({
  propertyExternalKey: z.string().min(1, "propertyExternalKey is required"),
  propertyName: z.string().min(1, "propertyName is required"),
  addressLine1: z.string().min(1, "addressLine1 is required"),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1, "city is required"),
  state: z.string().min(1, "state is required"),
  postalCode: z.string().min(1, "postalCode is required"),
  propertyType: PropertyTypeEnum.default("single_family"),
  acquisitionDate: z.string().optional().nullable().refine(val => !val || !isNaN(Date.parse(val)), "Invalid acquisitionDate"),
  estimatedValue: z.string().optional().nullable().transform(v => v ? parseCurrencyToCents(v) : 0),
});
export type PropertiesCSVInput = z.infer<typeof PropertiesCSVSchema>;

export const UnitsCSVSchema = z.object({
  propertyExternalKey: z.string().min(1, "propertyExternalKey is required"),
  unitExternalKey: z.string().min(1, "unitExternalKey is required"),
  unitNumber: z.string().min(1, "unitNumber is required"),
  bedrooms: z.string().optional().nullable().transform(v => v ? parseInt(v, 10) : null),
  bathrooms: z.string().optional().nullable(),
  status: UnitStatusEnum.default("vacant"),
  marketRent: z.string().optional().nullable().transform(v => v ? parseCurrencyToCents(v) : 0),
});
export type UnitsCSVInput = z.infer<typeof UnitsCSVSchema>;

export const TenantsCSVSchema = z.object({
  firstName: z.string().min(1, "firstName is required"),
  lastName: z.string().min(1, "lastName is required"),
  email: z.string().optional().nullable().refine(val => !val || z.string().email().safeParse(val.trim().toLowerCase()).success, "Invalid email"),
  phone: z.string().optional().nullable(),
  externalTenantKey: z.string().optional().nullable(),
});
export type TenantsCSVInput = z.infer<typeof TenantsCSVSchema>;

export const LeasesCSVSchema = z.object({
  unitExternalKey: z.string().min(1, "unitExternalKey is required"),
  tenantExternalKey: z.string().optional().nullable(),
  tenantEmail: z.string().optional().nullable(),
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid startDate"),
  endDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid endDate"),
  monthlyRent: z.string().transform(v => parseCurrencyToCents(v)),
  securityDeposit: z.string().optional().nullable().transform(v => v ? parseCurrencyToCents(v) : 0),
  leaseStatus: LeaseStatusEnum.default("active"),
}).refine(data => !!data.tenantExternalKey || !!data.tenantEmail, {
  message: "Either tenantExternalKey or tenantEmail is required",
  path: ["tenantExternalKey"],
});
export type LeasesCSVInput = z.infer<typeof LeasesCSVSchema>;

export const HistoricalPaymentsCSVSchema = z.object({
  propertyExternalKey: z.string().min(1, "propertyExternalKey is required"),
  unitExternalKey: z.string().min(1, "unitExternalKey is required"),
  tenantExternalKey: z.string().optional().nullable(),
  tenantEmail: z.string().optional().nullable(),
  amount: z.string().transform(v => parseCurrencyToCents(v)),
  paymentDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid paymentDate"),
  coverageMonth: z.string().optional().nullable().refine(val => !val || CoverageMonthRegex.test(val), "Invalid coverageMonth (expected YYYY-MM)"),
  paymentMethod: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  externalReference: z.string().optional().nullable(),
}).refine(data => !!data.tenantExternalKey || !!data.tenantEmail, {
  message: "Either tenantExternalKey or tenantEmail is required",
  path: ["tenantExternalKey"],
});
export type HistoricalPaymentsCSVInput = z.infer<typeof HistoricalPaymentsCSVSchema>;

export const HistoricalExpensesCSVSchema = z.object({
  propertyExternalKey: z.string().min(1, "propertyExternalKey is required"),
  unitExternalKey: z.string().optional().nullable(),
  vendorName: z.string().optional().nullable(),
  category: FinancialCategoryEnum.default("other"),
  amount: z.string().transform(v => parseCurrencyToCents(v)),
  paidDate: z.string().refine(val => !isNaN(Date.parse(val)), "Invalid paidDate"),
  transactionDate: z.string().optional().nullable().refine(val => !val || !isNaN(Date.parse(val)), "Invalid transactionDate"),
  memo: z.string().optional().nullable(),
  externalReference: z.string().optional().nullable(),
});
export type HistoricalExpensesCSVInput = z.infer<typeof HistoricalExpensesCSVSchema>;

export const MonthlySummaryCSVSchema = z.object({
  propertyExternalKey: z.string().min(1, "propertyExternalKey is required"),
  month: z.string().regex(CoverageMonthRegex, "Invalid month format (expected YYYY-MM)"),
  scheduledRent: z.string().transform(v => parseCurrencyToCents(v)),
  collectedRent: z.string().transform(v => parseCurrencyToCents(v)),
  expenses: z.string().transform(v => parseCurrencyToCents(v)),
  sourceNote: z.string().optional().nullable(),
});
export type MonthlySummaryCSVInput = z.infer<typeof MonthlySummaryCSVSchema>;

