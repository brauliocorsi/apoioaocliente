import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { openAttachment } from "@/lib/attachmentUrl";

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "fatura", label: "Fatura" },
  { value: "laudo_tecnico", label: "Laudo Técnico" },
  { value: "orcamento", label: "Orçamento" },
  { value: "comprovativo", label: "Comprovativo" },
  { value: "outro", label: "Outro" },
];

const typeLabel = (value: string) =>
  DOCUMENT_TYPES.find((t) => t.value === value)?.label || value;

interface TicketDocumentsProps {
  ticketId: string;
  userId: string;
}

type DocRow = {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at: string;
};

export default function TicketDocuments({ ticketId, userId }: TicketDocumentsProps) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState("fatura");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("ticket_documents" as any)
      .select("id, document_type, file_name, file_path, file_type, file_size, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setDocs((data as any as DocRow[]) || []);
  };

  useEffect(() => {
    fetchDocs();
  }, [ticketId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: `${file.name} excede 20MB`, variant: "destructive" });
        continue;
      }

      const ext = file.name.split(".").pop();
      const filePath = `${ticketId}/docs/${uuidv4()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
        continue;
      }

      await (supabase.from("ticket_documents" as any) as any).insert({
        ticket_id: ticketId,
        document_type: selectedType,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: userId,
      });
    }

    toast({ title: "Documento(s) anexado(s)" });
    setUploading(false);
    e.target.value = "";
    fetchDocs();
  };

  const deleteDoc = async (doc: DocRow) => {
    await supabase.storage.from("ticket-attachments").remove([doc.file_path]);
    await (supabase.from("ticket_documents" as any) as any).delete().eq("id", doc.id);
    toast({ title: "Documento removido" });
    fetchDocs();
  };

  const openDoc = async (doc: DocRow) => {
    await openAttachment(doc.file_path);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.length > 0 && (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-start gap-2 text-xs p-2 border rounded-md bg-muted/30">
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.file_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {typeLabel(doc.document_type)}
                    </Badge>
                    <span className="text-muted-foreground">{formatSize(doc.file_size)}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openDoc(doc)}>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteDoc(doc)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input ref={fileRef} type="file" className="hidden" multiple onChange={handleUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" />
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Anexar documento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
