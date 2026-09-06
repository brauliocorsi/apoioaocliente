import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Clock, Send, MessageSquare, Paperclip, X, FileImage, FileVideo, FileText, Trash2, Gavel, ChevronDown, ChevronRight, Check, Mail, Maximize2, Minimize2, AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DecisionEngine, type RuleSuggestion, type DecisionRule } from "@/lib/decisionEngine";
import { v4 as uuidv4 } from "uuid";
import FileUpload from "@/components/FileUpload";
import MacroSelector from "@/components/ticket/MacroSelector";
import AiSuggestionDialog from "@/components/ticket/AiSuggestionDialog";
import TicketSidebar from "@/components/ticket/TicketSidebar";
import SlaIndicator from "@/components/ticket/SlaIndicator";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import MentionTextarea from "@/components/MentionTextarea";
import ResolutionCard from "@/components/ticket/ResolutionCard";
import MessageReactions from "@/components/chat/MessageReactions";
import { useTicketRefetch } from "@/hooks/useTicketRefetch";
import { RefetchSummaryCard } from "@/components/ticket/RefetchSummaryCard";
import { TicketContinuationBadges } from "@/components/ticket/TicketContinuationBadges";
import TicketTimeline from "@/components/ticket/TicketTimeline";
import WmsDeliveryCard from "@/components/ticket/WmsDeliveryCard";

import { EmailDeliveryBadge } from "@/components/ticket/EmailDeliveryBadge";
import { withSignedUrls } from "@/lib/attachmentUrl";

// Detect HTML content
function isHtmlContent(text: string): boolean {
  if (!text) return false;
  return /<\w+[^>]*>/.test(text) && (text.includes("</") || text.includes("/>"));
}

// Sanitize HTML for safe rendering
function sanitizeForDisplay(html: string): string {
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  safe = safe.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  // Fix charset meta tag to prevent browser re-interpretation
  safe = safe.replace(/<meta[^>]*charset[^>]*>/gi, '<meta charset="utf-8">');
  // Replace Unicode replacement characters with a visible placeholder
  safe = safe.replace(/\uFFFD+/g, "?");
  return safe;
}

// Clean raw MIME content (strip headers, decode quoted-printable)
function cleanMimeContent(text: string): string {
  if (!text) return text;
  // Strip IMAP BODY[TEXT] wrapper
  let cleaned = text.replace(/^BODY\[TEXT\]\s*\{\d+\}\s*/i, "");
  // Strip MIME boundaries and headers
  cleaned = cleaned.replace(/--[a-zA-Z0-9_-]+\s*(Content-Type:[^\n]+\n(Content-Transfer-Encoding:[^\n]+\n)*(charset=[^\n]+\n)*(\n)?)?/gi, "");
  cleaned = cleaned.replace(/Content-Type:\s*[^\r\n]+[\r\n]*/gi, "");
  cleaned = cleaned.replace(/Content-Transfer-Encoding:\s*[^\r\n]+[\r\n]*/gi, "");
  cleaned = cleaned.replace(/Content-Disposition:\s*[^\r\n]+[\r\n]*/gi, "");
  // Decode quoted-printable: first join soft line breaks, then decode byte sequences
  cleaned = cleaned.replace(/=\r?\n/g, "");
  // Collect all =XX sequences as bytes and decode as UTF-8
  cleaned = decodeQuotedPrintableUtf8(cleaned);
  // Also try to fix common HTML entity issues
  cleaned = cleaned.replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í").replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã").replace(/&otilde;/gi, "õ")
    .replace(/&ccedil;/gi, "ç").replace(/&Ccedil;/gi, "Ç")
    .replace(/&acirc;/gi, "â").replace(/&ecirc;/gi, "ê").replace(/&ocirc;/gi, "ô");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

