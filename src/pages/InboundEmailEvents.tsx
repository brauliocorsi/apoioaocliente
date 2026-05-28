import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Mail, ExternalLink, RefreshCw } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";

type EventRow = {
  id: string;
  received_at: string;
  processed_at: string | null;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  status: string;
  spam_score: number;
  spam_reasons: any;
  routing_action: string | null;
  routing_reason: string | null;
  routed_ticket_id: string | null;
  parent_ticket_id: string | null;
  pending_email_id: string | null;
  error_message: string | null;
  body_preview: string | null;
};

const FILTERS = [
  { key: "all", label: "Todos", statuses: null as string[] | null },
  { key: "processed", label: "Processados", statuses: ["processed"] },
  { key: "pending_review", label: "Pendentes", statuses: ["pending_review"] },
  { key: "quarantined", label: "Quarentena", statuses: ["quarantined"] },
  { key: "failed", label: "Falhas", statuses: ["failed"] },
  { key: "duplicate", label: "Duplicados", statuses: ["duplicate"] },
];

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  processed: { label: "Processado", variant: "default" },
  pending_review: { label: "Revisão", variant: "secondary" },
  quarantined: { label: "Quarentena", variant: "destructive" },
  failed: { label: "Falha", variant: "destructive" },
  duplicate: { label: "Duplicado", variant: "outline" },
  received: { label: "Recebido", variant: "outline" },
};

export default function InboundEmailEvents() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("inbound_email_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(500);

    const f = FILTERS.find((x) => x.key === filter);
    if (f?.statuses) q = q.in("status", f.statuses);

    const { data, error } = await q;
    if (!error && data) setRows(data as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.from_address?.toLowerCase().includes(s) ||
        r.subject?.toLowerCase().includes(s) ||
        r.routed_ticket_id?.toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Caixa de Entrada
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registo de todos os e-mails recebidos e respectivas decisões de encaminhamento.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
          <div className="ml-auto w-64">
            <Input
              placeholder="Pesquisar por remetente, assunto ou ticket"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Sem eventos para os filtros selecionados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Remetente</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Spam</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const badge = STATUS_BADGES[r.status] || { label: r.status, variant: "outline" as const };
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.received_at), { addSuffix: true, locale: pt })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{r.from_name || r.from_address}</div>
                      {r.from_name && <div className="text-xs text-muted-foreground">{r.from_address}</div>}
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px] truncate">{r.subject || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={
                          r.spam_score >= 80
                            ? "text-destructive font-semibold"
                            : r.spam_score >= 40
                            ? "text-amber-600 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {r.spam_score}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.routing_action || "—"}
                    </TableCell>
                    <TableCell>
                      {r.routed_ticket_id ? (
                        <Link
                          to={`/tickets/${r.routed_ticket_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline text-xs inline-flex items-center gap-1"
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {selected && (
        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Detalhe do evento</h2>
              <p className="text-xs text-muted-foreground">
                {format(new Date(selected.received_at), "dd/MM/yyyy HH:mm", { locale: pt })}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Fechar
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Remetente" value={`${selected.from_name || ""} <${selected.from_address}>`} />
            <Field label="Assunto" value={selected.subject || "—"} />
            <Field label="Status" value={STATUS_BADGES[selected.status]?.label || selected.status} />
            <Field label="Spam score" value={String(selected.spam_score)} />
            <Field label="Ação" value={selected.routing_action || "—"} />
            <Field
              label="Processado em"
              value={selected.processed_at ? format(new Date(selected.processed_at), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}
            />
            {selected.routed_ticket_id && (
              <Field
                label="Ticket relacionado"
                value={
                  <Link to={`/tickets/${selected.routed_ticket_id}`} className="text-primary hover:underline">
                    Abrir ticket
                  </Link>
                }
              />
            )}
            {selected.parent_ticket_id && (
              <Field
                label="Ticket pai"
                value={
                  <Link to={`/tickets/${selected.parent_ticket_id}`} className="text-primary hover:underline">
                    Abrir ticket pai
                  </Link>
                }
              />
            )}
            {selected.pending_email_id && (
              <Field label="Pending email ID" value={<code className="text-xs">{selected.pending_email_id}</code>} />
            )}
          </div>
          {selected.routing_reason && (
            <Field label="Motivo da decisão" value={selected.routing_reason} block />
          )}
          {Array.isArray(selected.spam_reasons) && selected.spam_reasons.length > 0 && (
            <Field
              label="Sinais de spam"
              value={
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {selected.spam_reasons.map((r: any, i: number) => (
                    <li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
                  ))}
                </ul>
              }
              block
            />
          )}
          {selected.error_message && (
            <Field
              label="Erro"
              value={<pre className="text-xs whitespace-pre-wrap text-destructive">{selected.error_message}</pre>}
              block
            />
          )}
          {selected.body_preview && (
            <Field
              label="Pré-visualização"
              value={<pre className="text-xs whitespace-pre-wrap text-muted-foreground">{selected.body_preview}</pre>}
              block
            />
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, block = false }: { label: string; value: React.ReactNode; block?: boolean }) {
  return (
    <div className={block ? "col-span-2" : ""}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}
