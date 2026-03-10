

## Diagnosis

The `download-attachment` edge function is still running an **old version** (logs show `Chunk: seq=55` instead of `UID chunk: uid=`). Even after fixing that, the UID partial fetch returns **0 bytes** — likely because IMAP `BODY[part]<offset.size>` partial fetching is unreliable across different mail servers, and each chunk requires a full TLS+IMAP session which is expensive.

## Root Cause

The chunked approach (300KB per call, each with a new IMAP TLS connection) is fundamentally flawed:
1. Each invocation pays ~500ms+ CPU for TLS handshake + LOGIN + SELECT before any fetch
2. IMAP partial fetch (`BODY[part]<offset.size>`) isn't universally supported and returns 0 bytes on this server
3. Multiple round-trips multiply the failure surface

## Plan: Single-Call Full Part Fetch

Replace the chunked partial-fetch approach with a **single call per attachment** that fetches the entire MIME part at once, using the most CPU-efficient binary processing possible.

### 1. Rewrite `download-attachment` Edge Function
- Use `UID FETCH <uid> BODY[<part>]` (no partial/offset — fetch entire part in one go)
- Read the IMAP literal directly as `Uint8Array` using the literal size hint `{N}`
- Decode base64 in-place using a lookup table (no `atob`, no string concatenation)
- Upload the decoded binary directly to Supabase Storage via service role
- Insert the `ticket_attachments` record server-side (no frontend round-trip)
- Return success/failure status only

This keeps all heavy work server-side and eliminates the browser-based assembly.

### 2. Simplify Frontend (`EmailTicketDetail.tsx`)
- `refetchEmails` fires one `download-attachment` call per attachment job
- Each call is fire-and-forget (the edge function does the full upload)
- Poll `ticket_attachments` table every 3s to update UI counter
- No chunked assembly, no base64 decoding in browser

### 3. CPU Budget Analysis
For a 5MB attachment:
- Base64-encoded IMAP data: ~6.7MB
- TLS connect + LOGIN + SELECT: ~300ms CPU
- Read 6.7MB literal: ~200ms CPU (binary read, no string ops)
- Base64 decode (lookup table): ~300ms CPU
- Upload to storage: ~100ms CPU
- **Total: ~900ms** — safely within 2s limit

### 4. Redeploy
Deploy the new `download-attachment` function.

### Technical Details

**Edge Function** will accept: `{ uid, part_num, ticket_id, filename, content_type, encoding }`  
It connects to IMAP, fetches the full part, decodes, uploads to storage, inserts DB record, returns `{ success: true }`.

**Frontend** simplifies to:
```typescript
for (const job of jobs) {
  await supabase.functions.invoke("download-attachment", { body: { ...job, ticket_id: id } });
  setBgAttachments(prev => prev - 1);
}
```

