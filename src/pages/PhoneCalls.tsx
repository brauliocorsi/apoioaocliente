import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Clock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import PhoneCallForm from "@/components/phone/PhoneCallForm";
import PhoneCallList from "@/components/phone/PhoneCallList";
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
  reminder_count?: number;
};

export default function PhoneCalls() {
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [reminderCounts, setReminderCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [priorityFilter, setPriorityFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<PhoneCall | null>(null);

  const fetchCalls = async () => {
    const { data } = await supabase
      .from("phone_calls" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as any as PhoneCall[]) || [];
    setCalls(rows);

    // fetch pending reminder counts
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
    if (statusFilter !== "todos") result = result.filter((c) => c.status === statusFilter);
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
  }, [enrichedCalls, statusFilter, priorityFilter, search]);

  const today = new Date().toDateString();
  const todayCalls = calls.filter((c) => new Date(c.created_at).toDateString() === today);
  const pendentes = calls.filter((c) => c.status === "pendente").length;
  const emAndamento = calls.filter((c) => c.status === "em_andamento").length;
  const concluidos = todayCalls.filter((c) => c.status === "concluido").length;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ligações</h1>
        <p className="text-muted-foreground">Controle de atendimentos telefónicos</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Hoje</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{todayCalls.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{pendentes}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Phone className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{emAndamento}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Concluídos Hoje</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{concluidos}</div></CardContent>
        </Card>
      </div>

      {/* Quick form */}
      <PhoneCallForm onCreated={fetchCalls} />

      {/* Filters + List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Lista de Ligações</CardTitle>
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="pendente">Pendente</TabsTrigger>
                <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
                <TabsTrigger value="concluido">Concluído</TabsTrigger>
                <TabsTrigger value="cancelado">Cancelado</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="P1">P1</SelectItem>
                <SelectItem value="P2">P2</SelectItem>
                <SelectItem value="P3">P3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <PhoneCallList calls={filtered} onSelect={setSelectedCall} />
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
