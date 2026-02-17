import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Upload, X, FileImage, FileVideo } from "lucide-react";

export default function PortalNewTicket() {
  const { user, profile } = useClientAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [productName, setProductName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [contactPhone, setContactPhone] = useState(profile?.phone || "");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > 20 * 1024 * 1024) {
        toast({ title: `${f.name} excede 20MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setLoading(true);

    const { data, error } = await supabase.from("tickets").insert({
      subject,
      description,
      product_name: productName || null,
      order_number: orderNumber || null,
      client_name: profile.full_name,
      client_email: profile.email,
      client_phone: contactPhone || profile.phone,
      client_user_id: user.id,
      created_by: user.id,
    }).select("id").single();

    if (error) {
      toast({ title: "Erro ao criar ticket", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Upload files
    if (files.length > 0 && data) {
      setUploading(true);
      for (const file of files) {
        const filePath = `${data.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, file);

        if (!uploadError) {
          await supabase.from("ticket_attachments").insert({
            ticket_id: data.id,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: user.id,
          });
        }
      }
      setUploading(false);
    }

    toast({ title: "Ticket criado com sucesso" });
    navigate(`/portal/tickets/${data.id}`);
    setLoading(false);
  };

  const isImage = (f: File) => f.type.startsWith("image/");
  const isVideo = (f: File) => f.type.startsWith("video/");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Novo Ticket</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Descreva o seu problema</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Assunto *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Resumo do problema" />
            </div>

            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} placeholder="Descreva o seu problema com o máximo detalhe possível..." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Nota de Encomenda</Label>
                <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Ex: NE-12345" />
              </div>
              <div className="space-y-2">
                <Label>Produto</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Nome do produto" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contacto telefónico</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Telefone de contacto" />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Anexos</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  onChange={handleFileChange}
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">Clique para enviar ficheiros</span>
                  <span className="text-xs">Fotos, vídeos, PDFs, documentos · Máx. 20MB</span>
                </label>
              </div>

              {files.length > 0 && (
                <div className="space-y-2 mt-2">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm">
                      {isImage(file) ? <FileImage className="h-4 w-4 text-primary shrink-0" /> : isVideo(file) ? <FileVideo className="h-4 w-4 text-primary shrink-0" /> : null}
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/portal/tickets")}>Cancelar</Button>
              <Button type="submit" disabled={loading || uploading || !subject.trim() || !description.trim()}>
                {(loading || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Ticket
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
