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

/**
 * Fill both new-style {var} placeholders (legacy) and the simple [cliente]/[ticket]/[encomenda]/[produto]
 * placeholders requested in Phase 9. Never inserts "undefined" / "null" — empty values become "".
 */
function fillPlaceholders(content: string, ticket: any): string {
  const safe = (v: any) => (v === undefined || v === null ? "" : String(v));
  return content
    // legacy curly placeholders kept for backward compatibility
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
    // Phase 9 — short bracket placeholders
    .replace(/\[cliente\]/g, safe(ticket?.client_name))
    .replace(/\[ticket\]/g, safe(ticket?.ticket_number))
    .replace(/\[encomenda\]/g, safe(ticket?.order_number))
    .replace(/\[produto\]/g, safe(ticket?.product_name));
}

/**
 * Phase 9 — simple rule-based macro suggestions (no AI).
 * Returns macro IDs scored by relevance.
 */
function computeSuggestedIds(args: {
  macros: any[];
  tagNames: string[];
  categoryName?: string;
  hasOrder: boolean;
  pausedReason?: string | null;
  isResolvedOrClosed: boolean;
}): Set<string> {
  const { macros, tagNames, categoryName, hasOrder, pausedReason, isResolvedOrClosed } = args;
  const hay = [
    categoryName || "",
    ...tagNames,
  ].join(" ").toLowerCase();

  const suggested = new Set<string>();
  const pick = (predicate: (m: any) => boolean) => macros.filter(predicate).forEach((m) => suggested.add(m.id));

  if (/atraso/.test(hay)) pick((m) => /atraso|atualiza/i.test(m.title));
  if (/entrega/.test(hay)) pick((m) => /atraso|atualiza|entrega/i.test(m.title));
  if (/garantia/.test(hay)) pick((m) => m.macro_category === "garantia");
  if (/defeito|danific|dano/.test(hay)) {
    pick((m) => /dano|defeito|fotos|registo/i.test(m.title) || m.macro_category === "garantia");
  }
  if (/pe[cç]a|falta/.test(hay)) pick((m) => /pe[cç]a|falta/i.test(m.title));

  if (!hasOrder) pick((m) => /sem n[uú]mero|n[uú]mero de encomenda/i.test(m.title));
  if (pausedReason && /fornecedor|f[aá]brica/i.test(pausedReason)) {
    pick((m) => /fornecedor|f[aá]brica|aguarda/i.test(m.title));
  }
  if (isResolvedOrClosed) pick((m) => /encerramento|resolu/i.test(m.title));

  return suggested;
}

export default function MacroSelector({ ticket, tags = [], onSelect }: MacroSelectorProps) {
  const [macros, setMacros] = useState<any[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState<string>("");
  const [statusInfo, setStatusInfo] = useState<{ is_resolved: boolean; is_closed: boolean; pauses_sla: boolean; pause_reason: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabase.from("macros").select("*").order("sort_order").then(({ data }) => {
      setMacros(data || []);
    });
  }, []);

  // Resolve tag names + category + status meta for suggestion rules
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tags && tags.length > 0) {
        const { data } = await supabase.from("tags").select("id,name").in("id", tags);
        if (!cancelled) setTagNames(((data || []) as any[]).map((t) => t.name));
      } else {
        setTagNames([]);
      }
      if (ticket?.category_id) {
        const { data } = await supabase.from("categories").select("name").eq("id", ticket.category_id).maybeSingle();
        if (!cancelled && data) setCategoryName((data as any).name || "");
      }
      if (ticket?.status) {
        const { data } = await supabase
          .from("ticket_statuses")
          .select("is_resolved,is_closed,pauses_sla,sla_pause_reason")
          .eq("id", ticket.status)
          .maybeSingle();
        if (!cancelled && data) {
          setStatusInfo({
            is_resolved: !!(data as any).is_resolved,
            is_closed: !!(data as any).is_closed,
            pauses_sla: !!(data as any).pauses_sla,
            pause_reason: (data as any).sla_pause_reason ?? null,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ticket?.category_id, ticket?.status, tags?.join("|")]);

  const suggestedIds = useMemo(
    () =>
      computeSuggestedIds({
        macros,
        tagNames,
        categoryName,
        hasOrder: !!ticket?.order_number,
        pausedReason: statusInfo?.pauses_sla ? statusInfo?.pause_reason : null,
        isResolvedOrClosed: !!(statusInfo?.is_resolved || statusInfo?.is_closed),
      }),
    [macros, tagNames, categoryName, ticket?.order_number, statusInfo],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return macros;
    return macros.filter(
      (m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q),
    );
  }, [macros, query]);

  const suggested = filtered.filter((m) => suggestedIds.has(m.id));
  const others = filtered.filter((m) => !suggestedIds.has(m.id));

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
          {suggestedIds.size > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
              {suggestedIds.size}
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
                  <Sparkles className="h-3 w-3 text-primary" /> Sugeridas
                </div>
                {suggested.map((m) => renderRow(m, true))}
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Todas
                </div>
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
