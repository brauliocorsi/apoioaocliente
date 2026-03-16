import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Package, FileText, Wrench, Phone, ShoppingBag } from "lucide-react";
import VendaPDFDialog from "@/components/ticket/VendaPDFDialog";
import OSDetailDialog from "@/components/ticket/OSDetailDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function OrderLookupDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [vendas, setVendas] = useState<any[]>([]);
  const [ordensServico, setOrdensServico] = useState<any[]>([]);
  const [pdfVenda, setPdfVenda] = useState<{ id: string; codigo: string } | null>(null);
  const [osDetail, setOsDetail] = useState<{ id: string; codigo: string } | null>(null);

  const isPhone = (q: string) => /^[\d\s\+\(\)\-]{7,}$/.test(q.trim());

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setVendas([]);
    setOrdensServico([]);

    try {
      const { data, error } = await supabase.functions.invoke("gestaoclick-proxy", {
        body: { action: "search_all", query: query.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const v = data?.vendas || [];
      const os = data?.ordens_servico || [];
      setVendas(v);
      setOrdensServico(os);

      if (v.length === 0 && os.length === 0) {
        toast({ title: "Nenhum resultado encontrado" });
      }
    } catch (e: any) {
      toast({ title: "Erro na pesquisa", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const hasResults = vendas.length > 0 || ordensServico.length > 0;

  const fmtDate = (val: string) => {
    if (!val) return "–";
    const parts = val.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  };

  const fmt = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val || "–";
    return num.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  };

  const renderVenda = (item: any, i: number) => {
    const v = item.venda || item;
    return (
      <div
        key={`v-${v.id || i}`}
        className="rounded-lg border border-border p-3 hover:bg-accent/30 transition-colors space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <Package className="h-4 w-4 text-primary" />
            Encomenda #{v.codigo || v.numero || v.id}
          </span>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{
                backgroundColor: v.cor_situacao || undefined,
                color: v.cor_situacao ? "#333" : undefined,
              }}
            >
              {v.nome_situacao || v.situacao || "–"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => setPdfVenda({ id: v.id?.toString(), codigo: v.codigo || v.numero || v.id?.toString() })}
            >
              <FileText className="h-3.5 w-3.5" />
              Detalhes
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="text-foreground/70">Cliente:</strong> {v.nome_cliente || "–"}</span>
          <span><strong className="text-foreground/70">Data:</strong> {fmtDate(v.data_venda || v.data)}</span>
          <span><strong className="text-foreground/70">Valor:</strong> {v.valor_total ? fmt(v.valor_total) : "–"}</span>
          {v.prazo_entrega && <span><strong className="text-foreground/70">Entrega:</strong> {fmtDate(v.prazo_entrega)}</span>}
          {v.nome_vendedor && <span><strong className="text-foreground/70">Vendedor:</strong> {v.nome_vendedor}</span>}
          {v.nome_forma_pagamento && <span><strong className="text-foreground/70">Pagamento:</strong> {v.nome_forma_pagamento}</span>}
        </div>
        {/* Products preview */}
        {(v.produtos || []).length > 0 && (
          <div className="text-[11px] text-muted-foreground border-t border-border/50 pt-1.5 mt-1">
            <span className="font-medium text-foreground/60">Produtos: </span>
            {(v.produtos || []).slice(0, 3).map((p: any, pi: number) => {
              const prod = p.produto || p;
              return (
                <span key={pi}>
                  {prod.nome_produto || prod.nome}{pi < Math.min((v.produtos || []).length, 3) - 1 ? ", " : ""}
                </span>
              );
            })}
            {(v.produtos || []).length > 3 && <span className="text-muted-foreground/60"> +{(v.produtos || []).length - 3}</span>}
          </div>
        )}
      </div>
    );
  };

  const renderOS = (item: any, i: number) => {
    const os = item.ordem_servico || item;
    return (
      <div
        key={`os-${os.id || i}`}
        className="rounded-lg border border-border p-3 hover:bg-accent/30 transition-colors space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-primary" />
            OS #{os.codigo || os.numero || os.id}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {os.nome_situacao || os.situacao || os.status || "–"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => setOsDetail({ id: os.id?.toString(), codigo: os.codigo || os.numero || os.id?.toString() })}
            >
              <FileText className="h-3.5 w-3.5" />
              Detalhes
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="text-foreground/70">Cliente:</strong> {os.nome_cliente || "–"}</span>
          <span><strong className="text-foreground/70">Data:</strong> {fmtDate(os.data || os.data_abertura)}</span>
          {os.valor_total && <span><strong className="text-foreground/70">Valor:</strong> {fmt(os.valor_total)}</span>}
        </div>
      </div>
    );
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)}
            >
              <ShoppingBag className="h-4.5 w-4.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Consultar encomendas</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setVendas([]); setOrdensServico([]); setQuery(""); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Consultar Encomendas — GestãoClick
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nº encomenda, nome do cliente ou telefone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                autoFocus
              />
              <Button onClick={search} disabled={loading} size="icon" variant="secondary">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {isPhone(query) && !loading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> Pesquisando por telefone do cliente
              </p>
            )}

            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {!loading && hasResults && (
              <div className="space-y-4">
                {vendas.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Vendas ({vendas.length})
                    </p>
                    {vendas.map((v, i) => renderVenda(v, i))}
                  </div>
                )}

                {vendas.length > 0 && ordensServico.length > 0 && <Separator />}

                {ordensServico.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" /> Ordens de Serviço ({ordensServico.length})
                    </p>
                    {ordensServico.map((os, i) => renderOS(os, i))}
                  </div>
                )}
              </div>
            )}

            {!loading && !hasResults && query && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Pesquise por número de encomenda, nome do cliente ou telefone.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {pdfVenda && (
        <VendaPDFDialog
          open={!!pdfVenda}
          onOpenChange={(o) => !o && setPdfVenda(null)}
          vendaId={pdfVenda.id}
          vendaCodigo={pdfVenda.codigo}
        />
      )}
      {osDetail && (
        <OSDetailDialog
          open={!!osDetail}
          onOpenChange={(o) => !o && setOsDetail(null)}
          osId={osDetail.id}
          osCodigo={osDetail.codigo}
        />
      )}
    </>
  );
}
