import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Clock, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Category = { id: string; name: string };
type TicketStatus = { id: string; name: string; color: string | null; sla_minutes: number | null };
type SlaConfig = { id: string; category_id: string; priority: string; first_response_minutes: number; resolution_minutes: number };

const PRIORITIES = ["P1", "P2", "P3"] as const;

// Convert minutes to human-readable string
function minutesToLabel(minutes: number | null): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`.replace(".0h", "h");
  const days = minutes / 1440;
  return days % 1 === 0 ? `${days}d` : `${days.toFixed(1)}d`;
}

// Parse human-readable input to minutes
// Accepts: "30min", "2h", "1.5d", "2 dias", "1440" (raw minutes)
function parseToMinutes(val: string): number | null {
  const v = val.trim().toLowerCase();
  if (!v) return null;
  const minMatch = v.match(/^(\d+(?:\.\d+)?)\s*(?:min|m)$/);
  if (minMatch) return Math.round(parseFloat(minMatch[1]));
  const hMatch = v.match(/^(\d+(?:\.\d+)?)\s*h(?:oras?)?$/);
  if (hMatch) return Math.round(parseFloat(hMatch[1]) * 60);
  const dMatch = v.match(/^(\d+(?:\.\d+)?)\s*d(?:ias?)?$/);
  if (dMatch) return Math.round(parseFloat(dMatch[1]) * 1440);
  const raw = parseFloat(v);
  if (!isNaN(raw)) return Math.round(raw);
  return null;
}

type SlaRow = {
  category_id: string;
  priority: string;
  first_response: string;
  resolution: string;
};

export default function SlaConfigTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const isSupervisor = role === "supervisor";

  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [slaConfig, setSlaConfig] = useState<SlaConfig[]>([]);
  const [rows, setRows] = useState<SlaRow[]>([]);
  const [statusSla, setStatusSla] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [catRes, statusRes, slaRes] = await Promise.all([
        supabase.from("categories").select("id, name").order("sort_order"),
        supabase.from("ticket_statuses").select("id, name, color, sla_minutes").order("sort_order"),
        supabase.from("sla_config").select("*"),
      ]);
      const cats = catRes.data || [];
      const stats = statusRes.data || [];
      const configs = slaRes.data || [];

      setCategories(cats);
      setStatuses(stats);
      setSlaConfig(configs);

      // Build editable rows
      const newRows: SlaRow[] = [];
      for (const cat of cats) {
        for (const p of PRIORITIES) {
          const cfg = configs.find(c => c.category_id === cat.id && c.priority === p);
          newRows.push({
            category_id: cat.id,
            priority: p,
            first_response: cfg ? minutesToLabel(cfg.first_response_minutes) : "",
            resolution: cfg ? minutesToLabel(cfg.resolution_minutes) : "",
          });
        }
      }
      setRows(newRows);

      // Status SLA map
      const sMap: Record<string, string> = {};
      for (const s of stats) {
        sMap[s.id] = s.sla_minutes ? minutesToLabel(s.sla_minutes) : "";
      }
      setStatusSla(sMap);
      setLoading(false);
    };
    load();
  }, []);

  const updateRow = (category_id: string, priority: string, field: "first_response" | "resolution", value: string) => {
    setRows(prev => prev.map(r =>
      r.category_id === category_id && r.priority === priority ? { ...r, [field]: value } : r
    ));
  };

  const handleSaveSlaConfig = async () => {
    setSaving(true);
    const upserts: { id: string; category_id: string; priority: "P1" | "P2" | "P3"; first_response_minutes: number; resolution_minutes: number }[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.first_response && !row.resolution) continue;
      const fr = parseToMinutes(row.first_response);
      const res = parseToMinutes(row.resolution);
      if (row.first_response && fr === null) { errors.push(`${row.category_id}/${row.priority}: valor inválido em 1ª Resp`); continue; }
      if (row.resolution && res === null) { errors.push(`${row.category_id}/${row.priority}: valor inválido em Resolução`); continue; }
      const existing = slaConfig.find(c => c.category_id === row.category_id && c.priority === row.priority);
      upserts.push({
        id: existing?.id || `${row.category_id}-${row.priority}`,
        category_id: row.category_id,
        priority: row.priority as "P1" | "P2" | "P3",
        first_response_minutes: fr || 0,
        resolution_minutes: res || 0,
      });
    }

    if (errors.length > 0) {
      toast({ title: "Valores inválidos", description: errors.join("; "), variant: "destructive" });
      setSaving(false);
      return;
    }

    if (upserts.length > 0) {
      const { error } = await supabase.from("sla_config").upsert(upserts, { onConflict: "id" });
      if (error) {
        toast({ title: "Erro ao guardar SLA", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      // Refresh
      const { data } = await supabase.from("sla_config").select("*");
      setSlaConfig(data || []);
    }

    toast({ title: "SLA guardado com sucesso" });
    setSaving(false);
  };

  const handleSaveStatusSla = async () => {
    setSavingStatus(true);
    for (const status of statuses) {
      const val = statusSla[status.id];
      const minutes = val ? parseToMinutes(val) : null;
      if (val && minutes === null) {
        toast({ title: `Valor inválido para estado "${status.name}"`, variant: "destructive" });
        setSavingStatus(false);
        return;
      }
      const { error } = await supabase.from("ticket_statuses").update({ sla_minutes: minutes }).eq("id", status.id);
      if (error) {
        toast({ title: `Erro ao guardar "${status.name}"`, description: error.message, variant: "destructive" });
        setSavingStatus(false);
        return;
      }
    }
    toast({ title: "SLA por estado guardado com sucesso" });
    setSavingStatus(false);
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm p-4">A carregar configurações SLA…</div>;
  }

  const formatHint = (
    <p className="text-[11px] text-muted-foreground mt-1">
      Formatos aceites: <code className="bg-muted px-1 rounded">30min</code> · <code className="bg-muted px-1 rounded">2h</code> · <code className="bg-muted px-1 rounded">1.5d</code> · <code className="bg-muted px-1 rounded">30d</code>
    </p>
  );

  return (
    <div className="space-y-6">
      {!isSupervisor && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Apenas supervisores podem editar as configurações de SLA.
        </div>
      )}

      {/* Section A: Category × Priority SLA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            SLA por Categoria e Prioridade
          </CardTitle>
          <CardDescription>
            Define os prazos de primeira resposta e resolução total para cada combinação de categoria e prioridade.
            {formatHint}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground min-w-[160px]">Categoria</th>
                  {PRIORITIES.map(p => (
                    <th key={p} colSpan={2} className="text-center pb-2 px-2">
                      <Badge variant="outline" className={p === "P1" ? "border-destructive text-destructive" : p === "P2" ? "border-warning text-warning" : "border-muted-foreground text-muted-foreground"}>
                        {p}
                      </Badge>
                    </th>
                  ))}
                </tr>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1 pr-4" />
                  {PRIORITIES.map(p => (
                    <>
                      <th key={`${p}-fr`} className="py-1 px-1 font-normal text-center whitespace-nowrap">1ª Resp.</th>
                      <th key={`${p}-res`} className="py-1 px-1 font-normal text-center whitespace-nowrap">Resolução</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2 pr-4 font-medium text-sm whitespace-nowrap">{cat.name}</td>
                    {PRIORITIES.map(p => {
                      const row = rows.find(r => r.category_id === cat.id && r.priority === p)!;
                      return (
                        <>
                          <td key={`${cat.id}-${p}-fr`} className="px-1 py-1.5">
                            <Input
                              value={row?.first_response || ""}
                              onChange={e => updateRow(cat.id, p, "first_response", e.target.value)}
                              placeholder="ex: 4h"
                              className="h-7 text-xs w-20 text-center"
                              disabled={!isSupervisor}
                            />
                          </td>
                          <td key={`${cat.id}-${p}-res`} className="px-1 py-1.5">
                            <Input
                              value={row?.resolution || ""}
                              onChange={e => updateRow(cat.id, p, "resolution", e.target.value)}
                              placeholder="ex: 30d"
                              className="h-7 text-xs w-20 text-center"
                              disabled={!isSupervisor}
                            />
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isSupervisor && (
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={handleSaveSlaConfig} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? "A guardar…" : "Guardar SLA Global"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Section B: Per-status SLA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            SLA por Estado (Tempo Máximo no Estágio)
          </CardTitle>
          <CardDescription>
            Define o tempo máximo que um ticket pode permanecer em cada estado antes de ser considerado em risco.
            {formatHint}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {statuses.map(status => (
              <div key={status.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: status.color || "#6b7280" }}
                />
                <span className="text-sm font-medium flex-1">{status.name}</span>
                <div className="flex items-center gap-2">
                  <Input
                    value={statusSla[status.id] || ""}
                    onChange={e => setStatusSla(prev => ({ ...prev, [status.id]: e.target.value }))}
                    placeholder="sem SLA"
                    className="h-7 text-xs w-24 text-center"
                    disabled={!isSupervisor}
                  />
                  {statusSla[status.id] ? (
                    <Badge variant="secondary" className="text-[10px]">activo</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">sem SLA</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isSupervisor && (
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={handleSaveStatusSla} disabled={savingStatus}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingStatus ? "A guardar…" : "Guardar SLA por Estado"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
