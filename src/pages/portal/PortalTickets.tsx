import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus } from "lucide-react";
import TicketStatusStepper from "@/components/portal/TicketStatusStepper";

export default function PortalTickets() {
  const { user } = useClientAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, { name: string; color: string }>>({});
  const [statusList, setStatusList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const [{ data: tix }, { data: sts }] = await Promise.all([
        supabase
          .from("tickets")
          .select("id, ticket_number, subject, status, created_at, description")
          .eq("client_user_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase.from("ticket_statuses").select("id, name, color").order("sort_order"),
      ]);
      setTickets(tix || []);
      setStatusList(sts || []);
      const map: Record<string, { name: string; color: string }> = {};
      (sts || []).forEach((s: any) => { map[s.id] = { name: s.name, color: s.color }; });
      setStatuses(map);
      setLoading(false);
    };
    if (user) load();
  }, [user]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Os Meus Tickets</h1>
          <p className="text-muted-foreground">Acompanhe o progresso dos seus pedidos</p>
        </div>
        <Button onClick={() => navigate("/portal/tickets/new")}>
          <Plus className="mr-2 h-4 w-4" /> Novo Ticket
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Ainda não tem tickets.</p>
            <Button variant="link" onClick={() => navigate("/portal/tickets/new")}>Criar o primeiro ticket</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const st = statuses[t.status];
            return (
              <Card
                key={t.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/portal/tickets/${t.id}`)}
              >
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">#{t.ticket_number}</span>
                        <p className="text-sm font-medium">{t.subject}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      style={st ? { backgroundColor: st.color + "20", color: st.color, borderColor: st.color + "40" } : {}}
                      className="border"
                    >
                      {st?.name || t.status}
                    </Badge>
                  </div>
                  <TicketStatusStepper statuses={statusList} currentStatusId={t.status} compact />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
