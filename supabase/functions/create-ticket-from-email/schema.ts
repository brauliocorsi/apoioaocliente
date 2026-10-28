import { z } from "npm:zod@3.25.76";

export const emailTicketSchema = z.object({
  idempotency_key: z.string().trim().min(1).max(160),
  schema_version: z.literal(1),
  client_name: z.string().trim().min(1).max(200),
  client_email: z.string().trim().email().max(254).optional(),
  client_phone: z.string().trim().min(1).max(40).optional(),
  order_number: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(300),
  description: z.string().min(1).max(60000),
  category_id: z.string().trim().min(1).max(100).optional(),
  priority: z.enum(["P1", "P2", "P3"]).default("P2"),
  source_message_id: z.string().trim().min(1).max(500).optional(),
}).strict();

export async function readBoundedBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("missing_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 100000) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}