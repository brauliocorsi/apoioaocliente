import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, Camera } from "lucide-react";

interface ProductLine {
  product_id?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  colis_number?: string | null;
  quantity?: number | null;
  disposition?: string | null;
}

interface Incident {
  id: string;
  incident_id: string;
  order_number: string | null;
  route_id: string | null;
  attempt_id: string | null;
  note_id: string | null;
  occurred_at: string | null;
  driver_id: string | null;
  driver_name: string | null;
  delivery_outcome: string | null;
  product_lines: ProductLine[];
  attachments: Array<{ name?: string | null; mime_type?: string | null }>;
  attachments_status: string;
}

/** Contexto da assistência aberta pelo entregador (origem: Entrega WMS). */
export default function WmsDeliveryCard({ ticketId }: { ticketId: string }) {
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("wms_delivery_incidents")
        .select("*")
        .eq("ticket_id", ticketId)
        .maybeSingle();
      if (!cancelled && data) setIncident(data as unknown as Incident);
    })();
    return () => { cancelled = true; };
  }, [ticketId]);

  if (!incident) return null;

  const lines = Array.isArray(incident.product_lines) ? incident.product_lines : [];
  const atts = Array.isArray(incident.attachments) ? incident.attachments : [];

  return (
    <Card className="shadow-soft border-warning/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <Truck className="h-4 w-4" />
          </span>
          Origem: Entrega WMS
          {incident.delivery_outcome && (
            <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
              {incident.delivery_outcome}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Field label="Encomenda" value={incident.order_number} />
          <Field label="Rota" value={incident.route_id} />
          <Field label="Tentativa" value={incident.attempt_id} />
          <Field label="Nota" value={incident.note_id} />
          <Field label="Entregador" value={incident.driver_name || incident.driver_id} />
          <Field
            label="Ocorrido em"
            value={incident.occurred_at ? new Date(incident.occurred_at).toLocaleString("pt-PT") : null}
          />
        </dl>

        {lines.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Produtos / volumes
            </p>
            <ul className="space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="text-sm text-foreground/90">
                  {l.product_name || l.product_code || l.product_id || "Produto"}
                  {l.colis_number ? ` · volume ${l.colis_number}` : ""}
                  {l.quantity != null ? ` · qtd ${l.quantity}` : ""}
                  {l.disposition ? ` · ${l.disposition}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {atts.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
              <Camera className="h-3.5 w-3.5" /> Evidências ({atts.length})
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {atts.map((a, i) => (
                <li key={i}>{a.name || `ficheiro ${i + 1}`}{a.mime_type ? ` · ${a.mime_type}` : ""}</li>
              ))}
            </ul>
            {incident.attachments_status === "pending" && (
              <p className="text-xs text-warning mt-1.5">
                As fotografias continuam guardadas na app de entregas — ainda não foram copiadas para o ticket.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}
