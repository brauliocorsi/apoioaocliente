import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TicketStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  pauses_sla: boolean;
  is_resolved: boolean;
  is_closed: boolean;
  default_assign: string | null;
  sla_minutes: number | null;
};

let cachedStatuses: TicketStatus[] | null = null;

export function useTicketStatuses() {
  const [statuses, setStatuses] = useState<TicketStatus[]>(cachedStatuses || []);
  const [loading, setLoading] = useState(!cachedStatuses);

  const fetch = async () => {
    const { data } = await supabase
      .from("ticket_statuses")
      .select("*")
      .order("sort_order");
    const list = (data as TicketStatus[]) || [];
    cachedStatuses = list;
    setStatuses(list);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const statusLabels: Record<string, string> = {};
  const statusColors: Record<string, string> = {};
  statuses.forEach((s) => {
    statusLabels[s.id] = s.name;
    statusColors[s.id] = s.color;
  });

  return { statuses, statusLabels, statusColors, loading, refetch: fetch };
}
