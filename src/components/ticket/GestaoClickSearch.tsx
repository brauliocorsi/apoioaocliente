import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Package, ArrowRight, FileText, Wrench, Phone } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import VendaPDFDialog from "./VendaPDFDialog";
import OSDetailDialog from "./OSDetailDialog";

interface GestaoClickSearchProps {
  onSelectOrder?: (orderData: {
    order_number: string;
    client_name: string;
    client_email?: string;
    client_phone?: string;
    product_name?: string;
    delivery_date?: string;
    purchase_date?: string;
  }) => void;
  compact?: boolean;
}

export default function GestaoClickSearch({ onSelectOrder, compact = false }: GestaoClickSearchProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [vendas, setVendas] = useState<any[]>([]);
  const [ordensServico, setOrdensServico] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
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
        toast({ title: "Nenhum resultado encontrado no GestãoClick" });
      }
    } catch (e: any) {
      console.error("GestaoClick search error:", e);
      toast({
        title: "Erro ao pesquisar no GestãoClick",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectOrder = (item: any) => {
    const orderData = {
      order_number: item.codigo || item.numero || item.id?.toString() || "",
      client_name: item.nome_cliente || item.cliente?.nome || "",
      client_email: item.email_cliente || item.cliente?.email || "",
      client_phone: item.telefone_cliente || item.cliente?.telefone || "",
      product_name: item.itens?.[0]?.nome || item.produtos?.[0]?.nome || "",
      delivery_date: item.data_entrega || item.prazo_entrega || "",
      purchase_date: item.data_venda || item.data || "",
    };
    onSelectOrder?.(orderData);
    toast({ title: `Registo ${orderData.order_number} selecionado` });
    setOpen(false);
    setVendas([]);
    setOrdensServico([]);
    setQuery("");
  };

  const openVendaPdf = (e: React.MouseEvent, v: any) => {
    e.stopPropagation();
    setPdfVenda({ id: v.id?.toString(), codigo: v.codigo || v.numero || v.id?.toString() });
  };

  const openOsDetail = (e: React.MouseEvent, os: any) => {
    e.stopPropagation();
    setOsDetail({ id: os.id?.toString(), codigo: os.codigo || os.numero || os.id?.toString() });
  };

  const hasResults = vendas.length > 0 || ordensServico.length > 0;

  const renderResultItem = (item: any, i: number, type: "venda" | "os") => (
    <div
      key={`${type}-${item.id || i}`}
      className="w-full text-left p-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-xs space-y-0.5"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium flex items-center gap-1">
          {type === "os" ? <Wrench className="h-3 w-3 text-primary" /> : <Package className="h-3 w-3 text-primary" />}
          #{item.codigo || item.numero || item.id}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => type === "venda" ? openVendaPdf(e, item) : openOsDetail(e, item)}
            className="p-1 rounded hover:bg-accent"
            title={type === "venda" ? "Ver detalhes da venda" : "Ver detalhes da OS"}
          >
            <FileText className="h-3 w-3 text-primary" />
          </button>
          <Badge variant="outline" className="text-[10px]">
            {item.situacao || item.status || item.nome_situacao || "–"}
          </Badge>
        </div>
      </div>
      <div className="text-muted-foreground">
        {item.nome_cliente || item.cliente?.nome || "–"}
      </div>
      <div className="flex items-center justify-between">
        {(item.data_venda || item.data) && (
          <span className="text-muted-foreground">{item.data_venda || item.data}</span>
        )}
        <button
          onClick={() => selectOrder(item)}
          className="text-primary text-[10px] hover:underline flex items-center gap-0.5"
        >
          <ArrowRight className="h-2.5 w-2.5" /> Usar dados
        </button>
      </div>
    </div>
  );

  const renderResultItemFull = (item: any, i: number, type: "venda" | "os") => (
    <div
      key={`${type}-${item.id || i}`}
      className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-sm space-y-1"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold flex items-center gap-1.5">
          {type === "os" ? <Wrench className="h-4 w-4 text-primary" /> : <Package className="h-4 w-4 text-primary" />}
          {type === "os" ? "OS" : "Encomenda"} #{item.codigo || item.numero || item.id}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1 text-xs"
            onClick={(e) => type === "venda" ? openVendaPdf(e, item) : openOsDetail(e, item)}
          >
            <FileText className="h-3.5 w-3.5" />
            Ver Detalhes
          </Button>
          <Badge variant="outline" className="text-xs">
            {item.situacao || item.status || item.nome_situacao || "–"}
          </Badge>
        </div>
      </div>
      <div className="text-muted-foreground text-xs">
        Cliente: {item.nome_cliente || item.cliente?.nome || "–"}
      </div>
      {item.valor_total && (
        <div className="text-muted-foreground text-xs">
          Valor: {parseFloat(item.valor_total).toLocaleString("pt-PT", { minimumFractionDigits: 2 })} €
        </div>
      )}
      <button
        onClick={() => selectOrder(item)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ArrowRight className="h-3 w-3" /> Usar dados deste registo
      </button>
    </div>
  );

  if (compact) {
    return (
      <>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Pesquisar no GestãoClick
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            <div className="flex gap-1.5">
              <Input
                placeholder="Nº encomenda, telefone, cliente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="secondary" onClick={search} disabled={loading} className="h-8 px-2">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {isPhone(query) && !loading && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> Pesquisando por telefone do cliente
              </p>
            )}
            {hasResults && (
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {vendas.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">
                      Vendas ({vendas.length})
                    </p>
                    {vendas.map((v, i) => renderResultItem(v, i, "venda"))}
                  </>
                )}
                {ordensServico.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">
                      Ordens de Serviço ({ordensServico.length})
                    </p>
                    {ordensServico.map((os, i) => renderResultItem(os, i, "os"))}
                  </>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

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

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" />
            GestãoClick
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Pesquisar por código, nome do cliente ou telefone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
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

          {hasResults && (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {vendas.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 pt-1">
                    <Package className="h-3.5 w-3.5" /> Vendas ({vendas.length})
                  </p>
                  {vendas.map((v, i) => renderResultItemFull(v, i, "venda"))}
                </>
              )}
              {ordensServico.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 pt-2">
                    <Wrench className="h-3.5 w-3.5" /> Ordens de Serviço ({ordensServico.length})
                  </p>
                  {ordensServico.map((os, i) => renderResultItemFull(os, i, "os"))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
