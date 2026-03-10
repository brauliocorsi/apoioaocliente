import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal IMAP client — full UID FETCH (no partial)
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

  async login(user: string, pass: string): Promise<boolean> {
    const r = await this.cmd(`LOGIN "${user}" "${pass}"`);
    return r.includes("OK");
  }

  async select(folder: string): Promise<void> {
    await this.cmd(`SELECT "${folder}"`);
  }

  // Fetch entire MIME part as raw bytes using UID FETCH
  async uidFetchFull(uid: number, partNum: string): Promise<Uint8Array> {
    const tag = this.nextTag();
    await this.write(`${tag} UID FETCH ${uid} BODY[${partNum}]\r\n`);

    // Read chunks until we find the literal size marker {N}\r\n
    // Keep accumulated data as raw bytes to avoid CPU-heavy string ops
    const rawChunks: Uint8Array[] = [];
    let totalLen = 0;
    const start = Date.now();

    while (Date.now() - start < 15000) {
      const chunk = await this.readChunk();
      if (!chunk) break;
      rawChunks.push(chunk);
      totalLen += chunk.length;

      // Only decode the first 512 bytes to find {SIZE}\r\n (it's always in the first line)
      const checkLen = Math.min(totalLen, 512);
      const checkBuf = new Uint8Array(checkLen);
      let off = 0;
      for (const c of rawChunks) {
        const take = Math.min(c.length, checkLen - off);
        if (take <= 0) break;
        checkBuf.set(c.subarray(0, take), off);
        off += take;
      }
      const headerStr = this.decoder.decode(checkBuf);
      const m = headerStr.match(/\{(\d+)\}\r?\n/);

      if (m) {
        const litSize = parseInt(m[1]);
        // Find byte offset where literal data starts
        const markerEnd = headerStr.indexOf(m[0]) + m[0].length;
        const markerEndBytes = new TextEncoder().encode(headerStr.substring(0, markerEnd)).length;

        // Merge all raw chunks into one buffer
        const allData = new Uint8Array(totalLen);
        let pos = 0;
        for (const c of rawChunks) { allData.set(c, pos); pos += c.length; }

        // Extract literal bytes already received
        const alreadyHave = totalLen - markerEndBytes;
        const remaining = litSize - alreadyHave;

        let literalBytes: Uint8Array;
        if (remaining <= 0) {
          literalBytes = allData.slice(markerEndBytes, markerEndBytes + litSize);
          if (alreadyHave > litSize) {
            this.buf = allData.slice(markerEndBytes + litSize);
          }
        } else {
          const rest = await this.readBytes(remaining);
          literalBytes = new Uint8Array(litSize);
          literalBytes.set(allData.subarray(markerEndBytes), 0);
          literalBytes.set(rest, alreadyHave);
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

      // Check for error/OK without literal
      if (checkLen >= 20) {
        const s = this.decoder.decode(checkBuf);
        if (s.includes(`${tag} NO`) || s.includes(`${tag} BAD`)) return new Uint8Array(0);
        if (s.includes(`${tag} OK`) && !s.includes("{")) return new Uint8Array(0);
      }
    }
    return new Uint8Array(0);
  }

  async logout() {
    try { await this.cmd("LOGOUT"); } catch { /* */ }
    try { this.conn.close(); } catch { /* */ }
  }
}

// Native base64 decode — uses fetch+data URL for zero-JS-loop decoding
async function fastB64Decode(raw: Uint8Array): Promise<Uint8Array> {
  // Strip whitespace bytes in-place (single pass)
  let j = 0;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b > 32) raw[j++] = b; // skip control chars, spaces, newlines
  }
  const b64 = new TextDecoder('ascii').decode(raw.subarray(0, j));
  // Use native fetch with data URL — base64 decode happens in native C++ code
  const res = await fetch(`data:application/octet-stream;base64,${b64}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { uid, part_num, ticket_id, filename, content_type, encoding } = body;

    if (!uid || !part_num || !ticket_id || !filename) {
      return new Response(JSON.stringify({ success: false, message: "Missing params (uid, part_num, ticket_id, filename required)" }), {
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
      console.log(`Attachment ${filename} already exists for ticket ${ticket_id}, skipping`);
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

    console.log(`Fetching: uid=${uid} part=${part_num} file=${filename} encoding=${encoding}`);

    const ok = await imap.connect(cfg.imap_host, port);
    if (!ok) throw new Error("IMAP connect failed");
    const loggedIn = await imap.login(cfg.imap_user, cfg.imap_pass);
    if (!loggedIn) throw new Error("IMAP login failed");
    await imap.select(cfg.imap_folder || "INBOX");

    // Fetch entire MIME part at once
    const rawBytes = await imap.uidFetchFull(Number(uid), part_num);
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
      // 7bit, 8bit, quoted-printable — raw bytes are the file
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

    // Insert attachment record (use service role — bypasses RLS)
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
      // Try to clean up the uploaded file
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
