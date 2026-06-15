import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BookOpen, Sparkles, Search } from "lucide-react";

const categoryLabels: Record<string, string> = {
  entrega: "Entrega",
  reclamacao: "Reclamação",
  garantia: "Garantia",
  devolucao: "Devolução",
  pagamento: "Pagamento",
  exposicao: "Exposição",
  geral: "Geral",
};

interface MacroSelectorProps {
  ticket: any;
  tags?: string[];
  onSelect: (content: string) => void;
}

function fillPlaceholders(content: string, ticket: any): string {
  const safe = (v: any) => (v === undefined || v === null ? "" : String(v));
  return content
    .replace(/\{nome_cliente\}/g, safe(ticket?.client_name))
    .replace(/\{n_encomenda\}/g, safe(ticket?.order_number))
    .replace(/\{data_entrega\}/g, safe(ticket?.delivery_date))
    .replace(/\{data_compra\}/g, safe(ticket?.purchase_date))
    .replace(/\{numero_ticket\}/g, safe(ticket?.ticket_number))
    .replace(/\{assunto\}/g, safe(ticket?.subject))
    .replace(/\{email_cliente\}/g, safe(ticket?.client_email))
    .replace(/\{telefone_cliente\}/g, safe(ticket?.client_phone))
    .replace(/\{produto\}/g, safe(ticket?.product_name))
    .replace(/\{n_assistencia\}/g, safe(ticket?.service_number))
    .replace(/\{data_levantamento\}/g, safe(ticket?.pickup_date))
    .replace(/\{tipo_entrega\}/g, ticket?.delivery_type === "entrega" ? "Entrega" : ticket?.delivery_type === "levantamento" ? "Levantamento" : "")
    .replace(/\[cliente\]/g, safe(ticket?.client_name))
    .replace(/\[ticket\]/g, safe(ticket?.ticket_number))
    .replace(/\[encomenda\]/g, safe(ticket?.order_number))
    .replace(/\[produto\]/g, safe(ticket?.product_name));
}

export default function MacroSelector({ ticket, tags = [], onSelect }: MacroSelectorProps) {
  const [macros, setMacros] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabase.from("macros").select("*").eq("is_active", true).order("sort_order").then(({ data }) => {
      setMacros(data || []);
    });
  }, []);

  // Score each macro by context match: cat (required) + subcat (required) + tag (bonus)
  const scored = useMemo(() => {
    const catId: string | undefined = ticket?.category_id;
    const subId: string | undefined = ticket?.subcategory_id;
    const ticketTagSet = new Set(tags);

    return macros.map((m) => {
      const cats: string[] = m.category_ids || [];
      const subs: string[] = m.subcategory_ids || [];
      const mTags: string[] = m.tag_ids || [];

      const matchCat = catId && cats.includes(catId);
      const matchSub = subId && subs.includes(subId);
      const matchTag = mTags.some((t) => ticketTagSet.has(t));

      // Suggested only when both category AND subcategory match
      const isSuggested = !!(matchCat && matchSub);
      // Tag adds a small score bump (for ordering inside the suggested group)
      const score = (isSuggested ? 10 : 0) + (matchTag ? 5 : 0);
      return { ...m, _isSuggested: isSuggested, _score: score, _matchTag: matchTag };
    });
  }, [macros, ticket?.category_id, ticket?.subcategory_id, tags.join("|")]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scored;
    return scored.filter(
      (m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q),
    );
  }, [scored, query]);

  const suggested = filtered.filter((m) => m._isSuggested).sort((a, b) => b._score - a._score);
  const others = filtered.filter((m) => !m._isSuggested);
  const suggestedCount = scored.filter((m) => m._isSuggested).length;

  const handleSelect = (macro: any) => {
    onSelect(fillPlaceholders(macro.content, ticket));
    setOpen(false);
  };

  const renderRow = (m: any, isSuggested = false) => (
    <button
      key={m.id}
      className="w-full text-left rounded-md px-3 py-2 hover:bg-muted transition-colors"
      onClick={() => handleSelect(m)}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-sm font-medium flex items-center gap-1.5">
          {isSuggested && <Sparkles className="h-3 w-3 text-primary" />}
          {m.title}
          {m._matchTag && <Badge variant="outline" className="text-[9px] h-4 px-1">tag</Badge>}
        </span>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {categoryLabels[m.macro_category] || m.macro_category}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{m.content}</p>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Macros
          {suggestedCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
              {suggestedCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar macros..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="h-96">
          <div className="p-2 space-y-1">
            {suggested.length > 0 && (
              <>
                <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" /> Compatíveis com este ticket
                </div>
                {suggested.map((m) => renderRow(m, true))}
                {others.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Outras macros
                  </div>
                )}
              </>
            )}
            {others.length === 0 && suggested.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Sem macros para a pesquisa.
              </div>
            ) : (
              others.map((m) => renderRow(m, false))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
