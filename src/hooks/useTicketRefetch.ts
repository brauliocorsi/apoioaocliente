import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RefetchAttachmentResult {
  filename: string;
  ok: boolean;
}

export interface RefetchResult {
  summary: string;
  messagesAdded: number;
  contentUpdated: boolean;
  imported: RefetchAttachmentResult[];
  failed: RefetchAttachmentResult[];
  error?: string;
}

interface PendingAttachment {
  seq_num: number;
  part_num: string;
  filename: string;
  content_type: string;
  encoding: string;
  size: number;
}

/**
 * Re-imports emails (messages + attachments) for a ticket from IMAP.
 * Phase 1: refetch_ticket → messages/content + attachment inventory.
 * Phase 2: download each missing attachment individually (avoids CPU limits).
 */
export function useTicketRefetch(ticketId?: string | null, clientEmail?: string | null) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [lastResult, setLastResult] = useState<RefetchResult | null>(null);

  const downloadOne = useCallback(
    async (att: PendingAttachment) => {
      const { data, error } = await supabase.functions.invoke("download-attachment", {
        body: {
          seq_num: att.seq_num,
          part_num: att.part_num,
          ticket_id: ticketId,
          filename: att.filename,
          content_type: att.content_type,
          encoding: att.encoding,
          client_email: clientEmail,
        },
      });
      if (error) return false;
      return !!data?.success;
    },
    [ticketId, clientEmail],
  );

  const retryAttachment = useCallback(
    async (att: PendingAttachment) => {
      setProgress(`A importar ${att.filename}…`);
      const ok = await downloadOne(att);
      setProgress("");
      setLastResult((prev) => {
        if (!prev) return prev;
        if (!ok) return prev;
        return {
          ...prev,
          imported: [...prev.imported, { filename: att.filename, ok: true }],
          failed: prev.failed.filter((f) => f.filename !== att.filename),
        };
      });
      return ok;
    },
    [downloadOne],
  );

  const run = useCallback(async (): Promise<RefetchResult | null> => {
    if (!ticketId || running) return null;
    setRunning(true);
    setProgress("A verificar e-mails…");
    setLastResult(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      const { data, error } = await supabase.functions.invoke("fetch-inbound-emails", {
        body: { action: "refetch_ticket", ticket_id: ticketId, agent_id: user.id },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.message || "Falha na re-importação");

      const pending: PendingAttachment[] = data?.pending_attachments || [];
      const imported: RefetchAttachmentResult[] = [];
      const failed: RefetchAttachmentResult[] = [];

      for (let i = 0; i < pending.length; i++) {
        const att = pending[i];
        setProgress(`A importar anexo ${i + 1} de ${pending.length}…`);
        try {
          const ok = await downloadOne(att);
          (ok ? imported : failed).push({ filename: att.filename, ok });
        } catch (_e) {
          failed.push({ filename: att.filename, ok: false });
        }
      }

      const parts: string[] = [];
      if (data?.content_updated) parts.push("conteúdo atualizado");
      if (data?.messages_added > 0) parts.push(`${data.messages_added} mensagem(ns) adicionada(s)`);
      if (imported.length > 0) parts.push(`${imported.length} anexo(s) importado(s)`);
      if (failed.length > 0) parts.push(`${failed.length} anexo(s) falharam`);
      if (parts.length === 0) parts.push("Nenhum conteúdo novo encontrado");

      const result: RefetchResult = {
        summary: parts.join(", "),
        messagesAdded: data?.messages_added || 0,
        contentUpdated: !!data?.content_updated,
        imported,
        failed,
      };

      // Timeline entry so the validation stays on record
      try {
        await supabase.from("ticket_events").insert({
          ticket_id: ticketId,
          user_id: user.id,
          event_type: "note",
          content: `Re-importação de e-mail: ${result.summary}`,
          metadata: {
            source: "refetch_ticket",
            messages_added: result.messagesAdded,
            attachments_imported: imported.map((a) => a.filename),
            attachments_failed: failed.map((a) => a.filename),
          },
        });
      } catch (_e) {
        /* non-blocking */
      }

      setLastResult(result);
      setPendingRef(pending);
      return result;
    } catch (err) {
      const result: RefetchResult = {
        summary: (err as Error).message,
        messagesAdded: 0,
        contentUpdated: false,
        imported: [],
        failed: [],
        error: (err as Error).message,
      };
      setLastResult(result);
      return result;
    } finally {
      setRunning(false);
      setProgress("");
    }
  }, [ticketId, running, downloadOne]);

  const [pendingRef, setPendingRef] = useState<PendingAttachment[]>([]);

  const retryByName = useCallback(
    async (filename: string) => {
      const att = pendingRef.find((p) => p.filename === filename);
      if (!att) return false;
      return retryAttachment(att);
    },
    [pendingRef, retryAttachment],
  );

  const clearResult = useCallback(() => setLastResult(null), []);

  return { run, running, progress, lastResult, retryByName, clearResult };
}
