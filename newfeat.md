# Migration Guide: Brevo → Amazon SES + Zoho Mail

## Overview

This document outlines the migration from **Brevo** to **Amazon SES** for transactional email delivery while using **Zoho Mail** as the support mailbox.

### Current Architecture

```text
Backend Scraper
        │
        ▼
Database (ArtStation usernames)
        │
        ▼
Chrome Extension
        │
        ▼
Database (Email Addresses)
        │
        ▼
Backend Emailer
        │
        ▼
Brevo
        │
        ▼
Recipients
```

### Target Architecture

```text
Backend Scraper
        │
        ▼
Database (ArtStation usernames)
        │
        ▼
Chrome Extension
        │
        ▼
Database (Email Addresses)
        │
        ▼
Backend Emailer
        │
        ▼
Amazon SES
        │
        ▼
Recipients
              │
              ▼
support@artreserve.org
      (Zoho Mail)
```

---

# Phase 1: Infrastructure

## Step 1 — Purchase Domain

Purchase the production domain.

Example:

```
artreserve.org
```

Recommended registrars:

- Namecheap
- Porkbun
- Cloudflare Registrar

---

## Step 2 — Configure Zoho Mail

Create a Zoho Mail account.

Create the primary support mailbox:

```
support@artreserve.org
```

Optional aliases:

```
hello@artreserve.org
info@artreserve.org
team@artreserve.org
```

Verify ownership of the domain.

Configure the DNS records provided by Zoho.

Required records:

- MX
- SPF
- DKIM

At this point the mailbox should be capable of:

- Receiving emails
- Sending replies
- Acting as the Reply-To address

---

## Step 3 — Create AWS Account

Enable:

- Amazon Simple Email Service (SES)

Choose a single production region.

Example:

```
us-east-1
```

or

```
eu-west-1
```

Keep this region consistent across the project.

---

## Step 4 — Verify Domain in SES

Navigate to:

```
SES
→ Verified Identities
→ Create Identity
```

Verify:

```
artreserve.org
```

SES will provide:

- Verification TXT record
- DKIM CNAME records

Add all records to DNS.

---

## Step 5 — Request Production Access

New SES accounts start inside the Sandbox.

Request Production Access.

Include:

- Use case
- Expected volume (~3,000 emails/month)
- Transactional / outreach emails
- Legitimate recipients

Do not proceed until Production Access is approved.

---

# Phase 2: DNS Configuration

The final DNS zone should contain records for both Zoho and Amazon SES.

## Zoho

- MX
- SPF
- DKIM

## Amazon SES

- Verification TXT
- DKIM CNAMEs

## DMARC

Example:

```
Host:

_dmarc.artreserve.org

Value:

v=DMARC1;
p=quarantine;
rua=mailto:dmarc@artreserve.org
```

After the system has been stable for several weeks, consider changing:

```
p=quarantine
```

to

```
p=reject
```

---

# Phase 3: Backend Changes

## Step 6 — Install AWS SDK

```bash
npm install @aws-sdk/client-ses
```

---

## Step 7 — Abstract Email Provider

Replace provider-specific logic with an interface.

Example:

```ts
interface EmailProvider {
    send(payload: EmailPayload): Promise<void>;
}
```

Current implementation:

```
BrevoProvider
```

New implementation:

```
AmazonSESProvider
```

Business logic should depend only on the interface.

---

## Step 8 — Replace Brevo API

Current flow:

```
Backend Emailer
        │
        ▼
Brevo API
```

New flow:

```
Backend Emailer
        │
        ▼
Amazon SES API
```

No changes should be required in scraper or extension logic.

---

# Phase 4: Email Templates

Create a template directory.

```
templates/

welcome.html

outreach.html

followup.html
```

Render templates using the preferred engine.

Examples:

- Handlebars
- EJS
- Nunjucks

SES supports:

- HTML
- Plain text
- Multipart emails

---

# Phase 5: Sending Workflow

Current workflow:

```
Scraper

↓

Database

↓

Brevo
```

New workflow:

```
Scraper

↓

Database

↓

Backend Emailer

↓

Render Template

↓

Amazon SES

↓

Recipient

↓

Update Database
```

---

# Phase 6: Database Updates

Track email status.

Suggested fields:

```
status

pending

sent

failed

bounced

replied
```

Additional metadata:

```
message_id

sent_at

last_error
```

---

# Phase 7: Bounce Handling

Create Amazon SNS Topics.

Recommended topics:

- Bounce
- Complaint
- Delivery

Subscribe the backend webhook.

Example flow:

```
SES

↓

SNS

↓

Webhook

↓

Update Database

↓

status = bounced
```

Never attempt to resend to permanently bounced addresses.

---

# Phase 8: Reply Handling

Outgoing sender:

```
grace@artreserve.org
```

Reply-To:

```
grace@artreserve.org
```

Replies will automatically arrive inside Zoho Mail.

No backend changes required unless automated reply processing is added later.

---

# Phase 9: Rate Limiting

Do not send all emails simultaneously.

Use a queue.

Recommended:

- BullMQ
- RabbitMQ
- AWS SQS

Example:

```
10 emails

↓

wait

↓

10 emails

↓

wait
```

This helps maintain sender reputation.

---

# Phase 10: Logging

Store:

```
Recipient

Subject

SES Message ID

Status

Timestamp

Provider Response
```

Logs should support:

- Debugging
- Retry logic
- Auditing

---

# Phase 11: Monitoring

Monitor:

- Bounce rate
- Complaint rate
- Delivery failures
- SES sending quota
- SES reputation metrics

Alerts should be generated if:

- Bounce rate increases
- Complaint rate exceeds acceptable thresholds
- Sending fails repeatedly

---

# Final Production Architecture

```text
Backend Scraper
        │
        ▼
Database
        │
        ▼
Chrome Extension
        │
        ▼
Database
        │
        ▼
Backend Emailer
        │
        ├───────────────┐
        │               │
        ▼               ▼
 Render Template    Email Queue
        │               │
        └───────┬───────┘
                ▼
          Amazon SES
                │
      ┌─────────┴─────────┐
      ▼                   ▼
Recipients          Amazon SNS
      │                   │
      ▼                   ▼
 Reply          Backend Webhook
      │                   │
      ▼                   ▼
Zoho Mail          Update Database
```

---

# Suggested Project Structure

```
src/

    email/

        providers/

            EmailProvider.ts

            AmazonSESProvider.ts

        templates/

            welcome.html

            outreach.html

            followup.html

        services/

            EmailService.ts

        webhooks/

            snsWebhook.ts

        queue/

            emailQueue.ts

        types/

            EmailPayload.ts

        utils/

            templateRenderer.ts
```

---

# Recommended Stack

| Component | Technology |
|-----------|------------|
| Mailbox | Zoho Mail |
| Outgoing Email | Amazon SES |
| Queue | BullMQ |
| Database | Existing Database |
| Backend | Node.js |
| Templates | Handlebars / EJS |
| Notifications | Amazon SNS |
| Authentication | SPF + DKIM + DMARC |

---
# Future Improvements

- Email open tracking
- Click tracking
- Retry queue with exponential backoff
- Suppression list management
- Unsubscribe endpoint
- Email analytics dashboard
- Bounce analytics
- Complaint analytics
- Template versioning
- Multi-provider failover (SES → Resend → Mailgun)