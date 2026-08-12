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

## 6. Canonical Origin & Link Security

- Server-side `APP_URL` is validated strictly at API startup.
- In production (`NODE_ENV=production`), `APP_URL` is required, must use HTTPS, and cannot be set to `localhost` or `127.0.0.1`.
- Invitation URLs are constructed exclusively from `APP_URL` using fragment parameters (`${APP_URL}/invite#token=${rawToken}`).
- URLs never derive from request `Host` headers or `NEXT_PUBLIC_APP_URL`.

## 7. Secure Invitation Tokens & Transactional Email

- **Token Storage**: Raw invitation tokens exist only in memory during creation. Databases store only cryptographic `tokenHash` (SHA-256).
- **Log Sanitation**: Raw tokens, token hashes, full invitation URLs, and raw provider error responses are strictly redacted from logs, error fields, and audit trails.
- **Safety Gate**: Transactional email defaults to `EMAIL_ENABLED=false` using `NoopEmailProvider`. No real emails are sent and no provider credentials are required unless explicitly activated.
- **State Isolation**: Invitation status (`pending`, `sent`, `accepted`, etc.) is kept separate from provider `deliveryStatus` (`not_sent`, `skipped`, `accepted`, `delivered`, `bounced`, `complained`, `failed`).

