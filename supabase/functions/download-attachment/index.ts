import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal IMAP client - partial fetch support
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
    while (Date.now() - start < 10000) {
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
      const t = new Promise<{ value: undefined; done: true }>(r => setTimeout(() => r({ value: undefined, done: true }), 5000));
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
    while (got < n && Date.now() - start < 15000) {
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

  // Partial fetch: BODY[part]<offset.size>
  // Returns the raw base64 bytes for that chunk
  async fetchPartial(seqNum: number, partNum: string, offset: number, size: number): Promise<Uint8Array> {
    const tag = this.nextTag();
    const cmd = `FETCH ${seqNum} BODY[${partNum}]<${offset}.${size}>`;
    await this.write(`${tag} ${cmd}\r\n`);

    let header = "";
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const chunk = await this.readChunk();
      if (!chunk) break;
      header += this.decoder.decode(chunk);
      const m = header.match(/\{(\d+)\}\r?\n/);
      if (m) {
        const litSize = parseInt(m[1]);
        const afterPos = header.indexOf(m[0]) + m[0].length;
        const already = this.encoder.encode(header.substring(afterPos));

        let literalBytes: Uint8Array;
        if (already.length >= litSize) {
          literalBytes = already.slice(0, litSize);
          if (already.length > litSize) this.buf = already.slice(litSize);
        } else {
          const rest = await this.readBytes(litSize - already.length);
          literalBytes = new Uint8Array(already.length + rest.length);
          literalBytes.set(already, 0);
          literalBytes.set(rest, already.length);
        }

        // Drain trailing response
        let trail = "";
        const drainStart = Date.now();
        while (Date.now() - drainStart < 3000) {
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

// Convert Uint8Array to base64 string (for JSON response) - works in small chunks
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Process in 8KB chunks to avoid stack overflow
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { seq_num, part_num, offset, chunk_size, total_size } = body;

    if (!seq_num || !part_num || offset === undefined || !chunk_size) {
      return new Response(JSON.stringify({ success: false, message: "Missing params" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Get IMAP config
    const { data: settings } = await admin.from("system_settings")
      .select("key, value")
      .in("key", ["imap_host", "imap_port", "imap_user", "imap_pass", "imap_folder"]);
    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => { cfg[s.key] = s.value; });
    if (!cfg.imap_host || !cfg.imap_user || !cfg.imap_pass) {
      return new Response(JSON.stringify({ success: false, message: "IMAP not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const port = Number(cfg.imap_port) || 993;
    const imap = new MiniImap();

    const ok = await imap.connect(cfg.imap_host, port);
    if (!ok) throw new Error("IMAP connect failed");
    const loggedIn = await imap.login(cfg.imap_user, cfg.imap_pass);
    if (!loggedIn) throw new Error("IMAP login failed");
    await imap.select(cfg.imap_folder || "INBOX");

    console.log(`Chunk: seq=${seq_num} part=${part_num} offset=${offset} size=${chunk_size}`);
    const rawBytes = await imap.fetchPartial(Number(seq_num), part_num, Number(offset), Number(chunk_size));
    console.log(`Got ${rawBytes.length} bytes`);

    await imap.logout();

    // Return chunk as base64 in JSON
    const b64 = uint8ToBase64(rawBytes);

    return new Response(JSON.stringify({
      success: true,
      data: b64,
      bytes_read: rawBytes.length,
      offset: Number(offset),
      done: rawBytes.length < Number(chunk_size) || (total_size && Number(offset) + rawBytes.length >= Number(total_size)),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`download-attachment error: ${(err as Error).message}`);
    return new Response(JSON.stringify({ success: false, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
