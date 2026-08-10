# Odyssey Security Strategy

Security is baked into Odyssey's architecture, targeting multi-tenant isolation, role authorization, and production readiness.

## 1. Multi-Tenant Scoping

Odyssey is a multi-tenant application. Data leakage between organizations is a critical failure.
- Every domain table contains an `org_id` column.
- The JWT session decodes the caller's authorized `orgId`.
- **All database queries** in routes apply an explicit tenant filter:
  `and(eq(table.orgId, request.user.orgId), ...)`
- This prevents horizontal privilege escalation (e.g. requesting lease `X` belonging to another organization yields a 404).

## 2. Role-Based Access Control (RBAC)

The application defines four user roles:
- `owner`: full admin control (properties, tenants, leases, finances, settings).
- `manager`: operational manager. Can configure properties/leases/repairs/tasks.
- `maintenance`: contractor lead. Limited to viewing units, executing tasks, and updating maintenance work order statuses.
- `read_only`: investor access. View-only access across the entire portfolio (cannot POST/PUT/DELETE).

Fastify API endpoints enforce role checks via middleware:
`preHandler: authorize(["owner", "manager"])`

## 3. JWT Verification

Authentication is managed via a JWT Bearer header.
- Local developer auth generates JWTs signed by a local `JWT_SECRET`.
- In production, the session verification layer is Clerk-ready, verifying public RSA tokens issued by Clerk.

## 4. SQL Injection Protection

Database queries are written using **Drizzle ORM** which parameterizes values by default. No raw SQL template strings are constructed, eliminating standard SQL Injection vectors.

## 5. Input Validation

All incoming payloads are validated at the API route boundary using **Zod schemas** shared through `packages/validation`. This enforces structure, checks lengths, formats emails, parses dates, and sanitizes numeric inputs before they reach database queries.
