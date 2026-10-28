import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import SlaDashboard, { type SlaTicket, getTicketSlaStatus } from "@/components/ticket/SlaDashboard";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, Ticket } from "lucide-react";

type Row = SlaTicket & { subject: string; client_name: string };
export default function SupportOverview() {
  const [tickets, setTickets] = useState<Row[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.from("tickets").select("id,ticket_number,subject,client_name,status,assigned_to,priority,sla_first_response_at,sla_resolution_at,sla_paused_at,sla_paused_total_seconds,first_responded_at,resolved_at,sla_stage_deadline_at")
      .order("created_at", { ascending: false }).limit(200).then(({ data, error }) => {
        if (!active) return;
        setError(!!error);
        setTickets((data || []) as Row[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [refresh]);
  const attention = tickets.filter(t => ["breached", "at_risk"].includes(getTicketSlaStatus(t)));
  return (
    <div className="space-y-5">
      <PageHeader title="Resumo do atendimento" subtitle="Últimos 200 tickets" icon={<Ticket className="h-5 w-5" />} actions={<Button variant="outline" onClick={() => setRefresh(r => r + 1)} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>} />
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto my-12" /> : error ? <p role="alert" className="text-destructive">Não foi possível carregar o atendimento. Tente atualizar.</p> : <>
        <SlaDashboard tickets={tickets} />
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-warning" />Precisam de atenção</h2>
          {attention.length === 0 ? <p className="text-sm text-muted-foreground py-6">Nenhum prazo em risco nos tickets carregados.</p> : <div className="divide-y border-y">
            {attention.map(t => <Button key={t.id} variant="ghost" className="h-auto w-full rounded-none px-1 py-4 justify-between gap-3 whitespace-normal text-left" onClick={() => navigate(`/tickets/${t.id}`)}>
              <span className="min-w-0"><span className="block font-medium break-words">#{t.ticket_number} · {t.subject}</span><span className="text-xs text-muted-foreground">{t.client_name}</span></span>
              <span className={`shrink-0 text-xs ${getTicketSlaStatus(t) === "breached" ? "text-destructive" : "text-warning"}`}>{getTicketSlaStatus(t) === "breached" ? "Atrasado" : "Em risco"}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Button>)}
          </div>}
        </section>
        <Button onClick={() => navigate("/tickets")} className="w-full sm:w-auto">Abrir tickets<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </>}
    </div>
  );
}