# Odyssey Controlled Resend Activation & Admin/Owner Test Checklist

This document provides the mandatory, controlled test checklist for activating Resend transactional emails in Odyssey for **workspace team invitations only**.

---

## 1. Safety Rules & Scope Restrictions

> [!CAUTION]
> - **Workspace Invitations Only**: Email sending MUST ONLY be activated for workspace member invitations (`POST /workspaces/:orgId/invitations`).
> - **DO NOT ENABLE**: Tenant portal invitations, rent reminders, payment receipts, password reset emails, SMS notifications, or marketing/bulk campaigns.
> - **DO NOT ADD WEBHOOKS**: Resend webhook listeners are disabled at this phase. Status transition to `"delivered"` is prohibited without a future verified webhook implementation.
> - **NO SENSITIVE DATA LEAKAGE**: API keys, raw invitation tokens, and full email request payloads must NEVER be logged, audited, stored in DB, or returned in API responses (except the one-time invitation URL returned to the owner upon creation).

---

## 2. Required Railway Environment Variables

Configure the following variables in the Railway API service dashboard:

| Railway Variable Name | Description / Format | Example Value |
|---|---|---|
| `APP_URL` | Canonical app URL (HTTPS mandatory in prod, no trailing slash) | `https://odyssey.investments` |
| `EMAIL_PROVIDER` | Must be explicitly set to `resend` | `resend` |
| `EMAIL_ENABLED` | Master feature flag for sending emails | `true` |
| `RESEND_API_KEY` | Secret API key generated in Resend console | `re_123456789...` |
| `EMAIL_FROM` | Verified domain sender address | `Odyssey <invitations@odyssey.investments>` |
| `EMAIL_REPLY_TO` | Verified reply-to address (Optional) | `support@odyssey.investments` |

> [!IMPORTANT]
> **Startup Safety Assertions**:
> 1. If `EMAIL_PROVIDER=resend` AND `EMAIL_ENABLED=true`, the API startup checks that `RESEND_API_KEY` and `EMAIL_FROM` are set. Missing variables cause an immediate, safe startup failure (`FATAL EMAIL CONFIGURATION`).
> 2. If `EMAIL_ENABLED=false` or `EMAIL_PROVIDER=noop`, `getTransactionalEmailProvider()` returns `NoopEmailProvider`, preventing external HTTP network calls.

---

## 3. Resend Domain Verification Pre-Check

Before running the test invitation, verify sending domain status in the [Resend Console](https://resend.com/domains):

1. **Domain Status**: Ensure `odyssey.investments` displays status **Verified**.
2. **DNS Records Check**:
   - `resend._domainkey.odyssey.investments` (DKIM - CNAME/TXT) -> Verified
   - `send.odyssey.investments` / SPF -> Verified
   - `_dmarc.odyssey.investments` (DMARC) -> Configured (`v=DMARC1; p=none; ...`)

---

## 4. Controlled Admin/Owner Single Invitation Test Procedure

Follow these steps to send exactly **ONE** test invitation to the owner's email address:

### Step 1: Obtain Owner JWT & Target Workspace ID
Log in as the workspace owner to retrieve an authentication token:
```bash
curl -X POST https://api.odyssey.investments/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "owner@odyssey.investments", "password": "<YOUR_PASSWORD>"}'
```
*Save `token` and target `orgId` from the response.*

### Step 2: Trigger Controlled Workspace Invitation
Send **one** invitation to your own verified email address:
```bash
curl -X POST https://api.odyssey.investments/workspaces/<ORG_ID>/invitations \
  -H "Authorization: Bearer <OWNER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@odyssey.investments",
    "role": "manager",
    "note": "Controlled Resend provider activation test"
  }'
```

---

## 5. Expected API Response & Database Verification Checklist

### A. API Response Assertions (HTTP 201)
- [ ] `message`: `"Invitation created and email sent successfully."`
- [ ] `invitationUrl`: Contains valid canonical format `https://odyssey.investments/invite#token=<RAW_TOKEN>`
- [ ] `invitation.status`: `"sent"`
- [ ] `invitation.deliveryStatus`: `"accepted"`
- [ ] `invitation` payload does **NOT** leak `rawToken` or `tokenHash` inside the nested object.

### B. PostgreSQL Record Verification Query
Run the following SQL query in the Railway PostgreSQL database:
```sql
SELECT 
  id, 
  email, 
  role, 
  status, 
  delivery_status, 
  provider_message_id, 
  sent_at, 
  last_delivery_error,
  token_hash
FROM organization_invitations
WHERE email = 'owner@odyssey.investments'
ORDER BY created_at DESC
LIMIT 1;
```

#### Verification Matrix:
| Field | Expected Database Value |
|---|---|
| `status` | `'sent'` |
| `delivery_status` | `'accepted'` |
| `provider_message_id` | Populated (e.g. `resend-id-...`) |
| `sent_at` | Non-null timestamp matching sending time |
| `last_delivery_error` | `NULL` |
| `token_hash` | 64-character hex string (SHA-256 hash of raw token) |

---

## 6. Failure Recovery Verification

If Resend API returns an error (e.g., rate limit or network rejection):
1. `status` remains `'pending'` (un-changed).
2. `delivery_status` is set to `'failed'`.
3. `last_delivery_error` contains only normalized error code (e.g., `'ERR_PROVIDER_REJECTED'`).
4. API response message returns fallback message: `"Invitation link generated. Email delivery failed. Copy the one-time link to share it manually."`.

---

## 7. Verification Confirmation Sign-off

- [x] Resend enabled ONLY for Workspace Team Invitations.
- [x] Tenant portal invitations disabled (`ERR_NOT_IMPLEMENTED`).
- [x] Payment receipts & reminders disabled (`ERR_NOT_IMPLEMENTED`).
- [x] Password reset emails disabled (`ERR_NOT_IMPLEMENTED`).
- [x] SMS messaging disabled.
- [x] Bulk campaigns disabled.
- [x] Resend webhooks NOT added.
- [x] Payment, tenant, and bank functions unchanged.
