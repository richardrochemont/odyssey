# Odyssey API Contracts

The Odyssey Fastify server implements standard RESTful endpoints. It exports OpenAPI 2.0/3.0 metadata automatically, accessible via Swagger-UI at:
`http://localhost:4000/docs`

## Authorization Header

Except for public sign-in routes, all requests must provide a signed JWT bearer token:
`Authorization: Bearer <JWT>`

The JWT contains:
- `id`: User UUID
- `orgId`: Tenant Organization UUID
- `role`: owner | manager | maintenance | read_only
- `name`: User Name
- `email`: User Email

---

## Route Schema Summary

### 1. Developer Auth (`/auth`)
- `GET /auth/users`: Lists seeded credentials (for selector utility).
- `POST /auth/login`: Authenticates password and yields Token.
  - Body: `{ email, password }`
  - Response: `{ token, user: { id, name, role, orgId } }`

### 2. Property Mappings (`/properties`)
- `GET /properties`: Lists properties with nested buildings and units.
- `GET /properties/:id`: Detailed Property information.
- `POST /properties`: Creates property (Owner/Manager).
- `PUT /properties/:id`: Updates property (Owner/Manager).
- `DELETE /properties/:id`: Archive property (Owner/Manager).
- `POST /properties/buildings`: Adds building (Owner/Manager).
- `DELETE /properties/buildings/:id`: Archives building.
- `POST /properties/units`: Adds rental unit (Owner/Manager).
- `PUT /properties/units/:id`: Updates unit (Owner/Manager/Maintenance).
- `DELETE /properties/units/:id`: Archives unit.

### 3. Tenancy & Leases (`/leases`)
- `GET /leases/tenants`: Lists tenant cards.
- `GET /leases/tenants/:id`: Detailed timeline of tenant tenancy.
- `POST /leases/tenants`: Registers tenant.
- `GET /leases`: Lists leases (returns computed `daysUntilExpiry` and `isExpiringSoon` flags).
- `GET /leases/:id`: Lease details.
- `POST /leases`: Creates lease. Enforces Unit occupancy check.
- `PUT /leases/:id`: Updates lease status.
- `DELETE /leases/:id`: Archives lease.

### 4. Payments Ledger (`/payments`)
- `GET /payments`: Lists payments with tenant, property, unit, and lease details.
- `POST /payments`: Creates manual payment record.
  - Body: `{ tenantId, leaseId, propertyId, unitId, amountDue, amountReceived, dueDate, paidDate, status, paymentMethod, memo }`
- `PUT /payments/:id`: Updates manual payment record.
- `DELETE /payments/:id`: Archives payment record.

### 5. Maintenance & Work Orders (`/maintenance` - Available Internally)
- `GET /maintenance/requests`: Lists active requests.
- `GET /maintenance/requests/:id`: Request details and active Work Orders.
- `POST /maintenance/requests`: Files request ticket.
- `PUT /maintenance/requests/:id/status`: Updates Kanban column status.
- `POST /maintenance/work-orders`: Converts ticket to Work Order and assigns to Vendor.
- `PUT /maintenance/work-orders/:id/status`: Updates Work Order progress status.
- `GET /maintenance/vendors`: Lists vendor profiles.
- `POST /maintenance/vendors`: Registers vendor profile.

### 6. Task Checklist (`/tasks` - Available Internally)
- `GET /tasks`: Lists active checklist. Supports filtering via `?status=todo` or `?ownerId=...`.
- `POST /tasks`: Creates task.
- `PUT /tasks/:id`: Updates checklist status.
- `DELETE /tasks/:id`: Archives checklist item.

### 7. Operating Expenses & Cash Flow Trends (`/financials`)
- `GET /financials/records`: Lists portfolio expense transactions.
- `POST /financials/records`: Logs operating expense.
- `DELETE /financials/records/:id`: Archives expense record.
- `GET /financials/summary`: Calculates scheduled rent, collected rent, operating expenses, and Net Operating Income (NOI).
- `GET /financials/trends`: Calculates 9-month cash flow trends including actual collected rents, projected rents, and expenses.

### 8. AI Operations (`/ai`)
- `POST /ai/lease-summary`: Summarizes lease terms.
- `POST /ai/prompt`: Context-aware prompt parsing for interactive operator.
  - Body: `{ context, text }`
  - Response:
    ```json
    {
      "message": "I've extracted a draft expense...",
      "card": {
        "intent": "create_expense_draft",
        "title": "Draft Expense Detected",
        "data": {
          "amount": 425.00,
          "category": "repairs_and_maintenance",
          "vendor": "Apex Plumbing",
          "propertyNickname": "Oakridge Manor",
          "unitNumber": "101",
          "date": "2026-08-08"
        }
      }
    }
    ```
