import { supabase } from "@/integrations/supabase/client";

const BUCKET = "ticket-attachments";
const EXPIRES = 60 * 60; // 1h

/** The bucket is private — always use signed URLs to render/download files. */
export async function getAttachmentUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES);
  return data?.signedUrl || "";
}

/** Adds a signed `url` field to each row that has a `file_path`. */
export async function withSignedUrls<T extends { file_path: string }>(
  rows: T[],
): Promise<(T & { url: string })[]> {
  if (!rows || rows.length === 0) return [];
  const paths = rows.map((r) => r.file_path);
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, EXPIRES);
  return rows.map((r, i) => ({ ...r, url: data?.[i]?.signedUrl || "" }));
}

/** Opens an attachment in a new tab using a freshly signed URL. */
export async function openAttachment(path: string): Promise<void> {
  const url = await getAttachmentUrl(path);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
