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
  // Use latin1 to preserve raw byte values — charset-aware decoding happens later in MIME parser
  private decoder = new TextDecoder("latin1");
  private tagCounter = 0;
  private buffer = new Uint8Array(0); // leftover bytes from previous reads

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
    if (!response.includes("OK")) throw new Error("STARTTLS failed");
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
      // Only check the last few lines for the tag (optimization for large responses)
      const lastChunk = result.length > 500 ? result.substring(result.length - 500) : result;
      const lines = lastChunk.split("\r\n");
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
      } catch (_e) { break; }
    }
    return result;
  }

  // Read exactly N raw bytes from the connection (for IMAP literals)
  private async readExactBytes(needed: number): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let collected = 0;

    // Use any leftover buffer first
    if (this.buffer.length > 0) {
      if (this.buffer.length >= needed) {
        const result = this.buffer.slice(0, needed);
        this.buffer = this.buffer.slice(needed);
        return result;
      }
      chunks.push(this.buffer);
      collected += this.buffer.length;
      this.buffer = new Uint8Array(0);
    }

    const start = Date.now();
    while (collected < needed && Date.now() - start < 30000) {
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 10000)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) break;
        
        const remaining = needed - collected;
        if (value.length > remaining) {
          chunks.push(value.slice(0, remaining));
          this.buffer = value.slice(remaining); // save leftovers
          collected += remaining;
        } else {
          chunks.push(value);
          collected += value.length;
        }
      } catch (_e) { break; }
    }

    // Merge chunks
    const result = new Uint8Array(collected);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // Read until we see the tag completion line (for post-literal trailing data)
  private async readUntilTag(tag: string): Promise<string> {
    let result = this.decoder.decode(this.buffer);
    this.buffer = new Uint8Array(0);
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (result.includes(`${tag} `)) return result;
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 3000)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) break;
        result += this.decoder.decode(value);
      } catch (_e) { break; }
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

  async searchSince(daysAgo: number): Promise<number[]> {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateStr = d.getDate() + "-" + monthNames[d.getMonth()] + "-" + d.getFullYear();
    const response = await this.command("SEARCH SINCE " + dateStr);
    const match = response.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    return match[1].trim().split(/\s+/).map(Number).filter(function(n) { return !isNaN(n); });
  }

  // Lightweight: fetch only headers + RFC822 size (no body)
  async fetchHeaders(seqNum: number): Promise<{
    from: string;
    subject: string;
    messageId: string;
    date: string | null;
    size: number | null;
  }> {
    const response = await this.command(`FETCH ${seqNum} (RFC822.SIZE BODY[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID DATE)])`);
    let from = "";
    let subject = "";
    let messageId = "";
    let date: string | null = null;
    let size: number | null = null;

    const fromMatch = response.match(/^From:\s*(.+?)$/im);
    if (fromMatch) from = fromMatch[1].trim();

    subject = extractHeader(response, "Subject");
    subject = decodeHeaderValue(subject);

    const msgIdMatch = response.match(/^Message-ID:\s*(.+?)$/im);
    if (msgIdMatch) messageId = msgIdMatch[1].trim();

    const dateMatch = response.match(/^Date:\s*(.+?)$/im);
    if (dateMatch) {
      try {
        const parsed = new Date(dateMatch[1].trim());
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString();
        }
      } catch (_e) { /* keep null */ }
    }

    const sizeMatch = response.match(/RFC822\.SIZE\s+(\d+)/i);
    if (sizeMatch) size = Number(sizeMatch[1]);

    return { from, subject: subject || "Sem assunto", messageId, date, size };
  }

  async fetchMessage(seqNum: number): Promise<{
    from: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    messageId: string;
    date: string | null;
    attachments: { filename: string; contentType: string; data: Uint8Array }[];
  }> {
    const response = await this.command(`FETCH ${seqNum} BODY[]`);
    return parseFetchedMessageResponse(response, false);
  }

  async fetchMessagePartial(seqNum: number, maxBytes = 900000): Promise<{
    from: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    messageId: string;
    date: string | null;
    attachments: { filename: string; contentType: string; data: Uint8Array }[];
  }> {
    const response = await this.command(`FETCH ${seqNum} BODY[]<0.${maxBytes}>`);
    return parseFetchedMessageResponse(response, true);
  }

  async markAsSeen(seqNum: number): Promise<void> {
    await this.command(`STORE ${seqNum} +FLAGS (\\Seen)`);
  }

  // Fetch individual MIME part by section number (e.g. "2", "1.2")
  // Returns raw string (for small parts or backward compat)
  async fetchMimePart(seqNum: number, partNum: string): Promise<string> {
    const response = await this.command(`FETCH ${seqNum} BODY[${partNum}]`);
    // Strip IMAP wrapper to get raw part content
    const match = response.match(/\{(\d+)\}\r?\n/);
    if (match) {
      const start = (match.index || 0) + match[0].length;
      const len = parseInt(match[1]);
      return response.substring(start, start + len);
    }
    return response;
  }

  // Binary-efficient: fetch MIME part as raw bytes without string conversion
  // Sends the FETCH command, reads the literal header to get size, then reads exact bytes
  async fetchMimePartBinary(seqNum: number, partNum: string): Promise<Uint8Array> {
    const tag = this.nextTag();
    await this.write(`${tag} FETCH ${seqNum} BODY[${partNum}]\r\n`);
    
    // Read the initial response line with the literal size: * N FETCH (BODY[X] {SIZE}\r\n
    let header = "";
    if (this.buffer.length > 0) {
      header = this.decoder.decode(this.buffer);
      this.buffer = new Uint8Array(0);
    }
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const literalMatch = header.match(/\{(\d+)\}\r?\n$/);
      if (literalMatch) {
        const literalSize = parseInt(literalMatch[1]);
        // Calculate how many bytes of the literal are already in our header string
        const afterLiteral = header.substring(header.indexOf(literalMatch[0]) + literalMatch[0].length);
        const alreadyRead = new TextEncoder().encode(afterLiteral);
        
        // Read remaining literal bytes
        const remaining = literalSize - alreadyRead.length;
        let literalBytes: Uint8Array;
        if (remaining <= 0) {
          literalBytes = alreadyRead.slice(0, literalSize);
          // Put excess back into buffer
          if (alreadyRead.length > literalSize) {
            this.buffer = alreadyRead.slice(literalSize);
          }
        } else {
          const restBytes = await this.readExactBytes(remaining);
          literalBytes = new Uint8Array(alreadyRead.length + restBytes.length);
          literalBytes.set(alreadyRead, 0);
          literalBytes.set(restBytes, alreadyRead.length);
        }
        
        // Read trailing tag response
        await this.readUntilTag(tag);
        
        return literalBytes;
      }
      
      try {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 5000)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) break;
        header += this.decoder.decode(value);
      } catch (_e) { break; }
    }
    
    // Fallback: return empty
    return new Uint8Array(0);
  }

  // Fetch BODYSTRUCTURE to identify attachments without downloading them
  async fetchBodyStructure(seqNum: number): Promise<string> {
    return await this.command(`FETCH ${seqNum} BODYSTRUCTURE`);
  }

  // Fetch the UID for a given sequence number
  async fetchUid(seqNum: number): Promise<number> {
    const response = await this.command(`FETCH ${seqNum} (UID)`);
    const match = response.match(/UID\s+(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async logout(): Promise<void> {
    try { await this.command("LOGOUT"); } catch (_e) { /* ignore */ }
    try { this.conn.close(); } catch (_e2) { /* ignore */ }
  }
}

function parseFetchedMessageResponse(response: string, forceFastParser = false): {
  from: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  messageId: string;
  date: string | null;
  attachments: { filename: string; contentType: string; data: Uint8Array }[];
} {
  // Strip IMAP FETCH wrapper for both full and partial fetches
  let rawMessage = response;
  const fetchStart = rawMessage.match(/\* \d+ FETCH \(BODY\[\](?:<\d+>)? \{\d+\}\r?\n/);
  if (fetchStart) {
    rawMessage = rawMessage.substring((fetchStart.index || 0) + fetchStart[0].length);
  }
  // Strip trailing IMAP tag response
  rawMessage = rawMessage.replace(/\)\r?\n\s*A\d{4}\s+OK.*$/s, "").trim();

  let from = "";
  let subject = "";
  let messageId = "";
  let date: string | null = null;

  const fromMatch = rawMessage.match(/^From:\s*(.+?)$/im);
  if (fromMatch) from = fromMatch[1].trim();

  subject = extractHeader(rawMessage, "Subject");
  subject = decodeHeaderValue(subject);

  const msgIdMatch = rawMessage.match(/^Message-ID:\s*(.+?)$/im);
  if (msgIdMatch) messageId = msgIdMatch[1].trim();

  const dateMatch = rawMessage.match(/^Date:\s*(.+?)$/im);
  if (dateMatch) {
    try {
      const parsedDate = new Date(dateMatch[1].trim());
      if (!isNaN(parsedDate.getTime())) {
        date = parsedDate.toISOString();
      }
    } catch (_e) { /* keep null */ }
  }

  const LARGE_RAW_PARSE_THRESHOLD = 5 * 1024 * 1024; // 5MB — only use fast parse for very large emails
  const FAST_PARSE_SCAN_LIMIT = 900 * 1024;
  const shouldFastParse = forceFastParser || rawMessage.length > LARGE_RAW_PARSE_THRESHOLD;

  let parsed = shouldFastParse
    ? parseMimeMessageFast(rawMessage)
    : parseMimeMessage(rawMessage);

  if (shouldFastParse && !hasReadableEmailContent(parsed) && rawMessage.length > FAST_PARSE_SCAN_LIMIT) {
    const tailStart = Math.max(0, rawMessage.length - FAST_PARSE_SCAN_LIMIT);
    const tailParsed = parseMimeMessageFast(rawMessage.substring(tailStart));
    if (hasReadableEmailContent(tailParsed)) {
      // Preserve attachments from first parse
      const prevAttachments = parsed.attachments;
      parsed = tailParsed;
      if (parsed.attachments.length === 0) parsed.attachments = prevAttachments;
    }
  }

  return {
    from,
    subject: subject || "Sem assunto",
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    messageId,
    date,
    attachments: parsed.attachments,
  };
}

// Extract a header value, handling multi-line folded headers
function extractHeader(raw: string, headerName: string): string {
  const regex = new RegExp(`^${headerName}:\\s*(.+)`, "im");
  const match = raw.match(regex);
  if (!match) return "";

  let value = match[1].trim();
  
  // Find position after the match to check for continuation lines
  const matchIndex = raw.indexOf(match[0]);
  const afterMatch = raw.substring(matchIndex + match[0].length);
  const lines = afterMatch.split(/\r?\n/);
  
  for (const line of lines) {
    // Continuation lines start with whitespace (folded header)
    if (/^\s+/.test(line) && !line.match(/^\s*$/)) {
      value += " " + line.trim();
    } else {
      break;
    }
  }
  
  return value;
}

// Decode base64 from raw bytes (Uint8Array) without converting to JS string first
// This is much more CPU-efficient than atob() for large payloads
function decodeBase64BytesDirect(raw: Uint8Array, maxBytes?: number): Uint8Array {
  // Build lookup table
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256).fill(255);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  lookup[61] = 0; // '='

  // Count valid base64 chars (skip whitespace/newlines)
  let validCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (lookup[b] < 255 || b === 61) validCount++;
  }

  const outputLen = Math.floor((validCount * 3) / 4);
  if (maxBytes !== undefined && outputLen > maxBytes) return new Uint8Array(0);

  const out = new Uint8Array(outputLen);
  let outIdx = 0;
  let acc = 0;
  let bits = 0;

  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (b === 10 || b === 13 || b === 32) continue; // skip \n \r space
    if (b === 61) break; // '=' padding
    const val = lookup[b];
    if (val === 255) continue;
    acc = (acc << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (acc >> bits) & 0xFF;
    }
  }

  return outIdx === out.length ? out : out.slice(0, outIdx);
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from.replace(/[<>]/g, "").trim();
}

