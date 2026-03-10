

## Plan: Visual Attachment Indicators + Robust Email Import with Attachments

### Problem Summary

1. **No visual indicator** on ticket lists/Kanban showing which tickets have attachments (photos, videos, files)
2. **Email imports sometimes miss content and attachments** — partial fetches, BODYSTRUCTURE parsing failures, and large email handling leave some tickets without their full data

### Part 1: Visual Attachment Indicators

**Approach**: Fetch attachment counts per ticket and display icons on Kanban cards and list views.

**Files to modify:**

1. **`src/pages/Tickets.tsx`**
   - Query `ticket_attachments` table to get per-ticket attachment counts and types
   - Pass `attachmentInfo` map to KanbanBoard and list view
   - Show 📎 icon with count, differentiate image/video with 🖼️/🎬 icons

2. **`src/components/KanbanBoard.tsx`**
   - Add `attachmentInfo` prop to `KanbanBoardProps`
   - In `TicketCard`, render attachment badges: paperclip icon + count, image icon for photos, video icon for videos
   - Color-coded: images in blue, videos in purple, documents in gray

3. **`src/pages/EmailTickets.tsx`**
   - Add attachment count query for email tickets list
   - Show 📎 indicator on each ticket row

4. **`src/pages/EmailTicketDetail.tsx`**
   - Already shows attachments — no changes needed

### Part 2: Robust Email Import

The core issues:
- `BODYSTRUCTURE` parsing misses some attachment parts (nested multipart structures)
- Partial fetches (`fetchMessagePartial`) skip attachments beyond the byte limit
- Backfill only processes 1 email per batch — too slow for catching up

**Files to modify:**

5. **`supabase/functions/fetch-inbound-emails/index.ts`**
   - **Always attempt BODYSTRUCTURE attachment fetch** after inserting a new email (even when body was parsed from full fetch), not just as a fallback
   - **Fix BODYSTRUCTURE parser**: Handle nested multipart structures recursively (e.g., `multipart/mixed` containing `multipart/alternative` + attachment). Current parser only looks at top-level parts
   - **Increase backfill per batch** from 1 to 3 — allows faster catch-up
   - **For pending emails**: When body parsing fails to extract attachments, also try BODYSTRUCTURE before giving up
   - **Chunked base64 conversion**: Replace `atob` + spread operator with chunked approach to handle large attachments without stack overflow

### Technical Details

**Attachment info structure** passed to components:
```typescript
type AttachmentInfo = {
  count: number;
  hasImages: boolean;
  hasVideos: boolean;
};
// Map: Record<string, AttachmentInfo>
```

**Query** (single batch query for all visible tickets):
```typescript
const { data: attData } = await supabase
  .from("ticket_attachments")
  .select("ticket_id, file_type")
  .in("ticket_id", ticketIds);
// Group by ticket_id, check file_type prefixes
```

**BODYSTRUCTURE recursive parser fix**:
Currently `parseBodyStructureAttachments` only scans top-level `()` groups. For nested multipart emails (very common), attachments inside inner multipart parts are missed. The fix adds recursive descent into sub-parts that themselves contain `(` groups.

**Chunked base64** for `decodeBase64ToBytes`:
Replace `Uint8Array.from(atob(cleaned), c => c.charCodeAt(0))` with a chunked version that processes 8KB at a time, preventing call stack overflow on large files.

