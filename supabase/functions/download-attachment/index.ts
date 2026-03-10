import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal IMAP client with safe stream handling
class MiniImap {
  private conn!: Deno.TlsConn | Deno.Conn;
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder("latin1");
  private tagN = 0;
  private buf = new Uint8Array(0);
  // Track pending read to avoid data loss on timeout
  private pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  async connect(host: string, port: number): Promise<boolean> {
    this.conn = port === 993
      ? await Deno.connectTls({ hostname: host, port })
      : await Deno.connect({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    const greeting = await this.readLine();
    return greeting.includes("OK");
  }

  private nextTag() { return `T${++this.tagN}`; }
  getNextTag() { return this.nextTag(); }

  private async write(s: string) {
    const w = this.conn.writable.getWriter();
    await w.write(this.encoder.encode(s));
    w.releaseLock();
  }
  async writeCmd(s: string) { await this.write(s); }
  async readTagged(tag: string): Promise<string> { return await this.cmd2(tag); }

  private async readLine(): Promise<string> {
    let s = "";
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const chunk = await this.readChunk(15000);
      if (!chunk) break;
      s += this.decoder.decode(chunk);
      if (s.includes("\r\n")) return s;
    }
    return s;
  }

  // Safe readChunk: preserves pending read promise so no data is lost on timeout
  private async readChunk(timeoutMs = 15000): Promise<Uint8Array | null> {
    if (this.buf.length > 0) {
      const b = this.buf;
      this.buf = new Uint8Array(0);
      return b;
    }
    try {
      // Reuse pending read if one was abandoned by a previous timeout
      const readPromise = this.pendingRead || this.reader.read();
      this.pendingRead = null;

      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; }, timeoutMs);
      const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), timeoutMs));

      const result = await Promise.race([readPromise, timeoutPromise]);
      clearTimeout(timer);

      if (timedOut || result === null) {
        // Timeout won — save the read promise so data isn't lost
        this.pendingRead = readPromise as Promise<ReadableStreamReadResult<Uint8Array>>;
        return null;
      }

      const { value, done } = result as ReadableStreamReadResult<Uint8Array>;
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
    while (got < n && Date.now() - start < 60000) {
      const chunk = await this.readChunk(30000);
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

  private async cmd(c: string): Promise<string> {
    const tag = this.nextTag();
    await this.write(`${tag} ${c}\r\n`);
    let result = "";
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const tail = result.length > 300 ? result.substring(result.length - 300) : result;
      if (tail.includes(`${tag} OK`) || tail.includes(`${tag} NO`) || tail.includes(`${tag} BAD`)) return result;
      const chunk = await this.readChunk(15000);
      if (!chunk) break;
      result += this.decoder.decode(chunk);
    }
    return result;
  }

  async login(user: string, pass: string): Promise<boolean> {
    const r = await this.cmd(`LOGIN "${user}" "${pass}"`);
    return r.includes("OK");
  }

  async select(folder: string): Promise<void> {
    await this.cmd(`SELECT "${folder}"`);
  }

  // Fetch MIME part by sequence number
  async fetchPartBySeq(seqNum: number, partNum: string): Promise<Uint8Array> {
    const tag = this.nextTag();
    await this.write(`${tag} FETCH ${seqNum} BODY[${partNum}]\r\n`);

    // Accumulate chunks and look for the {N}\r\n literal marker
    // We work at the BYTE level to avoid latin1↔UTF-8 offset mismatches
    const headerChunks: Uint8Array[] = [];
    let headerTotalLen = 0;
    const start = Date.now();

    while (Date.now() - start < 30000) {
      const chunk = await this.readChunk(15000);
      if (!chunk) {
        console.error(`readChunk returned null after ${Date.now() - start}ms`);
        break;
      }
      headerChunks.push(chunk);
      headerTotalLen += chunk.length;

      // Decode only enough bytes to find the literal marker (latin1 = 1 byte per char)
      const checkLen = Math.min(headerTotalLen, 512);
      const allBytes = new Uint8Array(headerTotalLen);
      let off = 0;
      for (const c of headerChunks) { allBytes.set(c, off); off += c.length; }

      const headerStr = this.decoder.decode(allBytes.subarray(0, checkLen));

      const m = headerStr.match(/\{(\d+)\}\r?\n/);
      if (m) {
        const litSize = parseInt(m[1]);
        console.log(`Found literal: ${litSize} bytes for part ${partNum}`);

        // Find the byte offset where literal data starts
        // In latin1, char index === byte index, so we can use string indexOf directly
        const markerEnd = headerStr.indexOf(m[0]) + m[0].length;
        // markerEnd is both char offset and byte offset in latin1

        const alreadyHave = headerTotalLen - markerEnd;
        const remaining = litSize - alreadyHave;

        let literalBytes: Uint8Array;
        if (remaining <= 0) {
          literalBytes = allBytes.slice(markerEnd, markerEnd + litSize);
          if (alreadyHave > litSize) {
            this.buf = allBytes.slice(markerEnd + litSize);
          }
        } else {
          const rest = await this.readBytes(remaining);
          literalBytes = new Uint8Array(litSize);
          literalBytes.set(allBytes.subarray(markerEnd), 0);
          literalBytes.set(rest, alreadyHave);
        }

        // Drain trailing tag response
        let trail = "";
        const drainStart = Date.now();
        while (Date.now() - drainStart < 10000) {
          if (this.buf.length > 0) {
            trail += this.decoder.decode(this.buf);
            this.buf = new Uint8Array(0);
          }
          if (trail.includes(`${tag} `)) break;
          const c = await this.readChunk(5000);
          if (!c) break;
          trail += this.decoder.decode(c);
        }
        return literalBytes;
      }

      // Check for error/no-data responses
      if (headerStr.includes(`${tag} NO`) || headerStr.includes(`${tag} BAD`)) {
        console.error(`IMAP error: ${headerStr.substring(0, 200)}`);
        return new Uint8Array(0);
      }
      if (headerStr.includes(`${tag} OK`) && !headerStr.includes("{")) {
        console.error(`IMAP OK but no literal: ${headerStr.substring(0, 200)}`);
        return new Uint8Array(0);
      }
    }

    // Build header for error logging
    const allBytes = new Uint8Array(headerTotalLen);
    let off2 = 0;
    for (const c of headerChunks) { allBytes.set(c, off2); off2 += c.length; }
    const headerDbg = this.decoder.decode(allBytes.subarray(0, Math.min(headerTotalLen, 200)));
    console.error(`Timeout waiting for IMAP response (${headerTotalLen} bytes). Header: ${headerDbg}`);
    return new Uint8Array(0);
  }

  // Simple command that returns tagged response
  private async cmd2(tag: string): Promise<string> {
    let result = "";
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const tail = result.length > 300 ? result.substring(result.length - 300) : result;
      if (tail.includes(`${tag} OK`) || tail.includes(`${tag} NO`) || tail.includes(`${tag} BAD`)) return result;
      const chunk = await this.readChunk(10000);
      if (!chunk) break;
      result += this.decoder.decode(chunk);
    }
    return result;
  }

  async logout() {
    try { await this.cmd("LOGOUT"); } catch { /* */ }
    try { this.conn.close(); } catch { /* */ }
  }
}