function decodeQuotedPrintable(str: string, charset = "utf-8"): string {
  const input = str.replace(/=\r?\n/g, "");
  const byteChunks: number[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === "=" && i + 2 < input.length && /[0-9A-Fa-f]{2}/.test(input.substring(i + 1, i + 3))) {
      byteChunks.push(parseInt(input.substring(i + 1, i + 3), 16));
      i += 3;
    } else {
      byteChunks.push(input.charCodeAt(i));
      i++;
    }
  }
  try {
    // Map common charset names to TextDecoder labels
    const decoderCharset = normalizeCharset(charset);
    return new TextDecoder(decoderCharset, { fatal: false }).decode(new Uint8Array(byteChunks));
  } catch (_e) {
    // Fallback: try latin1 then raw
    try {
      return new TextDecoder("iso-8859-1", { fatal: false }).decode(new Uint8Array(byteChunks));
    } catch (_e2) {
      return input.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
  }
}

function normalizeCharset(charset: string): string {
  const c = charset.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const map: Record<string, string> = {
    "iso88591": "iso-8859-1",
    "iso885915": "iso-8859-15",
    "latin1": "iso-8859-1",
    "windows1252": "windows-1252",
    "cp1252": "windows-1252",
    "utf8": "utf-8",
    "usascii": "utf-8",
    "ascii": "utf-8",
  };
  return map[c] || charset;
}

function extractCharset(contentTypeHeader: string): string {
  const match = contentTypeHeader.match(/charset="?([^"\s;]+)"?/i);
  return match ? match[1].trim() : "utf-8";
}

function decodeBase64(str: string, charset = "utf-8"): string {
  try {
    const cleaned = str.replace(/\r?\n/g, "").trim();
    const bytes = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0));
    const decoderCharset = normalizeCharset(charset);
    return new TextDecoder(decoderCharset, { fatal: false }).decode(bytes);
  } catch (_e) {
    return str;
  }
}

function decodeBase64ToBytes(str: string, maxBytes?: number): Uint8Array {
  try {
    const cleaned = str.replace(/\r?\n/g, "").trim();
    if (maxBytes !== undefined) {
      const estimatedBytes = Math.floor((cleaned.length * 3) / 4);
      if (estimatedBytes > maxBytes) {
        return new Uint8Array(0);
      }
    }
    // Chunked decoding to avoid Maximum call stack size exceeded
    const binaryStr = atob(cleaned);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    const CHUNK = 8192;
    for (let offset = 0; offset < len; offset += CHUNK) {
      const end = Math.min(offset + CHUNK, len);
      for (let i = offset; i < end; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
    }
    return bytes;
  } catch (_e) {
    return new Uint8Array(0);
  }
}

function decodeHeaderValue(value: string): string {
  // Handle consecutive encoded words (join without space between same-charset parts)
  let decoded = value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s*=\?)/g, (match, charset, enc, encoded, next) => {
    const part = enc.toUpperCase() === "B"
      ? decodeBase64(encoded)
      : decodeQuotedPrintable(encoded.replace(/_/g, " "));
    return part + next;
  });
  decoded = decoded.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, encoding, encoded) => {
    if (encoding.toUpperCase() === "B") {
      return decodeBase64(encoded);
    } else {
      return decodeQuotedPrintable(encoded.replace(/_/g, " "));
    }
  });
  return decoded.trim();
}

interface MimeParsed {
  bodyText: string;
  bodyHtml: string;
  attachments: { filename: string; contentType: string; data: Uint8Array }[];
}

