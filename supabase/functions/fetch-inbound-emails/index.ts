import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImapConfig {
  imap_host: string;
  imap_port: string;
  imap_user: string;
  imap_pass: string;
  imap_folder: string;
  imap_enabled: string;
}

async function getImapConfig(adminClient: ReturnType<typeof createClient>): Promise<ImapConfig | null> {
  const { data } = await adminClient
    .from("system_settings")
    .select("key, value")
    .in("key", ["imap_host", "imap_port", "imap_user", "imap_pass", "imap_folder", "imap_enabled"]);

  if (!data || data.length === 0) return null;

  const cfg: Record<string, string> = {};
  data.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });

  if (!cfg.imap_host || !cfg.imap_user || !cfg.imap_pass) return null;
  if (cfg.imap_enabled === "false") return null;

  return {
    imap_host: cfg.imap_host,
    imap_port: cfg.imap_port || "993",
    imap_user: cfg.imap_user,
    imap_pass: cfg.imap_pass,
    imap_folder: cfg.imap_folder || "INBOX",
    imap_enabled: cfg.imap_enabled || "true",
  };
}

class ImapClient {
  private conn!: Deno.TlsConn | Deno.Conn;
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private tagCounter = 0;

  async connect(host: string, port: number): Promise<string> {
    if (port === 993) {
      this.conn = await Deno.connectTls({ hostname: host, port });
    } else {
      this.conn = await Deno.connect({ hostname: host, port });
    }
    this.reader = this.conn.readable.getReader();
    return await this.readResponse("*");
  }

  async startTls(host: string): Promise<void> {
    const response = await this.command("STARTTLS");
    if (!response.includes("OK")) {
      throw new Error("STARTTLS failed");
    }
    this.reader.releaseLock();
    this.conn = await Deno.startTls(this.conn as Deno.Conn, { hostname: host });
    this.reader = this.conn.readable.getReader();
  }

  private nextTag(): string {
    this.tagCounter++;
    return `A${String(this.tagCounter).padStart(4, "0")}`;
  }

  private async write(data: string): Promise<void> {
    const writer = this.conn.writable.getWriter();
    await writer.write(this.encoder.encode(data));
    writer.releaseLock();
  }

  private async readResponse(tag: string): Promise<string> {
    let result = "";
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const lines = result.split("\r\n");
      for (const line of lines) {
        if (tag === "*" && line.startsWith("* OK")) return result;
        if (line.startsWith(`${tag} `)) return result;
      }
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 5000)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) break;
        result += this.decoder.decode(value);
      } catch { break; }
    }
    return result;
  }

  async command(cmd: string): Promise<string> {
    const tag = this.nextTag();
    await this.write(`${tag} ${cmd}\r\n`);
    return await this.readResponse(tag);
  }

  async login(user: string, pass: string): Promise<string> {
    return await this.command(`LOGIN "${user}" "${pass}"`);
  }

  async select(folder: string): Promise<string> {
    return await this.command(`SELECT "${folder}"`);
  }

  async searchUnseen(): Promise<number[]> {
    const response = await this.command("SEARCH UNSEEN");
    const match = response.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    return match[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  }

  async searchAll(): Promise<number[]> {
    const response = await this.command("SEARCH ALL");
    const match = response.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    return match[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  }

  async fetchMessage(seqNum: number): Promise<{
    from: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    messageId: string;
    attachments: { filename: string; contentType: string; data: Uint8Array }[];
  }> {
    const response = await this.command(`FETCH ${seqNum} BODY[]`);

    let from = "";
    let subject = "";
    let messageId = "";

    const fromMatch = response.match(/^From:\s*(.+?)$/im);
    if (fromMatch) from = fromMatch[1].trim();

    const subjectMatch = response.match(/^Subject:\s*(.+?)$/im);
    if (subjectMatch) subject = decodeHeaderValue(subjectMatch[1].trim());

    const msgIdMatch = response.match(/^Message-ID:\s*(.+?)$/im);
    if (msgIdMatch) messageId = msgIdMatch[1].trim();

    // Extract body parts and attachments from MIME
    const parsed = parseMimeMessage(response);

    return {
      from,
      subject: subject || "Sem assunto",
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      messageId,
      attachments: parsed.attachments,
    };
  }

  async markAsSeen(seqNum: number): Promise<void> {
    await this.command(`STORE ${seqNum} +FLAGS (\\Seen)`);
  }

  async logout(): Promise<void> {
    try { await this.command("LOGOUT"); } catch { /* ignore */ }
    try { this.conn.close(); } catch { /* ignore */ }
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from.replace(/[<>]/g, "").trim();
}

function decodeQuotedPrintable(str: string): string {
  let result = str.replace(/=\r?\n/g, "");
  result = result.replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  try {
    const bytes = new Uint8Array([...result].map(c => c.charCodeAt(0)));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return result;
  }
}

function decodeBase64(str: string): string {
  try {
    const cleaned = str.replace(/\r?\n/g, "").trim();
    const bytes = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return str;
  }
}

function decodeBase64ToBytes(str: string): Uint8Array {
  try {
    const cleaned = str.replace(/\r?\n/g, "").trim();
    return Uint8Array.from(atob(cleaned), c => c.charCodeAt(0));
  } catch {
    return new Uint8Array(0);
  }
}

function decodeHeaderValue(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, encoding, encoded) => {
    if (encoding.toUpperCase() === "B") {
      return decodeBase64(encoded);
    } else {
      return decodeQuotedPrintable(encoded.replace(/_/g, " "));
    }
  });
}

