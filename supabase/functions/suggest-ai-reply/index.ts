import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MAX_MESSAGES = 40;
const MAX_MSG_CHARS = 2000;
const MAX_DOC_CHARS = 30_000;
const MAX_IMAGES = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonErr("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonErr("LOVABLE_API_KEY missing", 500);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) return jsonErr("Unauthorized", 401);
    const userId = claims.claims.sub;

    const admin = createClient(supabaseUrl, serviceKey);

    // Validate the caller is an active agent/supervisor
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["agent", "supervisor"])
      .maybeSingle();
    if (!roleRow) return jsonErr("Forbidden", 403);

    const body = await req.json().catch(() => ({}));
    const { ticket_id, include_images, extra_instructions } = body as {
      ticket_id?: string; include_images?: boolean; extra_instructions?: string;
    };
    if (!ticket_id) return jsonErr("ticket_id required", 400);

    // Load ticket + agent profile + messages in parallel
    const [{ data: ticket }, { data: agentProfile }] = await Promise.all([
      admin.from("tickets").select("id, ticket_number, subject, description, client_name, client_email, order_number, category_id, subcategory_id, status, priority").eq("id", ticket_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    if (!ticket) return jsonErr("Ticket not found", 404);

    const [{ data: messages }, { data: docs }, { data: attachments }, { data: category }, { data: subcategory }] = await Promise.all([
      admin.from("ticket_messages")
        .select("sender_type, sender_name, content, created_at")
        .eq("ticket_id", ticket_id)
        .order("created_at", { ascending: true })
        .limit(200),
      admin.from("company_documents").select("title, extracted_text").eq("is_active", true).not("extracted_text", "is", null),
      include_images
        ? admin.from("ticket_attachments").select("file_path, file_type, file_name").eq("ticket_id", ticket_id).like("file_type", "image/%").limit(MAX_IMAGES)
        : Promise.resolve({ data: [] as any[] }),
      ticket.category_id ? admin.from("categories").select("name").eq("id", ticket.category_id).maybeSingle() : Promise.resolve({ data: null }),
      ticket.subcategory_id ? admin.from("subcategories").select("name").eq("id", ticket.subcategory_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    // Build T&C context
    let docContext = "";
    let docCount = 0;
    for (const d of (docs || [])) {
      if (!d.extracted_text) continue;
      const remaining = MAX_DOC_CHARS - docContext.length;
      if (remaining <= 200) break;
      const chunk = (d.extracted_text as string).slice(0, remaining);
      docContext += `\n\n# ${d.title}\n${chunk}`;
      docCount += 1;
    }

    // Conversation
    const recentMsgs = (messages || []).slice(-MAX_MESSAGES);
    const conversation = recentMsgs.map((m: any) => {
      const who = m.sender_type === "client" ? `CLIENTE (${m.sender_name || ticket.client_name || ""})` : `AGENTE (${m.sender_name || ""})`;
      const content = String(m.content || "").slice(0, MAX_MSG_CHARS);
      return `[${who}]\n${content}`;
    }).join("\n\n---\n\n");

    // Signed image URLs (when requested)
    const imageBlocks: any[] = [];
    let usedImages = false;
    if (include_images && attachments && attachments.length > 0) {
      for (const a of attachments) {
        const { data: signed } = await admin.storage.from("ticket-attachments").createSignedUrl(a.file_path, 120);
        if (signed?.signedUrl) {
          imageBlocks.push({ type: "image_url", image_url: { url: signed.signedUrl } });
        }
      }
      usedImages = imageBlocks.length > 0;
    }

    const agentName = agentProfile?.full_name || "Equipa de Apoio";
    const systemPrompt = `Es o assistente de redação da equipa de Apoio ao Cliente da UP Móveis.
A tua tarefa é sugerir UMA resposta formal, empática e profissional em Português europeu (PT-PT) para o agente enviar ao cliente.

REGRAS OBRIGATÓRIAS:
- Usa exclusivamente PT-PT (ex.: "obrigado", "está", "encontra-se", "atualizar"). Nunca PT-BR.
- Tom formal mas humano. Trata o cliente por "o(a) Sr.(a)" quando aplicável; caso contrário, usa "Caro(a) ${ticket.client_name || "cliente"}".
- Baseia respostas factuais EXCLUSIVAMENTE nos Termos & Condições da empresa fornecidos. Se algo não estiver coberto, indica que vais validar internamente — NUNCA inventes prazos, garantias ou valores.
- Não prometas nada que não esteja documentado.
- Mantém entre 80 e 220 palavras. Parágrafos curtos.
- Termina com a assinatura:
"Com os melhores cumprimentos,
${agentName}
Apoio ao Cliente — UP Móveis"
- Devolves apenas o corpo da mensagem pronto a enviar. Sem prefácios, sem "Aqui está", sem markdown extra.`;

    const ticketContext = `## Contexto do ticket
- Nº ticket: #${ticket.ticket_number}
- Assunto: ${ticket.subject || "(sem assunto)"}
- Categoria: ${(category as any)?.name || "—"} / ${(subcategory as any)?.name || "—"}
- Encomenda: ${ticket.order_number || "—"}
- Cliente: ${ticket.client_name || "—"}
- Prioridade: ${ticket.priority || "—"}
- Estado atual: ${ticket.status || "—"}
- Descrição inicial: ${(ticket.description || "").slice(0, 1500)}`;

    const tcContext = docContext
      ? `## Termos & Condições / Políticas internas\n${docContext}`
      : `## Termos & Condições\n(Nenhum documento ativo carregado. Responde com base apenas em práticas gerais e indica que vais validar internamente o que não estiver claro.)`;

    const convoContext = `## Histórico da conversa (cronológico)\n${conversation || "(sem mensagens anteriores)"}`;

    const extra = extra_instructions ? `\n\n## Instruções adicionais do agente\n${extra_instructions.slice(0, 500)}` : "";

    const userTextContent = `${ticketContext}\n\n${tcContext}\n\n${convoContext}${extra}\n\nGera agora a resposta formal a enviar ao cliente.`;

    const model = include_images && imageBlocks.length > 0 ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const userContent: any = include_images && imageBlocks.length > 0
      ? [{ type: "text", text: userTextContent }, ...imageBlocks]
      : userTextContent;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (aiResp.status === 429) return jsonErr("Limite de pedidos atingido. Tente novamente em breve.", 429);
    if (aiResp.status === 402) return jsonErr("Sem créditos disponíveis no gateway de IA. Contacte o administrador.", 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return jsonErr("Falha na geração de resposta", 500);
    }

    const data = await aiResp.json();
    const suggestion = (data?.choices?.[0]?.message?.content || "").trim();
    if (!suggestion) return jsonErr("Sem resposta gerada", 500);

    return new Response(JSON.stringify({
      suggestion,
      model,
      used_images: usedImages,
      image_count: imageBlocks.length,
      doc_count: docCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return jsonErr(e instanceof Error ? e.message : "Unknown error", 500);
  }
});

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
