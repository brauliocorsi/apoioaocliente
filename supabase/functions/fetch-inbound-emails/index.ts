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
  private buffer = "";

  async connect(host: string, port: number): Promise<string> {
    if (port === 993) {
      this.conn = await Deno.connectTls({ hostname: host, port });
    } else {
      this.conn = await Deno.connect({ hostname: host, port });
    }
    this.reader = this.conn.readable.getReader();
    // Read greeting
    return await this.readResponse("*");
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
    const timeout = 15000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      // Check buffer first
      if (this.buffer.length > 0) {
        result += this.buffer;
        this.buffer = "";
      }

      // Check if we have a complete tagged response
      const lines = result.split("\r\n");
      for (const line of lines) {
        if (tag === "*" && line.startsWith("* OK")) {
          return result;
        }
        if (line.startsWith(`${tag} `)) {
          return result;
        }
      }

      // Read more data
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 5000)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) break;
        result += this.decoder.decode(value);
      } catch {
        break;
      }
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
    const response = await this.command(`FETCH ${seqNum} (BODY[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)] BODY[TEXT])`);

    let from = "";
    let subject = "";
    let messageId = "";
    let body = "";

    // Parse From
    const fromMatch = response.match(/From:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/is);
    if (fromMatch) from = fromMatch[1].trim();

    // Parse Subject
    const subjectMatch = response.match(/Subject:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/is);
    if (subjectMatch) subject = subjectMatch[1].trim();

    // Parse Message-ID
    const msgIdMatch = response.match(/Message-ID:\s*(.+?)(?:\r\n(?!\s)|\r\n\))/is);
    if (msgIdMatch) messageId = msgIdMatch[1].trim();

    // Extract body text (everything after the header section)
    const bodyParts = response.split(/\r\n\r\n/);
    if (bodyParts.length > 1) {
      body = bodyParts.slice(1).join("\r\n\r\n");
      // Clean up IMAP artifacts
      body = body.replace(/\)\r\n.*$/s, "").trim();
      // Remove trailing FETCH response
      body = body.replace(/\s*\d+\s+FETCH\s+.*$/s, "").trim();
    }

    // Strip HTML tags for plain text
    body = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // Limit body length
    if (body.length > 5000) body = body.substring(0, 5000);

    return { from, subject: subject || "Sem assunto", body, messageId };
  }

  async markAsSeen(seqNum: number): Promise<void> {
    await this.command(`STORE ${seqNum} +FLAGS (\\Seen)`);
  }

  async logout(): Promise<void> {
    try {
      await this.command("LOGOUT");
    } catch { /* ignore */ }
    try {
      this.conn.close();
    } catch { /* ignore */ }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check request params
    let testOnly = false;
    let fetchRecent = false;
    let maxEmails = 20;
    try {
      const body = await req.json();
      testOnly = body?.test_only === true;
      fetchRecent = body?.fetch_recent === true;
      if (body?.max_emails) maxEmails = Math.min(Number(body.max_emails), 50);
    } catch { /* no body */ }

    const imapCfg = await getImapConfig(adminClient);
    if (!imapCfg) {
      return new Response(JSON.stringify({ success: false, message: "IMAP não configurado ou desativado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imap = new ImapClient();
    const port = Number(imapCfg.imap_port) || 993;

    // Connect
    const greeting = await imap.connect(imapCfg.imap_host, port);
    if (!greeting.includes("OK")) {
      return new Response(JSON.stringify({ success: false, message: "Servidor IMAP não respondeu" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Login
    const loginRes = await imap.login(imapCfg.imap_user, imapCfg.imap_pass);
    if (!loginRes.includes("OK")) {
      await imap.logout();
      return new Response(JSON.stringify({ success: false, message: "Falha na autenticação IMAP" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (testOnly) {
      await imap.logout();
      return new Response(JSON.stringify({ success: true, message: "Conexão IMAP bem-sucedida" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Select folder
    await imap.select(imapCfg.imap_folder);

    // Search emails - UNSEEN for cron, ALL for manual fetch_recent
    let emailIds: number[];
    if (fetchRecent) {
      const allIds = await imap.searchAll();
      // Take only the most recent N emails (highest sequence numbers)
      emailIds = allIds.slice(-maxEmails);
      console.log(`Fetch recent mode: found ${allIds.length} total emails, processing last ${emailIds.length}`);
    } else {
      emailIds = await imap.searchUnseen();
      console.log(`Found ${emailIds.length} unseen emails`);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Process
    const toProcess = emailIds.slice(0, maxEmails);

    for (const seqNum of toProcess) {
      try {
        const msg = await imap.fetchMessage(seqNum);
        const clientEmail = extractEmail(msg.from);
        const clientName = extractName(msg.from);

        if (!clientEmail) {
          await imap.markAsSeen(seqNum);
          continue;
        }

        // Duplicate detection: check if this message-id was already processed
        if (msg.messageId && msg.messageId.trim()) {
          const { data: existingLog } = await adminClient
            .from("email_logs")
            .select("id")
            .eq("source", "inbound")
            .eq("subject", msg.subject.substring(0, 200))
            .eq("recipient", clientEmail.toLowerCase())
            .limit(1);

          // Also check email_threads for this exact message-id
          const { data: existingThread2 } = await adminClient
            .from("email_threads")
            .select("id")
            .eq("last_message_id", msg.messageId.trim())
            .limit(1);

          if ((existingThread2 && existingThread2.length > 0)) {
            skipped++;
            await imap.markAsSeen(seqNum);
            continue;
          }
        }

        // Check for existing open thread with this email
        const { data: existingThread } = await adminClient
          .from("email_threads")
          .select("ticket_id")
          .eq("email_address", clientEmail.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        let ticketId: string;

        if (existingThread) {
          // Check if ticket is still open
          const { data: existingTicket } = await adminClient
            .from("tickets")
            .select("id, status, ticket_number")
            .eq("id", existingThread.ticket_id)
            .single();

          // Check if ticket status is closed
          const { data: statusData } = existingTicket ? await adminClient
            .from("ticket_statuses")
            .select("is_closed")
            .eq("id", existingTicket.status)
            .single() : { data: null };

          if (existingTicket && !statusData?.is_closed) {
            // Add message to existing ticket
            ticketId = existingTicket.id;
            await adminClient.from("ticket_messages").insert({
              ticket_id: ticketId,
              sender_id: "00000000-0000-0000-0000-000000000000",
              sender_type: "client",
              content: msg.body || "(email sem conteúdo)",
            });

            // Update thread
            await adminClient.from("email_threads")
              .update({ last_message_id: msg.messageId })
              .eq("id", existingThread.ticket_id);

            updated++;
          } else {
            // Ticket is closed, create new one
            const { data: newTicket } = await adminClient
              .from("tickets")
              .insert({
                client_name: clientName,
                client_email: clientEmail.toLowerCase(),
                subject: msg.subject.substring(0, 200),
                description: msg.body.substring(0, 5000),
                priority: "P2",
                status: "novo",
                created_by: "00000000-0000-0000-0000-000000000000",
              })
              .select("id, ticket_number")
              .single();

            if (!newTicket) {
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
        } else {
          // No existing thread - create new ticket
          const { data: newTicket } = await adminClient
            .from("tickets")
            .insert({
              client_name: clientName,
              client_email: clientEmail.toLowerCase(),
              subject: msg.subject.substring(0, 200),
              description: msg.body.substring(0, 5000),
              priority: "P2",
              status: "novo",
              created_by: "00000000-0000-0000-0000-000000000000",
            })
            .select("id, ticket_number")
            .single();

          if (!newTicket) {
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

        // Log in email_logs
        await adminClient.from("email_logs").insert({
          recipient: clientEmail,
          subject: msg.subject.substring(0, 200),
          status: "received",
          source: "inbound",
          ticket_id: ticketId,
        });

        // Mark as seen
        await imap.markAsSeen(seqNum);
      } catch (err) {
        console.error(`Error processing email ${seqNum}:`, (err as Error).message);
      }
    }

    await imap.logout();

    return new Response(JSON.stringify({
      success: true,
      message: `Processados: ${created} novos tickets, ${updated} atualizados, ${skipped} ignorados (duplicados)`,
      created,
      updated,
      skipped,
      total: toProcess.length,
    }), {
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
