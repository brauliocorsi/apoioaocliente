

## Problem Analysis

The edge function crashes with "CPU Time exceeded" at offset=25 (batch of 5 headers out of 36 total emails). Every single invocation must:
1. Establish TLS connection to IMAP server (~expensive)
2. Login + SELECT folder
3. Run SEARCH UNSEEN + SEARCH SINCE (~two IMAP commands)
4. Fetch 5 headers + do DB dedup checks for each
5. If a new email is found, fetch full body + process

The TLS handshake + authentication + dual search already consume significant CPU. Adding 5 header fetches + DB queries pushes it over the 2-second CPU limit.

## Plan

### 1. Reduce batch size from 5 to 2 headers per call
In `supabase/functions/fetch-inbound-emails/index.ts`, change `BATCH_SIZE` from 5 to 2. This keeps each invocation well within CPU limits while still making progress. The frontend loop handles iteration.

### 2. Cache the search results via a single search command
Replace the dual search (`searchUnseen` + `searchSince`) with a single `searchSince(1)` call. Since we already search the last 24 hours which includes unseen emails, the unseen search is redundant and wastes one IMAP round-trip per call.

### 3. Add a small delay between frontend rounds
Increase the inter-round delay from 300ms to 500ms to reduce server pressure and avoid concurrent function executions.

### Technical Details

**Edge function changes** (`supabase/functions/fetch-inbound-emails/index.ts`):
- Line ~693: `BATCH_SIZE = 5` → `BATCH_SIZE = 2`
- Lines ~679-686: Remove `searchUnseen()` call, use only `searchSince(1)` which already captures all emails (read or unread) from the last 24 hours
- This answers the user's question: **No, emails do NOT need to be unseen.** The `searchSince(1)` command fetches ALL emails from the last 24h regardless of read status. The unseen search is redundant.

**Frontend changes** (`src/pages/EmailTickets.tsx`):
- Line ~208: Delay from 300ms to 500ms

