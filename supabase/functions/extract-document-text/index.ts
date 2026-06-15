import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
// @ts-ignore - npm specifier resolved by Deno
import pdfParse from "npm:pdf-parse@1.1.1";
// @ts-ignore
import mammoth from "npm:mammoth@1.8.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub;

    const admin = createClient(supabaseUrl, serviceKey);

    // Check supervisor role
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "supervisor").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: supervisor only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: doc, error: docErr } = await admin.from("company_documents").select("*").eq("id", document_id).maybeSingle();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: fileData, error: dlErr } = await admin.storage.from("company-documents").download(doc.file_path);
    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: "Could not download file: " + (dlErr?.message || "unknown") }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const buf = new Uint8Array(await fileData.arrayBuffer());
    let text = "";

    const type = (doc.file_type || "").toLowerCase();
    try {
      if (type.includes("pdf") || doc.file_path.toLowerCase().endsWith(".pdf")) {
        const parsed = await pdfParse(buf);
        text = String(parsed?.text || "").trim();
      } else if (type.includes("word") || type.includes("officedocument") || doc.file_path.toLowerCase().endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer: buf });
        text = String(result?.value || "").trim();
      } else {
        // Plain text fallback
        text = new TextDecoder("utf-8", { fatal: false }).decode(buf).trim();
      }
    } catch (e) {
      console.error("Extraction failed", e);
      text = "";
    }

    // Limit to 200k chars
    if (text.length > 200_000) text = text.slice(0, 200_000);

    const { error: updErr } = await admin
      .from("company_documents")
      .update({ extracted_text: text })
      .eq("id", document_id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, chars: text.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
