import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

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
  onSelect: (content: string) => void;
}

export default function MacroSelector({ ticket, onSelect }: MacroSelectorProps) {
  const [macros, setMacros] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from("macros").select("*").order("sort_order").then(({ data }) => {
      setMacros(data || []);
    });
  }, []);

  const fillVariables = (content: string) => {
    return content
      .replace(/\{nome_cliente\}/g, ticket.client_name || "")
      .replace(/\{n_encomenda\}/g, ticket.order_number || "")
      .replace(/\{data_entrega\}/g, ticket.delivery_date || "")
      .replace(/\{data_compra\}/g, ticket.purchase_date || "")
      .replace(/\{numero_ticket\}/g, String(ticket.ticket_number || ""))
      .replace(/\{assunto\}/g, ticket.subject || "");
  };

  const handleSelect = (macro: any) => {
    const filled = fillVariables(macro.content);
    onSelect(filled);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Macros
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <ScrollArea className="h-80">
          <div className="p-2 space-y-1">
            {macros.map((m) => (
              <button
                key={m.id}
                className="w-full text-left rounded-md px-3 py-2 hover:bg-muted transition-colors"
                onClick={() => handleSelect(m)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium">{m.title}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {categoryLabels[m.macro_category] || m.macro_category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{m.content}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
