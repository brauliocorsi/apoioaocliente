import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, X, Loader2, Image, Film } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

type Attachment = {
  id?: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  url: string;
};

interface FileUploadProps {
  ticketId?: string;
  userId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = "image/*,video/*";
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export default function FileUpload({ ticketId, userId, attachments, onAttachmentsChange, disabled }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const upload = async (files: FileList) => {
    setUploading(true);
    const newAttachments: Attachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        toast({ title: "Ficheiro muito grande", description: `${file.name} excede 20MB`, variant: "destructive" });
        continue;
      }

      const ext = file.name.split(".").pop();
      const path = `${ticketId || "draft"}/${uuidv4()}.${ext}`;

      const { error } = await supabase.storage.from("ticket-attachments").upload(path, file);
      if (error) {
        toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(path);

      newAttachments.push({
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        url: urlData.publicUrl,
      });
    }

    onAttachmentsChange([...attachments, ...newAttachments]);
    setUploading(false);
  };

  const remove = async (index: number) => {
    const att = attachments[index];
    await supabase.storage.from("ticket-attachments").remove([att.file_path]);
    if (att.id) {
      await supabase.from("ticket_attachments").delete().eq("id", att.id);
    }
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
  };

  const isImage = (type: string) => type.startsWith("image/");
  const isVideo = (type: string) => type.startsWith("video/");

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Paperclip className="h-4 w-4 mr-2" />}
        {uploading ? "A enviar..." : "Anexar ficheiros"}
      </Button>

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {attachments.map((att, i) => (
            <div key={i} className="relative group border rounded-md overflow-hidden bg-muted">
              {isImage(att.file_type) ? (
                <img src={att.url} alt={att.file_name} className="w-full h-24 object-cover" />
              ) : isVideo(att.file_type) ? (
                <div className="w-full h-24 flex items-center justify-center">
                  <Film className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : (
                <div className="w-full h-24 flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <p className="text-xs truncate px-1 py-0.5">{att.file_name}</p>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
