import { Badge } from "@/components/ui/badge";
import { Ticket, Phone, TruckIcon, ClipboardCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

interface OrderInternalDataProps {
  data: {
    tickets: any[];
    phoneCalls: any[];
    deliveryConfirmations: any[];
    postDeliveryConfirmations: any[];
  };
}

export default function OrderInternalData({ data }: OrderInternalDataProps) {
  const { tickets, phoneCalls, deliveryConfirmations, postDeliveryConfirmations } = data;
  const hasAny = tickets.length > 0 || phoneCalls.length > 0 || deliveryConfirmations.length > 0 || postDeliveryConfirmations.length > 0;

  if (!hasAny) return null;

  const fmtDt = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return d; }
  };

  const priorityColor = (p: string) => {
    if (p === "P1") return "text-destructive";
    if (p === "P2") return "text-yellow-600 dark:text-yellow-400";
    return "text-muted-foreground";
  };

  return (
    <div className="border-t border-border/50 pt-2 mt-2 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Dados Internos</p>

      {/* Tickets */}
      {tickets.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <Ticket className="h-3 w-3" /> Tickets ({tickets.length})
          </p>
          {tickets.map((t: any) => (
            <div key={t.id} className="flex items-center gap-2 text-[11px] bg-muted/40 rounded px-2 py-1">
              <span className="font-medium">#{t.ticket_number}</span>
              <span className="truncate flex-1 text-muted-foreground">{t.subject}</span>
              <Badge variant="outline" className="text-[9px] h-4">{t.status}</Badge>
              <span className={`font-semibold text-[10px] ${priorityColor(t.priority)}`}>{t.priority}</span>
            </div>
          ))}
        </div>
      )}

      {/* Phone Calls */}
      {phoneCalls.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" /> Ligações ({phoneCalls.length})
          </p>
          {phoneCalls.map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 text-[11px] bg-muted/40 rounded px-2 py-1">
              <span className="font-medium">{p.client_name}</span>
              <span className="truncate flex-1 text-muted-foreground">{p.subject}</span>
              <Badge variant="outline" className="text-[9px] h-4">{p.status}</Badge>
              <span className="text-[10px] text-muted-foreground">{fmtDt(p.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Delivery Confirmations */}
      {deliveryConfirmations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <TruckIcon className="h-3 w-3" /> Confirmações Entrega ({deliveryConfirmations.length})
          </p>
          {deliveryConfirmations.map((d: any) => (
            <div key={d.id} className="flex items-center gap-2 text-[11px] bg-muted/40 rounded px-2 py-1">
              {d.confirmed ? (
                <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive shrink-0" />
              )}
              <span className="font-medium">{d.confirmed ? "Confirmada" : "Não confirmada"}</span>
              <span className="text-muted-foreground">({d.contact_attempts} tentativa{d.contact_attempts !== 1 ? "s" : ""})</span>
              {d.notes && <span className="truncate flex-1 text-muted-foreground">{d.notes}</span>}
              <span className="text-[10px] text-muted-foreground ml-auto">{fmtDt(d.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Post Delivery Confirmations */}
      {postDeliveryConfirmations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <ClipboardCheck className="h-3 w-3" /> Pós-Entrega ({postDeliveryConfirmations.length})
          </p>
          {postDeliveryConfirmations.map((pd: any) => {
            const allOk = pd.client_satisfied && pd.product_ok && pd.assembly_ok && pd.no_damage;
            return (
              <div key={pd.id} className="text-[11px] bg-muted/40 rounded px-2 py-1.5 space-y-0.5">
                <div className="flex items-center gap-2">
                  {allOk ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-yellow-600 shrink-0" />
                  )}
                  <span className="font-medium">{pd.client_name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{fmtDt(pd.created_at)}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <StatusPill ok={pd.client_satisfied} label="Satisfeito" />
                  <StatusPill ok={pd.product_ok} label="Produto OK" />
                  <StatusPill ok={pd.assembly_ok} label="Montagem OK" />
                  <StatusPill ok={pd.no_damage} label="Sem danos" />
                </div>
                {pd.issues_reported && (
                  <p className="text-destructive/80 text-[10px] mt-0.5">⚠ {pd.issues_reported}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full ${ok ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
