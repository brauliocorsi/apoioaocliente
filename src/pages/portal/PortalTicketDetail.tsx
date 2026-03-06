import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Send, Paperclip, FileText, Download, X, FileImage, FileVideo, MessageSquare, Clock, Tag, Layers, UserCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { v4 as uuidv4 } from "uuid";
import MessageReactions from "@/components/chat/MessageReactions";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function PortalTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useClientAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, { name: string; color: string }>>({});

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    if (!id || !user) return;
    const [{ data: t }, { data: msgs }, { data: sts }, { data: atts }, { data: evts }, { data: docs }] = await Promise.all([
      supabase
        .from("tickets")
        .select(`
          id, ticket_number, subject, status, created_at, description,
          resolution_type, resolution_reason, resolution_client_reason, resolution_at,
          category_id, subcategory_id, assigned_to,
          categories:category_id(name),
          subcategories:subcategory_id(name),
          profiles:assigned_to(full_name, avatar_url)
        `)
        .eq("id", id)
        .single(),
      supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_statuses").select("id, name, color").order("sort_order"),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase
        .from("ticket_events")
        .select("id, event_type, content, created_at, metadata")
        .eq("ticket_id", id)
        .in("event_type", ["status_change", "created"])
        .order("created_at", { ascending: true }),
      supabase
        .from("ticket_documents" as any)
        .select("id, document_type, file_name, file_path, file_type, file_size, created_at")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
    ]);
    setTicket(t);
    setMessages(msgs || []);
    setEvents(evts || []);
    const map: Record<string, { name: string; color: string }> = {};
    (sts || []).forEach((s: any) => { map[s.id] = { name: s.name, color: s.color }; });
    setStatuses(map);

    setAttachments((atts || []).map((a: any) => ({
      ...a,
      url: supabase.storage.from("ticket-attachments").getPublicUrl(a.file_path).data.publicUrl,
    })));
    setDocuments(((docs as any[]) || []).map((d: any) => ({
      ...d,
      url: supabase.storage.from("ticket-attachments").getPublicUrl(d.file_path).data.publicUrl,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, user]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.content === (payload.new as any).content && m.sender_id === (payload.new as any).sender_id && Math.abs(new Date(m.created_at).getTime() - new Date((payload.new as any).created_at).getTime()) < 10000)) {
              return prev.map((m) =>
                m.content === (payload.new as any).content && m.sender_id === (payload.new as any).sender_id && Math.abs(new Date(m.created_at).getTime() - new Date((payload.new as any).created_at).getTime()) < 10000
                  ? payload.new as any
                  : m
              );
            }
            return [...prev, payload.new];
          });
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_attachments", filter: `ticket_id=eq.${id}` },
        (payload) => {
          const a = payload.new as any;
          setAttachments((prev) => {
            if (prev.some((x) => x.id === a.id)) return prev;
            return [...prev, {
              ...a,
              url: supabase.storage.from("ticket-attachments").getPublicUrl(a.file_path).data.publicUrl,
            }];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: `${f.name} excede 20MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    if (!id || !user) return;
    if (!message.trim() && pendingFiles.length === 0) return;
    setSending(true);

    const uploadedPaths: string[] = [];
    for (const file of pendingFiles) {
      const ext = file.name.split(".").pop();
      const filePath = `${id}/${uuidv4()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: "Erro no upload", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
        continue;
      }

      await supabase.from("ticket_attachments").insert({
        ticket_id: id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
      uploadedPaths.push(filePath);
    }

    let content = message.trim();
    if (uploadedPaths.length > 0 && !content) {
      content = `📎 ${pendingFiles.length} anexo(s) enviado(s)`;
    } else if (uploadedPaths.length > 0) {
      content += `\n📎 ${uploadedPaths.length} anexo(s) enviado(s)`;
    }

    if (content) {
      const optimisticMsg = {
        id: crypto.randomUUID(),
        ticket_id: id,
        sender_id: user.id,
        sender_type: "client",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setMessage("");
      setPendingFiles([]);
      setSending(false);

      await supabase.from("ticket_messages").insert({
        ticket_id: id,
        sender_id: user.id,
        sender_type: "client",
        content,
      });
    } else {
      setMessage("");
      setPendingFiles([]);
      setSending(false);
    }

    if (uploadedPaths.length > 0) {
      fetchData();
    }
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
  const categoryName = (ticket.categories as any)?.name;
  const subcategoryName = (ticket.subcategories as any)?.name;
  const assignedAgent = ticket.profiles as { full_name: string; avatar_url: string | null } | null;

  // Build timeline: ticket creation + status change events
  const timelineItems: { date: string; label: string; statusId?: string; isFirst?: boolean }[] = [
    { date: ticket.created_at, label: "Ticket aberto", isFirst: true },
    ...events
      .filter((e) => e.event_type === "status_change")
      .map((e) => {
        const meta = e.metadata as any;
        const toStatusId = meta?.to || meta?.status_id || "";
        const toStatusName = statuses[toStatusId]?.name || toStatusId;
        return {
          date: e.created_at,
          label: `Estado alterado para "${toStatusName}"`,
          statusId: toStatusId,
        };
      }),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate("/portal/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold leading-tight">
            <span className="text-muted-foreground font-normal text-base">#{ticket.ticket_number}</span>
            {" "}
            <span className="break-words">{ticket.subject}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aberto em {new Date(ticket.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        {/* Status badge */}
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 border shrink-0"
          style={st ? { backgroundColor: st.color + "12", borderColor: st.color + "40" } : {}}
        >
          <span className="h-2 w-2 rounded-full animate-pulse" style={st ? { backgroundColor: st.color } : {}} />
          <span className="text-xs font-semibold" style={st ? { color: st.color } : {}}>
            {st?.name || ticket.status}
          </span>
        </div>
      </div>

      {/* Category + Subcategory highlight */}
      {(categoryName || subcategoryName) && (
        <div className="flex items-center gap-2 flex-wrap">
          {categoryName && (
            <div className="flex items-center gap-1.5 bg-primary/8 border border-primary/20 rounded-md px-3 py-1.5">
              <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-primary">{categoryName}</span>
            </div>
          )}
          {subcategoryName && (
            <div className="flex items-center gap-1.5 bg-muted border border-border rounded-md px-3 py-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">{subcategoryName}</span>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {ticket.description && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Descrição</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{ticket.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Resolution card */}
      {ticket.resolution_type && (
        <Card className={`border-2 ${ticket.resolution_type === "resolved" ? "border-green-500/40 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50/50 dark:bg-red-950/20"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {ticket.resolution_type === "resolved" ? "✅ Resolução Formal" : "❌ Cancelamento Formal"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{ticket.resolution_client_reason || ticket.resolution_reason}</p>
            <p className="text-xs text-muted-foreground">
              Decisão registada em {new Date(ticket.resolution_at).toLocaleString("pt-PT")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
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
                const isPdf = att.file_type === "application/pdf";
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
                    ) : isPdf ? (
                      <iframe src={`${att.url}#toolbar=0&navpanes=0`} className="w-full h-32 pointer-events-none" title={att.file_name} />
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

      {/* Documents */}
      {documents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documentos ({documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documents.map((doc: any) => {
                const typeLabels: Record<string, string> = {
                  fatura: "Fatura",
                  laudo_tecnico: "Laudo Técnico",
                  orcamento: "Orçamento",
                  comprovativo: "Comprovativo",
                  outro: "Outro",
                };
                return (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2.5 border rounded-lg hover:border-primary/50 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeLabels[doc.document_type] || doc.document_type}
                        {" · "}
                        {doc.file_size < 1024 * 1024
                          ? `${(doc.file_size / 1024).toFixed(0)} KB`
                          : `${(doc.file_size / (1024 * 1024)).toFixed(1)} MB`}
                      </p>
                    </div>
                    <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main tabs: Messages + Timeline */}
      <Tabs defaultValue="messages" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="messages" className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Mensagens
            {messages.length > 0 && (
              <span className="ml-1 text-xs bg-muted-foreground/20 rounded-full px-1.5 py-0.5 leading-none">
                {messages.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Messages tab */}
        <TabsContent value="messages" className="mt-2">
          <Card className="flex flex-col" style={{ minHeight: "380px" }}>
            <CardContent className="flex-1 flex flex-col pt-4">
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[360px]">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Sem mensagens. Envie uma mensagem para iniciar a conversa.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`group flex ${msg.sender_type === "client" ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[75%] space-y-1">
                        <div
                          className={`rounded-lg px-4 py-2 text-sm ${
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
                        {user && (
                          <MessageReactions
                            messageId={msg.id}
                            userId={user.id}
                            align={msg.sender_type === "client" ? "right" : "left"}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Pending files preview */}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 p-2 rounded-md bg-muted/50 border">
                  {pendingFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-background rounded px-2 py-1 text-xs border">
                      {file.type.startsWith("image/") ? (
                        <FileImage className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : file.type.startsWith("video/") ? (
                        <FileVideo className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate max-w-[120px]">{file.name}</span>
                      <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                      <button onClick={() => removePendingFile(i)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 border-t pt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  placeholder="Escreva a sua mensagem..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="flex-1 resize-none"
                />
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={sending || (!message.trim() && pendingFiles.length === 0)}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline tab */}
        <TabsContent value="timeline" className="mt-2">
          <Card>
            <CardContent className="pt-5 pb-4">
              {timelineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem histórico disponível.</p>
              ) : (
                <ol className="relative border-l border-border ml-2 space-y-0">
                  {timelineItems.map((item, i) => {
                    const stInfo = item.statusId ? statuses[item.statusId] : null;
                    const isLast = i === timelineItems.length - 1;
                    return (
                      <li key={i} className={`ml-4 ${isLast ? "pb-0" : "pb-5"}`}>
                        {/* Dot */}
                        <span
                          className="absolute -left-[5px] flex h-2.5 w-2.5 items-center justify-center rounded-full ring-4 ring-background"
                          style={{
                            backgroundColor: stInfo
                              ? stInfo.color
                              : item.isFirst
                              ? "hsl(var(--primary))"
                              : "hsl(var(--muted-foreground))",
                          }}
                        />
                        {/* Content */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-xs font-medium text-foreground leading-tight">{item.label}</p>
                          <time className="text-[11px] text-muted-foreground">
                            {new Date(item.date).toLocaleString("pt-PT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
