import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Search, CircleDot } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

type Call = {
  id: string;
  source: string;
  direction: string | null;
  attended: boolean | null;
  created_at: string;
  duration_seconds: number | null;
  ringing_seconds: number | null;
  extension: string | null;
  client_phone: string;
  client_name: string;
  ticket_id: string | null;
  subject: string;
};

type Monitored = { extension: number; label: string | null; assigned_profile_id: string | null; is_active: boolean };
type Status = { extension: number; last_call_at: string | null; last_direction: string | null; last_attended: boolean | null };

const WINDOWS: Record<string, number> = { "24": 24, "168": 24 * 7, "720": 24 * 30 };

function fmtDur(sec: number | null) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export default function ExtensionCalls() {
  const [windowH, setWindowH] = useState<string>("168");
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<Call[]>([]);
  const [monitored, setMonitored] = useState<Monitored[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedExt, setSelectedExt] = useState<string>("all");
  const [filter, setFilter] = useState<"all" | "attended" | "missed" | "inbound" | "outbound">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const since = new Date(Date.now() - WINDOWS[windowH] * 3600_000).toISOString();
      const [callsRes, monRes, statRes, profRes] = await Promise.all([
        supabase.from("phone_calls")
          .select("id, source, direction, attended, created_at, duration_seconds, ringing_seconds, extension, client_phone, client_name, ticket_id, subject")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("monitored_extensions").select("extension, label, assigned_profile_id, is_active").eq("is_active", true).order("extension"),
        supabase.from("microsip_extension_status").select("extension, last_call_at, last_direction, last_attended"),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (cancelled) return;
      setCalls((callsRes.data as Call[]) || []);
      setMonitored((monRes.data as Monitored[]) || []);
      setStatus((statRes.data as Status[]) || []);
      const pm: Record<string, string> = {};
      ((profRes.data as any[]) || []).forEach((p) => { pm[p.id] = p.full_name; });
      setProfiles(pm);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [windowH]);

  const statsByExt = useMemo(() => {
    const m: Record<string, { total: number; attended: number; missed: number; inbound: number; outbound: number; last: string | null }> = {};
    calls.forEach((c) => {
      if (c.source !== "letscall" || !c.extension) return;
      const k = c.extension;
      m[k] ||= { total: 0, attended: 0, missed: 0, inbound: 0, outbound: 0, last: null };
      m[k].total++;
      if (c.attended) m[k].attended++;
      if (c.attended === false) m[k].missed++;
      if (c.direction === "incoming" || c.direction === "inbound") m[k].inbound++;
      if (c.direction === "outgoing" || c.direction === "outbound") m[k].outbound++;
      if (!m[k].last || c.created_at > m[k].last!) m[k].last = c.created_at;
    });
    return m;
  }, [calls]);

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (c.source !== "letscall") return false;
      if (selectedExt !== "all" && c.extension !== selectedExt) return false;
      if (filter === "attended" && !c.attended) return false;
      if (filter === "missed" && c.attended !== false) return false;
      if (filter === "inbound" && !(c.direction === "incoming" || c.direction === "inbound")) return false;
      if (filter === "outbound" && !(c.direction === "outgoing" || c.direction === "outbound")) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.client_phone?.toLowerCase().includes(q) && !c.client_name?.toLowerCase().includes(q) && !c.subject?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [calls, selectedExt, filter, search]);

  const now = Date.now();
  const currentStats = selectedExt === "all"
    ? Object.values(statsByExt).reduce((a, b) => ({
        total: a.total + b.total, attended: a.attended + b.attended, missed: a.missed + b.missed,
        inbound: a.inbound + b.inbound, outbound: a.outbound + b.outbound, last: null,
      }), { total: 0, attended: 0, missed: 0, inbound: 0, outbound: 0, last: null as string | null })
    : statsByExt[selectedExt] || { total: 0, attended: 0, missed: 0, inbound: 0, outbound: 0, last: null };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5" /> Registos de Ligações por Ramal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico detalhado das chamadas MicroSIP/Let's Call por ramal.</p>
        </div>
        <Select value={windowH} onValueChange={setWindowH}>
          <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24">Últimas 24 horas</SelectItem>
            <SelectItem value="168">Últimos 7 dias</SelectItem>
            <SelectItem value="720">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards por ramal */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => setSelectedExt("all")}
          className={`text-left rounded-lg border p-4 transition hover:bg-muted/30 ${selectedExt === "all" ? "border-primary ring-1 ring-primary" : ""}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Todos os ramais</span>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {loading ? <Skeleton className="h-7 w-12" /> : Object.values(statsByExt).reduce((a, b) => a + b.total, 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">chamadas no período</div>
        </button>

        {monitored.map((m) => {
          const s = statsByExt[String(m.extension)];
          const st = status.find((x) => x.extension === m.extension);
          const lastTs = st?.last_call_at ? new Date(st.last_call_at).getTime() : (s?.last ? new Date(s.last).getTime() : 0);
          const minutesAgo = lastTs ? (now - lastTs) / 60000 : Infinity;
          const active = minutesAgo <= 5;
          const idle = minutesAgo <= 60;
          const sel = selectedExt === String(m.extension);
          return (
            <button
              key={m.extension}
              onClick={() => setSelectedExt(String(m.extension))}
              className={`text-left rounded-lg border p-4 transition hover:bg-muted/30 ${sel ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Ramal {m.extension}</span>
                <Badge variant="outline" className="text-[10px] gap-1">
                  <CircleDot className={`h-2.5 w-2.5 ${active ? "text-green-600" : idle ? "text-amber-600" : "text-muted-foreground"}`} />
                  {active ? "Ativo" : idle ? "Recente" : "Inativo"}
                </Badge>
              </div>
              <div className="mt-2 text-2xl font-semibold">{loading ? <Skeleton className="h-7 w-12" /> : (s?.total ?? 0)}</div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                <span className="text-green-700 dark:text-green-400">{s?.attended ?? 0} atend.</span>
                <span className="text-amber-700 dark:text-amber-400">{s?.missed ?? 0} perd.</span>
              </div>
              {m.assigned_profile_id && (
                <div className="text-[11px] text-muted-foreground mt-1 truncate">{profiles[m.assigned_profile_id]}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniKpi icon={Phone} label="Total" value={currentStats.total} />
        <MiniKpi icon={PhoneIncoming} label="Atendidas" value={currentStats.attended} tone="success" />
        <MiniKpi icon={PhoneMissed} label="Não atendidas" value={currentStats.missed} tone="warn" />
        <MiniKpi icon={PhoneIncoming} label="Recebidas" value={currentStats.inbound} />
        <MiniKpi icon={PhoneOutgoing} label="Efetuadas" value={currentStats.outbound} />
      </div>

      {/* Filtros + Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm">
              {selectedExt === "all" ? "Todas as chamadas" : `Chamadas do ramal ${selectedExt}`}
              <span className="text-xs text-muted-foreground font-normal ml-2">({filtered.length})</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar nome, telefone…"
                  className="h-8 pl-7 text-xs w-[220px]"
                />
              </div>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
                  <TabsTrigger value="attended" className="text-xs">Atendidas</TabsTrigger>
                  <TabsTrigger value="missed" className="text-xs">Perdidas</TabsTrigger>
                  <TabsTrigger value="inbound" className="text-xs">Receb.</TabsTrigger>
                  <TabsTrigger value="outbound" className="text-xs">Efet.</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Quando</TableHead>
                <TableHead className="text-xs">Ramal</TableHead>
                <TableHead className="text-xs">Direção</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Telefone</TableHead>
                <TableHead className="text-xs">Toque</TableHead>
                <TableHead className="text-xs">Duração</TableHead>
                <TableHead className="text-xs">Ticket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                    Sem chamadas para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtered.map((c) => {
                const isIn = c.direction === "incoming" || c.direction === "inbound";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>{format(new Date(c.created_at), "dd/MM HH:mm")}</div>
                      <div className="text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { locale: pt, addSuffix: true })}</div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{c.extension || "—"}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        {isIn ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}
                        {isIn ? "Recebida" : "Efetuada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.attended === true ? (
                        <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Atendida</Badge>
                      ) : c.attended === false ? (
                        <Badge variant="destructive" className="text-[10px]">Perdida</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{c.client_name}</TableCell>
                    <TableCell className="text-xs font-mono">{c.client_phone}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDur(c.ringing_seconds)}</TableCell>
                    <TableCell className="text-xs">{fmtDur(c.duration_seconds)}</TableCell>
                    <TableCell className="text-xs">
                      {c.ticket_id ? (
                        <Link to={`/tickets/${c.ticket_id}`} className="text-primary hover:underline">Abrir</Link>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "success" | "warn" }) {
  const cls = tone === "success" ? "text-green-600 dark:text-green-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold mt-0.5">{value}</p>
          </div>
          <Icon className={`h-4 w-4 ${cls}`} />
        </div>
      </CardContent>
    </Card>
  );
}
