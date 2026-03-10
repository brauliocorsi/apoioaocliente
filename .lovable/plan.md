

## Problem Analysis

From the edge function logs and analytics:
- Every call shows `offset=0, checking 1 of 37 total emails` -- this means each call processes the oldest email first
- The oldest emails are always duplicates (already imported), so the system spends all its time re-checking old emails before reaching the new ones
- Each call takes ~7 seconds (IMAP TLS + login + search + header fetch + DB check), so checking all 37 emails would take ~4.5 minutes
- If any call hits WORKER_LIMIT, the frontend loop breaks and stops importing

## Root Cause

The emails are processed oldest-first. Since most old emails are already imported (duplicates), the system wastes time skipping them before ever reaching the new emails from today.

## Plan

### 1. Process newest emails first (Edge Function)
Reverse the `emailIds` array after the IMAP search so the most recent emails are at offset=0. This means new


<lov-tool-use id="thinking-4feefd1a-1a5f-4fca-87ec-0821b272be7d" name="lov-think" data="Let me continue with the plan from where it was cut off." duration="0.562881">
</lov-tool-use>
<lov-plan>

## Problem Analysis

From the edge function logs and analytics:
- Every call shows `offset=0, checking 1 of 37 total emails` -- the offset never advances
- Each call takes ~7 seconds (IMAP TLS + login + search + header fetch + DB checks)
- Emails are processed oldest-first, so all time is spent re-checking old duplicates before reaching today's new emails
- The frontend loop likely breaks on WORKER_LIMIT errors before ever reaching new emails

## Root Cause

Two issues:
1. **Oldest-first order**: New emails are at the end of the list (offset 36 of 37), so they're never reached
2. **Offset stuck at 0**: Looking at the frontend loop logic (lines 183-196), when a duplicate is skipped (no `new_email_processed` and `next_offset` is returned), the offset should advance. But from the logs, it's always 0. The issue is that the function returns `next_offset: 1` for a skipped duplicate, but the frontend logic at line 185 checks `data?.new_email_processed` first -- if the email was skipped (not a "new email processed"), it correctly goes to the else branch at line 188 and sets `currentOffset = data.next_offset`. This should work... unless the function is hitting WORKER_LIMIT (546 error) and the frontend treats that as an error and breaks the loop, restarting from offset 0 each time the user clicks.

Actually, re-reading the logs more carefully: we only see `offset=0` entries, meaning the function successfully returns at offset=0 (status 200, execution_time ~7s), the frontend gets the response with `next_offset: 1`, but then either the next call at offset=1 fails with WORKER_LIMIT (not logged because it crashes), or the frontend loop has a bug.

## Plan

### 1. Reverse email order -- newest first
In `processEmails()` (line 680), after `searchSince(1)`, reverse the array so newest emails come first. New emails will be at offset 0.

```typescript
emailIds = await imap.searchSince(1);
emailIds.reverse(); // Newest first
```

### 2. Skip dedup check for first email quickly -- pre-check via DB before IMAP
Add a "pre-scan" approach: before connecting to IMAP, query the DB for all known fingerprints/message_ids from the last 24h. Pass this set to the processing loop so dedup checks are instant (no DB round-trip per email).

In `processEmails()`:
- Before IMAP connect, fetch all `last_message_id` from `email_threads` and all `message_id` from `pending_emails` created in last 48h
- Store in a `Set<string>`
- During the loop, check fingerprint against this set instead of making 2 DB queries per email

This eliminates 2 DB round-trips per email, saving significant time per call.

### 3. Batch skip multiple duplicates per call
With the DB pre-loaded set, skipping duplicates is now just a Set lookup (microseconds). Increase effective throughput by allowing up to **10 header checks** per call when they're all duplicates, but still limit to 1 full body download per call.

```typescript
const MAX_HEADER_CHECKS = 10; // Can check up to 10 headers if all are dupes
let headersChecked = 0;

for (const seqNum of remainingIds) {
  if (headersChecked >= MAX_HEADER_CHECKS) break;
  headersChecked++;
  
  const headers = await imap.fetchHeaders(seqNum);
  const fingerprint = headers.messageId || await generateFingerprint(...);
  
  if (knownFingerprints.has(fingerprint)) {
    skipped++;
    continue; // No IMAP markAsSeen, no DB query -- instant
  }
  
  // New email found -- fetch full body (expensive)
  const msg = await imap.fetchMessage(seqNum);
  // ... process ...
  break; // Only 1 new email per call
}
```

### 4. Fix offset advancement
Update the return value to properly indicate how many were checked so the frontend advances correctly:
- Return `next_offset = offset + headersChecked` (not just +1)

### Technical Changes

**File: `supabase/functions/fetch-inbound-emails/index.ts`**
- Line 680: Add `.reverse()` after searchSince
- Lines 636-695: Pre-load known fingerprints from DB before IMAP connection
- Lines 697-926: Replace single-email loop with multi-header-check loop using in-memory dedup
- Adjust `next_offset` calculation

**File: `src/pages/EmailTickets.tsx`**
- No changes needed -- the frontend loop logic already handles `next_offset` correctly

