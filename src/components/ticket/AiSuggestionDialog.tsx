import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Copy, RefreshCw, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiSuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  onInsert: (text: string) => void;
}

export default function AiSuggestionDialog({ open, onOpenChange, ticketId, onInsert }: AiSuggestionDialogProps) {
  const [includeImages, setIncludeImages] = useState(false);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [meta, setMeta] = useState<{ model?: string; doc_count?: number; image_count?: number; used_images?: boolean } | null>(null);
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    setSuggestion("");
    try {
      const { data, error } = await supabase.functions.invoke("suggest-ai-reply", {
        body: { ticket_id: ticketId, include_images: includeImages, extra_instructions: extra || undefined },
      });
      if (error) {
        const msg = (error as any)?.context?.error || error.message;
        toast({ title: "Erro a gerar sugestão", description: msg, variant: "destructive" });
        return;
      }
      if ((data as any)?.error) {
        toast({ title: "Erro", description: (data as any).error, variant: "destructive" });
        return;
      }
      setSuggestion((data as any)?.suggestion || "");
      setMeta({
        model: (data as any)?.model,
        doc_count: (data as any)?.doc_count,
        image_count: (data as any)?.image_count,
        used_images: (data as any)?.used_images,
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (!suggestion) return;
    onInsert(suggestion);
    onOpenChange(false);
    toast({ title: "Resposta inserida na caixa" });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(suggestion);
    toast({ title: "Copiada para o clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Sugerir resposta com IA
          </DialogTitle>
          <DialogDescription>
            A IA analisa toda a conversa e os Termos &amp; Condições da empresa para sugerir uma resposta formal.
            Reveja sempre antes de enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 p-3 rounded-md border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm">Incluir análise de fotos</Label>
              <p className="text-xs text-muted-foreground">
                Envia imagens anexadas ao ticket para a IA identificar danos, peças, etc. Mais lento e mais caro.
              </p>
            </div>
            <Switch checked={includeImages} onCheckedChange={setIncludeImages} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Instruções adicionais (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="ex.: foca-te no prazo de garantia; propõe troca em vez de reembolso..."
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              className="text-sm resize-none"
            />
          </div>

          {!suggestion && !loading && (
            <Button onClick={generate} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" /> Gerar sugestão
            </Button>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs">A analisar conversa e documentos{includeImages ? " e imagens" : ""}...</p>
            </div>
          )}

          {suggestion && !loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Sugestão (editável)</Label>
                {meta && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{meta.model?.split("/").pop()}</Badge>
                    <Badge variant="outline" className="text-[10px]">{meta.doc_count ?? 0} doc(s)</Badge>
                    {meta.used_images && <Badge variant="outline" className="text-[10px]">{meta.image_count} img</Badge>}
                  </div>
                )}
              </div>
              <Textarea
                rows={14}
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                className="text-sm font-sans"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {suggestion && !loading && (
            <>
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
              <Button variant="outline" size="sm" onClick={generate}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerar
              </Button>
              <Button size="sm" onClick={handleInsert}>
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" /> Inserir na resposta
              </Button>
            </>
          )}
          {!suggestion && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
