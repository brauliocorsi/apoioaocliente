import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal IMAP client for fetching a single MIME part
class MiniImap {
  private conn!: Deno.TlsConn | Deno.Conn;
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder("latin1");
  private tagN = 0;
  private buf = new Uint8Array(0);

  async connect(host: string, port: number): Promise<boolean> {
    this.conn = port === 993
      ? await Deno.connectTls({ hostname: host, port })
      : await Deno.connect({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    const greeting = await this.readLine();
    return greeting.includes("OK");
  }

  private nextTag() { return `T${++this.tagN}`; }

  private async write(s: string) {
    const w = this.conn.writable.getWriter();
    await w.write(this.encoder.encode(s));
    w.releaseLock();
  }

  private async cmd(c: string): Promise<string> {
    const tag = this.nextTag();
    await this.write(`${tag} ${c}\r\n`);
    let result = "";
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const tail = result.length > 300 ? result.substring(result.length - 300) : result;
      if (tail.includes(`${tag} OK`) || tail.includes(`${tag} NO`) || tail.includes(`${tag} BAD`)) return result;
      const chunk = await this.readChunk();
      if (!chunk) break;
      result += this.decoder.decode(chunk);
    }
    return result;
  }

  private async readLine(): Promise<string> {
    let s = "";
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const chunk = await this.readChunk();
      if (!chunk) break;
      s += this.decoder.decode(chunk);
      if (s.includes("\r\n")) return s;
    }
    return s;
  }

  private async readChunk(): Promise<Uint8Array | null> {
    if (this.buf.length > 0) {
      const b = this.buf;
      this.buf = new Uint8Array(0);
      return b;
    }
    try {
      const p = this.reader.read();
      const t = new Promise<{ value: undefined; done: true }>(r => setTimeout(() => r({ value: undefined, done: true }), 8000));
      const { value, done } = await Promise.race([p, t]);
      if (done || !value) return null;
      return value;
    } catch { return null; }
  }

  private async readBytes(n: number): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let got = 0;
    if (this.buf.length > 0) {
      if (this.buf.length >= n) {
        const r = this.buf.slice(0, n);
        this.buf = this.buf.slice(n);
        return r;
      }
      chunks.push(this.buf);
      got += this.buf.length;
      this.buf = new Uint8Array(0);
    }
    const start = Date.now();
    while (got < n && Date.now() - start < 30000) {
      const chunk = await this.readChunk();
      if (!chunk) break;
      const need = n - got;
      if (chunk.length > need) {
        chunks.push(chunk.slice(0, need));
        this.buf = chunk.slice(need);
        got += need;
      } else {
        chunks.push(chunk);
        got += chunk.length;
      }
    }
    const result = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { result.set(c, off); off += c.length; }
    return result;
  }

  async login(user: string, pass: string): Promise<boolean> {
    const r = await this.cmd(`LOGIN "${user}" "${pass}"`);
    return r.includes("OK");
  }

  async select(folder: string): Promise<void> {
    await this.cmd(`SELECT "${folder}"`);
  }

  async fetchPartBytes(seqNum: number, partNum: string): Promise<Uint8Array> {
    const tag = this.nextTag();
    await this.write(`${tag} FETCH ${seqNum} BODY[${partNum}]\r\n`);

    let header = "";
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const chunk = await this.readChunk();
      if (!chunk) break;
      header += this.decoder.decode(chunk);
      const m = header.match(/\{(\d+)\}\r?\n/);
      if (m) {
        const litSize = parseInt(m[1]);
        const afterPos = header.indexOf(m[0]) + m[0].length;
        const alreadyInHeader = this.encoder.encode(header.substring(afterPos));

        let literalBytes: Uint8Array;
        if (alreadyInHeader.length >= litSize) {
          literalBytes = alreadyInHeader.slice(0, litSize);
          if (alreadyInHeader.length > litSize) {
            this.buf = alreadyInHeader.slice(litSize);
          }
        } else {
          const remaining = litSize - alreadyInHeader.length;
          const rest = await this.readBytes(remaining);
          literalBytes = new Uint8Array(alreadyInHeader.length + rest.length);
          literalBytes.set(alreadyInHeader, 0);
          literalBytes.set(rest, alreadyInHeader.length);
        }

        // Drain trailing tag response
        let trail = "";
        const drainStart = Date.now();
        while (Date.now() - drainStart < 5000) {
          if (this.buf.length > 0) {
            trail += this.decoder.decode(this.buf);
            this.buf = new Uint8Array(0);
          }
          if (trail.includes(`${tag} `)) break;
          const c = await this.readChunk();
          if (!c) break;
          trail += this.decoder.decode(c);
        }

        return literalBytes;
      }
    }
    return new Uint8Array(0);
  }

  async logout() {
    try { await this.cmd("LOGOUT"); } catch { /* */ }
    try { this.conn.close(); } catch { /* */ }
  }
}