// Properly decode quoted-printable with UTF-8 support
function decodeQuotedPrintableUtf8(input: string): string {
  // Replace sequences of =XX with properly decoded UTF-8
  const parts: (string | number[])[] = [];
  let i = 0;
  let currentBytes: number[] = [];

  while (i < input.length) {
    if (input[i] === "=" && i + 2 < input.length && /[0-9A-Fa-f]{2}/.test(input.substring(i + 1, i + 3))) {
      currentBytes.push(parseInt(input.substring(i + 1, i + 3), 16));
      i += 3;
    } else {
      if (currentBytes.length > 0) {
        parts.push(currentBytes);
        currentBytes = [];
      }
      parts.push(input[i]);
      i++;
    }
  }
  if (currentBytes.length > 0) {
    parts.push(currentBytes);
  }

  // Build result, decoding byte arrays as UTF-8
  let result = "";
  for (const part of parts) {
    if (typeof part === "string") {
      result += part;
    } else {
      try {
        const bytes = new Uint8Array(part);
        result += new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch {
        // Fallback: decode as Latin-1
        result += part.map(b => String.fromCharCode(b)).join("");
      }
    }
  }
  return result;
}

// Render content intelligently: HTML as HTML, MIME-encoded as cleaned text
function RichContent({ content, onViewFull }: { content: string; onViewFull?: () => void }) {
  if (!content) return <span className="text-muted-foreground">Sem conteúdo</span>;

  // Check if it has raw MIME artifacts
  const hasMimeArtifacts = content.includes("BODY[TEXT]") || content.includes("Content-Type:") || content.includes("Content-Transfer-Encoding:");
  const display = hasMimeArtifacts ? cleanMimeContent(content) : content;

  if (isHtmlContent(display)) {
    return (
      <div className="relative group">
        <div
          className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_img]:h-auto [&_table]:border-collapse [&_td]:p-1 [&_a]:text-primary [&_a]:underline [&_p]:my-1 [&_*]:max-w-full overflow-hidden break-words"
          dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(display) }}
        />
        {onViewFull && (
          <Button variant="ghost" size="sm" className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 text-[10px] gap-1" onClick={onViewFull}>
            <Maximize2 className="h-3 w-3" /> Ver completo
          </Button>
        )}
      </div>
    );
  }

  // Plain text: also clean any QP artifacts
  const plainDisplay = hasMimeArtifacts ? display : decodeQuotedPrintableUtf8(display);
  const trimmed = plainDisplay.trim();
  if (!trimmed || trimmed.replace(/\s/g, "").length === 0) {
    return <span className="text-muted-foreground italic text-xs">(Mensagem sem conteúdo de texto)</span>;
  }

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{trimmed}</p>;
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { statuses, statusLabels } = useTicketStatuses();
  const [ticket, setTicket] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [clauses, setClauses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const noteFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});
  const [clauseMap, setClauseMap] = useState<Record<string, { code: string; description: string }>>({});
  const [macroMap, setMacroMap] = useState<Record<string, string>>({});
  const [allMacros, setAllMacros] = useState<{ id: string; title: string; content: string }[]>([]);
  const [isResolutionOpen, setIsResolutionOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [hasEmailThread, setHasEmailThread] = useState(false);
  const [messagesFullscreen, setMessagesFullscreen] = useState(false);
  const [fullViewContent, setFullViewContent] = useState<string | null>(null);
  const [failedEmails, setFailedEmails] = useState<any[]>([]);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const { run: runRefetch, running: refetching, progress: refetchProgress, lastResult: refetchResult, retryByName: retryAttachment, clearResult: clearRefetch } = useTicketRefetch(id, ticket?.client_email);

  const handleRefetch = async () => {
    const res = await runRefetch();
    if (res) {
      toast({
        title: res.error ? "Erro na re-importação" : "Re-importação concluída",
        description: res.summary,
        variant: res.error ? "destructive" : undefined,
      });
      await fetchTicket();
    }
  };

  const fetchTicket = async () => {
    if (!id) return;
    const [{ data: t }, { data: evts }, { data: tTags }, { data: tClauses }, { data: tAttachments }, { data: msgs }, { data: allClauses }, { data: allMacrosData }, { data: rulesData }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_tags").select("tag_id").eq("ticket_id", id),
      supabase.from("ticket_clauses").select("clause_id").eq("ticket_id", id),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("clauses").select("id, code, description"),
      supabase.from("macros").select("id, title, content"),
      supabase.from("decision_rules" as any).select("*").eq("is_active", true).order("sort_order"),
    ]);
    setTicket(t);
    setEvents(evts || []);
    setMessages(msgs || []);
    // Check for email thread + failed emails
    if (t) {
      const [{ data: et }, { data: failedLogs }] = await Promise.all([
        supabase.from("email_threads").select("id").eq("ticket_id", id).limit(1).maybeSingle(),
        supabase.from("email_logs").select("id, created_at, delivery_status, delivery_details, error_message, subject")
          .eq("ticket_id", id)
          .or("status.eq.failed,delivery_status.in.(failed,bounced,complained)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      setHasEmailThread(!!(et || t.client_email));
      setFailedEmails(failedLogs || []);
    }
    setTags((tTags || []).map((r: any) => r.tag_id));
    setClauses((tClauses || []).map((r: any) => r.clause_id));
    setAttachments(await withSignedUrls((tAttachments || []) as any[]));

    // Build clause and macro maps
    const cMap: Record<string, { code: string; description: string }> = {};
    (allClauses || []).forEach((c: any) => { cMap[c.id] = { code: c.code, description: c.description }; cMap[c.code] = { code: c.code, description: c.description }; });
    setClauseMap(cMap);

    const mMap: Record<string, string> = {};
    (allMacrosData || []).forEach((m: any) => { mMap[m.id] = m.title; });
    setMacroMap(mMap);
    setAllMacros((allMacrosData || []) as { id: string; title: string; content: string }[]);

    if (t) {
      const currentTagIds = (tTags || []).map((r: any) => r.tag_id);
      const rules = ((rulesData as unknown) as DecisionRule[]) || [];
      const s = DecisionEngine.evaluateRules(t, currentTagIds, rules);
      setSuggestions(s);
      // Open resolution section if there's an existing resolution
      if (t.resolution_type) setIsResolutionOpen(true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTicket(); }, [id]);

  // Mark ticket as read for current agent
  useEffect(() => {
    if (!id || !user) return;

    const markAsRead = async () => {
      const { error } = await supabase.from("ticket_read_status").upsert(
        { ticket_id: id, agent_id: user.id, last_read_at: new Date().toISOString() },
        { onConflict: "ticket_id,agent_id" }
      );

      if (error) {
        console.error("Erro ao marcar ticket como lido:", error.message);
      }
    };

    void markAsRead();
  }, [id, user]);

  // Load agents for mentions + sender profiles for chat avatars
  useEffect(() => {
    const loadProfiles = async () => {
      const { data: agentData } = await supabase.from("profiles").select("id, full_name, avatar_url");
      const agentList = (agentData as any[] || []).map((p: any) => ({ id: p.id, full_name: p.full_name }));
      setAgents(agentList);
      
      const profileMap: Record<string, { full_name: string; avatar_url?: string | null }> = {};
      (agentData as any[] || []).forEach((p: any) => {
        profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      });

      // Also load client profiles
      const { data: clientData } = await supabase.from("client_users").select("id, full_name, avatar_url");
      (clientData as any[] || []).forEach((p: any) => {
        profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      });
      
      setSenderProfiles(profileMap);
    };
    loadProfiles();
  }, []);

  // Realtime for messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`agent-ticket-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            const newMsg = payload.new as any;
            // Replace optimistic message if it matches
            if (prev.some((m) => m.content === newMsg.content && m.sender_id === newMsg.sender_id && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000)) {
              return prev.map((m) =>
                m.content === newMsg.content && m.sender_id === newMsg.sender_id && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000
                  ? newMsg : m
              );
            }
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReplyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!id || !user) return;
    const oldStatus = ticket.status;
    const newStatusObj = statuses.find((s) => s.id === newStatus);
    const oldStatusObj = statuses.find((s) => s.id === oldStatus);
    
    const updates: any = { status: newStatus, status_changed_at: new Date().toISOString() };

    if (newStatusObj?.pauses_sla && !ticket.sla_paused_at) {
      updates.sla_paused_at = new Date().toISOString();
    } else if (oldStatusObj?.pauses_sla && !newStatusObj?.pauses_sla && ticket.sla_paused_at) {
      const pausedSeconds = Math.floor((Date.now() - new Date(ticket.sla_paused_at).getTime()) / 1000);
      updates.sla_paused_total_seconds = (ticket.sla_paused_total_seconds || 0) + pausedSeconds;
      updates.sla_paused_at = null;
    }

    if (newStatusObj?.is_resolved) updates.resolved_at = new Date().toISOString();

    if (newStatusObj?.sla_minutes) {
      updates.sla_stage_deadline_at = new Date(Date.now() + newStatusObj.sla_minutes * 60000).toISOString();
    } else {
      updates.sla_stage_deadline_at = null;
    }

    if (newStatusObj?.default_assign) {
      updates.assigned_to = newStatusObj.default_assign;
    }

    await supabase.from("tickets").update(updates).eq("id", id);
    await supabase.from("ticket_events").insert({
      ticket_id: id,
      user_id: user.id,
      event_type: "status_change",
      content: `Estado alterado: ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`,
      metadata: { from: oldStatus, to: newStatus },
    });

    // Check if status change email notifications are enabled
    const { data: notifySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "notify_status_change_email")
      .maybeSingle();

    if (notifySetting?.value === "true" && (ticket.client_user_id || ticket.client_email)) {
      supabase.functions.invoke("send-ticket-email", {
        body: { ticket_id: id, template_id: "status_changed" },
      }).then(({ error }) => {
        if (error) toast({ title: "Falha ao enviar notificação por email", description: error.message, variant: "destructive" });
      }).catch(() => {
        toast({ title: "Falha ao enviar notificação por email", variant: "destructive" });
      });
    }

    toast({ title: "Estado atualizado" });
    fetchTicket();
  };

  const addNote = async () => {
    if (!id || !user) return;
    if (!note.trim() && noteFiles.length === 0) return;
    setAddingNote(true);

    // Upload note files
    const uploadedNames: string[] = [];
    for (const file of noteFiles) {
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
      uploadedNames.push(file.name);
    }

    let content = note.trim();
    if (uploadedNames.length > 0 && !content) {
      content = `📎 Anexo(s): ${uploadedNames.join(", ")}`;
    } else if (uploadedNames.length > 0) {
      content += `\n📎 Anexo(s): ${uploadedNames.join(", ")}`;
    }

    if (content) {
      await supabase.from("ticket_events").insert({
        ticket_id: id,
        user_id: user.id,
        event_type: "note",
        content,
      });
    }

    // Extract @mentions and create notifications
    const mentionRegex = /@([\w\s]+?)(?=\s@|\s*$|[.,!?])/g;
    let match;
    while ((match = mentionRegex.exec(note)) !== null) {
      const mentionedName = match[1].trim();
      const mentionedAgent = agents.find(
        (a) => a.full_name.toLowerCase() === mentionedName.toLowerCase()
      );
      if (mentionedAgent && mentionedAgent.id !== user.id) {
        await supabase.from("agent_notifications").insert({
          recipient_id: mentionedAgent.id,
          sender_id: user.id,
          ticket_id: id,
          type: "mention",
          content: `mencionou-o no ticket #${ticket.ticket_number}: "${note.slice(0, 80)}${note.length > 80 ? "..." : ""}"`,
        });
      }
    }

    setNote("");
    setNoteFiles([]);
    setAddingNote(false);
    fetchTicket();
  };

  const handleNoteFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > 20 * 1024 * 1024) {
        toast({ title: `${f.name} excede 20MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setNoteFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  const sendReply = async () => {
    if (!id || !user) return;
    if (!reply.trim() && replyFiles.length === 0) return;
    setSendingReply(true);

    // Upload files
    const uploadedCount = replyFiles.length;
    const uploadedFilePaths: string[] = [];
    for (const file of replyFiles) {
      const ext = file.name.split(".").pop();
      const filePath = `${id}/${uuidv4()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: "Erro no upload", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
        continue;
      }

      uploadedFilePaths.push(filePath);
      await supabase.from("ticket_attachments").insert({
        ticket_id: id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
    }

    // Build message content
    let content = reply.trim();
    if (uploadedCount > 0 && !content) {
      content = `📎 ${uploadedCount} anexo(s) enviado(s)`;
    } else if (uploadedCount > 0) {
      content += `\n📎 ${uploadedCount} anexo(s) enviado(s)`;
    }

    if (content) {
      // Optimistically add message to local state
      const optimisticMsg = {
        id: crypto.randomUUID(),
        ticket_id: id,
        sender_id: user.id,
        sender_type: "agent",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      const originalReply = reply.trim();
      setReply("");
      setReplyFiles([]);
      setSendingReply(false);

      // Check if ticket has an email thread — if so, send via edge function (which also inserts the message)
      const { data: emailThread } = await supabase
        .from("email_threads")
        .select("id")
        .eq("ticket_id", id)
        .limit(1)
        .maybeSingle();

      if (emailThread || ticket?.client_email) {
        try {
          const { error: emailError } = await supabase.functions.invoke("reply-email-ticket", {
            body: { 
              ticket_id: id, 
              content: originalReply || content,
              attachment_paths: uploadedFilePaths.length > 0 ? uploadedFilePaths : undefined,
            },
          });
          if (emailError) {
            console.error("Erro ao enviar email:", emailError);
            toast({ title: "Erro ao enviar email", description: "A resposta não foi enviada por email.", variant: "destructive" });
            // Fallback: insert message locally since edge function failed
            await supabase.from("ticket_messages").insert({
              ticket_id: id,
              sender_id: user.id,
              sender_type: "agent",
              content,
            });
          }
        } catch (emailErr) {
          console.error("Erro ao enviar email de resposta:", emailErr);
          toast({ title: "Mensagem guardada mas email não enviado", description: "A resposta foi registada mas houve um erro ao enviar o email.", variant: "destructive" });
          await supabase.from("ticket_messages").insert({
            ticket_id: id,
            sender_id: user.id,
            sender_type: "agent",
            content,
          });
        }
      } else {
        // No email thread — just insert message normally
        await supabase.from("ticket_messages").insert({
          ticket_id: id,
          sender_id: user.id,
          sender_type: "agent",
          content,
        });
      }

      if (uploadedCount > 0) fetchTicket();
    } else {
      setReply("");
      setReplyFiles([]);
      setSendingReply(false);
      if (uploadedCount > 0) fetchTicket();
    }
  };

  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > 20 * 1024 * 1024) {
        toast({ title: `${f.name} excede 20MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setReplyFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket não encontrado</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {editingSubject ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={subjectDraft}
                  onChange={(e) => setSubjectDraft(e.target.value)}
                  className="text-xl font-bold h-9"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && subjectDraft.trim()) {
                      await supabase.from("tickets").update({ subject: subjectDraft.trim() }).eq("id", id!);
                      toast({ title: "Assunto atualizado" });
                      setEditingSubject(false);
                      fetchTicket();
                    } else if (e.key === "Escape") {
                      setEditingSubject(false);
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={async () => {
                  if (subjectDraft.trim()) {
                    await supabase.from("tickets").update({ subject: subjectDraft.trim() }).eq("id", id!);
                    toast({ title: "Assunto atualizado" });
                    setEditingSubject(false);
                    fetchTicket();
                  }
                }}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingSubject(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-primary/80 transition-colors"
                onClick={() => { setSubjectDraft(ticket.subject); setEditingSubject(true); }}
                title="Clique para editar o assunto"
              >
                #{ticket.ticket_number} – {ticket.subject}
              </h1>
            )}
            <PriorityFlag priority={ticket.priority} showLabel />
          </div>
          <p className="text-sm text-muted-foreground">{ticket.client_name}{ticket.order_number ? ` · Enc. ${ticket.order_number}` : ""}{ticket.service_number ? ` · OS ${ticket.service_number}` : ""}</p>
          <TicketContinuationBadges ticketId={ticket.id} parentTicketId={(ticket as any).parent_ticket_id} />
        </div>
        <div className="flex items-center gap-2">
          {(ticket.client_email || hasEmailThread) && (
            <Button variant="outline" size="sm" onClick={handleRefetch} disabled={refetching} className="shrink-0 gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${refetching ? "animate-spin" : ""}`} />
              {refetching ? (refetchProgress || "A importar...") : "Re-importar e-mails e anexos"}
            </Button>
          )}
          <Select value={ticket.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {role === "supervisor" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Ticket #{ticket.ticket_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é irreversível. Todas as mensagens, eventos, anexos e dados associados serão permanentemente eliminados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      // Delete related data first
                      await Promise.all([
                        supabase.from("ticket_messages").delete().eq("ticket_id", id!),
                        supabase.from("ticket_events").delete().eq("ticket_id", id!),
                        supabase.from("ticket_tags").delete().eq("ticket_id", id!),
                        supabase.from("ticket_clauses").delete().eq("ticket_id", id!),
                        supabase.from("ticket_attachments").delete().eq("ticket_id", id!),
                        supabase.from("agent_notifications").delete().eq("ticket_id", id!),
                        supabase.from("phone_calls").update({ ticket_id: null } as any).eq("ticket_id", id!),
                        supabase.from("resolution_approvals").delete().eq("ticket_id", id!),
                        supabase.from("email_logs").delete().eq("ticket_id", id!),
                      ]);
                      const { error } = await supabase.from("tickets").delete().eq("id", id!);
                      if (error) {
                        toast({ title: "Erro ao excluir ticket", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Ticket excluído com sucesso" });
                        navigate("/tickets");
                      }
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {refetchResult && (
        <RefetchSummaryCard
          result={refetchResult}
          busy={refetching}
          onRetry={async (f) => { await retryAttachment(f); await fetchTicket(); }}
          onClose={clearRefetch}
        />
      )}


      {suggestions.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              ⚡ Sugestões do Motor de Regras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => {
              const missingTags = s.suggestedTags.filter((t) => !tags.includes(t));
              const missingClauses = s.suggestedClauses.filter((c) => !clauses.includes(c));

              const applyAll = async () => {
                if (!id) return;
                const tagInserts = missingTags.map((tagId) => ({ ticket_id: id, tag_id: tagId }));
                const clauseInserts = missingClauses.map((clauseId) => ({ ticket_id: id, clause_id: clauseId }));
                if (tagInserts.length > 0) await supabase.from("ticket_tags").insert(tagInserts);
                if (clauseInserts.length > 0) await supabase.from("ticket_clauses").insert(clauseInserts);
                toast({ title: "Tags e cláusulas aplicadas" });
                fetchTicket();
              };

              return (
                <div key={i} className="text-sm p-3 rounded-lg bg-background border space-y-2">
                  <p className="font-medium">{s.message}</p>

                  {s.suggestedTags.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium">Tags:</span>
                      {s.suggestedTags.map((tagId) => {
                        const alreadyApplied = tags.includes(tagId);
                        return (
                          <Badge
                            key={tagId}
                            variant={alreadyApplied ? "default" : "outline"}
                            className={`text-xs cursor-pointer ${alreadyApplied ? "opacity-60" : "hover:bg-primary/10"}`}
                            onClick={async () => {
                              if (alreadyApplied || !id) return;
                              await supabase.from("ticket_tags").insert({ ticket_id: id, tag_id: tagId });
                              toast({ title: "Tag aplicada" });
                              fetchTicket();
                            }}
                          >
                            {alreadyApplied ? "✓ " : "+ "}{tagId}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {s.suggestedClauses.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Cláusulas sugeridas:</p>
                      <div className="space-y-1">
                        {s.suggestedClauses.map((clauseId) => {
                          const clause = clauseMap[clauseId];
                          const alreadyApplied = clauses.includes(clauseId);
                          return (
                            <div key={clauseId} className="flex items-start gap-2 text-xs">
                              <Button
                                size="sm"
                                variant={alreadyApplied ? "secondary" : "outline"}
                                className="h-5 text-xs px-2 py-0 shrink-0"
                                disabled={alreadyApplied}
                                onClick={async () => {
                                  if (!id) return;
                                  await supabase.from("ticket_clauses").insert({ ticket_id: id, clause_id: clauseId });
                                  toast({ title: "Cláusula aplicada" });
                                  fetchTicket();
                                }}
                              >
                                {alreadyApplied ? "✓ Aplicada" : "+ Aplicar"}
                              </Button>
                              <span className="text-muted-foreground">
                                {clause
                                  ? <><span className="font-mono font-medium text-foreground">{clause.code}</span> — {clause.description}</>
                                  : <span className="font-mono">{clauseId}</span>
                                }
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {s.suggestedMacro && (() => {
                    const macroTitle = macroMap[s.suggestedMacro];
                    const macro = allMacros.find((m) => m.id === s.suggestedMacro);
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          Macro: <span className="font-mono font-medium text-foreground">{macroTitle || s.suggestedMacro}</span>
                        </span>
                        {macro && (
                          <Button size="sm" variant="outline" className="h-5 text-xs px-2 py-0" onClick={() => setReply(macro.content)}>
                            Usar Macro
                          </Button>
                        )}
                      </div>
                    );
                  })()}

                  {(missingTags.length > 0 || missingClauses.length > 0) && (
                    <Button size="sm" variant="default" className="h-6 text-xs" onClick={applyAll}>
                      <Check className="h-3 w-3 mr-1" /> Aplicar tudo
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <SlaIndicator ticket={ticket} />

      {/* Decisão Formal — Collapsible discreto */}
      <Collapsible open={isResolutionOpen} onOpenChange={setIsResolutionOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left">
            <Gavel className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Decisão Formal</span>
            {ticket.resolution_type === "resolved" && (
              <Badge variant="default" className="text-xs">✅ Resolvido</Badge>
            )}
            {ticket.resolution_type === "cancelled" && (
              <Badge variant="destructive" className="text-xs">❌ Cancelado</Badge>
            )}
            {!ticket.resolution_type && (
              <span className="text-xs text-muted-foreground">Sem decisão registada</span>
            )}
            {isResolutionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <ResolutionCard ticket={ticket} userId={user?.id || ""} onUpdate={fetchTicket} />
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Descrição</CardTitle></CardHeader>
            <CardContent>
              <RichContent content={ticket.description || "Sem descrição"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Anexos</CardTitle></CardHeader>
            <CardContent>
              <FileUpload
                ticketId={id}
                userId={user?.id || ""}
                attachments={attachments}
                onAttachmentsChange={async (newAtts) => {
                  const toInsert = newAtts.filter((a) => !a.id);
                  if (toInsert.length > 0) {
                    await supabase.from("ticket_attachments").insert(
                      toInsert.map((a) => ({
                        ticket_id: id!,
                        file_name: a.file_name,
                        file_path: a.file_path,
                        file_type: a.file_type,
                        file_size: a.file_size,
                        uploaded_by: user!.id,
                      }))
                    );
                  }
                  fetchTicket();
                }}
              />
            </CardContent>
          </Card>

          {/* Client Messages */}
          <Card className={messagesFullscreen ? "fixed inset-0 z-50 rounded-none flex flex-col" : ""}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagens do Cliente
                {messages.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{messages.length}</Badge>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMessagesFullscreen((v) => !v)}
                title={messagesFullscreen ? "Minimizar" : "Expandir em tela cheia"}
              >
                {messagesFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent className={`space-y-3 ${messagesFullscreen ? "flex-1 overflow-hidden flex flex-col" : ""}`}>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sem mensagens do cliente</p>
              ) : (
                <div className={`space-y-3 overflow-y-auto pr-1 ${messagesFullscreen ? "flex-1" : "max-h-[600px]"}`}>
                  {(() => {
                    const lastClientIdx = messages.reduce((acc, m, i) => m.sender_type === "client" ? i : acc, -1);
                    return messages.map((msg, idx) => {
                    const sender = senderProfiles[msg.sender_id];
                    const senderName = sender?.full_name || (msg.sender_type === "agent" ? "Agente" : "Cliente");
                    const senderInitials = senderName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                    const isAgent = msg.sender_type === "agent";
                    const isLastClientMsg = idx === lastClientIdx;

                    return (
                      <div
                        key={msg.id}
                        className={`group flex gap-2 ${isAgent ? "flex-row-reverse" : "flex-row"} ${isLastClientMsg ? "relative" : ""}`}
                      >
                        {isLastClientMsg && (
                          <div className="absolute -left-2 top-0 bottom-0 w-1 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        <Avatar className="h-7 w-7 shrink-0 mt-1">
                          <AvatarImage src={sender?.avatar_url || undefined} />
                          <AvatarFallback className={`text-[9px] font-semibold ${isAgent ? "bg-primary/20 text-primary" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                            {senderInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[85%] space-y-1`}>
                          <div
                            className={`rounded-lg px-4 py-2 text-sm ${
                              isAgent
                                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-800/50"
                                : isLastClientMsg
                                  ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 border border-blue-300 dark:border-blue-700/50 ring-2 ring-blue-400/50"
                                  : "bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200 border border-blue-200 dark:border-blue-800/40"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium mb-1">
                                {senderName}
                              </p>
                              {isLastClientMsg && (
                                <Badge className="text-[9px] h-4 px-1.5 mb-1 bg-blue-500 text-white border-0">
                                  Última
                                </Badge>
                              )}
                            </div>
                            <RichContent content={msg.content} onViewFull={() => setFullViewContent(msg.content)} />
                            {(msg as any).original_content && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setFullViewContent((msg as any).original_content); }}
                                className="text-[10px] mt-1 underline opacity-60 hover:opacity-100 transition-opacity"
                              >
                                Ver email original completo
                              </button>
                            )}
                            {/* Inline attachments matched by timestamp proximity */}
                            {(() => {
                              const msgTime = new Date(msg.created_at).getTime();
                              const msgAtts = attachments.filter((att: any) => {
                                const attTime = new Date(att.created_at).getTime();
                                return Math.abs(attTime - msgTime) < 30000; // within 30 seconds
                              });
                              if (msgAtts.length === 0) return null;
                              return (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {msgAtts.map((att: any) => {
                                    const url = att.url as string;
                                    const isImg = att.file_type?.startsWith("image/");
                                    return (
                                      <a
                                        key={att.id}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 rounded border bg-background/50 px-2 py-1 text-xs hover:bg-muted transition-colors"
                                      >
                                        {isImg ? (
                                          <img src={url} alt={att.file_name} className="h-10 w-10 object-cover rounded" />
                                        ) : (
                                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="truncate max-w-[100px]">{att.file_name}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                            <p className="text-xs mt-1 opacity-70">
                              {new Date(msg.created_at).toLocaleString("pt-PT")}
                            </p>
                          </div>
                          {user && (
                            <MessageReactions
                              messageId={msg.id}
                              userId={user.id}
                              align={isAgent ? "right" : "left"}
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                  })()}
                  <div ref={messagesEndRef} />
                </div>
              )}
              <div className="border-t pt-3 space-y-2">
                {failedEmails.length > 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong>Problema na entrega do e-mail!</strong>
                          {failedEmails.slice(0, 3).map((fe) => (
                            <div key={fe.id} className="mt-1 opacity-90 flex flex-wrap items-center gap-1.5">
                              <EmailDeliveryBadge status={fe.delivery_status} detail={fe.error_message} />
                              <span>{fe.error_message || fe.delivery_details || "Erro desconhecido"}</span>
                              <span className="opacity-60">({new Date(fe.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})</span>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                          disabled={retryingEmailId !== null}
                          onClick={async () => {
                            if (!id || !ticket) return;
                            setRetryingEmailId(failedEmails[0]?.id || "retry");
                            try {
                              // Find the last failed message content from ticket_messages
                              const lastAgentMsg = [...messages].reverse().find(m => m.sender_type === "agent");
                              const content = lastAgentMsg?.content || "";
                              if (!content) {
                                toast({ title: "Sem conteúdo para reenviar", description: "Não foi encontrada uma mensagem para reenviar.", variant: "destructive" });
                                setRetryingEmailId(null);
                                return;
                              }
                              const { data, error } = await supabase.functions.invoke("reply-email-ticket", {
                                body: { ticket_id: id, content },
                              });
                              if (error) {
                                toast({ title: "Erro ao reenviar", description: error.message, variant: "destructive" });
                              } else if (data?.error) {
                                toast({ title: "Falha no reenvio", description: data.error, variant: "destructive" });
                              } else {
                                toast({ title: "Email reenviado com sucesso!" });
                                // Refresh failed emails
                                const { data: updatedLogs } = await supabase
                                  .from("email_logs")
                                  .select("id, created_at, delivery_status, delivery_details, error_message, subject")
                                  .eq("ticket_id", id)
                                  .or("status.eq.failed,delivery_status.in.(failed,bounced,complained)")
                                  .order("created_at", { ascending: false })
                                  .limit(5);
                                setFailedEmails(updatedLogs || []);
                              }
                            } catch (err) {
                              toast({ title: "Erro ao reenviar email", description: (err as Error).message, variant: "destructive" });
                            }
                            setRetryingEmailId(null);
                          }}
                        >
                          {retryingEmailId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Reenviar
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {hasEmailThread && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">A resposta será enviada por email para {ticket?.client_email || "o cliente"}</span>
                  </div>
                )}
                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 rounded-md bg-muted/50 border">
                    {replyFiles.map((file, i) => (
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
                        <button onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={replyFileRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    multiple
                    className="hidden"
                    onChange={handleReplyFileSelect}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => replyFileRef.current?.click()}
                    disabled={sendingReply}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Textarea
                    placeholder={hasEmailThread ? "Escreva a sua resposta... (será enviada por email)" : "Responder ao cliente..."}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    rows={4}
                    className="flex-1 resize-none"
                  />
                  <Button size="icon" onClick={sendReply} disabled={sendingReply || (!reply.trim() && replyFiles.length === 0)}>
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contexto de assistência aberta na app de entregas (WMS) */}
          <WmsDeliveryCard ticketId={ticket.id} />

          {/* Unified ticket timeline (additive, read-only) */}
          <TicketTimeline ticketId={ticket.id} preloadedMessages={messages as any} preloadedEvents={events as any} />


          {/* Internal Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Timeline (Notas Internas & Emails)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
          {(() => {
            // Merge events + messages into unified timeline
            const timelineItems = [
              ...events.map((ev) => ({ ...ev, _type: 'event' as const })),
              ...messages.map((msg) => ({
                id: msg.id,
                created_at: msg.created_at,
                content: msg.content,
                user_id: msg.sender_id,
                event_type: msg.sender_type === 'client' ? 'email_in' : 'email_out',
                _type: 'message' as const,
                sender_type: msg.sender_type,
              })),
            ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            return timelineItems.map((ev) => {
              const evSender = ev.user_id ? senderProfiles[ev.user_id] : null;
              const evInitials = evSender?.full_name
                ? evSender.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
                : "?";
              const isEmail = ev._type === 'message';
              const isInbound = isEmail && ev.sender_type === 'client';

              return (
                <div key={ev.id} className={`flex gap-3 text-sm ${isEmail ? 'pl-1' : ''}`}>
                  <Avatar className={`h-6 w-6 shrink-0 mt-0.5 ${isEmail ? (isInbound ? 'ring-1 ring-blue-400' : 'ring-1 ring-primary') : ''}`}>
                    <AvatarImage src={evSender?.avatar_url || undefined} />
                    <AvatarFallback className={`text-[9px] font-semibold ${
                      isInbound ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      isEmail ? 'bg-primary/20 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isEmail ? (isInbound ? '📩' : '📤') : evInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {evSender?.full_name && (
                        <p className="text-xs font-medium text-foreground">{evSender.full_name}</p>
                      )}
                      {isEmail && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${isInbound ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400' : 'border-primary/30 text-primary'}`}>
                          {isInbound ? 'Email recebido' : 'Email enviado'}
                        </Badge>
                      )}
                    </div>
                    {isEmail ? (
                      <p className="text-xs text-muted-foreground truncate max-w-[400px]">
                        {(ev.content || '').replace(/<[^>]+>/g, '').substring(0, 100)}
                      </p>
                    ) : (
                      <p dangerouslySetInnerHTML={{
                        __html: (ev.content || "").replace(
                          /@([\w\s]+?)(?=\s@|\s*$|[.,!?])/g,
                          '<span class="font-semibold text-primary">@$1</span>'
                        )
                      }} />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString("pt-PT", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            });
          })()}
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center gap-2">
                  <MacroSelector ticket={ticket} tags={tags} onSelect={(content) => setNote(content)} />
                </div>
                {noteFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 rounded-md bg-muted/50 border">
                    {noteFiles.map((file, i) => (
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
                        <button onClick={() => setNoteFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={noteFileRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    multiple
                    className="hidden"
                    onChange={handleNoteFileSelect}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => noteFileRef.current?.click()}
                    disabled={addingNote}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <MentionTextarea
                    value={note}
                    onChange={setNote}
                    agents={agents}
                    placeholder="Adicionar nota interna... Use @ para mencionar agentes"
                    rows={3}
                  />
                  <Button size="icon" onClick={addNote} disabled={addingNote || (!note.trim() && noteFiles.length === 0)}>
                    {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <TicketSidebar ticket={ticket} tags={tags} clauses={clauses} userId={user?.id || ""} onUpdate={fetchTicket} />
      </div>

      {/* Full email view dialog */}
      {fullViewContent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setFullViewContent(null)}>
          <div className="bg-background rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Conteúdo completo</h3>
              <Button variant="ghost" size="sm" onClick={() => setFullViewContent(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {(() => {
                const hasMime = fullViewContent.includes("BODY[TEXT]") || fullViewContent.includes("Content-Type:") || fullViewContent.includes("Content-Transfer-Encoding:");
                const cleaned = hasMime ? cleanMimeContent(fullViewContent) : decodeQuotedPrintableUtf8(fullViewContent);
                if (isHtmlContent(cleaned)) {
                  return (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_table]:border-collapse [&_td]:p-1 [&_a]:text-primary [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(cleaned) }}
                    />
                  );
                }
                return <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{cleaned}</pre>;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