interface MimeParsed {
  bodyText: string;
  bodyHtml: string;
  attachments: { filename: string; contentType: string; data: Uint8Array }[];
}

function parseMimeMessage(raw: string): MimeParsed {
  const result: MimeParsed = { bodyText: "", bodyHtml: "", attachments: [] };

  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = raw.split(new RegExp(`--${escapedBoundary}`));

    for (const part of parts) {
      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
      if (!contentTypeMatch) continue;

      const contentType = contentTypeMatch[1].trim().toLowerCase();
      const transferEncodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
      const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : "";

      // Check for attachment disposition or non-text content types
      const dispositionMatch = part.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const disposition = dispositionMatch ? dispositionMatch[1].trim().toLowerCase() : "";
      const filenameMatch = part.match(/(?:file)?name="?([^"\r\n;]+)"?/i);
      const filename = filenameMatch ? decodeHeaderValue(filenameMatch[1].trim()) : "";

      // Check for nested multipart
      const nestedBoundaryMatch = part.match(/boundary="?([^"\r\n;]+)"?/i);
      if (contentType.includes("multipart/") && nestedBoundaryMatch) {
        const nested = parseMimeMessage(part);
        if (!result.bodyText && nested.bodyText) result.bodyText = nested.bodyText;
        if (!result.bodyHtml && nested.bodyHtml) result.bodyHtml = nested.bodyHtml;
        result.attachments.push(...nested.attachments);
        continue;
      }

      // Get body after headers (double newline)
      const bodyStart = part.search(/\r?\n\r?\n/);
      if (bodyStart === -1) continue;
      let partBody = part.substring(bodyStart).trim();
      partBody = partBody.replace(/--\s*$/, "").trim();

      const isAttachment = disposition === "attachment" ||
        (filename && !contentType.includes("text/")) ||
        contentType.includes("application/") ||
        contentType.includes("image/") ||
        contentType.includes("audio/") ||
        contentType.includes("video/");

      if (isAttachment && filename) {
        // Decode attachment data
        let attachData: Uint8Array;
        if (transferEncoding === "base64") {
          attachData = decodeBase64ToBytes(partBody);
        } else {
          attachData = new TextEncoder().encode(partBody);
        }
        // Limit attachment size to 5MB
        if (attachData.length <= 5 * 1024 * 1024) {
          result.attachments.push({
            filename,
            contentType: contentTypeMatch[1].trim(),
            data: attachData,
          });
        }
        continue;
      }

      // Decode text body
      if (transferEncoding === "quoted-printable") {
        partBody = decodeQuotedPrintable(partBody);
      } else if (transferEncoding === "base64") {
        partBody = decodeBase64(partBody);
      }

      if (contentType.includes("text/plain") && !result.bodyText) {
        result.bodyText = partBody.trim();
      } else if (contentType.includes("text/html") && !result.bodyHtml) {
        result.bodyHtml = partBody.trim();
      }
    }
  } else {
    // Not multipart
    const headerEnd = raw.search(/\r?\n\r?\n/);
    if (headerEnd === -1) return result;

    let body = raw.substring(headerEnd + 2).trim();
    const headerSection = raw.substring(0, headerEnd);
    const transferEncodingMatch = headerSection.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : "";

    body = body.replace(/\)\r?\n\s*A\d{4}\s+OK.*$/s, "").trim();
    body = body.replace(/\)\s*$/s, "").trim();

    if (transferEncoding === "quoted-printable") {
      body = decodeQuotedPrintable(body);
    } else if (transferEncoding === "base64") {
      body = decodeBase64(body);
    }

    const contentTypeMatch = headerSection.match(/Content-Type:\s*([^;\r\n]+)/i);
    if (contentTypeMatch && contentTypeMatch[1].toLowerCase().includes("text/html")) {
      result.bodyHtml = body;
    } else {
      result.bodyText = body;
    }
  }

  return result;
}

