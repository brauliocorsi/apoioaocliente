import { supabase } from "@/integrations/supabase/client";

const BUCKET = "ticket-attachments";
const EXPIRES = 60 * 60; // 1h

/** The bucket is private — always use signed URLs to render/download files. */
export async function getAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES);
  if (error) throw new Error("Não foi possível aceder ao anexo.");
  if (!data?.signedUrl) throw new Error("O anexo não está disponível.");
  return data.signedUrl;
}

/** Adds a signed `url` field to each row that has a `file_path`. */
export async function withSignedUrls<T extends { file_path: string }>(
  rows: T[],
): Promise<(T & { url: string })[]> {
  if (!rows || rows.length === 0) return [];
  const paths = rows.map((r) => r.file_path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, EXPIRES);
  if (error) return rows.map((r) => ({ ...r, url: "" }));
  return rows.map((r, i) => ({ ...r, url: data?.[i]?.signedUrl || "" }));
}

/** Opens an attachment in a new tab using a freshly signed URL. */
export async function openAttachment(path: string): Promise<void> {
  // Open immediately during the click event so browsers do not treat the
  // asynchronous signed-URL lookup as an unsolicited popup.
  const preview = window.open("about:blank", "_blank");
  if (preview) {
    preview.opener = null;
    preview.document.title = "A abrir anexo…";
    preview.document.body.textContent = "A abrir anexo…";
  }

  try {
    const url = await getAttachmentUrl(path);
    if (preview) {
      preview.location.replace(url);
      return;
    }

    // Fallback for browsers that prevent opening even during the click.
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    preview?.close();
    throw error;
  }
}
