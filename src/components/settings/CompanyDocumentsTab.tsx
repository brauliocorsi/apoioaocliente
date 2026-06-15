import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, Trash2, RefreshCw, Eye } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CompanyDocument {
  id: string;
  title: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  extracted_text: string | null;
  is_active: boolean;
  created_at: string;
}

const ACCEPTED = ".pdf,.docx,.doc,.txt,.md";

export default function CompanyDocumentsTab() {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<CompanyDocument | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_documents")
      .select("*")
      .order("created_at", { ascending: false });
    setDocs((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast({ title: `${file.name} excede 20MB`, variant: "destructive" });
          continue;
        }
        const ts = Date.now();
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${ts}_${cleanName}`;

        const { error: upErr } = await supabase.storage
          .from("company-documents")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;

        const { data: ins, error: insErr } = await supabase
          .from("company_documents")
          .insert({
            title: file.name.replace(/\.[^.]+$/, ""),
            file_path: path,
            file_type: file.type || "application/octet-stream",
            file_size: file.size,
            uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        // Trigger text extraction (don't await — let it run server-side; refresh after)
        const { error: extractErr } = await supabase.functions.invoke("extract-document-text", {
          body: { document_id: ins.id },
        });
        if (extractErr) {
          console.error("extract error", extractErr);
          toast({ title: `Aviso: texto não extraído de ${file.name}`, description: "Pode tentar reprocessar.", variant: "destructive" });
        }
      }
      toast({ title: "Documentos carregados" });
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (doc: CompanyDocument) => {
    const { error } = await supabase
      .from("company_documents")
      .update({ is_active: !doc.is_active })
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, is_active: !doc.is_active } : d));
    }
  };

  const reprocess = async (doc: CompanyDocument) => {
    toast({ title: "A reprocessar..." });
    const { error } = await supabase.functions.invoke("extract-document-text", {
      body: { document_id: doc.id },
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Texto reextraído" });
      load();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const doc = docs.find((d) => d.id === deleteId);
    if (!doc) return;
    const { error: stErr } = await supabase.storage.from("company-documents").remove([doc.file_path]);
    if (stErr) console.warn(stErr);
    const { error } = await supabase.from("company_documents").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Documento eliminado" });
      setDeleteId(null);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos da Empresa</CardTitle>
          <CardDescription>
            Termos & Condições, políticas e outros documentos usados pela sugestão IA para gerar respostas formais ao cliente.
            Apenas documentos <strong>ativos</strong> são considerados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Carregar documento (PDF, DOCX, TXT)
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem documentos. Carregue os Termos & Condições para que a IA gere respostas alinhadas com a política da empresa.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {docs.map((d) => (
            <Card key={d.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{d.title}</span>
                        {d.is_active ? (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                        {d.extracted_text ? (
                          <Badge variant="outline" className="text-[10px]">{(d.extracted_text.length / 1000).toFixed(1)}k chars</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Texto não extraído</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {d.file_type} · {d.file_size ? `${(d.file_size / 1024).toFixed(0)} KB` : "—"} · {new Date(d.created_at).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={d.is_active} onCheckedChange={() => toggleActive(d)} />
                    {d.extracted_text && (
                      <Button variant="ghost" size="icon" onClick={() => setPreviewDoc(d)} title="Pré-visualizar texto">
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => reprocess(d)} title="Reextrair texto">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>O ficheiro e o texto extraído serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{previewDoc?.title}</AlertDialogTitle>
            <AlertDialogDescription>Texto extraído utilizado pela IA.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-xs bg-muted/40 rounded-md p-3 border">
            {previewDoc?.extracted_text}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