function extractName(from: string): string {
  const name = from.replace(/<.+?>/, "").replace(/"/g, "").trim();
  return name || extractEmail(from);
}

// Sanitize HTML: remove script/style tags, on* attributes
function sanitizeHtml(html: string): string {
  let safe = html;
  // Remove script and style blocks
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Remove on* event attributes
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  // Remove javascript: hrefs
  safe = safe.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  safe = safe.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
  return safe;
}

async function uploadAttachment(
  adminClient: ReturnType<typeof createClient>,
  ticketId: string,
  attachment: { filename: string; contentType: string; data: Uint8Array },
  agentId: string,
): Promise<void> {
  const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${ticketId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await adminClient.storage
    .from("ticket-attachments")
    .upload(filePath, attachment.data, {
      contentType: attachment.contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error(`Attachment upload failed: ${uploadError.message}`);
    return;
  }

  await adminClient.from("ticket_attachments").insert({
    ticket_id: ticketId,
    file_name: attachment.filename,
    file_path: filePath,
    file_type: attachment.contentType,
    file_size: attachment.data.length,
    uploaded_by: agentId,
  });
}

async function processEmails(params: { fetchRecent: boolean; maxEmails: number; agentId?: string }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let createdBy = params.agentId;
  if (!createdBy) {
    const { data: agents } = await adminClient.rpc("get_agent_profiles");
    if (agents && agents.length > 0) createdBy = agents[0].id;
  }
  if (!createdBy) {
    return { success: false, message: "Nenhum agente encontrado para criar tickets" };
  }

  const imapCfg = await getImapConfig(adminClient);
  if (!imapCfg) {
    return { success: false, message: "IMAP não configurado" };
  }

  const imap = new ImapClient();
  const port = Number(imapCfg.imap_port) || 993;

  try {
    const greeting = await imap.connect(imapCfg.imap_host, port);
    if (!greeting.includes("OK")) {
      return { success: false, message: "Servidor IMAP não respondeu" };
    }

    if (port === 143) {
      try { await imap.startTls(imapCfg.imap_host); } catch (e) {
        console.log(`STARTTLS skipped: ${(e as Error).message}`);
      }
    }

    const loginRes = await imap.login(imapCfg.imap_user, imapCfg.imap_pass);
    if (!loginRes.includes("OK")) {
      await imap.logout();
      return { success: false, message: "Falha na autenticação IMAP" };
    }

    await imap.select(imapCfg.imap_folder);

    let emailIds: number[];
    if (params.fetchRecent) {
      const allIds = await imap.searchAll();
      emailIds = allIds.slice(-params.maxEmails);
    } else {
      emailIds = await imap.searchUnseen();
    }

    let created = 0, updated = 0, skipped = 0;
    const batch = emailIds.slice(0, Math.min(params.maxEmails, 5));

    for (const seqNum of batch) {
      try {
        const msg = await imap.fetchMessage(seqNum);
        const clientEmail = extractEmail(msg.from);
        const clientName = extractName(msg.from);

        if (!clientEmail) {
          await imap.markAsSeen(seqNum);
          continue;
        }

        // Duplicate check
        if (msg.messageId?.trim()) {
          const { data: dup } = await adminClient
            .from("email_threads")
            .select("id")
            .eq("last_message_id", msg.messageId.trim())
            .limit(1);
          if (dup && dup.length > 0) {
            skipped++;
            await imap.markAsSeen(seqNum);
            continue;
          }
        }

        // Build description: prefer HTML (sanitized), fall back to plain text
        const description = msg.bodyHtml
          ? sanitizeHtml(msg.bodyHtml).substring(0, 10000)
          : (msg.bodyText || "(email sem conteúdo)").substring(0, 5000);
        const isHtml = !!msg.bodyHtml;

        // Check existing thread
        const { data: existingThread } = await adminClient
          .from("email_threads")
          .select("ticket_id")
          .eq("email_address", clientEmail.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        let ticketId: string | null = null;

        if (existingThread) {
          const { data: ticket } = await adminClient
            .from("tickets")
            .select("id, status")
            .eq("id", existingThread.ticket_id)
            .single();

          const { data: statusData } = ticket ? await adminClient
            .from("ticket_statuses")
            .select("is_closed")
            .eq("id", ticket.status)
            .single() : { data: null };

          if (ticket && !statusData?.is_closed) {
            ticketId = ticket.id;
            await adminClient.from("ticket_messages").insert({
              ticket_id: ticketId,
              sender_id: "00000000-0000-0000-0000-000000000000",
              sender_type: "client",
              content: description,
            });
            await adminClient.from("email_threads")
              .update({ last_message_id: msg.messageId })
              .eq("ticket_id", existingThread.ticket_id);
            updated++;
          }
        }

        if (!ticketId) {
          const { data: newTicket, error } = await adminClient
            .from("tickets")
            .insert({
              client_name: clientName,
              client_email: clientEmail.toLowerCase(),
              subject: msg.subject.substring(0, 200),
              description: description,
              priority: "P2",
              status: "novo",
              created_by: createdBy,
            })
            .select("id")
            .single();

          if (error || !newTicket) {
            console.error(`Ticket create error: ${error?.message}`);
            await imap.markAsSeen(seqNum);
            continue;
          }

          ticketId = newTicket.id;
          await adminClient.from("email_threads").insert({
            ticket_id: ticketId,
            email_address: clientEmail.toLowerCase(),
            last_message_id: msg.messageId,
          });
          created++;
        }

        // Upload attachments
        if (msg.attachments.length > 0 && ticketId) {
          for (const att of msg.attachments) {
            try {
              await uploadAttachment(adminClient, ticketId, att, createdBy!);
              console.log(`Attachment uploaded: ${att.filename} (${att.data.length} bytes)`);
            } catch (err) {
              console.error(`Attachment error: ${(err as Error).message}`);
            }
          }
        }

        await adminClient.from("email_logs").insert({
          recipient: clientEmail,
          subject: msg.subject.substring(0, 200),
          status: "received",
          source: "inbound",
          ticket_id: ticketId,
        });

        await imap.markAsSeen(seqNum);
      } catch (err) {
        console.error(`Email ${seqNum} error: ${(err as Error).message}`);
      }
    }

    await imap.logout();

    const remaining = emailIds.length - batch.length;
    const message = `Processados: ${created} novos, ${updated} atualizados, ${skipped} duplicados${remaining > 0 ? `. Restam ${remaining} emails — clique novamente.` : ""}`;
    console.log(message);

    return { success: true, message, created, updated, skipped, total: batch.length, remaining };
  } catch (err) {
    try { await imap.logout(); } catch { /* */ }
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let testOnly = false;
    let fetchRecent = false;
    let maxEmails = 5;
    let agentId: string | undefined;
    try {
      const body = await req.json();
      testOnly = body?.test_only === true;
      fetchRecent = body?.fetch_recent === true;
      if (body?.max_emails) maxEmails = Math.min(Number(body.max_emails), 10);
      if (body?.agent_id) agentId = body.agent_id;
    } catch { /* no body */ }

    if (testOnly) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const imapCfg = await getImapConfig(adminClient);
      if (!imapCfg) {
        return new Response(JSON.stringify({ success: false, message: "IMAP não configurado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const imap = new ImapClient();
      const port = Number(imapCfg.imap_port) || 993;
      const greeting = await imap.connect(imapCfg.imap_host, port);
      if (port === 143) {
        try { await imap.startTls(imapCfg.imap_host); } catch { /* */ }
      }
      const loginRes = await imap.login(imapCfg.imap_user, imapCfg.imap_pass);
      await imap.logout();
      const ok = greeting.includes("OK") && loginRes.includes("OK");
      return new Response(JSON.stringify({ success: ok, message: ok ? "Conexão IMAP bem-sucedida" : "Falha na autenticação" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultPromise = processEmails({ fetchRecent, maxEmails, agentId });

    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      const sharedResult: { value?: any } = {};
      const promise = resultPromise.then(r => { sharedResult.value = r; }).catch(err => {
        sharedResult.value = { success: false, error: err.message };
      });
      (globalThis as any).EdgeRuntime.waitUntil(promise);

      const deadline = Date.now() + 8000;
      while (!sharedResult.value && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
      }

      const result = sharedResult.value || { success: true, message: "A processar em segundo plano..." };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await resultPromise;
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-inbound-emails error:", (err as Error).message);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
