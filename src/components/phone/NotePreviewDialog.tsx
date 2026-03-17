import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, FileText } from "lucide-react";

interface NotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  subject: string;
  notes: string | null;
}

export default function NotePreviewDialog({ open, onOpenChange, clientName, subject, notes }: NotePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" />
            {clientName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Assunto</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{subject}</p>
          </div>
          {notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Notas
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/50 rounded-lg p-3 border">{notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
