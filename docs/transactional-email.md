# Odyssey Transactional Email & Application URL Infrastructure

This document details the configuration, security architecture, environment variables, provider setup, and deployment workflow for Odyssey transactional emails and canonical application links.

---

## 1. Environment Variable Specifications

### Railway API Environment Variables (Production Backend)

To fix the production invitation link issue and configure transactional email, set the following environment variables in your **Railway API service dashboard**:

| Variable | Recommended Value | Description | Required? |
|---|---|---|---|
| `APP_URL` | `https://odyssey.investments` | Canonical application origin. HTTPS required in production. No localhost or trailing slash. | **Required** |
| `EMAIL_PROVIDER` | `noop` (or `resend` once ready) | Active provider implementation (`noop` or `resend`). | Optional (defaults to `noop`) |
| `EMAIL_ENABLED` | `false` (or `true` once ready) | Safety gate to enable external email delivery (`true` or `false`). | Optional (defaults to `false`) |
| `RESEND_API_KEY` | `re_123456789...` | Secret API key from Resend dashboard. | Required only when `EMAIL_ENABLED=true` |
| `EMAIL_FROM` | `Odyssey <invitations@odyssey.investments>` | Verified sender address matching verified domain. | Required only when `EMAIL_ENABLED=true` |
| `EMAIL_REPLY_TO` | `support@odyssey.investments` | Reply-to destination address. | Optional |

> [!IMPORTANT]
> **Production Safety Gate**: Setting `EMAIL_PROVIDER=resend` while keeping `EMAIL_ENABLED=false` will **NOT** trigger external HTTP calls to Resend, will **NOT** validate credentials at startup, and will return `{ deliveryStatus: "skipped" }`.

### Vercel Web Application Variables (Production Frontend)

No transactional email environment variables are required on Vercel. The Next.js frontend uses:
- `NEXT_PUBLIC_API_URL`: Points to the Railway backend API (e.g. `https://api.odyssey.investments`).

---

## 2. Resend Setup & Domain Verification Guide

Follow these steps when you are ready to activate real email delivery in production:

### Step 1: Create Resend Account & Domain
1. Log in to [Resend Console](https://resend.com).
2. Navigate to **Domains** -> **Add Domain**.
3. Enter your domain: `odyssey.investments` (or `mail.odyssey.investments`).

### Step 2: Configure DNS Verification Records
Add the following DNS records provided by Resend to your domain registrar (Cloudflare / Namecheap / Route53):

1. **DKIM Record (DomainKeys Identified Mail)**
   - Type: `TXT` / `CNAME`
   - Name: `resend._domainkey`
   - Value: Provided in Resend dashboard.
2. **SPF Record (Sender Policy Framework)**
   - Type: `TXT`
   - Name: `@` or `v=spf1`
   - Value: `v=spf1 include:amazonses.com ~all` (or Resend SPF record).
3. **DMARC Record (Domain-based Message Authentication)**
   - Type: `TXT`
   - Name: `_dmarc`
   - Value: `v=DMARC1; p=none; rua=mailto:dmarc@odyssey.investments`

### Step 3: Generate Resend API Key
1. In Resend Console, go to **API Keys** -> **Create API Key**.
2. Name: `Odyssey Production API Key`.
3. Permission: `Full Access` (or `Sending Access`).
4. Copy key (`re_...`).

---

## 3. Test Email & Verification Strategy

Before enabling email sending for all users:

1. **Local Test Mode**:
   Keep `EMAIL_PROVIDER=noop` and `EMAIL_ENABLED=false`. All invitations generate valid links without external requests.
2. **Staging / Test Email Verification**:
   Set `EMAIL_PROVIDER=resend`, `EMAIL_ENABLED=true`, `RESEND_API_KEY=re_...`, and send a test invitation to an internal address.
3. **Log & Database Audit**:
   Verify in PostgreSQL that:
   - `status = 'sent'`
   - `delivery_status = 'accepted'`
   - `provider_message_id` is populated
   - `token_hash` stores SHA-256 hash
   - `last_delivery_error` is `null`

---

## 4. Production Deployment & Migration Execution Sequence

When deploying this update to Railway, follow this exact sequence:

1. **Set Railway Variable**:
   In Railway API service settings, add variable:
   `APP_URL=https://odyssey.investments`
2. **Deploy Application Code**:
   Push updated code to your GitHub production deployment branch.
3. **Execute Migration `0005`**:
   Connect to Railway database via CLI or migration runner and execute SQL migration `0005_common_slayback.sql`:
   ```sql
   ALTER TABLE "organization_invitations" ADD COLUMN "delivery_status" varchar(50) DEFAULT 'not_sent' NOT NULL;
   ALTER TABLE "organization_invitations" ADD COLUMN "provider_message_id" varchar(255);
   ALTER TABLE "organization_invitations" ADD COLUMN "sent_at" timestamp;
   ALTER TABLE "organization_invitations" ADD COLUMN "last_delivery_error" text;
   ALTER TABLE "organization_invitations" ADD CONSTRAINT "check_organization_invitations_delivery_status" CHECK ("delivery_status" IN ('not_sent', 'skipped', 'accepted', 'delivered', 'bounced', 'complained', 'failed'));
   ```
4. **Verify Application Health**:
   Check `/health` and test creating a workspace invitation. The response message will state:
   `"Invitation link generated. Email delivery is disabled. Copy the one-time link to share it manually."` with URL `https://odyssey.investments/invite#token=...`.
