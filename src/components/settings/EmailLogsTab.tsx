import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Mail } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

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
}

export default function EmailLogsTab() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data as EmailLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const sourceLabel = (s: string) => {
    const map: Record<string, string> = {
      "send-ticket-email": "Notificação Ticket",
      "create-client-account": "Boas-vindas",
      "test-smtp": "Teste SMTP",
      system: "Sistema",
    };
    return map[s] || s;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Logs de Email
              </CardTitle>
              <CardDescription>Histórico dos últimos 100 emails enviados pelo sistema</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum email registado ainda.</p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Data</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead className="w-[140px]">Origem</TableHead>
                    <TableHead className="w-[100px]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </TableCell>
                      <TableCell className="text-sm">{log.recipient}</TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{log.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{sourceLabel(log.source)}</Badge>
                      </TableCell>
                      <TableCell>
                        {log.status === "sent" ? (
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="text-xs">Enviado</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-destructive" title={log.error_message || ""}>
                            <XCircle className="h-3.5 w-3.5" />
                            <span className="text-xs">Falhou</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
