import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Mail, ExternalLink, RefreshCw, CheckCircle, Ban, ShieldOff, Archive, Link2, Plus, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";

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
  action_metadata: any;
};

const FILTERS = [
  { key: "all", label: "Todos", statuses: null as string[] | null },
  { key: "processed", label: "Processados", statuses: ["processed"] },
  { key: "pending_review", label: "Pendentes", statuses: ["pending_review"] },
  { key: "quarantined", label: "Quarentena", statuses: ["quarantined"] },
  { key: "failed", label: "Falhas", statuses: ["failed"] },
  { key: "duplicate", label: "Duplicados", statuses: ["duplicate"] },
  { key: "spam", label: "Spam", statuses: ["spam"] },
  { key: "ignored", label: "Ignorados", statuses: ["ignored", "reviewed"] },
];

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  processed: { label: "Processado", variant: "default" },
  pending_review: { label: "Revisão", variant: "secondary" },
  quarantined: { label: "Quarentena", variant: "destructive" },
  failed: { label: "Falha", variant: "destructive" },
  duplicate: { label: "Duplicado", variant: "outline" },
  received: { label: "Recebido", variant: "outline" },
  spam: { label: "Spam", variant: "destructive" },
  ignored: { label: "Ignorado", variant: "outline" },
  reviewed: { label: "Revisto", variant: "outline" },
};

type SpamKind = "spam" | "suspect" | "clean";

function spamKind(r: { spam_score: number; status: string }): SpamKind {
  if (r.status === "spam" || r.status === "quarantined" || r.spam_score >= 80) return "spam";
  if (r.spam_score >= 40) return "suspect";
  return "clean";
}