function parseMimeMessage(raw: string, depth = 0): MimeParsed {
  const result: MimeParsed = { bodyText: "", bodyHtml: "", attachments: [] };
  if (depth > 5) return result; // prevent stack overflow on deeply nested/malformed emails
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = raw.split(new RegExp(`--${escapedBoundary}`));

    for (const part of parts) {
      const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
      if (!contentTypeMatch) continue;

      const fullContentType = contentTypeMatch[1].trim();
      const contentType = fullContentType.split(";")[0].trim().toLowerCase();
      const charset = extractCharset(fullContentType);
      const transferEncodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
      const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : "";

      const dispositionMatch = part.match(/Content-Disposition:\s*([^;\r\n]+)/i);
      const disposition = dispositionMatch ? dispositionMatch[1].trim().toLowerCase() : "";
      const filenameMatch = part.match(/(?:file)?name="?([^"\r\n;]+)"?/i);
      const filename = filenameMatch ? decodeHeaderValue(filenameMatch[1].trim()) : "";

      const nestedBoundaryMatch = part.match(/boundary="?([^"\r\n;]+)"?/i);
      if (contentType.includes("multipart/") && nestedBoundaryMatch) {
        const nested = parseMimeMessage(part, depth + 1);
        if (!result.bodyText && nested.bodyText) result.bodyText = nested.bodyText;
        if (!result.bodyHtml && nested.bodyHtml) result.bodyHtml = nested.bodyHtml;
        result.attachments.push(...nested.attachments);
        continue;
      }

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
        // Quick size estimate BEFORE any decoding — saves CPU on large attachments
        const rawLen = partBody.length;
        const estimatedBytes = transferEncoding === "base64"
          ? Math.floor((rawLen * 3) / 4)
          : rawLen;
        if (estimatedBytes > 5 * 1024 * 1024) {
          // Still record attachment metadata but skip data
          result.attachments.push({ filename, contentType: fullContentType.split(";")[0].trim(), data: new Uint8Array(0) });
          continue;
        }
        let attachData: Uint8Array;
        if (transferEncoding === "base64") {
          attachData = decodeBase64ToBytes(partBody, 5 * 1024 * 1024);
        } else {
          attachData = new TextEncoder().encode(partBody);
        }
        if (attachData.length > 0 && attachData.length <= 5 * 1024 * 1024) {
          result.attachments.push({ filename, contentType: fullContentType.split(";")[0].trim(), data: attachData });
        }
        continue;
      }

      if (transferEncoding === "quoted-printable") {
        partBody = decodeQuotedPrintable(partBody, charset);
      } else if (transferEncoding === "base64") {
        partBody = decodeBase64(partBody, charset);
      } else {
        // For 7bit/8bit/unspecified transfer encoding, always re-decode through charset
        // The raw bytes come from latin1 decoder, so we must re-interpret them with the correct charset
        const hasHighBytes = /[\x80-\xff]/.test(partBody);
        const normalizedCharset = normalizeCharset(charset);
        if (hasHighBytes || (normalizedCharset !== "utf-8")) {
          try {
            const bytes = new Uint8Array([...partBody].map(c => c.charCodeAt(0)));
            const targetCharset = (normalizedCharset === "utf-8" && hasHighBytes) ? "windows-1252" : normalizedCharset;
            partBody = new TextDecoder(targetCharset, { fatal: false }).decode(bytes);
          } catch (_e) { /* keep as-is */ }
        }
      }

      if (contentType.includes("text/plain") && !result.bodyText) {
        result.bodyText = partBody.trim();
      } else if (contentType.includes("text/html") && !result.bodyHtml) {
        result.bodyHtml = partBody.trim();
      }
    }
  } else {
    const headerEnd = raw.search(/\r?\n\r?\n/);
    if (headerEnd === -1) return result;

    let body = raw.substring(headerEnd + 2).trim();
    const headerSection = raw.substring(0, headerEnd);
    const transferEncodingMatch = headerSection.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const transferEncoding = transferEncodingMatch ? transferEncodingMatch[1].trim().toLowerCase() : "";

    body = body.replace(/\)\r?\n\s*A\d{4}\s+OK.*$/s, "").trim();
    body = body.replace(/\)\s*$/s, "").trim();

    const contentTypeFullMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
    const singleCharset = contentTypeFullMatch ? extractCharset(contentTypeFullMatch[1]) : "utf-8";

    if (transferEncoding === "quoted-printable") {
      body = decodeQuotedPrintable(body, singleCharset);
    } else if (transferEncoding === "base64") {
      body = decodeBase64(body, singleCharset);
    } else {
      const hasHighBytes = /[\x80-\xff]/.test(body);
      const normalizedCharset = normalizeCharset(singleCharset);
      if (hasHighBytes || (normalizedCharset !== "utf-8")) {
        try {
          const bytes = new Uint8Array([...body].map(c => c.charCodeAt(0)));
          const targetCharset = (normalizedCharset === "utf-8" && hasHighBytes) ? "windows-1252" : normalizedCharset;
          body = new TextDecoder(targetCharset, { fatal: false }).decode(bytes);
        } catch (_e) { /* keep as-is */ }
      }
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

function hasReadableEmailContent(parsed: MimeParsed): boolean {
  const plain = (parsed.bodyText || "").replace(/\s+/g, " ").trim();
  const htmlAsText = (parsed.bodyHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 20 || htmlAsText.length > 20;
}

function parseMimeMessageFast(raw: string): MimeParsed {
  // For text content, only scan first 900KB to save CPU
  const textLimit = 900 * 1024;
  const limitedRaw = raw.substring(0, textLimit);
  const textParsed = parseMimeMessage(limitedRaw);

  // Limit text sizes
  if (textParsed.bodyText.length > 150000) textParsed.bodyText = textParsed.bodyText.substring(0, 150000);
  if (textParsed.bodyHtml.length > 250000) textParsed.bodyHtml = textParsed.bodyHtml.substring(0, 250000);

  if (!hasReadableEmailContent(textParsed)) {
    textParsed.bodyText = limitedRaw
      .split(/\r?\n/)
      .filter((line) => {
        const l = line.trim();
        if (!l) return false;
        if (l.startsWith("--")) return false;
        if (/^(content-type|content-transfer-encoding|mime-version|content-disposition):/i.test(l)) return false;
        return true;
      })
      .join("\n")
      .substring(0, 100000);
    textParsed.bodyHtml = "";
  }

  // For attachments, parse the FULL raw (attachments are already capped at 5MB each in parseMimeMessage)
  // Only do this if the limited parse didn't find them and the full raw is bigger
  if (textParsed.attachments.length === 0 && raw.length > textLimit) {
    const fullParsed = parseMimeMessage(raw);
    textParsed.attachments = fullParsed.attachments;
  }

  return textParsed;
}

function extractName(from: string): string {
  const name = from.replace(/<.+?>/, "").replace(/"/g, "").trim();
  return name || extractEmail(from);
}

// Strip quoted/previous email content from replies
function stripQuotedText(text: string): string {
  if (!text) return text;
  const lines = text.split(/\r?\n/);
  const cutPatterns = [
    /^-{2,}\s*Original\s*Message/i,
    /^-{2,}\s*Mensagem\s*Original/i,
    /^-{2,}\s*Forwarded/i,
    /^On\s.+wrote:$/i,
    /^Em\s.+escreveu:$/i,
    /^De:\s/i,
    /^From:\s/i,
    /^Enviado:\s/i,
    /^Sent:\s/i,
    /^>{2,}/,
  ];
  let cutIndex = lines.length;
  // Also detect consecutive ">" quoted lines
  let consecutiveQuoted = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (cutPatterns.some(p => p.test(line))) {
      cutIndex = i;
      break;
    }
    if (line.startsWith(">")) {
      consecutiveQuoted++;
      if (consecutiveQuoted >= 2) {
        cutIndex = i - 1;
        break;
      }
    } else {
      consecutiveQuoted = 0;
    }
  }
  const result = lines.slice(0, cutIndex).join("\n").trim();
  return result || text; // fallback to original if stripping removes everything
}

function stripQuotedHtml(html: string): string {
  if (!html) return html;
  // Remove Gmail-style quoted content
  let cleaned = html.replace(/<div\s+class="gmail_quote"[\s\S]*$/i, "");
  // Remove Outlook-style quoted content
  cleaned = cleaned.replace(/<div\s+id="divRplyFwdMsg"[\s\S]*$/i, "");
  cleaned = cleaned.replace(/<div\s+id="appendonsend"[\s\S]*$/i, "");
  // Remove blockquote elements (common in replies)
  cleaned = cleaned.replace(/<blockquote[\s\S]*$/i, "");
  // Remove "---Original Message---" style markers and everything after
  cleaned = cleaned.replace(/<hr\s*\/?>[\s\S]*?(?:Original\s*Message|Mensagem\s*Original)[\s\S]*$/i, "");
  cleaned = cleaned.replace(/(?:<p[^>]*>|<div[^>]*>)?\s*-{2,}\s*(?:Original\s*Message|Mensagem\s*Original)[\s\S]*$/i, "");
  // Remove "On ... wrote:" pattern
  cleaned = cleaned.replace(/(?:<p[^>]*>|<div[^>]*>)?\s*(?:On|Em)\s.+?(?:wrote|escreveu)\s*:[\s\S]*$/i, "");
  // Clean up trailing empty tags
  cleaned = cleaned.replace(/(<br\s*\/?\s*>|\s|&nbsp;)*$/i, "").trim();
  return cleaned || html; // fallback to original
}

function sanitizeHtml(html: string): string {
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  safe = safe.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  return safe;
}

// Check if email matches blocklist
async function isBlocked(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  subject: string,
): Promise<{ blocked: boolean; reason: string }> {
  const { data: rules } = await adminClient.from("email_blocked_senders").select("*");
  if (!rules || rules.length === 0) return { blocked: false, reason: "" };

  const emailLower = email.toLowerCase();
  const domain = emailLower.split("@")[1] || "";

  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase();
    if (rule.pattern_type === "email" && emailLower === pattern) {
      return { blocked: true, reason: rule.reason || `Remetente bloqueado: ${pattern}` };
    }
    if (rule.pattern_type === "domain" && domain === pattern) {
      return { blocked: true, reason: rule.reason || `Domínio bloqueado: ${pattern}` };
    }
    if (rule.pattern_type === "keyword_subject" && subject.toLowerCase().includes(pattern)) {
      return { blocked: true, reason: rule.reason || `Palavra-chave bloqueada: ${pattern}` };
    }
  }
  return { blocked: false, reason: "" };
}

// Generate a fingerprint for dedup when message_id is missing
async function generateFingerprint(from: string, subject: string, bodySnippet: string): Promise<string> {
  const raw = `${from.toLowerCase()}|${subject.substring(0, 100)}|${bodySnippet.substring(0, 200)}`;
  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 40);
}

// Fast base64 decode using lookup table — works on Uint8Array directly
function fastB64Decode(raw: Uint8Array): Uint8Array {
  const lut = new Uint8Array(256).fill(255);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < 64; i++) lut[chars.charCodeAt(i)] = i;

  const clean = new Uint8Array(raw.length);
  let len = 0;
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (lut[b] < 64 || b === 61) { clean[len++] = b; }
  }

  let padding = 0;
  if (len > 0 && clean[len - 1] === 61) padding++;
  if (len > 1 && clean[len - 2] === 61) padding++;
  const outLen = Math.floor(len * 3 / 4) - padding;
  const out = new Uint8Array(outLen);

  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lut[clean[i]];
    const b = lut[clean[i + 1]];
    const c = lut[clean[i + 2]];
    const d = lut[clean[i + 3]];
    if (j < outLen) out[j++] = (a << 2) | (b >> 4);
    if (j < outLen) out[j++] = ((b & 15) << 4) | (c >> 2);
    if (j < outLen) out[j++] = ((c & 3) << 6) | d;
  }
  return out;
}

