import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search, AlertTriangle, Package, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderContextCardProps {
  ticket: any;
  userId: string;
  onUpdate: () => void;
}

const STATUS_LABEL: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  not_checked: { label: "Não verificada", tone: "secondary" },
  found: { label: "Encontrada", tone: "default" },
  not_found: { label: "Não encontrada", tone: "outline" },
  multiple_matches: { label: "Múltiplas possíveis", tone: "outline" },
  error: { label: "Erro na consulta", tone: "destructive" },
  mismatch: { label: "Divergência", tone: "destructive" },
};

function pickVenda(payload: any): any | null {
  const list = payload?.data || payload?.vendas || (Array.isArray(payload) ? payload : null);
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return first?.venda || first;
}

function buildSnapshot(venda: any) {
  if (!venda) return null;
  const cliente = venda.cliente || {};
  const produtos = (venda.produtos || []).map((p: any) => ({
    nome: p?.produto?.nome || p?.nome || p?.descricao || "",
    quantidade: p?.quantidade ?? null,
    valor_unitario: p?.valor_unitario ?? null,
  })).filter((p: any) => p.nome);
  return {
    codigo: venda.codigo || venda.numero || null,
    data_venda: venda.data || venda.data_venda || null,
    previsao: venda.data_previsao || venda.previsao || null,
    valor_total: venda.valor_total || venda.total || null,
    situacao: venda.nome_situacao || venda.situacao || null,
    vendedor: venda.nome_vendedor || venda.vendedor || null,
    observacoes: venda.observacoes || null,
    cliente: {
      nome: cliente.nome || venda.nome_cliente || null,
      email: cliente.email || null,
      telefone: cliente.telefone || cliente.celular || null,
    },
    produtos,
    fetched_at: new Date().toISOString(),
  };
}

function hasMismatch(ticket: any, snap: any): boolean {
  if (!snap?.cliente?.email || !ticket?.client_email) return false;
  return snap.cliente.email.trim().toLowerCase() !== String(ticket.client_email).trim().toLowerCase();
}

