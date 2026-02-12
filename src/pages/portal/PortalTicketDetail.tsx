import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Send, Paperclip, FileText, Download } from "lucide-react";

export default function PortalTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useClientAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, { name: string; color: string }>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    if (!id || !user) return;
    const [{ data: t }, { data: msgs }, { data: sts }, { data: atts }] = await Promise.all([
      supabase.from("tickets").select("id, ticket_number, subject, status, created_at, description, resolution_type, resolution_reason, resolution_at").eq("id", id).single(),
      supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_statuses").select("id, name, color").order("sort_order"),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    ]);
    setTicket(t);
    setMessages(msgs || []);
    const map: Record<string, { name: string; color: string }> = {};
    (sts || []).forEach((s: any) => { map[s.id] = { name: s.name, color: s.color }; });
    setStatuses(map);
    setAttachments((atts || []).map((a: any) => ({
      ...a,
      url: supabase.storage.from("ticket-attachments").getPublicUrl(a.file_path).data.publicUrl,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, user]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!id || !user || !message.trim()) return;
    setSending(true);
    await supabase.from("ticket_messages").insert({
      ticket_id: id,
      sender_id: user.id,
      sender_type: "client",
      content: message.trim(),
    });
    setMessage("");
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket não encontrado</div>;

  const st = statuses[ticket.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">#{ticket.ticket_number} – {ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            Criado em {new Date(ticket.created_at).toLocaleDateString("pt-PT")}
          </p>
        </div>
        <Badge
          variant="secondary"
          style={st ? { backgroundColor: st.color + "20", color: st.color, borderColor: st.color + "40" } : {}}
          className="border text-sm"
        >
          {st?.name || ticket.status}
        </Badge>
      </div>

      {ticket.description && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Descrição</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
          </CardContent>
        </Card>
      )}

      {ticket.resolution_type && (
        <Card className={`border-2 ${ticket.resolution_type === "resolved" ? "border-green-500/40 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50/50 dark:bg-red-950/20"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {ticket.resolution_type === "resolved" ? "✅ Resolução Formal" : "❌ Cancelamento Formal"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{ticket.resolution_reason}</p>
            <p className="text-xs text-muted-foreground">
              Decisão registada em {new Date(ticket.resolution_at).toLocaleString("pt-PT")}
            </p>
          </CardContent>
        </Card>
      )}

      {attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Anexos ({attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {attachments.map((att) => {
                const isImage = att.file_type?.startsWith("image/");
                const isVideo = att.file_type?.startsWith("video/");
                return (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                  >
                    {isImage ? (
                      <img src={att.url} alt={att.file_name} className="w-full h-32 object-cover" />
                    ) : isVideo ? (
                      <video src={att.url} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center bg-muted">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-2 flex items-center gap-1">
                      <Download className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className="text-xs truncate">{att.file_name}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="flex flex-col" style={{ minHeight: "400px" }}>
        <CardHeader><CardTitle className="text-sm">Mensagens</CardTitle></CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[400px]">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sem mensagens. Envie uma mensagem para iniciar a conversa.
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === "client" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                      msg.sender_type === "client"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender_type === "client" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(msg.created_at).toLocaleString("pt-PT")}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2 border-t pt-3">
            <Textarea
              placeholder="Escreva a sua mensagem..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="flex-1 resize-none"
            />
            <Button size="icon" onClick={sendMessage} disabled={sending || !message.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
