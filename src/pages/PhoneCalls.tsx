import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, CheckCircle2, Loader2, XCircle, Search } from "lucide-react";
import PhoneCallForm from "@/components/phone/PhoneCallForm";
import { usePhoneCallStatuses } from "@/hooks/usePhoneCallStatuses";
import PhoneCallKanban from "@/components/phone/PhoneCallKanban";
import PhoneCallDetailDialog from "@/components/phone/PhoneCallDetailDialog";

type PhoneCall = {
  id: string;
  client_name: string;
  client_phone: string;
  invoice_number: string | null;
  subject: string;
  notes: string | null;
  status: string;
  priority: string;
  created_at: string;
  ticket_id?: string | null;
  reminder_count?: number;
  created_by?: string;
  created_by_name?: string;
  created_by_color?: string;
  created_by_avatar?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string;
  assigned_to_color?: string;
  assigned_to_avatar?: string | null;
};

export default function PhoneCalls() {
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [reminderCounts, setReminderCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<PhoneCall | null>(null);
  const { statuses, statusLabels } = usePhoneCallStatuses();

  const fetchCalls = async () => {
    const { data } = await supabase
      .from("phone_calls" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as any as PhoneCall[]) || [];

    // Fetch creator + assigned profiles with colors
    const allUserIds = [...new Set([
      ...rows.map((r) => r.created_by).filter(Boolean),
      ...rows.map((r) => r.assigned_to).filter(Boolean),
    ])];
    let profileMap: Record<string, { name: string; color: string; avatar_url?: string | null }> = {};
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, agent_color, avatar_url")
        .in("id", allUserIds);
      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = { name: p.full_name, color: p.agent_color || '#6b7280', avatar_url: p.avatar_url };
      });
    }

    const enrichedRows = rows.map((r) => ({
      ...r,
      created_by_name: r.created_by ? profileMap[r.created_by]?.name || "" : "",
      created_by_color: r.created_by ? profileMap[r.created_by]?.color || "#6b7280" : "#6b7280",
      created_by_avatar: r.created_by ? profileMap[r.created_by]?.avatar_url || null : null,
      assigned_to_name: r.assigned_to ? profileMap[r.assigned_to]?.name || "" : "",
      assigned_to_color: r.assigned_to ? profileMap[r.assigned_to]?.color || "#6b7280" : "#6b7280",
      assigned_to_avatar: r.assigned_to ? profileMap[r.assigned_to]?.avatar_url || null : null,
    }));
    setCalls(enrichedRows);

    const { data: remData } = await supabase
      .from("phone_call_reminders" as any)
      .select("phone_call_id")
      .eq("is_completed", false);
    const counts: Record<string, number> = {};
    ((remData as any[]) || []).forEach((r: any) => {
      counts[r.phone_call_id] = (counts[r.phone_call_id] || 0) + 1;
    });
    setReminderCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchCalls(); }, []);

  const enrichedCalls = useMemo(
    () => calls.map((c) => ({ ...c, reminder_count: reminderCounts[c.id] || 0 })),
    [calls, reminderCounts]
  );

  const filtered = useMemo(() => {
    let result = enrichedCalls;
    if (priorityFilter !== "todas") result = result.filter((c) => c.priority === priorityFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.client_name.toLowerCase().includes(q) ||
          c.client_phone.includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          (c.invoice_number || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [enrichedCalls, priorityFilter, search]);

  const today = new Date().toDateString();
  const todayCalls = calls.filter((c) => new Date(c.created_at).toDateString() === today);

  // Build summary cards dynamically from phone_call_statuses
  const statusIcons: Record<string, typeof Phone> = {};
  const statusIconBg: Record<string, string> = {};
  // Default icon mappings by position
  const iconList = [Clock, Phone, CheckCircle2];
  const iconBgList = ["bg-warning/10 text-warning", "bg-primary/10 text-primary", "bg-success/10 text-success"];

  const summaryCards = [
    {
      title: "Hoje",
      subtitle: "Ligações registadas hoje",
      value: todayCalls.length,
      icon: Phone,
      color: "hsl(215, 70%, 45%)",
      iconBg: "bg-primary/10 text-primary",
    },
    ...statuses.map((s, i) => ({
      title: s.name,
      subtitle: `Estado: ${s.name}`,
      value: calls.filter((c) => c.status === s.id).length,
      icon: iconList[i % iconList.length],
      color: s.color,
      iconBg: iconBgList[i % iconBgList.length],
    })),
  ];

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ligações</h1>
        <p className="text-muted-foreground">Controle de atendimentos telefónicos</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className="border-t-4 overflow-hidden" style={{ borderTopColor: card.color }}>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <div>
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">{card.subtitle}</p>
              </div>
              <div className={`p-2 rounded-lg ${card.iconBg}`}>
                <card.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick form */}
      <PhoneCallForm onCreated={fetchCalls} />

      {/* Kanban */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Quadro de Ligações</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 sm:w-56"
                />
              </div>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="P1">P1</SelectItem>
                  <SelectItem value="P2">P2</SelectItem>
                  <SelectItem value="P3">P3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PhoneCallKanban
            calls={filtered}
            onSelect={setSelectedCall}
            onStatusChanged={fetchCalls}
          />
        </CardContent>
      </Card>

      <PhoneCallDetailDialog
        call={selectedCall}
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        onUpdated={() => { fetchCalls(); }}
      />
    </div>
  );
}
