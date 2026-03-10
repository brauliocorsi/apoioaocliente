

## Plan: Fix Email Encoding (? Characters) and Add Attachments to Email Replies

### Problem 1: Email text showing "?" instead of accented characters/punctuation

The MIME parser reads raw IMAP data using `latin1` decoder (line 46), which preserves raw bytes. However, when the email has charset like `windows-1252` or `iso-8859-1` and the body is not explicitly transfer-encoded (no `quoted-printable` or `base64`), the parser skips charset re-decoding for plain 7-bit content. Additionally, the `cleanEmailText` function on the frontend (lines 36-51) does a rough byte-to-UTF-8 conversion that can corrupt characters that were already correctly decoded.

**Fix in Edge Function (`fetch-inbound-emails/index.ts`):**
- In `parseMimeMessage`, after extracting the body of each MIME part, always apply charset-aware decoding when the charset is known (even for `7bit` or `8bit` transfer encoding), not just for `quoted-printable`/`base64`.
- The current code at line 484 already handles non-UTF-8 charsets for raw bodies, but the condition `charset.toLowerCase() !== "us-ascii"` may miss edge cases. Ensure all text parts get proper charset decoding.

**Fix in Frontend (`EmailTicketDetail.tsx`):**
- The `cleanEmailText` function (line 46) does a naive byte→UTF-8 re-decode that can corrupt already-correct text. Add a guard: only attempt re-decode if the text actually contains garbled characters (high bytes that aren't valid UTF-8 sequences).

### Problem 2: Send message + attachments together in one email

Currently the reply form only has a textarea and send button — no file upload. Attachments and messages are separate actions. The user wants to compose a reply with attached files and send everything as a single email.

**Frontend changes (`EmailTicketDetail.tsx`):**
- Add the `FileUpload` component (already exists) to the reply section, below the textarea
- Track reply attachments in local state (`replyAttachments`)
- Pass attachment file paths to the `reply-email-ticket` function call
- Clear attachments after successful send

**Edge Function changes (`reply-email-ticket/index.ts`):**
- Accept optional `attachment_paths` array in the request body
- For each path, download the file from `ticket-attachments` storage bucket
- For Resend: include attachments in the API payload (Resend supports `attachments` array with `filename`, `content` as base64)
- For SMTP: include attachments in the `denomailer` send call (supports `attachments` array)
- Also save attachment records in `ticket_attachments` table linked to the ticket

### Technical Changes

**Files to modify:**

1. **`supabase/functions/fetch-inbound-emails/index.ts`**
   - In `parseMimeMessage()`: ensure charset decoding applies to all text parts regardless of transfer encoding
   - Fix edge case where `8bit` encoded content with non-UTF-8 charset gets passed through without decoding

2. **`src/pages/EmailTicketDetail.tsx`**
   - Fix `cleanEmailText()`: guard the byte→UTF-8 re-decode to avoid corrupting already-valid text
   - Add `FileUpload` component to the reply section
   - Add `replyAttachments` state
   - Pass attachment paths to `sendEmailReply()`
   - Clear attachments on successful send

3. **`supabase/functions/reply-email-ticket/index.ts`**
   - Accept `attachment_paths?: string[]` in request body
   - Download files from storage, convert to base64
   - Include in Resend API call (`attachments` field) or SMTP send (`attachments` field)
   - Insert records into `ticket_attachments` table

