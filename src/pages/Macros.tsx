import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Search, Loader2 } from "lucide-react";

const categoryLabels: Record<string, string> = {
  entrega: "Entrega",
  reclamacao: "Reclamação",
  garantia: "Garantia",
  devolucao: "Devolução",
  pagamento: "Pagamento",
  exposicao: "Exposição",
  geral: "Geral",
};

const categoryColors: Record<string, string> = {
  entrega: "bg-blue-100 text-blue-800",
  reclamacao: "bg-red-100 text-red-800",
  garantia: "bg-green-100 text-green-800",
  devolucao: "bg-orange-100 text-orange-800",
  pagamento: "bg-purple-100 text-purple-800",
  exposicao: "bg-yellow-100 text-yellow-800",
  geral: "bg-gray-100 text-gray-800",
};

export default function Macros() {
  const [macros, setMacros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("macros").select("*").order("sort_order").then(({ data }) => {
      setMacros(data || []);
      setLoading(false);
    });
  }, []);

  const filtered = macros.filter((m) => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase()) || m.content.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === "all" || m.macro_category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado para clipboard" });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Macros de Resposta</h1>
        <p className="text-muted-foreground">18 modelos pré-definidos para email e WhatsApp</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar macros..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => setCategoryFilter("all")}>Todas</Button>
          {Object.entries(categoryLabels).map(([k, v]) => (
            <Button key={k} size="sm" variant={categoryFilter === k ? "default" : "outline"} onClick={() => setCategoryFilter(k)}>{v}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{m.id} – {m.title}</CardTitle>
                <Badge className={categoryColors[m.macro_category] || ""} variant="secondary">
                  {categoryLabels[m.macro_category] || m.macro_category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">{m.content}</p>
              {m.variables && m.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {m.variables.map((v: string) => (
                    <Badge key={v} variant="outline" className="text-xs font-mono">{`{${v}}`}</Badge>
                  ))}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(m.content)}>
                <Copy className="mr-1 h-3 w-3" /> Copiar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
