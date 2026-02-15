import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePushNotifications(userId: string | undefined) {
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    requestPermission();
  }, [userId, requestPermission]);

  useEffect(() => {
    if (!userId) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const channel = supabase
      .channel(`push-notifications-${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "agent_notifications",
        filter: `recipient_id=eq.${userId}`,
      }, (payload: any) => {
        const data = payload.new;
        if (document.visibilityState === "hidden" || document.hidden) {
          const notification = new Notification("UP Móveis - Nova Notificação", {
            body: data.content || "Tem uma nova notificação",
            icon: "/pwa-192x192.png",
            badge: "/pwa-192x192.png",
            tag: `notification-${data.id}`,
            data: { ticketId: data.ticket_id },
          });
          notification.onclick = () => {
            window.focus();
            if (data.ticket_id) {
              window.location.href = `/tickets/${data.ticket_id}`;
            }
            notification.close();
          };
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { requestPermission };
}
