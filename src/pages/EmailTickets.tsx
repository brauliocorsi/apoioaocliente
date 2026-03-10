import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, Mail, RefreshCw, ArrowRight, Check, X, Ban, Eye, Clock, Shield, RotateCw, History, FileCheck, FileX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type EmailTicketRow = {
  id: string;
  ticket_number: number;
  client_name: string;
  client_email: string | null;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
  assigned_to: string | null;
  updated_at: string;
};

type PendingEmail = {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  attachments_meta: any;
};

type ProcessedEmail = {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  ticket_id: string | null;
};

function isHtmlContent(text: string): boolean {
  if (!text) return false;
  return /<\w+[^>]*>/.test(text) && (text.includes("</") || text.includes("/>"));
}

function sanitizeForDisplay(html: string): string {
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  return safe;
}

export default function EmailTickets() {
  const [tickets, setTickets] = useState<EmailTicketRow[]>([]);
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
  const [processedEmails, setProcessedEmails] = useState<ProcessedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [polling, setPolling] = useState(false);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [selectedPending, setSelectedPending] = useState<PendingEmail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState("pending");
  const navigate = useNavigate();
  const { statusLabels } = useTicketStatuses();
  const { toast } = useToast();
  const { user } = useAuth();
  const [pollProgress, setPollProgress] = useState("");

  const fetchEmailTickets = async () => {
    const { data: threads } = await supabase
      .from("email_threads" as any)
      .select("ticket_id");

    if (!threads || threads.length === 0) {
      setTickets([]);
    } else {
      const ticketIds = [...new Set((threads as any[]).map((t: any) => t.ticket_id))];
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, client_name, client_email, subject, priority, status, created_at, assigned_to, updated_at")
        .in("id", ticketIds)
        .order("updated_at", { ascending: false });
      setTickets((data as EmailTicketRow[]) || []);
    }
  };

  const fetchPendingEmails = async () => {
    const { data } = await supabase
      .from("pending_emails" as any)
      .select("*")
      .in("status", ["pending", "blocked"])
      .order("created_at", { ascending: false });
    setPendingEmails((data as unknown as PendingEmail[]) || []);
  };

  const fetchProcessedEmails = async () => {
    const { data } = await supabase
      .from("pending_emails" as any)
      .select("id, from_address, from_name, subject, status, rejection_reason, created_at, reviewed_at, reviewed_by, ticket_id")
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(200);
    setProcessedEmails((data as unknown as ProcessedEmail[]) || []);
  };

  useEffect(() => {
    Promise.all([
      fetchEmailTickets(),
      fetchPendingEmails(),
      fetchProcessedEmails(),
      supabase.rpc("get_agent_profiles").then(({ data }) => {
        const map: Record<string, string> = {};
        ((data as any[]) || []).forEach((p: any) => { map[p.id] = p.full_name; });
        setAgents(map);
      }),
    ]).then(() => setLoading(false));
  }, []);

  // Auto-switch to pending tab if there are pending emails
  useEffect(() => {
    if (!loading && pendingEmails.filter(e => e.status === "pending").length > 0) {
      setTab("pending");
    } else if (!loading) {
      setTab("tickets");
    }
  }, [loading, pendingEmails.length]);

  const triggerPoll = async (fetchRecent = false) => {
    setPolling(true);
    setPollProgress("");
    let totalProcessed = 0;
    let round = 0;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id;

      // Loop until no remaining emails
      while (true) {
        round++;
        setPollProgress(`A importar... (lote ${round}, ${totalProcessed} processados)`);

        const { data } = await supabase.functions.invoke("fetch-inbound-emails", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: { fetch_recent: fetchRecent, max_emails: 1, agent_id: userId },
        });

        if (data?.error) {
          toast({ title: "Erro", description: data.error, variant: "destructive" });
          break;
        }

        const batchTotal = data?.total || 0;
        totalProcessed += batchTotal;
        const remaining = data?.remaining || 0;

        // Refresh lists after each batch
        await Promise.all([fetchEmailTickets(), fetchPendingEmails(), fetchProcessedEmails()]);

        if (remaining <= 0 || batchTotal === 0) {
          // Done - show final summary
          toast({
            title: "Importação concluída",
            description: data?.message || `${totalProcessed} emails processados no total.`,
          });
          break;
        }

        // Small delay between batches
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error("Poll error:", err);
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    }
    setPollProgress("");
    setPolling(false);
  };

  const approvePending = async (pe: PendingEmail) => {
    setActionLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data } = await supabase.functions.invoke("fetch-inbound-emails", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { action: "approve", pending_id: pe.id, agent_id: user?.id },
      });
      if (data?.success) {
        toast({ title: "Ticket criado", description: `Ticket criado a partir do email de ${pe.from_name || pe.from_address}` });
        setSelectedPending(null);
        await Promise.all([fetchEmailTickets(), fetchPendingEmails(), fetchProcessedEmails()]);
        if (data.ticket_id) navigate(`/email-tickets/${data.ticket_id}`);
      } else {
        toast({ title: "Erro", description: data?.message || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  const rejectPending = async (pe: PendingEmail, reason?: string) => {
    setActionLoading(true);
    try {
      await supabase.from("pending_emails" as any).update({
        status: "rejected",
        rejection_reason: reason || "Rejeitado manualmente",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", pe.id);
      toast({ title: "Email rejeitado" });
      setSelectedPending(null);
      await Promise.all([fetchPendingEmails(), fetchProcessedEmails()]);
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  const blockSenderAndReject = async (pe: PendingEmail) => {
    setActionLoading(true);
    try {
      const domain = pe.from_address.split("@")[1];
      await supabase.from("email_blocked_senders" as any).insert({
        pattern: domain,
        pattern_type: "domain",
        reason: `Bloqueado a partir do email: ${pe.subject}`,
        created_by: user?.id,
      });
      await supabase.from("pending_emails" as any).update({
        status: "blocked",
        rejection_reason: `Domínio ${domain} bloqueado`,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", pe.id);
      toast({ title: "Domínio bloqueado", description: `Todos os emails de @${domain} serão bloqueados` });
      setSelectedPending(null);
      await Promise.all([fetchPendingEmails(), fetchProcessedEmails()]);
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  const pendingCount = pendingEmails.filter(e => e.status === "pending").length;
  const blockedCount = pendingEmails.filter(e => e.status === "blocked").length;

  const filteredTickets = tickets.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.client_name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.client_email && t.client_email.toLowerCase().includes(q)) ||
      String(t.ticket_number).includes(search)
    );
  });

  const filteredPending = pendingEmails.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.from_address.toLowerCase().includes(q) ||
      (p.from_name && p.from_name.toLowerCase().includes(q)) ||
      p.subject.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Email Tickets
          </h1>
          <p className="text-muted-foreground">Tickets originados por email — com fila de revisão e lista de bloqueio</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => triggerPoll(false)} disabled={polling}>
            <RefreshCw className={`h-4 w-4 mr-2 ${polling ? "animate-spin" : ""}`} />
            {polling ? (pollProgress || "A verificar...") : "Novos Emails"}
          </Button>
          <Button variant="secondary" onClick={() => triggerPoll(true)} disabled={polling}>
            <Mail className="h-4 w-4 mr-2" />
            {polling ? (pollProgress || "A importar...") : "Importar Todos"}
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, email, assunto..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-3.5 w-3.5" />
              Pendentes
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tickets" className="gap-2">
              <Mail className="h-3.5 w-3.5" />
              Tickets ({tickets.length})
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-2">
              <Shield className="h-3.5 w-3.5" />
              Bloqueados
              {blockedCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{blockedCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-3.5 w-3.5" />
              Histórico ({processedEmails.length})
            </TabsTrigger>
          </TabsList>

          {/* Pending emails tab */}
          <TabsContent value="pending" className="mt-4">
            {filteredPending.filter(p => p.status === "pending").length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Check className="h-12 w-12 text-green-500/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum email pendente de revisão</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Novos emails aparecerão aqui para aprovação antes de criarem tickets</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {filteredPending.filter(p => p.status === "pending").map((pe) => (
                      <div
                        key={pe.id}
                        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors group"
                        onClick={() => setSelectedPending(pe)}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
                            <Clock className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{pe.subject}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {pe.from_name || pe.from_address} · {pe.from_address}
                              {" · "}
                              {formatDistanceToNow(new Date(pe.created_at), { addSuffix: true, locale: pt })}
                              {pe.attachments_meta && (pe.attachments_meta as any[]).length > 0 && (
                                <span className="ml-1">📎 {(pe.attachments_meta as any[]).length}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                            Pendente
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                            onClick={(e) => { e.stopPropagation(); approvePending(pe); }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); rejectPending(pe); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tickets tab */}
          <TabsContent value="tickets" className="mt-4">
            {filteredTickets.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum email ticket encontrado</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {filteredTickets.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors group"
                        onClick={() => navigate(`/email-tickets/${t.id}`)}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                            <Mail className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">#{t.ticket_number}</span>
                              <p className="text-sm font-medium truncate">{t.subject}</p>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {t.client_name}
                              {t.client_email ? ` · ${t.client_email}` : ""}
                              {t.assigned_to ? ` · ${agents[t.assigned_to] || ""}` : ""}
                              {" · "}
                              {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true, locale: pt })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PriorityFlag priority={t.priority} />
                          <Badge variant="secondary">{statusLabels[t.status] || t.status}</Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Blocked tab */}
          <TabsContent value="blocked" className="mt-4">
            {filteredPending.filter(p => p.status === "blocked").length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum email bloqueado</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {filteredPending.filter(p => p.status === "blocked").map((pe) => (
                      <div
                        key={pe.id}
                        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedPending(pe)}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive shrink-0">
                            <Ban className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{pe.subject}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {pe.from_address} · {pe.rejection_reason}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                            Bloqueado
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:bg-green-50"
                            title="Aprovar mesmo assim"
                            onClick={(e) => { e.stopPropagation(); approvePending(pe); }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="mt-4">
            {processedEmails.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <History className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum email processado ainda</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {processedEmails.map((pe) => (
                      <div
                        key={pe.id}
                        className={`flex items-center justify-between px-4 py-3.5 transition-colors ${pe.ticket_id ? "cursor-pointer hover:bg-muted/50" : ""}`}
                        onClick={() => pe.ticket_id && navigate(`/email-tickets/${pe.ticket_id}`)}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                            pe.status === "approved"
                              ? "bg-green-500/10 text-green-600"
                              : "bg-destructive/10 text-destructive"
                          }`}>
                            {pe.status === "approved" ? <FileCheck className="h-4 w-4" /> : <FileX className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{pe.subject}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {pe.from_name || pe.from_address} · {pe.from_address}
                              {pe.reviewed_at && (
                                <> · {format(new Date(pe.reviewed_at), "dd/MM/yyyy HH:mm", { locale: pt })}</>
                              )}
                              {pe.reviewed_by && agents[pe.reviewed_by] && (
                                <> · por {agents[pe.reviewed_by]}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {pe.status === "approved" ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                              Ticket criado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                              Rejeitado
                            </Badge>
                          )}
                          {pe.ticket_id && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Pending email detail dialog */}
      <Dialog open={!!selectedPending} onOpenChange={(open) => { if (!open) setSelectedPending(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          {selectedPending && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{selectedPending.subject}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 flex-wrap">
                  <span>De: <strong>{selectedPending.from_name || selectedPending.from_address}</strong></span>
                  <span className="text-muted-foreground">({selectedPending.from_address})</span>
                  <span>·</span>
                  <span>{format(new Date(selectedPending.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}</span>
                  {selectedPending.status === "blocked" && (
                    <Badge variant="destructive" className="text-[10px]">Bloqueado</Badge>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[400px] rounded-lg border p-4">
                {selectedPending.body_html && isHtmlContent(selectedPending.body_html) ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_a]:text-primary"
                    dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(selectedPending.body_html) }}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{selectedPending.body_text || "(sem conteúdo)"}</p>
                )}
              </ScrollArea>

              {selectedPending.attachments_meta && (selectedPending.attachments_meta as any[]).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  📎 {(selectedPending.attachments_meta as any[]).length} anexo(s):
                  {" "}
                  {(selectedPending.attachments_meta as any[]).map((a: any) => a.filename).join(", ")}
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={actionLoading}
                  onClick={() => blockSenderAndReject(selectedPending)}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Bloquear Domínio
                </Button>
                <Button
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() => rejectPending(selectedPending)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Rejeitar
                </Button>
                <Button
                  disabled={actionLoading}
                  onClick={() => approvePending(selectedPending)}
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Aprovar e Criar Ticket
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