const SPAM_META: Record<SpamKind, { label: string; cls: string; dot: string }> = {
  spam: {
    label: "Spam",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  suspect: {
    label: "Suspeito",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-600",
    dot: "bg-amber-500",
  },
  clean: {
    label: "Legítimo",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
    dot: "bg-emerald-500",
  },
};

function SpamFlag({ row, showScore = true }: { row: { spam_score: number; status: string }; showScore?: boolean }) {
  const kind = spamKind(row);
  const meta = SPAM_META[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
      {showScore && <span className="opacity-60">· {row.spam_score}</span>}
    </span>
  );
}

function spamLabel(score: number): { label: string; cls: string } {
  const kind = spamKind({ spam_score: score, status: "" });
  return { label: SPAM_META[kind].label, cls: SPAM_META[kind].cls };
}

export default function InboundEmailEvents() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [spamView, setSpamView] = useState<"all" | SpamKind>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [acting, setActing] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachQuery, setAttachQuery] = useState("");
  const [attachResults, setAttachResults] = useState<any[]>([]);
  const [attachSearching, setAttachSearching] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    candidates: Array<{
      ticket_id: string; ticket_number: number | string; subject: string; status: string;
      is_closed: boolean; is_resolved: boolean; assigned_to: string | null;
      priority: string | null; updated_at: string;
      next_action?: string | null; next_action_due_at?: string | null;
    }>;
    recommendation: "auto_append_safe" | "manual_select" | "no_open_ticket" | "closed_ticket_only";
  } | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  // Phase 9 — fetch open-ticket suggestion whenever a non-terminal event is selected.
  useEffect(() => {
    setSuggestion(null);
    if (!selected) return;
    const TERMINAL = new Set(["processed", "duplicate", "spam", "ignored", "reviewed"]);
    if (TERMINAL.has(selected.status)) return;
    let cancelled = false;
    setSuggestionLoading(true);
    supabase.functions
      .invoke("suggest-open-ticket-for-inbound-email", { body: { event_id: selected.id } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setSuggestion(null);
        } else {
          setSuggestion(data as any);
        }
      })
      .finally(() => { if (!cancelled) setSuggestionLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.status]);

  const spamCounts = useMemo(() => {
    const c = { all: rows.length, clean: 0, suspect: 0, spam: 0 };
    rows.forEach((r) => { c[spamKind(r)]++; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (spamView !== "all" && spamKind(r) !== spamView) return false;
      if (!s) return true;
      return (
        r.from_address?.toLowerCase().includes(s) ||
        r.subject?.toLowerCase().includes(s) ||
        r.routed_ticket_id?.toLowerCase().includes(s)
      );
    });
  }, [rows, search, spamView]);

  async function runActionOn(eventId: string, action: string, extra: Record<string, unknown> = {}) {
    setActing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-inbound-email-event-action", {
        body: { event_id: eventId, action, ...extra },
      });
      if (error) throw error;
      if (data && (data as any).success === false) {
        toast({
          title: (data as any).code === "ticket_closed" ? "Ticket fechado" : "Ação bloqueada",
          description: (data as any).message || "Não foi possível concluir.",
          variant: "destructive",
        });
        return null;
      }
      const taken = (data as any)?.action_taken as string | undefined;
      const tn = (data as any)?.ticket_number;
      const ptn = (data as any)?.parent_ticket_number;
      if (action === "create_ticket" && taken === "appended") {
        toast({ title: "E-mail anexado", description: `Anexado ao ticket aberto #${tn} do cliente.` });
      } else if (action === "create_ticket" && taken === "continuation") {
        toast({ title: "Ticket de continuação criado", description: `#${tn} criado (continuação do #${ptn} fechado).` });
      } else if (action === "create_ticket" && taken === "new") {
        toast({ title: "Ticket criado", description: `Novo ticket #${tn}.` });
      } else {
        toast({ title: "Ação executada", description: actionLabel(action) });
      }
      await load();
      if (selected && selected.id === eventId) {
        const updated = await supabase
          .from("inbound_email_events")
          .select("*")
          .eq("id", eventId)
          .maybeSingle();
        if (updated.data) setSelected(updated.data as any);
      }
      return data;
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || String(err), variant: "destructive" });
      return null;
    } finally {
      setActing(false);
    }
  }

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    return runActionOn(selected.id, action, extra);
  }

  async function searchTickets() {
    const q = attachQuery.trim();
    if (!q) return;
    setAttachSearching(true);
    let query = supabase
      .from("tickets")
      .select("id, ticket_number, subject, client_name, client_email, status")
      .order("created_at", { ascending: false })
      .limit(15);

    const asNumber = Number(q.replace(/^#/, ""));
    if (!isNaN(asNumber) && asNumber > 0 && /^#?\d+$/.test(q)) {
      query = query.eq("ticket_number", asNumber);
    } else {
      query = query.or(
        `subject.ilike.%${q}%,client_email.ilike.%${q}%,client_name.ilike.%${q}%`,
      );
    }
    const { data } = await query;
    setAttachResults(data || []);
    setAttachSearching(false);
  }

  async function attachToTicket(ticketId: string) {
    const res = await runAction("append_to_ticket", { ticket_id: ticketId });
    if (res) {
      setAttachOpen(false);
      setAttachQuery("");
      setAttachResults([]);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Caixa de Entrada"
        subtitle="Registo de todos os e-mails recebidos e respectivas decisões de encaminhamento."
        icon={<Mail className="h-6 w-6" />}
        accent="primary"
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
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

        {/* Separador spam / legítimo */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground mr-1">Classificação:</span>
          {([
            { key: "all", label: "Tudo", count: spamCounts.all },
            { key: "clean", label: "Legítimos", count: spamCounts.clean },
            { key: "suspect", label: "Suspeitos", count: spamCounts.suspect },
            { key: "spam", label: "Spam", count: spamCounts.spam },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setSpamView(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                spamView === t.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.key !== "all" && (
                <span className={`h-1.5 w-1.5 rounded-full ${SPAM_META[t.key as SpamKind].dot}`} />
              )}
              {t.label}
              <span className="opacity-70">{t.count}</span>
            </button>
          ))}
        </div>


        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Sem eventos para os filtros selecionados.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Remetente</TableHead>
                <TableHead className="hidden lg:table-cell">Assunto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Spam</TableHead>
                <TableHead className="hidden xl:table-cell">Ação</TableHead>
                <TableHead className="text-right sticky right-0 bg-card">Ticket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const badge = STATUS_BADGES[r.status] || { label: r.status, variant: "outline" as const };
                const TERMINAL_ROW = ["processed", "duplicate", "spam", "ignored", "reviewed"];
                const canCreate = !r.routed_ticket_id && !TERMINAL_ROW.includes(r.status);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.received_at), { addSuffix: true, locale: pt })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{r.from_name || r.from_address}</div>
                      {r.from_name && <div className="text-xs text-muted-foreground">{r.from_address}</div>}
                      <div className="text-xs text-muted-foreground lg:hidden truncate max-w-[180px]">{r.subject || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px] truncate hidden lg:table-cell">{r.subject || "—"}</TableCell>
                    <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                    <TableCell className="text-xs hidden md:table-cell">
                      <span className={spamLabel(r.spam_score).cls}>
                        {spamLabel(r.spam_score).label}
                      </span>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        score {r.spam_score}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden xl:table-cell">{r.routing_action || "—"}</TableCell>
                    <TableCell className="text-right sticky right-0 bg-card">
                      {r.routed_ticket_id ? (
                        <Link to={`/tickets/${r.routed_ticket_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                          Abrir <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : canCreate ? (
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={acting}
                          onClick={(e) => { e.stopPropagation(); runActionOn(r.id, "create_ticket"); }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Criar
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );

              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {selected && (
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Detalhe do evento</h2>
              <p className="text-xs text-muted-foreground">
                {format(new Date(selected.received_at), "dd/MM/yyyy HH:mm", { locale: pt })}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Fechar</Button>
          </div>

          {/* ── Actions toolbar ─────────────────────────────────────── */}
          <ActionToolbar
            event={selected}
            acting={acting}
            onCreate={() => runAction("create_ticket")}
            onAttach={() => { setAttachOpen(true); setAttachQuery(selected.from_address || ""); }}
            onSpam={() => runAction("mark_spam")}
            onBlock={() => runAction("block_sender")}
            onIgnore={() => runAction("ignore")}
            onMarkReviewed={() => runAction("mark_reviewed")}
          />

          {/* ── Phase 9 — Open-ticket suggestion ─────────────────────── */}
          {suggestionLoading && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> A procurar tickets abertos deste cliente…
            </div>
          )}
          {!suggestionLoading && suggestion && suggestion.candidates.length > 0 && (() => {
            const openOnes = suggestion.candidates.filter((c) => !c.is_closed && !c.is_resolved);
            const closedOnly = openOnes.length === 0;
            return (
              <div
                className={`rounded-lg border p-3 space-y-2 ${
                  closedOnly
                    ? "border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60"
                    : "border-primary/30 bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {closedOnly ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Link2 className="h-4 w-4 text-primary" />}
                  {closedOnly
                    ? "Existe um ticket anterior, mas está fechado/resolvido"
                    : suggestion.recommendation === "auto_append_safe"
                      ? "Existe ticket aberto deste cliente"
                      : `Vários tickets abertos deste cliente (${openOnes.length})`}
                </div>
                {closedOnly && (
                  <p className="text-xs text-muted-foreground">
                    Não é permitido anexar a um ticket fechado. Crie um novo ticket (continuação) em vez disso.
                  </p>
                )}
                {!closedOnly && suggestion.recommendation === "manual_select" && (
                  <p className="text-xs text-muted-foreground">
                    Existem vários candidatos — escolha manualmente o ticket correto.
                  </p>
                )}
                <div className="space-y-1.5">
                  {(closedOnly ? suggestion.candidates : openOnes).slice(0, 5).map((c) => (
                    <div key={c.ticket_id} className="flex items-center justify-between gap-3 rounded-md bg-background border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          #{c.ticket_number} — {c.subject}
                          {(c.is_closed || c.is_resolved) && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {c.is_resolved ? "Resolvido" : "Fechado"}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.status}{c.priority ? ` • ${c.priority}` : ""}{" • atualizado "}
                          {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: pt })}
                          {c.next_action ? ` • próx.: ${c.next_action}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link to={`/tickets/${c.ticket_id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                          Abrir <ExternalLink className="h-3 w-3" />
                        </Link>
                        {!c.is_closed && !c.is_resolved && (
                          <Button size="sm" onClick={() => runAction("append_to_ticket", { ticket_id: c.ticket_id })} disabled={acting}>
                            <Link2 className="h-3.5 w-3.5" /> Anexar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}


          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Remetente" value={`${selected.from_name || ""} <${selected.from_address}>`} />
            <Field label="Assunto" value={selected.subject || "—"} />
            <Field label="Status" value={STATUS_BADGES[selected.status]?.label || selected.status} />
            <Field label="Spam" value={`${spamLabel(selected.spam_score).label} (score ${selected.spam_score})`} />
            <Field label="Ação" value={selected.routing_action || "—"} />
            <Field label="Processado em" value={selected.processed_at ? format(new Date(selected.processed_at), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"} />
            {selected.routed_ticket_id && (
              <Field label="Ticket relacionado" value={<Link to={`/tickets/${selected.routed_ticket_id}`} className="text-primary hover:underline">Abrir ticket</Link>} />
            )}
            {selected.parent_ticket_id && (
              <Field label="Ticket pai" value={<Link to={`/tickets/${selected.parent_ticket_id}`} className="text-primary hover:underline">Abrir ticket pai</Link>} />
            )}
          </div>

          {selected.routing_reason && <Field label="Motivo da decisão" value={selected.routing_reason} block />}
          {Array.isArray(selected.spam_reasons) && selected.spam_reasons.length > 0 && (
            <Field
              label="Sinais de spam"
              value={<ul className="list-disc list-inside text-xs space-y-0.5">{selected.spam_reasons.map((r: any, i: number) => (<li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>))}</ul>}
              block
            />
          )}
          {selected.error_message && (
            <Field label="Erro" value={<pre className="text-xs whitespace-pre-wrap text-destructive">{selected.error_message}</pre>} block />
          )}
          {selected.body_preview && (
            <Field label="Pré-visualização" value={<pre className="text-xs whitespace-pre-wrap text-muted-foreground">{selected.body_preview}</pre>} block />
          )}
          {selected.action_metadata?.last && (
            <Field
              label="Última ação manual"
              value={
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>{actionLabel(selected.action_metadata.last.manual_action)} — {format(new Date(selected.action_metadata.last.action_at), "dd/MM/yyyy HH:mm", { locale: pt })}</div>
                  <div className="font-mono">{selected.action_metadata.last.action_by}</div>
                </div>
              }
              block
            />
          )}
        </Card>
      )}

      {/* ── Attach to ticket dialog ───────────────────────────────── */}
      <Dialog open={attachOpen} onOpenChange={(o) => { setAttachOpen(o); if (!o) { setAttachQuery(""); setAttachResults([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anexar a ticket existente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nº do ticket (#123), e-mail do cliente ou assunto"
                value={attachQuery}
                onChange={(e) => setAttachQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchTickets(); }}
              />
              <Button onClick={searchTickets} disabled={attachSearching}>
                {attachSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Procurar"}
              </Button>
            </div>
            <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
              {attachResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Procure um ticket.</div>
              ) : attachResults.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">#{t.ticket_number} — {t.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.client_name} • {t.client_email} • {t.status}</div>
                  </div>
                  <Button size="sm" onClick={() => attachToTicket(t.id)} disabled={acting}>
                    Anexar
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Se o ticket estiver fechado/resolvido, será bloqueado — crie um novo ticket de continuação.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function actionLabel(a?: string | null): string {
  switch (a) {
    case "create_ticket": return "Ticket criado manualmente";
    case "append_to_ticket": return "Anexado a ticket existente";
    case "mark_spam": return "Marcado como spam";
    case "block_sender": return "Remetente bloqueado";
    case "ignore": return "Ignorado";
    case "mark_reviewed": return "Marcado como revisto";
    default: return a || "—";
  }
}

function ActionToolbar({
  event, acting, onCreate, onAttach, onSpam, onBlock, onIgnore, onMarkReviewed,
}: {
  event: EventRow;
  acting: boolean;
  onCreate: () => void;
  onAttach: () => void;
  onSpam: () => void;
  onBlock: () => void;
  onIgnore: () => void;
  onMarkReviewed: () => void;
}) {
  const s = event.status;
  const isPending = s === "pending_review";
  const isQuarantined = s === "quarantined";
  const isFailed = s === "failed";
  const isTerminal = s === "processed" || s === "duplicate" || s === "spam" || s === "ignored" || s === "reviewed";

  if (isTerminal) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Sem ações destrutivas disponíveis. Veja o ticket relacionado ou o histórico abaixo.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(isPending || isQuarantined || isFailed || !event.routed_ticket_id) && (
        <>
          <Button size="sm" onClick={onCreate} disabled={acting}>
            <Plus className="h-4 w-4" /> {isQuarantined ? "Aprovar e criar ticket" : "Criar ticket"}
          </Button>
          <Button size="sm" variant="outline" onClick={onAttach} disabled={acting}>
            <Link2 className="h-4 w-4" /> Anexar a ticket existente
          </Button>
          <Button size="sm" variant="outline" onClick={onSpam} disabled={acting}>
            <ShieldOff className="h-4 w-4" /> {isQuarantined ? "Spam confirmado" : "Marcar como spam"}
          </Button>
          {isQuarantined && (
            <Button size="sm" variant="outline" onClick={onBlock} disabled={acting}>
              <Ban className="h-4 w-4" /> Bloquear remetente
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onIgnore} disabled={acting}>
            <Archive className="h-4 w-4" /> Ignorar
          </Button>
        </>
      )}
      {isFailed && (
        <Button size="sm" variant="outline" onClick={onMarkReviewed} disabled={acting}>
          <CheckCircle className="h-4 w-4" /> Marcar como revisto
        </Button>
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