export default function OrderContextCard({ ticket, userId, onUpdate }: OrderContextCardProps) {
  const { toast } = useToast();
  const [orderInput, setOrderInput] = useState(ticket?.order_number || "");
  const [loading, setLoading] = useState(false);

  const status: string = ticket?.order_lookup_status || (ticket?.order_number ? "not_checked" : "not_checked");
  const snap = ticket?.order_snapshot;
  const lookupAt = ticket?.order_lookup_at ? new Date(ticket.order_lookup_at) : null;
  const mismatch = snap && hasMismatch(ticket, snap);
  const effectiveStatus = mismatch ? "mismatch" : status;
  const statusInfo = STATUS_LABEL[effectiveStatus] || STATUS_LABEL.not_checked;

  const doLookup = async () => {
    const code = (orderInput || ticket?.order_number || "").trim();
    if (!code) {
      toast({ title: "Indica o número da encomenda", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Persist order_number first if changed
      if (code !== ticket?.order_number) {
        await supabase.from("tickets").update({ order_number: code }).eq("id", ticket.id);
      }
      const { data, error } = await supabase.functions.invoke("gestaoclick-proxy", {
        body: { action: "search_vendas", query: code },
      });
      if (error) throw error;
      const venda = pickVenda(data);
      const now = new Date().toISOString();
      if (!venda) {
        await supabase.from("tickets").update({
          order_lookup_status: "not_found",
          order_lookup_at: now,
          order_lookup_error: null,
          order_snapshot: null,
        }).eq("id", ticket.id);
        await supabase.from("ticket_events").insert({
          ticket_id: ticket.id,
          user_id: userId,
          event_type: "note",
          content: `Consulta de encomenda ${code}: não encontrada.`,
          metadata: { order_lookup_status: "not_found", order_number: code },
        });
        toast({ title: "Encomenda não encontrada" });
      } else {
        const snapshot = buildSnapshot(venda);
        await supabase.from("tickets").update({
          order_lookup_status: "found",
          order_lookup_at: now,
          order_lookup_error: null,
          order_snapshot: snapshot,
        }).eq("id", ticket.id);
        await supabase.from("ticket_events").insert({
          ticket_id: ticket.id,
          user_id: userId,
          event_type: "note",
          content: `Consulta de encomenda ${code}: encontrada (${snapshot?.situacao || "—"}).`,
          metadata: { order_lookup_status: "found", order_number: code },
        });
        toast({ title: "Encomenda atualizada" });
      }
      onUpdate();
    } catch (e: any) {
      const msg = e?.message || "Erro desconhecido";
      await supabase.from("tickets").update({
        order_lookup_status: "error",
        order_lookup_at: new Date().toISOString(),
        order_lookup_error: msg.slice(0, 500),
      }).eq("id", ticket.id);
      await supabase.from("ticket_events").insert({
        ticket_id: ticket.id,
        user_id: userId,
        event_type: "note",
        content: `Consulta de encomenda falhou: ${msg.slice(0, 200)}`,
        metadata: { order_lookup_status: "error" },
      });
      toast({ title: "Erro ao consultar encomenda", description: msg, variant: "destructive" });
      onUpdate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Package className="h-4 w-4" />
          Encomenda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusInfo.tone}>{statusInfo.label}</Badge>
          {mismatch && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Possível divergência
            </Badge>
          )}
          {lookupAt && (
            <span className="text-xs text-muted-foreground">
              Atualizada {lookupAt.toLocaleString("pt-PT")}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Nº Encomenda</Label>
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              placeholder="Ex: 12345"
            />
            <Button size="sm" onClick={doLookup} disabled={loading} className="h-8">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ticket?.order_snapshot ? <RefreshCw className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {ticket?.order_lookup_error && status === "error" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {ticket.order_lookup_error}
          </div>
        )}

        {snap && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs">
            {snap.cliente?.nome && (
              <div><span className="text-muted-foreground">Cliente:</span> <span className="ml-1">{snap.cliente.nome}</span></div>
            )}
            {snap.cliente?.email && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Email:</span>
                <span>{snap.cliente.email}</span>
                {mismatch ? <XCircle className="h-3 w-3 text-destructive" /> : <CheckCircle2 className="h-3 w-3 text-primary" />}
              </div>
            )}
            {snap.cliente?.telefone && (
              <div><span className="text-muted-foreground">Telefone:</span> <span className="ml-1">{snap.cliente.telefone}</span></div>
            )}
            {snap.data_venda && (
              <div><span className="text-muted-foreground">Data:</span> <span className="ml-1">{snap.data_venda}</span></div>
            )}
            {snap.previsao && (
              <div><span className="text-muted-foreground">Previsão:</span> <span className="ml-1">{snap.previsao}</span></div>
            )}
            {snap.situacao && (
              <div><span className="text-muted-foreground">Estado:</span> <span className="ml-1">{snap.situacao}</span></div>
            )}
            {snap.valor_total != null && (
              <div><span className="text-muted-foreground">Valor:</span> <span className="ml-1">{snap.valor_total}</span></div>
            )}
            {snap.vendedor && (
              <div><span className="text-muted-foreground">Vendedor:</span> <span className="ml-1">{snap.vendedor}</span></div>
            )}
            {Array.isArray(snap.produtos) && snap.produtos.length > 0 && (
              <div>
                <span className="text-muted-foreground">Produtos:</span>
                <ul className="ml-3 mt-1 list-disc space-y-0.5">
                  {snap.produtos.slice(0, 8).map((p: any, i: number) => (
                    <li key={i}>
                      {p.nome}
                      {p.quantidade != null && <span className="text-muted-foreground"> × {p.quantidade}</span>}
                    </li>
                  ))}
                  {snap.produtos.length > 8 && (
                    <li className="text-muted-foreground">+ {snap.produtos.length - 8} mais…</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
