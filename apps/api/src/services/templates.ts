export interface CSVTemplateInfo {
  type: string;
  filename: string;
  description: string;
  headers: string[];
  sampleRows: string[][];
}

export const CSV_TEMPLATES: Record<string, CSVTemplateInfo> = {
  properties: {
    type: "properties",
    filename: "properties_template.csv",
    description: "Property portfolio master definitions",
    headers: [
      "propertyExternalKey",
      "propertyName",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "propertyType",
      "acquisitionDate",
      "estimatedValue"
    ],
    sampleRows: [
      [
        "PROP_DELRAY_01",
        "Delray Beach 9-Unit Rental",
        "1045 Atlantic Ave",
        "",
        "Delray Beach",
        "FL",
        "33483",
        "multi_family",
        "2021-03-15",
        "2200000.00"
      ]
    ]
  },
  units: {
    type: "units",
    filename: "units_template.csv",
    description: "Building unit inventory with market rent and specs",
    headers: [
      "propertyExternalKey",
      "unitExternalKey",
      "unitNumber",
      "bedrooms",
      "bathrooms",
      "status",
      "marketRent"
    ],
    sampleRows: [
      ["PROP_DELRAY_01", "UNIT_DELRAY_101", "101", "2", "1", "occupied", "1850.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_102", "102", "2", "1", "occupied", "1850.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_103", "103", "1", "1", "occupied", "1550.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_104", "104", "1", "1", "occupied", "1550.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_105", "105", "2", "2", "occupied", "2100.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_106", "106", "2", "2", "occupied", "2100.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_107", "107", "3", "2", "occupied", "2600.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_108", "108", "1", "1", "vacant", "1550.00"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_109", "109", "2", "1", "vacant", "1850.00"]
    ]
  },
  tenants: {
    type: "tenants",
    filename: "tenants_template.csv",
    description: "Tenant records without automatic invitations",
    headers: [
      "firstName",
      "lastName",
      "email",
      "phone",
      "externalTenantKey"
    ],
    sampleRows: [
      ["John", "Doe", "john.doe@example.com", "5615550101", "TENANT_DELRAY_101"],
      ["Jane", "Smith", "jane.smith@example.com", "5615550102", "TENANT_DELRAY_102"],
      ["Robert", "Johnson", "robert.j@example.com", "5615550103", "TENANT_DELRAY_103"],
      ["Emily", "Davis", "emily.d@example.com", "5615550104", "TENANT_DELRAY_104"],
      ["Michael", "Brown", "michael.b@example.com", "5615550105", "TENANT_DELRAY_105"],
      ["Sarah", "Wilson", "sarah.w@example.com", "5615550106", "TENANT_DELRAY_106"],
      ["David", "Taylor", "david.t@example.com", "5615550107", "TENANT_DELRAY_107"]
    ]
  },
  leases: {
    type: "leases",
    filename: "leases_template.csv",
    description: "Active and historical lease agreements",
    headers: [
      "unitExternalKey",
      "tenantExternalKey",
      "tenantEmail",
      "startDate",
      "endDate",
      "monthlyRent",
      "securityDeposit",
      "leaseStatus"
    ],
    sampleRows: [
      ["UNIT_DELRAY_101", "TENANT_DELRAY_101", "john.doe@example.com", "2026-01-01", "2026-12-31", "1850.00", "1850.00", "active"],
      ["UNIT_DELRAY_102", "TENANT_DELRAY_102", "jane.smith@example.com", "2026-01-01", "2026-12-31", "1850.00", "1850.00", "active"],
      ["UNIT_DELRAY_103", "TENANT_DELRAY_103", "robert.j@example.com", "2026-01-01", "2026-12-31", "1550.00", "1550.00", "active"],
      ["UNIT_DELRAY_104", "TENANT_DELRAY_104", "emily.d@example.com", "2026-01-01", "2026-12-31", "1550.00", "1550.00", "active"],
      ["UNIT_DELRAY_105", "TENANT_DELRAY_105", "michael.b@example.com", "2026-01-01", "2026-12-31", "2100.00", "2100.00", "active"],
      ["UNIT_DELRAY_106", "TENANT_DELRAY_106", "sarah.w@example.com", "2026-01-01", "2026-12-31", "2100.00", "2100.00", "active"],
      ["UNIT_DELRAY_107", "TENANT_DELRAY_107", "david.t@example.com", "2026-01-01", "2026-12-31", "2600.00", "2600.00", "active"]
    ]
  },
  payments: {
    type: "payments",
    filename: "historical_payments_template.csv",
    description: "Historical tenant rent payments and ledger receipts",
    headers: [
      "propertyExternalKey",
      "unitExternalKey",
      "tenantExternalKey",
      "tenantEmail",
      "amount",
      "paymentDate",
      "coverageMonth",
      "paymentMethod",
      "memo",
      "externalReference"
    ],
    sampleRows: [
      ["PROP_DELRAY_01", "UNIT_DELRAY_101", "TENANT_DELRAY_101", "john.doe@example.com", "1850.00", "2026-05-02", "2026-05", "ach", "May Rent Payment", "PAY_DELRAY_202605_101"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_102", "TENANT_DELRAY_102", "jane.smith@example.com", "1850.00", "2026-05-03", "2026-05", "check", "May Rent Check #402", "PAY_DELRAY_202605_102"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_103", "TENANT_DELRAY_103", "robert.j@example.com", "1550.00", "2026-05-01", "2026-05", "ach", "May Rent", "PAY_DELRAY_202605_103"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_104", "TENANT_DELRAY_104", "emily.d@example.com", "1550.00", "2026-05-04", "2026-05", "ach", "May Rent", "PAY_DELRAY_202605_104"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_105", "TENANT_DELRAY_105", "michael.b@example.com", "2100.00", "2026-05-02", "2026-05", "ach", "May Rent", "PAY_DELRAY_202605_105"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_106", "TENANT_DELRAY_106", "sarah.w@example.com", "2100.00", "2026-05-05", "2026-05", "check", "May Rent Check #112", "PAY_DELRAY_202605_106"],
      ["PROP_DELRAY_01", "UNIT_DELRAY_107", "TENANT_DELRAY_107", "david.t@example.com", "2600.00", "2026-05-01", "2026-05", "ach", "May Rent", "PAY_DELRAY_202605_107"]
    ]
  },
  expenses: {
    type: "expenses",
    filename: "historical_expenses_template.csv",
    description: "Historical property and unit operating expenses",
    headers: [
      "propertyExternalKey",
      "unitExternalKey",
      "vendorName",
      "category",
      "amount",
      "paidDate",
      "transactionDate",
      "memo",
      "externalReference"
    ],
    sampleRows: [
      ["PROP_DELRAY_01", "UNIT_DELRAY_101", "Plumbing Experts", "repairs_and_maintenance", "350.00", "2026-05-10", "2026-05-09", "Sink pipe repair", "EXP_DELRAY_202605_01"],
      ["PROP_DELRAY_01", "", "City Utilities", "utilities", "1200.00", "2026-05-15", "2026-05-14", "Water & Garbage", "EXP_DELRAY_202605_02"]
    ]
  },
  monthly_summaries: {
    type: "monthly_summaries",
    filename: "monthly_summaries_template.csv",
    description: "Landlord historical monthly cash-flow summaries (used when detailed transactions are absent)",
    headers: [
      "propertyExternalKey",
      "month",
      "scheduledRent",
      "collectedRent",
      "expenses",
      "sourceNote"
    ],
    sampleRows: [
      ["PROP_DELRAY_01", "2026-04", "13600.00", "13600.00", "3200.00", "Landlord Excel historical ledger Q2 2026"],
      ["PROP_DELRAY_01", "2026-03", "13600.00", "13600.00", "2800.00", "Landlord Excel historical ledger Q1 2026"]
    ]
  }
};

export function generateCSVContent(template: CSVTemplateInfo): string {
  const headerLine = template.headers.join(",");
  const dataLines = template.sampleRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","));
  return [headerLine, ...dataLines].join("\n");
}
