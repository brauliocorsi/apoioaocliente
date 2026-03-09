import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Send, Mail, User, Clock, Paperclip, Download, FileText, Image } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";

// Check if content looks like HTML
function isHtmlContent(text: string): boolean {
  if (!text) return false;
  return /<\w+[^>]*>/.test(text) && (text.includes("</") || text.includes("/>"));
}

// Sanitize HTML for safe rendering (extra frontend layer)
function sanitizeForDisplay(html: string): string {
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  safe = safe.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  return safe;
}

// Clean plain text email
function cleanEmailText(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/^BODY\[TEXT\].*?Content-Transfer-Encoding:\s*\S+\s*/is, "");
  cleaned = cleaned.replace(/Content-Type:\s*[^\r\n]+[\r\n]*/gi, "");
  cleaned = cleaned.replace(/Content-Transfer-Encoding:\s*[^\r\n]+[\r\n]*/gi, "");
  cleaned = cleaned.replace(/=\r?\n/g, "");
  cleaned = cleaned.replace(/=([0-9A-Fa-f]{2})/g, (_match: string, hex: string) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  try {
    const bytes = new Uint8Array([...cleaned].map(c => c.charCodeAt(0)));
    cleaned = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch { /* keep as-is */ }
  cleaned = cleaned.replace(/--[0-9a-f]{20,}--?/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

function EmailBody({ content }: { content: string }) {
  if (!content) return null;

  if (isHtmlContent(content)) {
    // Clean up email cruft: remove quoted replies, signatures, excessive whitespace
    let cleaned = sanitizeForDisplay(content);
    // Remove common email client quote markers
    cleaned = cleaned.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "");
    // Remove "On ... wrote:" patterns
    cleaned = cleaned.replace(/(<br\s*\/?>|\n)\s*Em\s+.*?escreveu:[\s\S]*$/i, "");
    cleaned = cleaned.replace(/(<br\s*\/?>|\n)\s*On\s+.*?wrote:[\s\S]*$/i, "");
    // Remove excessive <br> sequences
    cleaned = cleaned.replace(/(<br\s*\/?>[\s]*){3,}/gi, "<br><br>");

    return (
      <div
        className="email-html-content text-sm prose prose-sm dark:prose-invert max-w-none 
          [&_img]:max-w-full [&_img]:h-auto [&_table]:border-collapse [&_td]:p-1 
          [&_a]:text-primary [&_a]:underline [&_p]:my-1 [&_br+br+br]:hidden
          [&_*]:max-w-full overflow-hidden break-words"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
    );
  }

  const cleaned = cleanEmailText(content);
  // Remove quoted replies in plain text (lines starting with >)
  const lines = cleaned.split("\n");
  const filtered = [];
  for (const line of lines) {
    if (line.startsWith(">")) continue;
    if (/^Em .+ escreveu:/.test(line)) break;
    if (/^On .+ wrote:/.test(line)) break;
    filtered.push(line);
  }

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{filtered.join("\n").trim()}</p>;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <Image className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmailTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { statuses } = useTicketStatuses();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});
  const [emailThread, setEmailThread] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    if (!id) return;
    const [{ data: t }, { data: msgs }, { data: thread }, { data: profiles }, { data: atts }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("email_threads" as any).select("*").eq("ticket_id", id).limit(1).single(),
      supabase.from("profiles").select("id, full_name, avatar_url"),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    ]);
    setTicket(t);
    setMessages(msgs || []);
    setEmailThread(thread);
    setAttachments(atts || []);
    const profileMap: Record<string, { full_name: string; avatar_url?: string | null }> = {};
    ((profiles as any[]) || []).forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
    setAgents(profileMap);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`email-ticket-msgs-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            const newMsg = payload.new as any;
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!id || !user) return;
    supabase.from("ticket_read_status").upsert(
      { ticket_id: id, agent_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "ticket_id,agent_id" }
    );
  }, [id, user]);

  const sendEmailReply = async () => {
    if (!id || !user || !reply.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("reply-email-ticket", {
        body: { ticket_id: id, content: reply.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Email enviado com sucesso" });
      setReply("");
      fetchData();
    } catch (err) {
      toast({ title: "Erro ao enviar email", description: (err as Error).message, variant: "destructive" });
    }
    setSending(false);
  };

  const updateStatus = async (newStatus: string) => {
    if (!id || !user) return;
    await supabase.from("tickets").update({ status: newStatus, status_changed_at: new Date().toISOString() }).eq("id", id);
    toast({ title: "Estado atualizado" });
    fetchData();
  };

  const updatePriority = async (newPriority: string) => {
    if (!id) return;
    await supabase.from("tickets").update({ priority: newPriority as any }).eq("id", id);
    toast({ title: "Prioridade atualizada" });
    fetchData();
  };

  const updateAssignment = async (agentId: string) => {
    if (!id) return;
    await supabase.from("tickets").update({ assigned_to: agentId === "unassigned" ? null : agentId }).eq("id", id);
    toast({ title: "Agente atualizado" });
    fetchData();
  };

  const downloadAttachment = (att: any) => {
    const { data } = supabase.storage.from("ticket-attachments").getPublicUrl(att.file_path);
    window.open(data.publicUrl, "_blank");
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket não encontrado</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/email-tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] gap-1">
              <Mail className="h-3 w-3" /> Email
            </Badge>
            <span className="text-sm font-mono text-muted-foreground">#{ticket.ticket_number}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight truncate mt-0.5">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {ticket.client_name}
            {ticket.client_email ? ` · ${ticket.client_email}` : ""}
            {emailThread ? ` · Thread: ${emailThread.email_address}` : ""}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <Select value={ticket.status} onValueChange={updateStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ticket.priority} onValueChange={updatePriority}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="P1">P1 Urgente</SelectItem>
            <SelectItem value="P2">P2 Normal</SelectItem>
            <SelectItem value="P3">P3 Baixa</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ticket.assigned_to || "unassigned"} onValueChange={updateAssignment}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Atribuir a..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Não atribuído</SelectItem>
            {Object.entries(agents).map(([id, a]) => (
              <SelectItem key={id} value={id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description (original email) */}
      {ticket.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email original
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmailBody content={ticket.description} />
            <p className="text-xs text-muted-foreground mt-3">
              {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Anexos ({attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => downloadAttachment(att)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left w-full group"
                >
                  <div className="shrink-0 h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    {getFileIcon(att.file_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{att.file_name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(att.file_size)}</p>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Conversa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          <div className="max-h-[400px] overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Sem mensagens ainda</p>
            )}
            {messages.map((msg) => {
              const isAgent = msg.sender_type === "agent";
              const senderName = isAgent
                ? (agents[msg.sender_id]?.full_name || "Agente")
                : (ticket.client_name || "Cliente");

              return (
                <div key={msg.id} className={`flex gap-3 ${isAgent ? "flex-row-reverse" : ""}`}>
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={`text-xs ${isAgent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {isAgent ? <User className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] ${isAgent ? "text-right" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{senderName}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: pt })}
                      </span>
                      {isAgent && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/20 text-primary">
                          via email
                        </Badge>
                      )}
                    </div>
                    <div className={`rounded-xl px-4 py-2.5 text-sm ${isAgent ? "bg-primary/10 text-foreground" : "bg-muted"}`}>
                      <EmailBody content={msg.content} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply */}
          <div className="border-t p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Send className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Responder por email</span>
              {ticket.client_email && (
                <span className="text-xs text-muted-foreground">→ {ticket.client_email}</span>
              )}
            </div>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Escreva a sua resposta... (será enviada como email ao cliente)"
              rows={4}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  sendEmailReply();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Ctrl+Enter para enviar</p>
              <Button onClick={sendEmailReply} disabled={sending || !reply.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar Email
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
