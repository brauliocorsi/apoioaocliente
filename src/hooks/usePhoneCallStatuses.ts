import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PhoneCallStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
};

let cachedStatuses: PhoneCallStatus[] | null = null;

export function usePhoneCallStatuses() {
  const [statuses, setStatuses] = useState<PhoneCallStatus[]>(cachedStatuses || []);
  const [loading, setLoading] = useState(!cachedStatuses);

  const fetch = async () => {
    const { data } = await supabase
      .from("phone_call_statuses" as any)
      .select("*")
      .order("sort_order");
    const list = (data as any as PhoneCallStatus[]) || [];
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
