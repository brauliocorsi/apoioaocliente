import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, ChevronDown, Info, CircleDot,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

type Call = {
  id: string;
  source: string;
  direction: string | null;
  attended: boolean | null;
  call_status: string | null;
  duration_seconds: number | null;
  created_at: string;
  extension: string | null;
  client_phone: string;
  client_name: string;
  ticket_id: string | null;
};

type Monitored = { extension: number; label: string | null; assigned_profile_id: string | null; is_active: boolean };
type Status = { extension: number; last_call_at: string | null; last_direction: string | null; last_attended: boolean | null };
type Recon = { phone_call_id: string; reconciliation_status: string; source: string; created_at: string };
type Profile = { id: string; full_name: string };

// Mapeamento de ramal bruto (CDR Let's Call) → ramal exibido
const RAW_TO_DISPLAY: Record<string, number> = { "200": 400, "201": 401, "202": 402 };
const DISPLAY_TO_RAW: Record<number, string> = { 400: "200", 401: "201", 402: "202" };
const displayExt = (raw: string | null | undefined): string => (raw && RAW_TO_DISPLAY[raw] ? String(RAW_TO_DISPLAY[raw]) : (raw || "—"));

export default function CallsPanel() {
  const [windowH, setWindowH] = useState<"24" | "168">("24");
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<Call[]>([]);
  const [monitored, setMonitored] = useState<Monitored[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [recon, setRecon] = useState<Recon[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const since = new Date(Date.now() - parseInt(windowH, 10) * 3600_000).toISOString();
      const [callsRes, monRes, statRes, recRes, profRes] = await Promise.all([
        supabase.from("phone_calls")
          .select("id, source, direction, attended, created_at, extension, client_phone, client_name, ticket_id")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("monitored_extensions").select("extension, label, assigned_profile_id, is_active").order("extension"),
        supabase.from("microsip_extension_status").select("extension, last_call_at, last_direction, last_attended"),
        supabase.from("phone_calls_reconciliation").select("phone_call_id, reconciliation_status, source, created_at").gte("created_at", since).limit(1000),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (cancelled) return;
      setCalls((callsRes.data as Call[]) || []);
      setMonitored((monRes.data as Monitored[]) || []);
      setStatus((statRes.data as Status[]) || []);
      setRecon((recRes.data as Recon[]) || []);
      const pm: Record<string, string> = {};
      ((profRes.data as Profile[]) || []).forEach(p => { pm[p.id] = p.full_name; });
      setProfiles(pm);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [windowH]);

  const kpis = useMemo(() => {
    const cdr = calls.filter(c => c.source === "letscall");
    const total = cdr.length;
    const attended = cdr.filter(c => c.attended).length;
    const missed = cdr.filter(c => c.attended === false).length;
    const outbound = cdr.filter(c => c.direction === "outgoing" || c.direction === "outbound").length;
    const inbound = cdr.filter(c => c.direction === "incoming" || c.direction === "inbound").length;
    return { total, attended, missed, outbound, inbound };
  }, [calls]);

  const byExt = useMemo(() => {
    const m: Record<string, { total: number; attended: number; missed: number; last: string | null }> = {};
    calls.filter(c => c.source === "letscall" && c.extension).forEach(c => {
      const k = c.extension!;
      m[k] ||= { total: 0, attended: 0, missed: 0, last: null };
      m[k].total++;
      if (c.attended) m[k].attended++;
      if (c.attended === false) m[k].missed++;
      if (!m[k].last || c.created_at > m[k].last!) m[k].last = c.created_at;
    });
    return m;
  }, [calls]);

  const reconMap = useMemo(() => {
    const m: Record<string, string> = {};
    recon.forEach(r => { m[r.phone_call_id] = r.reconciliation_status; });
    return m;
  }, [recon]);

  const orphanCdr = calls.filter(c => c.source === "letscall" && reconMap[c.id] === "not_registered_in_system").slice(0, 50);
  const orphanSystem = calls.filter(c => c.source !== "letscall" && reconMap[c.id] === "not_found_in_microsip").slice(0, 50);

  const now = Date.now();

  return (
    <TooltipProvider>
      <div className="space-y-4" id="calls-panel">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2"><Phone className="h-4 w-4" /> Ligações / Ramais</h2>
            <p className="text-xs text-muted-foreground">Indicadores MicroSIP/Let's Call e reconciliação com o sistema.</p>
          </div>
          <Select value={windowH} onValueChange={(v) => setWindowH(v as "24" | "168")}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24" className="text-xs">Últimas 24 horas</SelectItem>
              <SelectItem value="168" className="text-xs">Últimos 7 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi icon={Phone} label="Total" value={loading ? null : kpis.total} />
          <Kpi icon={PhoneIncoming} label="Atendidas" value={loading ? null : kpis.attended} tone="success" />
          <Kpi icon={PhoneMissed} label="Não atendidas" value={loading ? null : kpis.missed} tone="warn" />
          <Kpi icon={PhoneIncoming} label="Recebidas" value={loading ? null : kpis.inbound} />
          <Kpi icon={PhoneOutgoing} label="Efetuadas" value={loading ? null : kpis.outbound} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Ramais monitorizados
              <Tooltip>
                <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  A API Let's Call não expõe estado online/DND em tempo real. A atividade é inferida pela última chamada registada no CDR.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ramal</TableHead>
                  <TableHead className="text-xs">Agente</TableHead>
                  <TableHead className="text-xs">Última chamada</TableHead>
                  <TableHead className="text-xs">Atendidas</TableHead>
                  <TableHead className="text-xs">Não atendidas</TableHead>
                  <TableHead className="text-xs">Atividade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                )}
                {!loading && monitored.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sem ramais configurados.</TableCell></TableRow>
                )}
                {!loading && monitored.map(m => {
                  const rawExt = DISPLAY_TO_RAW[m.extension] ?? String(m.extension);
                  const stats = byExt[rawExt];
                  const st = status.find(s => s.extension === m.extension || String(s.extension) === rawExt);
                  const lastTs = st?.last_call_at ? new Date(st.last_call_at).getTime() : (stats?.last ? new Date(stats.last).getTime() : 0);
                  const minutesAgo = lastTs ? (now - lastTs) / 60000 : Infinity;
                  const active = minutesAgo <= 5;
                  const idle = minutesAgo <= 60;
                  return (
                    <TableRow key={m.extension}>
                      <TableCell className="font-mono text-sm">{m.extension}{m.label ? <span className="text-muted-foreground text-xs ml-2">{m.label}</span> : null}</TableCell>
                      <TableCell className="text-sm">{m.assigned_profile_id ? profiles[m.assigned_profile_id] || "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lastTs ? formatDistanceToNow(new Date(lastTs), { locale: pt, addSuffix: true }) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{stats?.attended ?? 0}</TableCell>
                      <TableCell className={`text-sm ${stats && stats.missed > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>{stats?.missed ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <CircleDot className={`h-2.5 w-2.5 ${active ? "text-green-600" : idle ? "text-amber-600" : "text-muted-foreground"}`} />
                          {active ? "Ativo (<5min)" : idle ? "Recente (<1h)" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <ReconList
          title="Chamadas MicroSIP sem registo no sistema"
          description="CDR recebido do Let's Call sem ligação manual correspondente."
          items={orphanCdr}
        />
        <ReconList
          title="Registos manuais sem confirmação MicroSIP"
          description="Ligações criadas no sistema sem CDR equivalente na janela ±15 min."
          items={orphanSystem}
        />
      </div>
    </TooltipProvider>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | null; tone?: "success" | "warn" }) {
  const cls = tone === "success" ? "text-green-600 dark:text-green-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value === null ? <Skeleton className="h-7 w-12" /> : value}</p>
          </div>
          <Icon className={`h-4 w-4 ${cls}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ReconList({ title, description, items }: { title: string; description: string; items: Call[] }) {
  return (
    <Card>
      <Collapsible defaultOpen={items.length > 0 && items.length <= 5}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="text-left">
              <CardTitle className="text-sm">{title} <span className="text-xs text-muted-foreground font-normal">({items.length})</span></CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 overflow-x-auto">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">Sem ocorrências.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Quando</TableHead>
                    <TableHead className="text-xs">Direção</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Telefone</TableHead>
                    <TableHead className="text-xs">Ramal</TableHead>
                    <TableHead className="text-xs">Ticket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{formatDistanceToNow(new Date(c.created_at), { locale: pt, addSuffix: true })}</TableCell>
                      <TableCell className="text-xs">{c.direction || "—"}</TableCell>
                      <TableCell className="text-xs">{c.client_name}</TableCell>
                      <TableCell className="text-xs font-mono">{c.client_phone}</TableCell>
                      <TableCell className="text-xs font-mono">{displayExt(c.extension)}</TableCell>
                      <TableCell className="text-xs">
                        {c.ticket_id ? <Link to={`/tickets/${c.ticket_id}`} className="text-primary hover:underline">Abrir</Link> : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