// Parse BODYSTRUCTURE response to find attachment parts (part number, filename, content-type, size)
interface AttachmentPart { partNum: string; filename: string; contentType: string; encoding: string; size: number; }

function parseBodyStructureAttachments(bs: string, prefix = ""): AttachmentPart[] {
  const results: AttachmentPart[] = [];
  
  // Extract the BODYSTRUCTURE content between the outer FETCH parens
  let struct = bs;
  if (!prefix) {
    // Try multiple patterns — IMAP servers format this differently
    const bsMatch = bs.match(/BODYSTRUCTURE\s+(\(.*\))\s*\)\s*$/ms)
      || bs.match(/BODYSTRUCTURE\s+(\(.*\))/s);
    if (!bsMatch) {
      console.log(`BODYSTRUCTURE regex failed on: ${bs.substring(0, 300)}`);
      return results;
    }
    struct = bsMatch[1];
  }
  
  // Parse top-level parts by tracking parenthesis depth
  const topParts: { content: string; index: number }[] = [];
  let depth = 0;
  let partStart = -1;
  
  for (let i = 1; i < struct.length - 1; i++) {
    if (struct[i] === "(") {
      if (depth === 0) partStart = i;
      depth++;
    } else if (struct[i] === ")") {
      depth--;
      if (depth === 0 && partStart >= 0) {
        topParts.push({ content: struct.substring(partStart, i + 1), index: topParts.length });
      }
    }
  }
  
  for (let idx = 0; idx < topParts.length; idx++) {
    const part = topParts[idx].content;
    const partNum = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
    
    // Check if this part is itself a multipart (contains nested (...) groups at depth 1)
    let innerDepth = 0;
    let hasNestedParts = false;
    for (let i = 1; i < part.length - 1; i++) {
      if (part[i] === "(") {
        if (innerDepth === 0) { hasNestedParts = true; break; }
        innerDepth++;
      } else if (part[i] === ")") {
        innerDepth--;
      }
    }
    
    // Detect multipart container: starts with nested parens, has "mixed"/"alternative"/"related" etc
    const isMultipart = hasNestedParts && /"\s*(?:mixed|alternative|related|signed|report)/i.test(part);
    
    if (isMultipart) {
      // Recurse into nested multipart
      const nested = parseBodyStructureAttachments(part, partNum);
      results.push(...nested);
      continue;
    }
    
    // Look for filename in this part
    const nameMatch = part.match(/(?:"name"\s*"([^"]+)"|"filename"\s*"([^"]+)")/i);
    if (!nameMatch) continue;
    
    const filename = decodeHeaderValue(nameMatch[1] || nameMatch[2]);
    if (!filename) continue;
    
    // Skip text parts without attachment disposition
    const ctMatch = part.match(/"(image|application|audio|video)"\s+"([^"]+)"/i);
    if (!ctMatch && !part.toLowerCase().includes('"attachment"')) continue;
    
    const contentType = ctMatch ? `${ctMatch[1]}/${ctMatch[2]}`.toLowerCase() : "application/octet-stream";
    const encMatch = part.match(/"(base64|quoted-printable|7bit|8bit)"/i);
    const encoding = encMatch ? encMatch[1].toLowerCase() : "base64";
    
    // Find size: prefer "size" "NNN" in disposition params, then RFC822 size after encoding
    let size = 0;
    const dispositionSizeMatch = part.match(/"size"\s+"(\d+)"/i);
    if (dispositionSizeMatch) {
      size = parseInt(dispositionSizeMatch[1]);
    } else if (encMatch) {
      // The number right after encoding string is the RFC822 encoded size
      const afterEnc = part.substring((encMatch.index || 0) + encMatch[0].length);
      const rfcSizeMatch = afterEnc.match(/\s+(\d+)/);
      if (rfcSizeMatch) size = parseInt(rfcSizeMatch[1]);
    }
    
    results.push({ partNum, filename, contentType, encoding, size });
  }
  
  return results;
}

// Fetch attachments individually via MIME part numbers (CPU-efficient, no full email parsing)
async function fetchAttachmentsParts(
  imap: ImapClient,
  adminClient: ReturnType<typeof createClient>,
  seqNum: number,
  ticketId: string,
  agentId: string,
): Promise<number> {
  try {
    const bs = await imap.fetchBodyStructure(seqNum);
    console.log(`BODYSTRUCTURE raw (first 500): ${bs.substring(0, 500)}`);
    const parts = parseBodyStructureAttachments(bs);
    console.log(`BODYSTRUCTURE found ${parts.length} attachment parts: ${JSON.stringify(parts.map(p => ({ partNum: p.partNum, filename: p.filename, size: p.size })))}`);
    
    if (parts.length === 0) return 0;
    
    let uploaded = 0;
    for (const part of parts) {
      // Skip very large attachments (> 5MB)
      if (part.size > 5 * 1024 * 1024) continue;
      
      try {
        const rawPart = await imap.fetchMimePart(seqNum, part.partNum);
        let data: Uint8Array;
        
        if (part.encoding === "base64") {
          data = decodeBase64ToBytes(rawPart, 5 * 1024 * 1024);
        } else {
          data = new TextEncoder().encode(rawPart);
        }
        
        if (data.length > 0 && data.length <= 5 * 1024 * 1024) {
          await uploadAttachment(adminClient, ticketId, {
            filename: part.filename,
            contentType: part.contentType,
            data,
          }, agentId);
          uploaded++;
        }
      } catch (err) {
        console.error(`Part ${part.partNum} fetch error: ${(err as Error).message}`);
      }
    }
    return uploaded;
  } catch (err) {
    console.error(`BODYSTRUCTURE error: ${(err as Error).message}`);
    return 0;
  }
}


