# 🐛 Duplicate Emails — Root Cause Analysis

## The Problem
Some email addresses are receiving the same email **multiple times**.

## Root Cause: Race Condition Between Overlapping Schedules

The core issue is that **three separate schedules all trigger `sendBulkEmails()`**, and they can overlap:

### The Overlapping Triggers

| Schedule | Cron | Calls `sendBulkEmails()`? | `runOnInit`? |
|---|---|---|---|
| **Latest scrape** | Every 2 hours (`0 */2 * * *`) | ✅ Yes — via `runCleanup(true)` | ✅ **Yes** |
| **Daily cleanup** | 7:00 AM (`0 7 * * *`) | ✅ Yes — via `runCleanup(false)` | ✅ **Yes** |
| **Fallback email** | Every 3 hours (`0 */3 * * *`) | ✅ Yes — directly | ✅ **Yes** |

### How Duplicates Happen

1. **On startup**: All three schedules have `runOnInit: true`, meaning all three fire **simultaneously** at app start. Each one independently queries `WHERE is_sent = 0`, gets the **same** list of users, and sends emails to them. The `markAsSent()` call happens **after** the entire batch is processed (not per-email), so concurrent runs all see the same unsent users.

2. **At overlapping cron times**: At hours like **0:00, 6:00, 12:00, 18:00**, both the 2-hour and 3-hour schedules fire at the same time. At **7:00 AM**, the cleanup schedule also overlaps with the 2-hour schedule. Again, both read `is_sent = 0` concurrently → both send to the same users.

### The Critical Code Flow

```
scheduleManager.ts (line 21):  runOnInit: true  →  runCleanup(true)  →  sendBulkEmails()
scheduleManager.ts (line 35):  runOnInit: true  →  runCleanup(false) →  sendBulkEmails()
scheduleManager.ts (line 55):  runOnInit: true  →  sendBulkEmails()   (direct)
```

All three query users with `is_sent = 0` at the **same time**:

```typescript
// emailSender.ts line 62-65
const users = await db.all<User[]>(
  `SELECT * FROM users WHERE is_sent = 0 AND email IS NOT NULL LIMIT ?`,
  [limit]
);
```

But `markAsSent()` is only called **after** the entire batch loop finishes:

```typescript
// emailSender.ts line 130-132
if (sentUserIds.length > 0) {
  await markAsSent(sentUserIds);  // ← Too late! Other runs already picked up the same users.
}
```

## Secondary Issue: No Deduplication by Email Address

The `users` table uses `id` as the primary key and `username` as UNIQUE, but **`email` has no UNIQUE constraint**:

```sql
-- db.ts
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  ...
  email TEXT,        -- ← NOT UNIQUE!
  ...
)
```

If the same person appears in multiple scrapes (different project IDs but same email), they could have duplicate rows with the same email, each with `is_sent = 0`. Each row gets emailed separately.

---

## Recommended Fixes

### Fix 1: Mark users as sent **immediately** (per-email, not per-batch)

```diff
 // emailSender.ts — inside the user loop, after successful send
 if (success) {
-  sentUserIds.push(user.id);
+  await markAsSent([user.id]);  // Mark immediately
   emailStats.success++;
 }
```

### Fix 2: Add a sending lock to prevent concurrent runs

```typescript
let isSending = false;

export async function sendBulkEmails(...) {
  if (isSending) {
    console.log("Email sending already in progress, skipping...");
    return { total: 0, success: 0, failures: 0 };
  }
  isSending = true;
  try {
    // ... existing logic ...
  } finally {
    isSending = false;
  }
}
```

### Fix 3: Remove `runOnInit: true` from at least 2 of the 3 schedules

Only the fallback email schedule needs `runOnInit`. The others should wait for their cron time:

```diff
 // scheduleManager.ts
 // Latest scrape
-  { timezone: "Africa/Lagos", scheduled: true, runOnInit: true }
+  { timezone: "Africa/Lagos", scheduled: true, runOnInit: false }

 // Daily cleanup
-  { timezone: "Africa/Lagos", scheduled: true, runOnInit: true }
+  { timezone: "Africa/Lagos", scheduled: true, runOnInit: false }

 // Fallback email — keep this one
   { timezone: "Africa/Lagos", scheduled: true, runOnInit: true }
```

### Fix 4: Add a UNIQUE constraint on email (optional but recommended)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email 
ON users(email) WHERE email IS NOT NULL;
```