// Decode base64 from raw bytes
function b64decode(raw: Uint8Array, maxBytes: number): Uint8Array {
  const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const L = new Uint8Array(256).fill(255);
  for (let i = 0; i < T.length; i++) L[T.charCodeAt(i)] = i;

  let valid = 0;
  for (let i = 0; i < raw.length; i++) {
    if (L[raw[i]] < 255) valid++;
  }
  const outLen = Math.floor((valid * 3) / 4);
  if (outLen > maxBytes) return new Uint8Array(0);

  const out = new Uint8Array(outLen);
  let oi = 0, acc = 0, bits = 0;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b === 10 || b === 13 || b === 32 || b === 9) continue;
    if (b === 61) break; // '='
    const v = L[b];
    if (v === 255) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[oi++] = (acc >> bits) & 0xFF; }
  }
  return oi === out.length ? out : out.slice(0, oi);
}

// Background processor
async function processDownload(params: {
  ticket_id: string; seq_num: number; part_num: string;
  filename: string; content_type: string; encoding: string; agent_id: string;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // Check if already exists
    const { count } = await admin.from("ticket_attachments")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", params.ticket_id)
      .eq("file_name", params.filename);
    if (count && count > 0) {
      console.log(`Skipped ${params.filename} - already exists`);
      return;
    }

    // Get IMAP config
    const { data: settings } = await admin.from("system_settings")
      .select("key, value")
      .in("key", ["imap_host", "imap_port", "imap_user", "imap_pass", "imap_folder"]);
    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => { cfg[s.key] = s.value; });
    if (!cfg.imap_host || !cfg.imap_user || !cfg.imap_pass) {
      console.error("IMAP not configured");
      return;
    }

    const port = Number(cfg.imap_port) || 993;
    const imap = new MiniImap();

    const ok = await imap.connect(cfg.imap_host, port);
    if (!ok) throw new Error("IMAP connect failed");
    const loggedIn = await imap.login(cfg.imap_user, cfg.imap_pass);
    if (!loggedIn) throw new Error("IMAP login failed");
    await imap.select(cfg.imap_folder || "INBOX");

    console.log(`BG: Fetching part ${params.part_num} of seq ${params.seq_num} for ${params.filename}`);
    const rawBytes = await imap.fetchPartBytes(params.seq_num, params.part_num);
    console.log(`BG: Got ${rawBytes.length} raw bytes for ${params.filename}`);

    await imap.logout();

    let data: Uint8Array;
    if (params.encoding === "base64") {
      data = b64decode(rawBytes, 10 * 1024 * 1024);
    } else {
      data = rawBytes;
    }

    console.log(`BG: Decoded ${params.filename} to ${data.length} bytes`);

    if (data.length === 0 || data.length > 10 * 1024 * 1024) {
      console.error(`BG: Size invalid for ${params.filename}: ${data.length}`);
      return;
    }

    const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${params.ticket_id}/${Date.now()}_${safeName}`;
    const { error: upErr } = await admin.storage
      .from("ticket-attachments")
      .upload(filePath, data, { contentType: params.content_type || "application/octet-stream", upsert: false });

    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    await admin.from("ticket_attachments").insert({
      ticket_id: params.ticket_id,
      file_name: params.filename,
      file_path: filePath,
      file_type: params.content_type || "application/octet-stream",
      file_size: data.length,
      uploaded_by: params.agent_id,
    });

    console.log(`BG: Uploaded ${params.filename} (${data.length} bytes)`);
  } catch (err) {
    console.error(`BG error for ${params.filename}: ${(err as Error).message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id, seq_num, part_num, filename, content_type, encoding, agent_id } = await req.json();

    if (!ticket_id || !seq_num || !part_num || !filename || !agent_id) {
      return new Response(JSON.stringify({ success: false, message: "Missing params" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already exists (fast path)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { count } = await admin.from("ticket_attachments")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticket_id)
      .eq("file_name", filename);
    if (count && count > 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, message: "Already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Offload heavy IMAP work to background via waitUntil
    const promise = processDownload({
      ticket_id, seq_num: Number(seq_num), part_num, filename,
      content_type: content_type || "application/octet-stream",
      encoding: encoding || "base64", agent_id,
    });

    // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(promise);

    // Return immediately
    return new Response(JSON.stringify({ success: true, background: true, message: `${filename} processing in background` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`download-attachment error: ${(err as Error).message}`);
    return new Response(JSON.stringify({ success: false, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