async function uploadAttachment(
  adminClient: ReturnType<typeof createClient>,
  ticketId: string,
  attachment: { filename: string; contentType: string; data: Uint8Array },
  agentId: string,
): Promise<void> {
  // Dedup: skip if same filename already exists for this ticket
  const { count } = await adminClient
    .from("ticket_attachments")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .eq("file_name", attachment.filename);
  if (count && count > 0) {
    console.log(`Attachment '${attachment.filename}' already exists for ticket ${ticketId}, skipping`);
    return;
  }

  const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${ticketId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await adminClient.storage
    .from("ticket-attachments")
    .upload(filePath, attachment.data, { contentType: attachment.contentType, upsert: false });

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

// Store attachment to temp storage for pending emails
async function storePendingAttachment(
  adminClient: ReturnType<typeof createClient>,
  pendingId: string,
  attachment: { filename: string; contentType: string; data: Uint8Array },
): Promise<{ filename: string; contentType: string; size: number; path: string }> {
  const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `pending/${pendingId}/${Date.now()}_${safeName}`;

  await adminClient.storage
    .from("email-assets")
    .upload(filePath, attachment.data, { contentType: attachment.contentType, upsert: false });

  return {
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.data.length,
    path: filePath,
  };
}

// Create a new ticket as a continuation of a closed parent ticket
// Used when a client replies by email to a ticket that is already closed/resolved
async function createChildTicketFromClosed(
  adminClient: ReturnType<typeof createClient>,
  parentTicketId: string,
  emailDetails: { subject: string; description: string; clientName: string; clientEmail: string; receivedAt?: string },
  createdBy: string,
): Promise<{ id: string; ticket_number: number } | null> {
  const { data: parent } = await adminClient
    .from("tickets")
    .select("ticket_number, client_name, client_email, client_phone, order_number, category_id, subcategory_id, priority")
    .eq("id", parentTicketId)
    .single();

  const subjectPrefix = parent?.ticket_number ? `[Continuação #${parent.ticket_number}] ` : "[Continuação] ";
  const rawSubject = emailDetails.subject || "Sem assunto";
  const newSubject = (subjectPrefix + rawSubject).substring(0, 200);

  const insertPayload: Record<string, unknown> = {
    client_name: parent?.client_name || emailDetails.clientName || emailDetails.clientEmail,
    client_email: parent?.client_email || emailDetails.clientEmail || null,
    client_phone: parent?.client_phone || null,
    order_number: parent?.order_number || null,
    category_id: parent?.category_id || null,
    subcategory_id: parent?.subcategory_id || null,
    priority: parent?.priority || "P2",
    subject: newSubject,
    description: emailDetails.description,
    status: "novo",
    created_by: createdBy,
    parent_ticket_id: parentTicketId,
  };
  if (emailDetails.receivedAt) insertPayload.email_received_at = emailDetails.receivedAt;

  const { data: created, error } = await adminClient
    .from("tickets")
    .insert(insertPayload)
    .select("id, ticket_number")
    .single();

  if (error || !created) {
    console.error(`createChildTicketFromClosed failed: ${error?.message}`);
    return null;
  }

  // Log events on both tickets so agents have full context
  await adminClient.from("ticket_events").insert([
    {
      ticket_id: created.id,
      event_type: "note",
      content: parent?.ticket_number
        ? `Novo ticket criado por resposta de e-mail ao ticket #${parent.ticket_number} (fechado).`
        : `Novo ticket criado por resposta de e-mail a ticket anterior (fechado).`,
      metadata: { parent_ticket_id: parentTicketId },
    },
    {
      ticket_id: parentTicketId,
      event_type: "note",
      content: `Cliente respondeu por e-mail — novo ticket #${created.ticket_number} aberto.`,
      metadata: { child_ticket_id: created.id },
    },
  ]);

  return created as { id: string; ticket_number: number };
}

async function processEmails(params: { fetchRecent: boolean; maxEmails: number; agentId?: string; offset?: number; searchDays?: number }) {
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
  if (!imapCfg) return { success: false, message: "IMAP não configurado" };

  const imap = new ImapClient();
  const port = Number(imapCfg.imap_port) || 993;

  try {
    const greeting = await imap.connect(imapCfg.imap_host, port);
    if (!greeting.includes("OK")) return { success: false, message: "Servidor IMAP não respondeu" };

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
    const searchDays = params.searchDays || 1;
    if (searchDays > 1) {
      // Extended search: get all emails from last N days
      emailIds = await imap.searchSince(searchDays);
    } else if (params.fetchRecent) {
      const allIds = await imap.searchAll();
      emailIds = allIds.slice(-params.maxEmails);
    } else {
      // Default: last 24h
      emailIds = await imap.searchSince(1);
    }

    // ── NEWEST FIRST: reverse so most recent emails are at offset 0 ──
    emailIds.reverse();

    const totalEmails = emailIds.length;
    const offset = params.offset || 0;

    if (offset >= totalEmails) {
      await imap.logout();
      return {
        success: true, message: "Todos os emails verificados", created: 0, pending: 0,
        updated: 0, blocked: 0, skipped: 0, total: 0, remaining: 0,
        next_offset: null, new_email_processed: false,
      };
    }

    // ── PRE-LOAD known fingerprints for in-memory dedup (single DB query) ──
    const knownFingerprints = new Set<string>();
    try {
      const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: threads } = await adminClient
        .from("email_threads")
        .select("last_message_id")
        .gte("created_at", since48h);
      if (threads) threads.forEach((t: any) => { if (t.last_message_id) knownFingerprints.add(t.last_message_id); });

      const { data: pendingMsgs } = await adminClient
        .from("pending_emails")
        .select("message_id")
        .gte("created_at", since48h);
      if (pendingMsgs) pendingMsgs.forEach((p: any) => { if (p.message_id) knownFingerprints.add(p.message_id); });
    } catch (_e) { /* proceed without pre-loaded set */ }

    console.log(`Batch: offset=${offset}, total=${totalEmails}, known_fps=${knownFingerprints.size}`);

    // ── BATCH: check up to 10 headers if they're all duplicates, but only fetch 1 full body ──
    const MAX_HEADER_CHECKS = 10;
    const MAX_INLINE_EMAIL_SIZE = 10 * 1024 * 1024; // 10MB — attachments are already capped individually at 5MB
    let headersChecked = 0;
    let created = 0, pending = 0, blocked = 0, updated = 0, skipped = 0;
    let newEmailProcessed = false;
    let backfillCount = 0; // Allow up to 3 backfills per batch
    const MAX_BACKFILLS = 3;

    const remainingIds = emailIds.slice(offset);

    for (const seqNum of remainingIds) {
      if (headersChecked >= MAX_HEADER_CHECKS) break;
      headersChecked++;

      try {
        // Lightweight: fetch only headers (no body download)
        const headers = await imap.fetchHeaders(seqNum);
        const clientEmail = extractEmail(headers.from);

        if (!clientEmail) {
          skipped++;
          continue;
        }

        // Generate fingerprint from headers only
        const emailFingerprint = headers.messageId?.trim() || await generateFingerprint(clientEmail, headers.subject, "");

        // ── IN-MEMORY dedup check (instant, no DB round-trip) ──
        if (emailFingerprint && knownFingerprints.has(emailFingerprint)) {
          // Check if ticket is missing attachments — if so, fetch them now (max 3 per batch)
          if (backfillCount < MAX_BACKFILLS) {
            console.log(`Dup check: fp=${emailFingerprint.substring(0, 30)}... email=${clientEmail}`);
          }
          if (backfillCount < MAX_BACKFILLS) {
            try {
              // Find ticket via email_threads
              let backfillTicketId: string | null = null;
              const { data: threadRow } = await adminClient
                .from("email_threads")
                .select("ticket_id")
                .eq("last_message_id", emailFingerprint)
                .limit(1)
                .maybeSingle();

              if (threadRow?.ticket_id) {
                backfillTicketId = threadRow.ticket_id;
              } else {
                // Also check pending_emails → ticket_id
                const { data: pendingRow } = await adminClient
                  .from("pending_emails")
                  .select("ticket_id")
                  .eq("message_id", emailFingerprint)
                  .not("ticket_id", "is", null)
                  .limit(1)
                  .maybeSingle();
                if (pendingRow?.ticket_id) backfillTicketId = pendingRow.ticket_id;
              }

              // Also try matching by client email if no direct fingerprint match
              if (!backfillTicketId) {
                const { data: threadByEmail } = await adminClient
                  .from("email_threads")
                  .select("ticket_id")
                  .eq("email_address", clientEmail.toLowerCase())
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (threadByEmail?.ticket_id) backfillTicketId = threadByEmail.ticket_id;
              }

              console.log(`Backfill lookup: fp=${emailFingerprint.substring(0, 40)}... ticket=${backfillTicketId || 'NOT_FOUND'}`);

              if (backfillTicketId) {
                const { count } = await adminClient
                  .from("ticket_attachments")
                  .select("id", { count: "exact", head: true })
                  .eq("ticket_id", backfillTicketId);

                console.log(`Ticket ${backfillTicketId} has ${count} attachments`);

                if (count === 0) {
                  console.log(`Fetching attachments via BODYSTRUCTURE (lightweight)...`);
                  try {
                    // BODYSTRUCTURE first — lightweight, no full email download
                    let uploaded = await fetchAttachmentsParts(imap, adminClient, seqNum, backfillTicketId, createdBy!);
                    
                    // Fallback to full message only for small emails (< 2MB)
                    if (uploaded === 0 && headers.size && headers.size < 2 * 1024 * 1024) {
                      console.log(`BODYSTRUCTURE found nothing — trying full fetch (${headers.size} bytes)`);
                      const fullMsg = await imap.fetchMessage(seqNum);
                      if (fullMsg.attachments.length > 0) {
                        for (const att of fullMsg.attachments) {
                          if (att.data.length > 0 && att.data.length <= 5 * 1024 * 1024) {
                            await uploadAttachment(adminClient, backfillTicketId, att, createdBy!);
                            uploaded++;
                          }
                        }
                      }
                    }
                    
                    if (uploaded > 0) {
                      console.log(`Imported ${uploaded} attachment(s) for ticket ${backfillTicketId}`);
                    } else {
                      console.log(`No attachments found for ticket ${backfillTicketId}`);
                    }
                    newEmailProcessed = true;
                    backfillCount++;
                  } catch (fetchErr) {
                    console.error(`Backfill fetch error: ${(fetchErr as Error).message}`);
                    backfillCount++;
                  }
                }
              }
            } catch (err) {
              console.error(`Attachment backfill error: ${(err as Error).message}`);
            }
          }
          skipped++;
          continue;
        }

        // Very large emails can exceed edge CPU limits when parsing full MIME + attachments.
        // Fallback: import as pending with header metadata so the inbox doesn't block.
        if (headers.size && headers.size > MAX_INLINE_EMAIL_SIZE) {
          const clientName = extractName(headers.from);
          await adminClient.from("pending_emails").insert({
            from_address: clientEmail.toLowerCase(),
            from_name: clientName,
            subject: headers.subject.substring(0, 500),
            body_text: `Email recebido (${Math.round(headers.size / 1024)} KB). Conteúdo completo indisponível neste modo de importação.`,
            body_html: "",
            message_id: emailFingerprint,
            status: "pending",
          });
          pending++;
          await imap.markAsSeen(seqNum);
          newEmailProcessed = true;
          break;
        }

        // This email is NOT a duplicate - now fetch body (partial for large emails to avoid worker CPU limits)
        const PARTIAL_FETCH_THRESHOLD = 1800 * 1024; // Keep low for text parsing
        const msg = (headers.size && headers.size > PARTIAL_FETCH_THRESHOLD)
          ? await imap.fetchMessagePartial(seqNum, 900000)
          : await imap.fetchMessage(seqNum);
        const clientName = extractName(msg.from);

        // Check blocklist
        const blockCheck = await isBlocked(adminClient, clientEmail, msg.subject);
        if (blockCheck.blocked) {
          await adminClient.from("pending_emails").insert({
            from_address: clientEmail.toLowerCase(),
            from_name: clientName,
            subject: msg.subject.substring(0, 500),
            body_text: (msg.bodyText || "").substring(0, 5000),
            body_html: (msg.bodyHtml ? sanitizeHtml(msg.bodyHtml) : "").substring(0, 10000),
            message_id: msg.messageId,
            status: "blocked",
            rejection_reason: blockCheck.reason,
          });
          blocked++;
          await imap.markAsSeen(seqNum);
          newEmailProcessed = true;
          break;
        }

        // Check if we have an existing open thread OR ticket by client_email
        const { data: existingThread } = await adminClient
          .from("email_threads")
          .select("ticket_id")
          .eq("email_address", clientEmail.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let ticketId: string | null = null;
        let threadExists = false;

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
            threadExists = true;
          }
        }

        // Fallback: check tickets table directly by client_email
        if (!ticketId) {
          const { data: openTickets } = await adminClient
            .from("tickets")
            .select("id, status")
            .eq("client_email", clientEmail.toLowerCase())
            .order("created_at", { ascending: false })
            .limit(5);

          if (openTickets) {
            for (const t of openTickets) {
              const { data: sd } = await adminClient
                .from("ticket_statuses")
                .select("is_closed")
                .eq("id", t.status)
                .single();
              if (!sd?.is_closed) {
                ticketId = t.id;
                break;
              }
            }
          }
        }

        if (ticketId) {
            const htmlPreview = msg.bodyHtml ? msg.bodyHtml.substring(0, 20000) : "";
            const textPreview = (msg.bodyText || "(email sem conteúdo)").substring(0, 10000);

            const htmlFull = htmlPreview ? sanitizeHtml(htmlPreview).substring(0, 10000) : "";
            const htmlStripped = htmlFull ? stripQuotedHtml(htmlFull).substring(0, 10000) : "";
            const textFull = textPreview.substring(0, 5000);
            const textStripped = stripQuotedText(textFull).substring(0, 5000);

            const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const hasReadableHtml = htmlStripped && stripHtml(htmlStripped).length > 0;
            const fullBody = hasReadableHtml ? htmlFull : textFull;
            const strippedBody = hasReadableHtml ? htmlStripped : textStripped;
            const body = strippedBody;

            const contentSnippet = stripHtml(body).substring(0, 200).trim().toLowerCase();
            const { data: existingMsgs } = await adminClient
              .from("ticket_messages")
              .select("id, content")
              .eq("ticket_id", ticketId)
              .eq("sender_type", "client")
              .order("created_at", { ascending: false })
              .limit(10);

            const isDuplicateContent = existingMsgs?.some(
              (m: any) => stripHtml(m.content).substring(0, 200).trim().toLowerCase() === contentSnippet
            );

            if (isDuplicateContent) {
              skipped++;
              await imap.markAsSeen(seqNum);
              newEmailProcessed = true;
              break;
            }

            const hasQuotedContent = stripHtml(fullBody).length !== stripHtml(strippedBody).length;

            const msgInsert: any = {
              ticket_id: ticketId,
              sender_id: "00000000-0000-0000-0000-000000000000",
              sender_type: "client",
              content: body,
              ...(hasQuotedContent ? { original_content: fullBody } : {}),
            };
            if (msg.date) msgInsert.created_at = msg.date;

            await adminClient.from("ticket_messages").insert(msgInsert);

            if (threadExists && existingThread) {
              await adminClient.from("email_threads")
                .update({ last_message_id: emailFingerprint })
                .eq("ticket_id", existingThread.ticket_id);
            } else {
              await adminClient.from("email_threads").insert({
                ticket_id: ticketId!,
                email_address: clientEmail.toLowerCase(),
                last_message_id: emailFingerprint,
              });
            }

            if (msg.attachments.length > 0) {
              for (const att of msg.attachments) {
                try {
                  await uploadAttachment(adminClient, ticketId, att, createdBy!);
                } catch (err) {
                  console.error(`Attachment error: ${(err as Error).message}`);
                }
              }
            }
            // Always try BODYSTRUCTURE to catch attachments missed by body parsing (partial fetches, nested MIME)
            await fetchAttachmentsParts(imap, adminClient, seqNum, ticketId, createdBy!);

            updated++;
            await imap.markAsSeen(seqNum);
            newEmailProcessed = true;
            break;
        }

        // New email from unknown/closed thread → pending review queue
        const pendingHtmlPreview = msg.bodyHtml ? msg.bodyHtml.substring(0, 20000) : "";
        const pendingInsert: any = {
          from_address: clientEmail.toLowerCase(),
          from_name: clientName,
          subject: msg.subject.substring(0, 500),
          body_text: (msg.bodyText || "").substring(0, 5000),
          body_html: pendingHtmlPreview ? sanitizeHtml(pendingHtmlPreview).substring(0, 10000) : "",
          message_id: emailFingerprint,
          status: "pending",
        };
        if (msg.date) pendingInsert.created_at = msg.date;

        const { data: pendingEmail } = await adminClient.from("pending_emails").insert(pendingInsert).select("id").single();

        if (pendingEmail && msg.attachments.length > 0) {
          const attMeta = [];
          for (const att of msg.attachments) {
            try {
              const meta = await storePendingAttachment(adminClient, pendingEmail.id, att);
              attMeta.push(meta);
            } catch (err) {
              console.error(`Pending attachment error: ${(err as Error).message}`);
            }
          }
          if (attMeta.length > 0) {
            await adminClient.from("pending_emails")
              .update({ attachments_meta: attMeta })
              .eq("id", pendingEmail.id);
          }
        }

        pending++;
        await imap.markAsSeen(seqNum);
        newEmailProcessed = true;
        break; // Only 1 new email per call
      } catch (err) {
        console.error(`Email ${seqNum} error: ${(err as Error).message}`);
        newEmailProcessed = true;
        break;
      }
    }

    await imap.logout();

    const nextOffset = offset + headersChecked;
    const hasMore = nextOffset < totalEmails;
    const totalChecked = headersChecked;
    const remaining = hasMore ? (totalEmails - nextOffset) : 0;
    const parts = [];
    if (pending > 0) parts.push(`${pending} para revisao`);
    if (updated > 0) parts.push(`${updated} atualizados`);
    if (blocked > 0) parts.push(`${blocked} bloqueados`);
    if (skipped > 0) parts.push(`${skipped} duplicados`);
    if (parts.length === 0) parts.push("0 novos emails");
    const message = parts.join(", ") + (remaining > 0 ? `. Restam ${remaining}.` : "");

    return { 
      success: true, message, created, pending, updated, blocked, skipped, 
      total: totalChecked, remaining, 
      next_offset: hasMore ? nextOffset : null,
      new_email_processed: newEmailProcessed,
    };
  } catch (err) {
    try { await imap.logout(); } catch (_e) { /* */ }
    throw err;
  }
  // end processEmails
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
    let action: string | undefined;
    let pendingId: string | undefined;
    let offset: number | undefined;
    let searchDays: number | undefined;
    let ticketIdBody: string | undefined;
    let bodyParsed: any = {};
    try {
      const body = await req.json();
      bodyParsed = body || {};
      testOnly = body?.test_only === true;
      fetchRecent = body?.fetch_recent === true;
      if (body?.max_emails) maxEmails = Math.min(Number(body.max_emails), 50);
      if (body?.agent_id) agentId = body.agent_id;
      action = body?.action;
      pendingId = body?.pending_id;
      if (body?.offset !== undefined) offset = Number(body.offset);
      if (body?.search_days) searchDays = Math.min(Number(body.search_days), 30);
      if (body?.ticket_id) ticketIdBody = body.ticket_id;
    } catch (_e) { /* no body */ }

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
      if (port === 143) { try { await imap.startTls(imapCfg.imap_host); } catch (_e) { /* */ } }
      const loginRes = await imap.login(imapCfg.imap_user, imapCfg.imap_pass);
      await imap.logout();
      const ok = greeting.includes("OK") && loginRes.includes("OK");
      return new Response(JSON.stringify({ success: ok, message: ok ? "Conexão IMAP bem-sucedida" : "Falha na autenticação" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Approve pending email → create ticket
    if (action === "approve" && pendingId && agentId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const { data: pe } = await adminClient.from("pending_emails").select("*").eq("id", pendingId).single();
      if (!pe) {
        return new Response(JSON.stringify({ success: false, message: "Email pendente não encontrado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const description = pe.body_html || pe.body_text || "(email sem conteúdo)";

      // ── Check if there's already an OPEN ticket with an email thread for this sender ──
      let ticketId: string | null = null;
      const { data: existingThread } = await adminClient
        .from("email_threads")
        .select("ticket_id")
        .eq("email_address", pe.from_address.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingThread) {
        const { data: existingTicket } = await adminClient
          .from("tickets")
          .select("id, status")
          .eq("id", existingThread.ticket_id)
          .single();

        if (existingTicket) {
          const { data: statusData } = await adminClient
            .from("ticket_statuses")
            .select("is_closed")
            .eq("id", existingTicket.status)
            .single();

          if (!statusData?.is_closed) {
            ticketId = existingTicket.id;
          }
        }
      }

      // Fallback: check tickets table directly by client_email
      if (!ticketId) {
        const { data: openTickets } = await adminClient
          .from("tickets")
          .select("id, status")
          .eq("client_email", pe.from_address.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(5);

        if (openTickets) {
          for (const t of openTickets) {
            const { data: sd } = await adminClient
              .from("ticket_statuses")
              .select("is_closed")
              .eq("id", t.status)
              .single();
            if (!sd?.is_closed) {
              ticketId = t.id;
              break;
            }
          }
        }
      }

      if (ticketId) {
        // ── Append message to existing ticket instead of creating a duplicate ──
        await adminClient.from("ticket_messages").insert({
          ticket_id: ticketId,
          sender_id: "00000000-0000-0000-0000-000000000000",
          sender_type: "client",
          content: description,
        });

        // Create or update email thread
        if (existingThread) {
          await adminClient.from("email_threads")
            .update({ last_message_id: pe.message_id })
            .eq("ticket_id", ticketId);
        } else {
          await adminClient.from("email_threads").insert({
            ticket_id: ticketId,
            email_address: pe.from_address.toLowerCase(),
            last_message_id: pe.message_id,
          });
        }

        // Move attachments to existing ticket
        const attMeta = (pe.attachments_meta as any[]) || [];
        for (const att of attMeta) {
          try {
            const { data: fileData } = await adminClient.storage.from("email-assets").download(att.path);
            if (fileData) {
              const bytes = new Uint8Array(await fileData.arrayBuffer());
              await uploadAttachment(adminClient, ticketId, {
                filename: att.filename, contentType: att.contentType, data: bytes,
              }, agentId);
            }
            await adminClient.storage.from("email-assets").remove([att.path]);
          } catch (err) {
            console.error(`Move attachment error: ${(err as Error).message}`);
          }
        }

        // Mark as approved, linking to existing ticket
        await adminClient.from("pending_emails").update({
          status: "approved",
          reviewed_by: agentId,
          reviewed_at: new Date().toISOString(),
          ticket_id: ticketId,
        }).eq("id", pendingId);

        // ── Merge ALL other pending emails from same sender into this ticket ──
        const { data: otherPending } = await adminClient.from("pending_emails")
          .select("*")
          .eq("from_address", pe.from_address.toLowerCase())
          .eq("status", "pending")
          .neq("id", pendingId)
          .order("created_at", { ascending: true });

        let mergedCount = 0;
        if (otherPending && otherPending.length > 0) {
          for (const op of otherPending) {
            const opContent = op.body_html || op.body_text || "(email sem conteúdo)";
            const msgInsert: any = {
              ticket_id: ticketId,
              sender_id: "00000000-0000-0000-0000-000000000000",
              sender_type: "client",
              content: opContent,
            };
            if (op.created_at) msgInsert.created_at = op.created_at;
            await adminClient.from("ticket_messages").insert(msgInsert);

            // Move attachments from this pending email too
            const opAttMeta = (op.attachments_meta as any[]) || [];
            for (const att of opAttMeta) {
              try {
                const { data: fileData } = await adminClient.storage.from("email-assets").download(att.path);
                if (fileData) {
                  const bytes = new Uint8Array(await fileData.arrayBuffer());
                  await uploadAttachment(adminClient, ticketId!, { filename: att.filename, contentType: att.contentType, data: bytes }, agentId);
                }
                await adminClient.storage.from("email-assets").remove([att.path]);
              } catch (err) { console.error(`Merge attachment error: ${(err as Error).message}`); }
            }

            await adminClient.from("pending_emails").update({
              status: "approved",
              reviewed_by: agentId,
              reviewed_at: new Date().toISOString(),
              ticket_id: ticketId,
              rejection_reason: "Fundido com ticket existente",
            }).eq("id", op.id);
            mergedCount++;
          }
        }

        const mergeMsg = mergedCount > 0
          ? `Mensagem adicionada ao ticket existente (+ ${mergedCount} email${mergedCount > 1 ? "s" : ""} fundido${mergedCount > 1 ? "s" : ""})`
          : "Mensagem adicionada ao ticket existente";

        return new Response(JSON.stringify({ success: true, message: mergeMsg, ticket_id: ticketId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── No existing open ticket — create a new one ──
      const ticketInsert: any = {
        client_name: pe.from_name || pe.from_address,
        client_email: pe.from_address,
        subject: pe.subject,
        description: description,
        priority: "P2",
        status: "novo",
        created_by: agentId,
      };
      // Store original email date separately from ticket creation date
      if (pe.created_at && pe.created_at !== new Date().toISOString()) {
        ticketInsert.email_received_at = pe.created_at;
      }
      const { data: newTicket, error } = await adminClient.from("tickets").insert(ticketInsert).select("id").single();

      if (error || !newTicket) {
        return new Response(JSON.stringify({ success: false, message: error?.message || "Erro ao criar ticket" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("email_threads").insert({
        ticket_id: newTicket.id,
        email_address: pe.from_address,
        last_message_id: pe.message_id,
      });

      // Move attachments from pending to ticket
      const attMeta = (pe.attachments_meta as any[]) || [];
      for (const att of attMeta) {
        try {
          const { data: fileData } = await adminClient.storage.from("email-assets").download(att.path);
          if (fileData) {
            const bytes = new Uint8Array(await fileData.arrayBuffer());
            await uploadAttachment(adminClient, newTicket.id, {
              filename: att.filename, contentType: att.contentType, data: bytes,
            }, agentId);
          }
          await adminClient.storage.from("email-assets").remove([att.path]);
        } catch (err) {
          console.error(`Move attachment error: ${(err as Error).message}`);
        }
      }

      // Mark THIS pending email as approved
      await adminClient.from("pending_emails").update({
        status: "approved",
        reviewed_by: agentId,
        reviewed_at: new Date().toISOString(),
        ticket_id: newTicket.id,
      }).eq("id", pendingId);

      // ── Merge other pending emails from same sender into the new ticket ──
      const { data: otherPendingNew } = await adminClient.from("pending_emails")
        .select("*")
        .eq("from_address", pe.from_address.toLowerCase())
        .eq("status", "pending")
        .neq("id", pendingId)
        .order("created_at", { ascending: true });

      if (otherPendingNew && otherPendingNew.length > 0) {
        for (const op of otherPendingNew) {
          const opContent = op.body_html || op.body_text || "(email sem conteúdo)";
          const msgInsert: any = {
            ticket_id: newTicket.id,
            sender_id: "00000000-0000-0000-0000-000000000000",
            sender_type: "client",
            content: opContent,
          };
          if (op.created_at) msgInsert.created_at = op.created_at;
          await adminClient.from("ticket_messages").insert(msgInsert);

          const opAttMeta = (op.attachments_meta as any[]) || [];
          for (const att of opAttMeta) {
            try {
              const { data: fileData } = await adminClient.storage.from("email-assets").download(att.path);
              if (fileData) {
                const bytes = new Uint8Array(await fileData.arrayBuffer());
                await uploadAttachment(adminClient, newTicket.id, { filename: att.filename, contentType: att.contentType, data: bytes }, agentId);
              }
              await adminClient.storage.from("email-assets").remove([att.path]);
            } catch (err) { console.error(`Merge attachment error: ${(err as Error).message}`); }
          }

          await adminClient.from("pending_emails").update({
            status: "approved",
            reviewed_by: agentId,
            reviewed_at: new Date().toISOString(),
            ticket_id: newTicket.id,
            rejection_reason: "Fundido com ticket criado",
          }).eq("id", op.id);
        }
      }

      await adminClient.from("email_logs").insert({
        recipient: pe.from_address,
        subject: pe.subject,
        status: "received",
        source: "inbound",
        ticket_id: newTicket.id,
      });

      return new Response(JSON.stringify({ success: true, message: "Ticket criado com sucesso", ticket_id: newTicket.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Download a single attachment part (called by frontend per attachment) ──
    if (action === "download_single_attachment" && agentId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const { ticket_id: attTicketId, seq_num, part_num, filename, content_type, encoding } = ticketIdBody
        ? { ticket_id: ticketIdBody, seq_num: bodyParsed.seq_num, part_num: bodyParsed.part_num, filename: bodyParsed.filename, content_type: bodyParsed.content_type, encoding: bodyParsed.encoding }
        : { ticket_id: null, seq_num: null, part_num: null, filename: null, content_type: null, encoding: null };

      if (!attTicketId || !seq_num || !part_num || !filename) {
        return new Response(JSON.stringify({ success: false, message: "Parâmetros em falta" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if attachment already exists
      const { data: existing } = await adminClient
        .from("ticket_attachments")
        .select("id")
        .eq("ticket_id", attTicketId)
        .eq("file_name", filename)
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ success: true, message: "Anexo já existe", skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const imapCfg = await getImapConfig(adminClient);
      if (!imapCfg) {
        return new Response(JSON.stringify({ success: false, message: "IMAP não configurado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const imap = new ImapClient();
      const port = Number(imapCfg.imap_port) || 993;
      try {
        const greeting = await imap.connect(imapCfg.imap_host, port);
        if (!greeting.includes("OK")) throw new Error("IMAP connect failed");
        if (port === 143) { try { await imap.startTls(imapCfg.imap_host); } catch (_e) { /* */ } }
        const loginRes = await imap.login(imapCfg.imap_user, imapCfg.imap_pass);
        if (!loginRes.includes("OK")) throw new Error("IMAP login failed");
        await imap.select(imapCfg.imap_folder);

        // Use binary path to avoid string conversion overhead for large attachments
        const rawBytes = await imap.fetchMimePartBinary(Number(seq_num), part_num);
        let data: Uint8Array;
        if (encoding === "base64") {
          data = decodeBase64BytesDirect(rawBytes, 5 * 1024 * 1024);
        } else {
          data = rawBytes;
        }

        await imap.logout();

        if (data.length > 0 && data.length <= 5 * 1024 * 1024) {
          const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${attTicketId}/${Date.now()}_${safeName}`;
          const { error: upErr } = await adminClient.storage
            .from("ticket-attachments")
            .upload(filePath, data, {
              contentType: content_type || "application/octet-stream",
              upsert: false,
            });
          if (upErr) throw new Error(`Storage: ${upErr.message}`);

          await adminClient.from("ticket_attachments").insert({
            ticket_id: attTicketId,
            file_name: filename,
            file_path: filePath,
            file_type: content_type || "application/octet-stream",
            file_size: data.length,
            uploaded_by: agentId,
          });

          console.log(`Single attachment uploaded: ${filename} (${data.length} bytes)`);
          return new Response(JSON.stringify({ success: true, message: `Anexo ${filename} importado`, uploaded: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify({ success: false, message: `Anexo ${filename} demasiado grande ou vazio (${data.length} bytes)` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        try { await imap.logout(); } catch (_e) { /* */ }
        console.error(`Single attachment error: ${(err as Error).message}`);
        return new Response(JSON.stringify({ success: false, message: (err as Error).message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "refetch_ticket" && agentId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const ticketIdParam = ticketIdBody;
      if (!ticketIdParam) {
        return new Response(JSON.stringify({ success: false, message: "ticket_id obrigatório" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get ticket info
      const { data: ticket } = await adminClient.from("tickets").select("id, client_email, client_name, description").eq("id", ticketIdParam).single();
      if (!ticket || !ticket.client_email) {
        return new Response(JSON.stringify({ success: false, message: "Ticket não encontrado ou sem email de cliente" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const imapCfg = await getImapConfig(adminClient);
      if (!imapCfg) {
        return new Response(JSON.stringify({ success: false, message: "IMAP não configurado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Phase 1: Quick — fetch content/messages only (no large attachment downloads)
      const imap = new ImapClient();
      const port = Number(imapCfg.imap_port) || 993;
      let messagesAdded = 0;
      let contentUpdated = false;
      const pendingAttachments: { seq_num: number; part_num: string; filename: string; content_type: string; encoding: string; size: number }[] = [];

      try {
        const greeting = await imap.connect(imapCfg.imap_host, port);
        if (!greeting.includes("OK")) throw new Error("Servidor IMAP não respondeu");
        if (port === 143) { try { await imap.startTls(imapCfg.imap_host); } catch (_e) { /* */ } }
        const loginRes = await imap.login(imapCfg.imap_user, imapCfg.imap_pass);
        if (!loginRes.includes("OK")) throw new Error("Falha na autenticação IMAP");
        await imap.select(imapCfg.imap_folder);

        const clientEmail = ticket.client_email.toLowerCase();
        const searchRes = await imap.command(`SEARCH FROM "${clientEmail}"`);
        const searchMatch = searchRes.match(/\* SEARCH([\d\s]*)/);
        const emailIds = (searchMatch && searchMatch[1].trim())
          ? searchMatch[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
          : [];

        console.log(`Refetch: found ${emailIds.length} emails from ${clientEmail}`);

        const { data: existingMsgs } = await adminClient
          .from("ticket_messages")
          .select("content")
          .eq("ticket_id", ticketIdParam)
          .eq("sender_type", "client");
        const existingSnippets = new Set(
          (existingMsgs || []).map((m: any) => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 200).toLowerCase())
        );

        for (const seqNum of emailIds) {
          try {
            const headers = await imap.fetchHeaders(seqNum);
            const senderEmail = extractEmail(headers.from);
            if (senderEmail.toLowerCase() !== clientEmail) continue;

            // Collect attachment metadata — don't download inline (CPU limit)
            const bs = await imap.fetchBodyStructure(seqNum);
            console.log(`Refetch BODYSTRUCTURE seq=${seqNum} (first 800): ${bs.substring(0, 800)}`);
            const parts = parseBodyStructureAttachments(bs);
            console.log(`Refetch parsed ${parts.length} attachment parts: ${JSON.stringify(parts.map(p => ({ partNum: p.partNum, filename: p.filename, size: p.size })))}`);
            const validParts = parts.filter(p => p.size <= 10 * 1024 * 1024);

            for (const part of validParts) {
              const { count } = await adminClient.from("ticket_attachments")
                .select("id", { count: "exact", head: true })
                .eq("ticket_id", ticketIdParam)
                .eq("file_name", part.filename);
              if (count && count > 0) {
                console.log(`Attachment ${part.filename} already exists, skipping`);
                continue;
              }
              pendingAttachments.push({
                seq_num: seqNum,
                part_num: part.partNum,
                filename: part.filename,
                content_type: part.contentType || "application/octet-stream",
                encoding: part.encoding || "base64",
                size: part.size,
              });
            }

            // Fetch text content only (use partial for large emails to save CPU)
            const msg = (headers.size && headers.size > 1800 * 1024)
              ? await imap.fetchMessagePartial(seqNum)
              : await imap.fetchMessage(seqNum);

            // Update ticket description if empty/placeholder
            const hasContent = msg.bodyHtml || msg.bodyText;
            if (hasContent && (!ticket.description || ticket.description.includes("Conteúdo completo indisponível") || ticket.description === "(email sem conteúdo)")) {
              const descContent = msg.bodyHtml
                ? sanitizeHtml(msg.bodyHtml).substring(0, 20000)
                : (msg.bodyText || "").substring(0, 10000);
              if (descContent.replace(/<[^>]+>/g, "").trim().length > 10) {
                await adminClient.from("tickets").update({ description: descContent }).eq("id", ticketIdParam);
                contentUpdated = true;
                ticket.description = descContent;
              }
            }

            // Add as message if not duplicate
            const bodyForMsg = msg.bodyHtml
              ? stripQuotedHtml(sanitizeHtml(msg.bodyHtml).substring(0, 10000))
              : stripQuotedText((msg.bodyText || "").substring(0, 5000));
            const snippet = bodyForMsg.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 200).toLowerCase();

            if (snippet.length > 10 && !existingSnippets.has(snippet)) {
              const fullBody = msg.bodyHtml
                ? sanitizeHtml(msg.bodyHtml).substring(0, 10000)
                : (msg.bodyText || "").substring(0, 5000);
              const hasQuoted = fullBody.replace(/<[^>]+>/g, "").trim().length !== bodyForMsg.replace(/<[^>]+>/g, "").trim().length;

              const msgInsert: any = {
                ticket_id: ticketIdParam,
                sender_id: "00000000-0000-0000-0000-000000000000",
                sender_type: "client",
                content: bodyForMsg,
                ...(hasQuoted ? { original_content: fullBody } : {}),
              };
              if (msg.date) msgInsert.created_at = msg.date;

              await adminClient.from("ticket_messages").insert(msgInsert);
              existingSnippets.add(snippet);
              messagesAdded++;
            }
          } catch (err) {
            console.error(`Refetch email ${seqNum} error: ${(err as Error).message}`);
          }
        }

        await imap.logout();
      } catch (err) {
        try { await imap.logout(); } catch (_e) { /* */ }
        return new Response(JSON.stringify({ success: false, message: (err as Error).message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msgParts = [];
      if (contentUpdated) msgParts.push("conteúdo atualizado");
      if (messagesAdded > 0) msgParts.push(`${messagesAdded} mensagem(ns) adicionada(s)`);
      if (pendingAttachments.length > 0) msgParts.push(`${pendingAttachments.length} anexo(s) para importar`);
      if (msgParts.length === 0) msgParts.push("Nenhum conteúdo novo encontrado");

      return new Response(JSON.stringify({
        success: true,
        message: msgParts.join(", "),
        pending_attachments: pendingAttachments,
        content_updated: contentUpdated,
        messages_added: messagesAdded,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Process emails - 1 at a time, frontend loop handles iteration
    const result = await processEmails({ fetchRecent, maxEmails, agentId, offset, searchDays });
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
