import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Mail, AlertTriangle, Clock, ArrowDownCircle, Send, Server } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmailLog {
  id: string;
  created_at: string;
  recipient: string;
  subject: string;
  status: string;
  error_message: string | null;
  source: string;
  ticket_id: string | null;
  template_id: string | null;
  delivery_status: string | null;
  delivery_details: string | null;
  smtp_response: string | null;
}

const DELIVERY_STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  delivered: { label: "Entregue", icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
  accepted: { label: "Aceite", icon: ArrowDownCircle, className: "text-blue-600 dark:text-blue-400" },
  bounced: { label: "Devolvido", icon: XCircle, className: "text-destructive" },
  rejected: { label: "Rejeitado", icon: XCircle, className: "text-destructive" },
  deferred: { label: "Adiado", icon: Clock, className: "text-yellow-600 dark:text-yellow-400" },
  failed: { label: "Falhou", icon: AlertTriangle, className: "text-destructive" },
};

export default function EmailLogsTab() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [activeMethod, setActiveMethod] = useState<"smtp" | "resend" | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setLogs((data as unknown as EmailLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
    supabase.from("system_settings").select("key, value").eq("key", "resend_enabled").maybeSingle().then(({ data }) => {
      setActiveMethod(data?.value === "true" ? "resend" : "smtp");
    });
  }, []);

  const sourceLabel = (s: string) => {
    const map: Record<string, string> = {
      "send-ticket-email": "Notificação",
      "reply-email-ticket": "Resposta Email",
      "create-client-account": "Boas-vindas",
      "test-smtp": "Teste SMTP",
      inbound: "Recebido",
      system: "Sistema",
    };
    return map[s] || s;
  };

  const filteredLogs = filter === "all" 
    ? logs 
    : filter === "problems"
      ? logs.filter(l => l.delivery_status && !["delivered", "accepted"].includes(l.delivery_status) || l.status === "failed")
      : logs.filter(l => l.source === filter);

  // Stats
  const stats = {
    total: logs.length,
    delivered: logs.filter(l => l.delivery_status === "delivered" || (l.status === "sent" && !l.delivery_status)).length,
    accepted: logs.filter(l => l.delivery_status === "accepted").length,
    problems: logs.filter(l => ["bounced", "rejected", "failed", "deferred"].includes(l.delivery_status || "") || l.status === "failed").length,
    received: logs.filter(l => l.source === "inbound").length,
  };

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setFilter("all")}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setFilter("all")}>
          <CardContent className="p-3">
            <p className="text-[10px] text-green-600 dark:text-green-400 uppercase font-medium">Entregues</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setFilter("all")}>
          <CardContent className="p-3">
            <p className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-medium">Aceites</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.accepted}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setFilter("problems")}>
          <CardContent className="p-3">
            <p className="text-[10px] text-destructive uppercase font-medium">Problemas</p>
            <p className="text-2xl font-bold text-destructive">{stats.problems}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => setFilter("inbound")}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Recebidos</p>
            <p className="text-2xl font-bold">{stats.received}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Logs de Email
              </CardTitle>
              <CardDescription>
                Histórico de emails com rastreio de entrega
                {filter !== "all" && (
                  <Button variant="link" size="sm" className="ml-2 h-auto p-0 text-xs" onClick={() => setFilter("all")}>
                    Limpar filtro
                  </Button>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="problems">Problemas</SelectItem>
                  <SelectItem value="reply-email-ticket">Respostas</SelectItem>
                  <SelectItem value="send-ticket-email">Notificações</SelectItem>
                  <SelectItem value="inbound">Recebidos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum email registado.</p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Data</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead className="w-[120px]">Origem</TableHead>
                    <TableHead className="w-[100px]">Envio</TableHead>
                    <TableHead className="w-[110px]">Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const ds = log.delivery_status || (log.status === "sent" ? "accepted" : "failed");
                    const cfg = DELIVERY_STATUS_CONFIG[ds] || DELIVERY_STATUS_CONFIG.failed;
                    const Icon = cfg.icon;

                    return (
                      <TableRow key={log.id} className={["bounced", "rejected", "failed"].includes(ds) ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), "dd/MM HH:mm", { locale: pt })}
                        </TableCell>
                        <TableCell className="text-sm">{log.recipient}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{log.subject}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{sourceLabel(log.source)}</Badge>
                        </TableCell>
                        <TableCell>
                          {log.status === "sent" || log.status === "received" ? (
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span className="text-xs">{log.status === "received" ? "Recebido" : "Enviado"}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-destructive">
                              <XCircle className="h-3.5 w-3.5" />
                              <span className="text-xs">Falhou</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`flex items-center gap-1 cursor-help ${cfg.className}`}>
                                <Icon className="h-3.5 w-3.5" />
                                <span className="text-xs">{cfg.label}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <div className="space-y-1">
                                {log.delivery_details && <p className="text-xs">{log.delivery_details}</p>}
                                {log.smtp_response && <p className="text-[10px] text-muted-foreground font-mono break-all">{log.smtp_response}</p>}
                                {log.error_message && <p className="text-[10px] text-destructive">{log.error_message}</p>}
                                {!log.delivery_details && !log.smtp_response && !log.error_message && (
                                  <p className="text-xs text-muted-foreground">Sem detalhes adicionais</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}