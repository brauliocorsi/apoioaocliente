import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  ticketId: string;
  parentTicketId?: string | null;
  /** Route base for navigation. Defaults to "/tickets". Use "/emails" for email view. */
  basePath?: string;
}

interface MiniTicket {
  id: string;
  ticket_number: number;
  subject: string;
}

/**
 * Shows badges linking a ticket to its parent (if it was created as a continuation
 * of a closed ticket) and to any children (continuations spawned from this ticket
 * after it was closed).
 */
export function TicketContinuationBadges({ ticketId, parentTicketId, basePath = "/tickets" }: Props) {
  const [parent, setParent] = useState<MiniTicket | null>(null);
  const [children, setChildren] = useState<MiniTicket[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (parentTicketId) {
        const { data } = await supabase
          .from("tickets")
          .select("id, ticket_number, subject")
          .eq("id", parentTicketId)
          .maybeSingle();
        if (!cancelled) setParent((data as MiniTicket) || null);
      } else {
        setParent(null);
      }

      const { data: kids } = await supabase
        .from("tickets")
        .select("id, ticket_number, subject")
        .eq("parent_ticket_id", ticketId)
        .order("ticket_number", { ascending: true });
      if (!cancelled) setChildren((kids as MiniTicket[]) || []);
    };

    void load();
    return () => { cancelled = true; };
  }, [ticketId, parentTicketId]);

  if (!parent && children.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {parent && (
        <Link to={`${basePath}/${parent.id}`} className="no-underline">
          <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted">
            <ArrowUpRight className="h-3 w-3" />
            Continuação do ticket #{parent.ticket_number}
          </Badge>
        </Link>
      )}
      {children.map((c) => (
        <Link key={c.id} to={`${basePath}/${c.id}`} className="no-underline">
          <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted">
            <ArrowDownRight className="h-3 w-3" />
            Tem continuação no ticket #{c.ticket_number}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
