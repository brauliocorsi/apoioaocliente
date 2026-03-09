import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, Mail, RefreshCw, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

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

export default function EmailTickets() {
  const [tickets, setTickets] = useState<EmailTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [polling, setPolling] = useState(false);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { statusLabels } = useTicketStatuses();
  const { toast } = useToast();

  const fetchEmailTickets = async () => {
    // Get ticket IDs that have email threads
    const { data: threads } = await supabase
      .from("email_threads" as any)
      .select("ticket_id");

    if (!threads || threads.length === 0) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const ticketIds = [...new Set((threads as any[]).map((t: any) => t.ticket_id))];

    const { data } = await supabase
      .from("tickets")
      .select("id, ticket_number, client_name, client_email, subject, priority, status, created_at, assigned_to, updated_at")
      .in("id", ticketIds)
      .order("updated_at", { ascending: false });

    setTickets((data as EmailTicketRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    Promise.all([
      fetchEmailTickets(),
      supabase.rpc("get_agent_profiles").then(({ data }) => {
        const map: Record<string, string> = {};
        ((data as any[]) || []).forEach((p: any) => { map[p.id] = p.full_name; });
        setAgents(map);
      }),
    ]);
  }, []);

  const triggerPoll = async (fetchRecent = false) => {
    setPolling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data } = await supabase.functions.invoke("fetch-inbound-emails", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { fetch_recent: fetchRecent, max_emails: fetchRecent ? 50 : 20 },
      });
      if (data?.message) {
        toast({ title: "Resultado", description: data.message });
      }
      if (data?.error_details?.length > 0) {
        console.log("Import errors:", data.error_details);
        toast({ title: "Erros de importação", description: data.error_details.join("; "), variant: "destructive" });
      }
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      }
      await fetchEmailTickets();
    } catch (err) {
      console.error("Poll error:", err);
    }
    setPolling(false);
  };

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.client_name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.client_email && t.client_email.toLowerCase().includes(q)) ||
      String(t.ticket_number).includes(search)
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
          <p className="text-muted-foreground">Tickets originados por email — respostas são enviadas como email ao cliente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => triggerPoll(false)} disabled={polling}>
            <RefreshCw className={`h-4 w-4 mr-2 ${polling ? "animate-spin" : ""}`} />
            {polling ? "A verificar..." : "Novos Emails"}
          </Button>
          <Button variant="secondary" onClick={() => triggerPoll(true)} disabled={polling}>
            <Mail className="h-4 w-4 mr-2" />
            Importar Recentes
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum email ticket encontrado</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Configure o IMAP nas definições para receber emails automaticamente</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((t) => (
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
    </div>
  );
}
