import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Printer, Package, Truck, CreditCard, FileText, User, Store, Calendar, Hash } from "lucide-react";

interface VendaPDFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendaId: string;
  vendaCodigo: string;
}

export default function VendaPDFDialog({ open, onOpenChange, vendaId, vendaCodigo }: VendaPDFDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [venda, setVenda] = useState<any>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchVenda = async () => {
    setLoading(true);
    setVenda(null);
    try {
      const { data, error } = await supabase.functions.invoke("gestaoclick-proxy", {
        body: { action: "get_venda", id: vendaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVenda(data?.data || data);
    } catch (e: any) {
      console.error("Fetch venda error:", e);
      toast({ title: "Erro ao carregar venda", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && vendaId) {
      fetchVenda();
    }
    if (!open) setVenda(null);
  }, [open, vendaId]);

  const handlePrint = () => {
    const content = contentRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast({ title: "Permita popups para imprimir", variant: "destructive" }); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Venda #${vendaCodigo}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; padding: 20px; }
        .print-content { max-width: 800px; margin: auto; }
        h2 { font-size: 18px; color: #c41e3a; margin-bottom: 4px; }
        h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #c41e3a; border-bottom: 1px solid #e5e5e5; padding-bottom: 3px; margin: 14px 0 8px; letter-spacing: 0.5px; }
        table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
        th { background: #f5f5f5; font-weight: 600; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; color: #555; border-bottom: 2px solid #ddd; }
        td { padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 10.5px; }
        tr:nth-child(even) { background: #fafafa; }
        .text-right { text-align: right; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; margin-bottom: 10px; }
        .info-row { display: flex; gap: 6px; font-size: 11px; }
        .info-label { font-weight: 600; color: #555; min-width: 120px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
        .totals { display: flex; justify-content: flex-end; margin-top: 8px; }
        .totals table { width: 250px; }
        .totals .total-final td { font-weight: 700; font-size: 13px; border-top: 2px solid #c41e3a; color: #c41e3a; }
        .obs-box { background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 4px; padding: 8px; font-size: 10px; white-space: pre-wrap; max-height: 300px; overflow: hidden; }
        .footer { margin-top: 16px; text-align: center; font-size: 9px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
      </style></head><body><div class="print-content">${content.innerHTML}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const fmt = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val || "–";
    return num.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  };

  const fmtDate = (val: string) => {
    if (!val) return "–";
    const parts = val.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  };

  // Normalize nested arrays from GestãoClick
  const produtos = (venda?.produtos || []).map((p: any) => p.produto || p);
  const servicos = (venda?.servicos || []).map((s: any) => s.servico || s);
  const pagamentos = (venda?.pagamentos || []).map((p: any) => p.pagamento || p);
  const atributos = (venda?.atributos || []).map((a: any) => a.atributo || a);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Venda #{vendaCodigo}
            </span>
            {venda && (
              <Button onClick={handlePrint} size="sm" variant="outline" className="gap-1.5 shrink-0">
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">A carregar dados da venda...</p>
          </div>
        )}

        {!loading && !venda && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Não foi possível carregar os dados da venda.
          </div>
        )}

        {venda && (
          <div ref={contentRef} className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-primary">Venda #{venda.codigo || vendaCodigo}</h2>
                <p className="text-sm text-muted-foreground">
                  {fmtDate(venda.data)} · {venda.nome_loja || ""}
                </p>
              </div>
              <div className="text-right space-y-1">
                <Badge
                  className="text-xs"
                  style={{
                    backgroundColor: venda.cor_situacao || undefined,
                    color: venda.cor_situacao ? "#333" : undefined,
                  }}
                >
                  {venda.nome_situacao || "–"}
                </Badge>
                <p className="text-lg font-bold">{fmt(venda.valor_total)}</p>
              </div>
            </div>

            <Separator />

            {/* Info Grid */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-primary mb-3 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Informações da Venda
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <InfoRow label="Cliente" value={venda.nome_cliente} />
                <InfoRow label="Vendedor" value={venda.nome_vendedor} />
                <InfoRow label="Centro de Custo" value={venda.nome_centro_custo} />
                <InfoRow label="Canal de Venda" value={venda.nome_canal_venda} />
                <InfoRow label="Prazo Entrega" value={fmtDate(venda.prazo_entrega)} />
                <InfoRow label="Condição Pgto" value={venda.condicao_pagamento === "parcelado" ? "Parcelado" : venda.condicao_pagamento === "a_vista" ? "À vista" : venda.condicao_pagamento} />
                <InfoRow label="Forma Pgto" value={venda.nome_forma_pagamento} />
                <InfoRow label="Nº Parcelas" value={venda.numero_parcelas} />
                {venda.nome_transportadora && <InfoRow label="Transportadora" value={venda.nome_transportadora} />}
                {venda.aos_cuidados_de && <InfoRow label="Aos cuidados de" value={venda.aos_cuidados_de} />}
                <InfoRow label="Criado em" value={venda.cadastrado_em} />
                <InfoRow label="Modificado em" value={venda.modificado_em} />
              </div>
            </div>

            {/* Custom Attributes */}
            {atributos.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary mb-3 flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> Campos Extras
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {atributos.map((a: any, i: number) => (
                    <InfoRow key={i} label={a.descricao || `Campo ${i + 1}`} value={a.conteudo} />
                  ))}
                </div>
              </div>
            )}

            {/* Products */}
            {produtos.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary mb-3 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Produtos ({produtos.length})
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">#</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Produto</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Detalhes</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Qtd</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Valor Unit.</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtos.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="p-2.5 font-medium">{p.nome_produto || "–"}</td>
                          <td className="p-2.5 text-muted-foreground text-xs">{p.detalhes || "–"}</td>
                          <td className="p-2.5 text-right">{p.quantidade || 1}</td>
                          <td className="p-2.5 text-right">{fmt(p.valor_venda)}</td>
                          <td className="p-2.5 text-right font-medium">{fmt(p.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Services */}
            {servicos.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary mb-3 flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" /> Serviços ({servicos.length})
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">#</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Serviço</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Qtd</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Valor Unit.</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicos.map((s: any, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="p-2.5 font-medium">{s.nome_servico || "–"}</td>
                          <td className="p-2.5 text-right">{s.quantidade || 1}</td>
                          <td className="p-2.5 text-right">{fmt(s.valor_venda)}</td>
                          <td className="p-2.5 text-right font-medium">{fmt(s.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                {parseFloat(venda.valor_produtos || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Produtos:</span>
                    <span>{fmt(venda.valor_produtos)}</span>
                  </div>
                )}
                {parseFloat(venda.valor_servicos || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Serviços:</span>
                    <span>{fmt(venda.valor_servicos)}</span>
                  </div>
                )}
                {parseFloat(venda.desconto_valor || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Desconto:</span>
                    <span>-{fmt(venda.desconto_valor)}</span>
                  </div>
                )}
                {parseFloat(venda.valor_frete || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frete:</span>
                    <span>{fmt(venda.valor_frete)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base text-primary pt-1">
                  <span>Total:</span>
                  <span>{fmt(venda.valor_total)}</span>
                </div>
              </div>
            </div>

            {/* Payments */}
            {pagamentos.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary mb-3 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" /> Pagamentos ({pagamentos.length})
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">#</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Vencimento</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Forma</th>
                        <th className="text-right p-2.5 text-xs font-semibold text-muted-foreground">Valor</th>
                        <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentos.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="p-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="p-2.5">{fmtDate(p.data_vencimento)}</td>
                          <td className="p-2.5">{p.nome_forma_pagamento || "–"}</td>
                          <td className="p-2.5 text-right font-medium">{fmt(p.valor)}</td>
                          <td className="p-2.5 text-muted-foreground text-xs">{p.observacao || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Observations */}
            {venda.observacoes && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary mb-3">Observações</h3>
                <div className="bg-muted/30 border rounded-lg p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {venda.observacoes}
                </div>
              </div>
            )}

            {venda.observacoes_interna && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-primary mb-3">Observações Internas</h3>
                <div className="bg-muted/30 border rounded-lg p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {venda.observacoes_interna}
                </div>
              </div>
            )}

            {/* Footer */}
            <p className="text-[10px] text-center text-muted-foreground pt-2 border-t">
              UP Móveis · Documento consultado em {new Date().toLocaleDateString("pt-PT")} às {new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value || value === "–") return null;
  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground shrink-0 min-w-[120px]">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}