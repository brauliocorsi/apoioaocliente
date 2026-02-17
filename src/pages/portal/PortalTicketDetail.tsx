import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Send, Paperclip, FileText, Download, X, FileImage, FileVideo } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function PortalTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useClientAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, { name: string; color: string }>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    if (!id || !user) return;
    const [{ data: t }, { data: msgs }, { data: sts }, { data: atts }] = await Promise.all([
      supabase.from("tickets").select("id, ticket_number, subject, status, created_at, description, resolution_type, resolution_reason, resolution_client_reason, resolution_at").eq("id", id).single(),
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

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicating optimistic messages
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

    // Upload files first
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

    // Build message content with attachment references
    let content = message.trim();
    if (uploadedPaths.length > 0 && !content) {
      content = `📎 ${pendingFiles.length} anexo(s) enviado(s)`;
    } else if (uploadedPaths.length > 0) {
      content += `\n📎 ${uploadedPaths.length} anexo(s) enviado(s)`;
    }

    if (content) {
      // Optimistically add message to local state
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

    // Refresh attachments list
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
            <p className="text-sm whitespace-pre-wrap">{ticket.resolution_client_reason || ticket.resolution_reason}</p>
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
                      <iframe
                        src={`${att.url}#toolbar=0&navpanes=0`}
                        className="w-full h-32 pointer-events-none"
                        title={att.file_name}
                      />
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
    </div>
  );
}
