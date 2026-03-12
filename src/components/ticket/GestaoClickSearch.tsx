import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Package, ArrowRight, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("gestaoclick-proxy", {
        body: { action: "search_vendas", query: query.trim() },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const vendas = data?.data || data?.vendas || (Array.isArray(data) ? data : []);
      setResults(vendas);

      if (vendas.length === 0) {
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

  const selectOrder = (venda: any) => {
    const orderData = {
      order_number: venda.codigo || venda.numero || venda.id?.toString() || "",
      client_name: venda.nome_cliente || venda.cliente?.nome || "",
      client_email: venda.email_cliente || venda.cliente?.email || "",
      client_phone: venda.telefone_cliente || venda.cliente?.telefone || "",
      product_name: venda.itens?.[0]?.nome || venda.produtos?.[0]?.nome || "",
      delivery_date: venda.data_entrega || "",
      purchase_date: venda.data_venda || venda.data || "",
    };
    onSelectOrder?.(orderData);
    toast({ title: `Encomenda ${orderData.order_number} selecionada` });
    setOpen(false);
    setResults([]);
    setQuery("");
  };

  if (compact) {
    return (
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
              placeholder="Nº encomenda, cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="secondary" onClick={search} disabled={loading} className="h-8 px-2">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {results.map((v: any, i: number) => (
                <button
                  key={v.id || i}
                  onClick={() => selectOrder(v)}
                  className="w-full text-left p-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">#{v.codigo || v.numero || v.id}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {v.situacao || v.status || "–"}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">
                    {v.nome_cliente || v.cliente?.nome || "–"}
                  </div>
                  {(v.data_venda || v.data) && (
                    <div className="text-muted-foreground">
                      {v.data_venda || v.data}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
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
            placeholder="Pesquisar encomenda, cliente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <Button onClick={search} disabled={loading} size="icon" variant="secondary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {results.map((v: any, i: number) => (
              <button
                key={v.id || i}
                onClick={() => selectOrder(v)}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Encomenda #{v.codigo || v.numero || v.id}</span>
                  <Badge variant="outline" className="text-xs">
                    {v.situacao || v.status || "–"}
                  </Badge>
                </div>
                <div className="text-muted-foreground text-xs">
                  Cliente: {v.nome_cliente || v.cliente?.nome || "–"}
                </div>
                <div className="flex items-center gap-1 text-xs text-primary">
                  <ArrowRight className="h-3 w-3" /> Usar dados desta encomenda
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
