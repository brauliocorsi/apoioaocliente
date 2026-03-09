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

  async fetchMessage(seqNum: number): Promise<{ from: string; subject: string; body: string; messageId: string }> {
    const response = await this.command(`FETCH ${seqNum} BODY[]`);

    let from = "";
    let subject = "";
    let messageId = "";
    let body = "";

    const fromMatch = response.match(/^From:\s*(.+?)$/im);
    if (fromMatch) from = fromMatch[1].trim();

    // Handle encoded subjects (=?UTF-8?Q?...?= or =?UTF-8?B?...?=)
    const subjectMatch = response.match(/^Subject:\s*(.+?)$/im);
    if (subjectMatch) subject = decodeHeaderValue(subjectMatch[1].trim());

    const msgIdMatch = response.match(/^Message-ID:\s*(.+?)$/im);
    if (msgIdMatch) messageId = msgIdMatch[1].trim();

    // Extract body from MIME message
    body = extractBodyFromMime(response);

    // Limit body length
    if (body.length > 3000) body = body.substring(0, 3000);

    return { from, subject: subject || "Sem assunto", body, messageId };
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

function extractName(from: string): string {
  const name = from.replace(/<.+?>/, "").replace(/"/g, "").trim();
  return name || extractEmail(from);
}

async function processEmails(params: { fetchRecent: boolean; maxEmails: number; agentId?: string }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Get a valid created_by: use provided agent_id or find first agent
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
    console.log("IMAP not configured");
    return { success: false, message: "IMAP não configurado" };
  }

  const imap = new ImapClient();
  const port = Number(imapCfg.imap_port) || 993;

  try {
    const greeting = await imap.connect(imapCfg.imap_host, port);
    if (!greeting.includes("OK")) {
      return { success: false, message: "Servidor IMAP não respondeu" };
    }

    // STARTTLS for port 143
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
      console.log(`Fetch recent: ${allIds.length} total, processing ${emailIds.length}`);
    } else {
      emailIds = await imap.searchUnseen();
      console.log(`Unseen: ${emailIds.length}`);
    }

    let created = 0, updated = 0, skipped = 0;

    // Process max 5 emails per invocation to stay within limits
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
              content: msg.body || "(email sem conteúdo)",
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
              description: msg.body.substring(0, 3000),
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

    // Test-only: quick connection check
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

    // Process emails in background using waitUntil
    const resultPromise = processEmails({ fetchRecent, maxEmails, agentId });

    // Use EdgeRuntime.waitUntil if available for background processing
    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      const sharedResult: { value?: any } = {};
      const promise = resultPromise.then(r => { sharedResult.value = r; }).catch(err => {
        sharedResult.value = { success: false, error: err.message };
      });
      (globalThis as any).EdgeRuntime.waitUntil(promise);

      // Wait briefly for result (up to 8s)
      const deadline = Date.now() + 8000;
      while (!sharedResult.value && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
      }

      const result = sharedResult.value || { success: true, message: "A processar em segundo plano..." };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: await directly
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
