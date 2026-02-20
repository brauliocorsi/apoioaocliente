import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const groupLabels: Record<string, string> = {
  prazo: "Prazo",
  produto: "Produto",
  entrega: "Entrega",
  pagamentos: "Pagamentos",
  reclamacao: "Reclamação / Devolução",
  gestao_interna: "Gestão Interna / Garantia",
};

interface TagSelectorProps {
  ticketId: string;
  selectedTags: string[];
  onTagsChange: () => void;
}

export default function TagSelector({ ticketId, selectedTags, onTagsChange }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("tags").select("*").order("sort_order").then(({ data }) => {
      setAllTags(data || []);
    });
  }, []);

  const grouped = allTags.reduce((acc, tag) => {
    const g = tag.tag_group || "geral";
    if (!acc[g]) acc[g] = [];
    acc[g].push(tag);
    return acc;
  }, {} as Record<string, any[]>);

  const addTag = async (tagId: string) => {
    if (selectedTags.includes(tagId)) return;
    await supabase.from("ticket_tags").insert({ ticket_id: ticketId, tag_id: tagId });
    onTagsChange();
  };

  const removeTag = async (tagId: string) => {
    await supabase.from("ticket_tags").delete().eq("ticket_id", ticketId).eq("tag_id", tagId);
    onTagsChange();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {selectedTags.map((t) => {
          const tag = allTags.find((at) => at.id === t);
          return (
            <Badge
              key={t}
              className="text-xs gap-1 text-white border-0"
              style={{ backgroundColor: tag?.color || "#6b7280" }}
            >
              {tag?.name || t}
              <button onClick={() => removeTag(t)} className="hover:text-destructive-foreground/80">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" type="button">
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <ScrollArea className="h-64">
            <div className="p-2 space-y-3">
              {Object.entries(grouped).map(([group, tags]) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase px-2 mb-1">
                    {groupLabels[group] || group}
                  </p>
                  <div className="flex flex-wrap gap-1 px-2">
                    {(tags as any[]).map((tag) => (
                      <Badge
                        key={tag.id}
                        className={`text-xs cursor-pointer ${selectedTags.includes(tag.id) ? "text-white border-0" : "border"}`}
                        style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color || "#6b7280" } : undefined}
                        variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                        onClick={() => selectedTags.includes(tag.id) ? removeTag(tag.id) : addTag(tag.id)}
                      >
                        <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: tag.color || "#6b7280" }} />
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
