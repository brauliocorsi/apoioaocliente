import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Printer, Download } from "lucide-react";

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
    if (venda) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gestaoclick-proxy", {
        body: { action: "get_venda", id: vendaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const vendaData = data?.data || data;
      setVenda(vendaData);
    } catch (e: any) {
      toast({ title: "Erro ao carregar venda", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen) fetchVenda();
  };

  const handlePrint = () => {
    const content = contentRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Permita popups para imprimir", variant: "destructive" });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Venda #${vendaCodigo}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c41e3a; padding-bottom: 12px; margin-bottom: 16px; }
          .logo-area h1 { font-size: 22px; color: #c41e3a; font-weight: 700; letter-spacing: -0.5px; }
          .logo-area p { font-size: 10px; color: #666; }
          .doc-info { text-align: right; }
          .doc-info h2 { font-size: 16px; color: #333; margin-bottom: 4px; }
          .doc-info p { font-size: 10px; color: #666; }
          .section { margin-bottom: 14px; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #c41e3a; border-bottom: 1px solid #e5e5e5; padding-bottom: 3px; margin-bottom: 8px; letter-spacing: 0.5px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
          .info-row { display: flex; gap: 6px; }
          .info-label { font-weight: 600; color: #555; min-width: 110px; }
          .info-value { color: #1a1a1a; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          thead th { background: #f5f5f5; font-weight: 600; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #555; border-bottom: 2px solid #ddd; }
          tbody td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 10.5px; }
          tbody tr:nth-child(even) { background: #fafafa; }
          .text-right { text-align: right; }
          .totals { margin-top: 10px; display: flex; justify-content: flex-end; }
          .totals-table { width: 260px; }
          .totals-table td { padding: 3px 8px; font-size: 11px; }
          .totals-table .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #c41e3a; padding-top: 6px; color: #c41e3a; }
          .observations { background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 4px; padding: 10px; font-size: 10px; color: #444; white-space: pre-wrap; max-height: 200px; overflow: hidden; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 9px; color: #999; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #e8f5e9; color: #2e7d32; }
          .payments-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
          .payment-item { background: #f5f5f5; border-radius: 4px; padding: 6px 8px; font-size: 10px; }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const formatCurrency = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val || "–";
    return num.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  };

  const formatDate = (val: string) => {
    if (!val) return "–";
    const parts = val.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  };

  const items = venda?.itens || venda?.produtos || venda?.items || [];
  const pagamentos = venda?.pagamentos || venda?.parcelas || [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Venda #{vendaCodigo}</span>
            {venda && (
              <Button onClick={handlePrint} size="sm" className="gap-1.5">
                <Printer className="h-4 w-4" />
                Imprimir / PDF
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {venda && (
          <div ref={contentRef}>
            {/* Header */}
            <div className="header">
              <div className="logo-area">
                <h1>UP Móveis</h1>
                <p>Documento de Venda</p>
              </div>
              <div className="doc-info">
                <h2>Venda #{venda.codigo || vendaCodigo}</h2>
                <p>Data: {formatDate(venda.data)}</p>
                {venda.nome_situacao && <p><span className="badge">{venda.nome_situacao}</span></p>}
              </div>
            </div>

            {/* Client & Sale Info */}
            <div className="section">
              <div className="section-title">Informações</div>
              <div className="info-grid">
                <div className="info-row"><span className="info-label">Cliente:</span><span className="info-value">{venda.nome_cliente || "–"}</span></div>
                <div className="info-row"><span className="info-label">Vendedor:</span><span className="info-value">{venda.nome_vendedor || "–"}</span></div>
                <div className="info-row"><span className="info-label">Centro de Custo:</span><span className="info-value">{venda.nome_centro_custo || "–"}</span></div>
                <div className="info-row"><span className="info-label">Prazo Entrega:</span><span className="info-value">{venda.prazo_entrega || "–"}</span></div>
                {venda.nome_transportadora && (
                  <div className="info-row"><span className="info-label">Transportadora:</span><span className="info-value">{venda.nome_transportadora}</span></div>
                )}
                {venda.aos_cuidados_de && (
                  <div className="info-row"><span className="info-label">Aos cuidados de:</span><span className="info-value">{venda.aos_cuidados_de}</span></div>
                )}
                {venda.condicao_pagamento && (
                  <div className="info-row"><span className="info-label">Cond. Pagamento:</span><span className="info-value">{venda.condicao_pagamento === "a_vista" ? "À vista" : "Parcelado"}</span></div>
                )}
              </div>
            </div>

            {/* Items */}
            {items.length > 0 && (
              <div className="section">
                <div className="section-title">Itens</div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Produto</th>
                      <th className="text-right" style={{ width: "60px" }}>Qtd</th>
                      <th className="text-right" style={{ width: "100px" }}>Valor Unit.</th>
                      <th className="text-right" style={{ width: "80px" }}>Desc.</th>
                      <th className="text-right" style={{ width: "100px" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, i: number) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          {item.nome || item.descricao || item.produto_nome || "–"}
                          {item.codigo_produto && <span style={{ color: "#999", fontSize: "9px", marginLeft: "6px" }}>({item.codigo_produto})</span>}
                        </td>
                        <td className="text-right">{item.quantidade || 1}</td>
                        <td className="text-right">{formatCurrency(item.valor_unitario || item.preco)}</td>
                        <td className="text-right">{item.desconto ? `${item.desconto}%` : "–"}</td>
                        <td className="text-right">{formatCurrency(item.valor_total || item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="totals">
              <table className="totals-table">
                <tbody>
                  {venda.valor_desconto && parseFloat(venda.valor_desconto) > 0 && (
                    <>
                      <tr>
                        <td>Subtotal:</td>
                        <td className="text-right">{formatCurrency(venda.valor_subtotal || venda.valor_total)}</td>
                      </tr>
                      <tr>
                        <td>Desconto:</td>
                        <td className="text-right">-{formatCurrency(venda.valor_desconto)}</td>
                      </tr>
                    </>
                  )}
                  {venda.valor_frete && parseFloat(venda.valor_frete) > 0 && (
                    <tr>
                      <td>Frete:</td>
                      <td className="text-right">{formatCurrency(venda.valor_frete)}</td>
                    </tr>
                  )}
                  <tr className="total-row">
                    <td>Total:</td>
                    <td className="text-right">{formatCurrency(venda.valor_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Payments */}
            {pagamentos.length > 0 && (
              <div className="section" style={{ marginTop: "14px" }}>
                <div className="section-title">Pagamentos / Parcelas</div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vencimento</th>
                      <th>Forma</th>
                      <th className="text-right">Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentos.map((p: any, i: number) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{formatDate(p.data_vencimento || p.data)}</td>
                        <td>{p.nome_forma_pagamento || p.forma_pagamento || "–"}</td>
                        <td className="text-right">{formatCurrency(p.valor)}</td>
                        <td>{p.status || p.situacao || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Observations */}
            {venda.observacoes && (
              <div className="section" style={{ marginTop: "14px" }}>
                <div className="section-title">Observações</div>
                <div className="observations">{venda.observacoes}</div>
              </div>
            )}

            {/* Introduction */}
            {venda.introducao && (
              <div className="section">
                <div className="section-title">Introdução</div>
                <div className="observations">{venda.introducao}</div>
              </div>
            )}

            {/* Footer */}
            <div className="footer">
              <p>UP Móveis · Documento gerado em {new Date().toLocaleDateString("pt-PT")} às {new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        )}

        {!loading && !venda && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Não foi possível carregar os dados da venda.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}