// Native base64 decode — uses fetch+data URL for zero-JS-loop decoding
async function fastB64Decode(raw: Uint8Array): Promise<Uint8Array> {
  let j = 0;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b > 32) raw[j++] = b;
  }
  const b64 = new TextDecoder('ascii').decode(raw.subarray(0, j));
  const res = await fetch(`data:application/octet-stream;base64,${b64}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { part_num, ticket_id, filename, content_type, encoding, client_email, seq_num } = body;

    if (!part_num || !ticket_id || !filename) {
      return new Response(JSON.stringify({ success: false, message: "Missing params" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Check if attachment already exists
    const { count } = await admin.from("ticket_attachments")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticket_id)
      .eq("file_name", filename);
    if (count && count > 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, message: "Already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    console.log(`Fetching: seq_num=${seq_num || 'none'} email=${client_email || 'none'} part=${part_num} file=${filename}`);

    const ok = await imap.connect(cfg.imap_host, port);
    if (!ok) throw new Error("IMAP connect failed");
    const loggedIn = await imap.login(cfg.imap_user, cfg.imap_pass);
    if (!loggedIn) throw new Error("IMAP login failed");
    await imap.select(cfg.imap_folder || "INBOX");

    console.log(`IMAP connected, fetching part ${part_num}`);

    let rawBytes = new Uint8Array(0);

    if (seq_num) {
      console.log(`Direct fetch seq=${seq_num} part=${part_num}`);
      rawBytes = await imap.fetchPartBySeq(seq_num, part_num);
      console.log(`Direct fetch result: ${rawBytes.length} bytes`);
    }

    // Fallback: search by client email if direct fetch failed
    if (rawBytes.length === 0 && client_email) {
      const searchTag2 = imap.getNextTag();
      await imap.writeCmd(`${searchTag2} SEARCH FROM "${client_email}"\r\n`);
      const searchRes = await imap.readTagged(searchTag2);
      const searchMatch = searchRes.match(/\* SEARCH([\d\s]*)/);
      const seqNums = (searchMatch && searchMatch[1].trim())
        ? searchMatch[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
        : [];

      console.log(`Found ${seqNums.length} emails from ${client_email}`);

      for (const sn of seqNums) {
        try {
          rawBytes = await imap.fetchPartBySeq(sn, part_num);
          if (rawBytes.length > 0) {
            console.log(`Found attachment in seq ${sn}: ${rawBytes.length} bytes`);
            break;
          }
        } catch (_e) { /* try next */ }
      }
    }

    console.log(`Raw IMAP data: ${rawBytes.length} bytes`);

    await imap.logout();

    if (rawBytes.length === 0) {
      return new Response(JSON.stringify({ success: false, message: "IMAP returned 0 bytes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode based on encoding
    let fileBytes: Uint8Array;
    if (encoding === "base64") {
      fileBytes = await fastB64Decode(rawBytes);
    } else {
      fileBytes = rawBytes;
    }

    console.log(`Decoded file: ${fileBytes.length} bytes`);

    // Upload to Supabase Storage
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${ticket_id}/${Date.now()}_${safeName}`;
    const { error: upErr } = await admin.storage
      .from("ticket-attachments")
      .upload(filePath, fileBytes, {
        contentType: content_type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const { error: dbErr } = await admin.from("ticket_attachments").insert({
      ticket_id,
      file_name: filename,
      file_path: filePath,
      file_type: content_type || "application/octet-stream",
      file_size: fileBytes.length,
      uploaded_by: "00000000-0000-0000-0000-000000000000",
    });
    if (dbErr) {
      console.error(`DB insert error: ${dbErr.message}`);
      await admin.storage.from("ticket-attachments").remove([filePath]);
      throw new Error(`DB insert failed: ${dbErr.message}`);
    }

    console.log(`✓ Imported ${filename} (${fileBytes.length} bytes) → ${filePath}`);

    return new Response(JSON.stringify({
      success: true,
      file_name: filename,
      file_size: fileBytes.length,
      file_path: filePath,
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
