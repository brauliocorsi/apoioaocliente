import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface Reminder {
  id: string;
  remind_at: string;
  message: string;
  is_completed: boolean;
}

interface ReminderListProps {
  reminders: Reminder[];
  onUpdated: () => void;
}

function getReminderState(reminder: Reminder): "completed" | "overdue" | "soon" | "normal" {
  if (reminder.is_completed) return "completed";
  const now = new Date();
  const remindAt = new Date(reminder.remind_at);
  if (remindAt < now) return "overdue";
  if (remindAt.getTime() - now.getTime() < 60 * 60 * 1000) return "soon";
  return "normal";
}

export default function ReminderList({ reminders, onUpdated }: ReminderListProps) {
  const toggleCompleted = async (id: string, current: boolean) => {
    await supabase.from("phone_call_reminders" as any).update({ is_completed: !current } as any).eq("id", id);
    onUpdated();
  };

  if (reminders.length === 0) return <p className="text-xs text-muted-foreground py-2">Sem lembretes</p>;

  return (
    <div className="space-y-1.5">
      {reminders.map((r) => {
        const state = getReminderState(r);
        return (
          <div
            key={r.id}
            className={`flex items-start gap-2 rounded-md border p-2 text-sm transition-opacity ${
              state === "completed" ? "opacity-50" : ""
            } ${state === "overdue" ? "border-destructive/40 bg-destructive/5" : ""} ${
              state === "soon" ? "border-warning/40 bg-warning/5" : ""
            }`}
          >
            <Checkbox
              checked={r.is_completed}
              onCheckedChange={() => toggleCompleted(r.id, r.is_completed)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className={state === "completed" ? "line-through text-muted-foreground" : ""}>
                {r.message}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(r.remind_at), "dd/MM/yyyy HH:mm", { locale: pt })}
              </p>
            </div>
            {state === "overdue" && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
            {state === "soon" && <Badge className="bg-warning text-warning-foreground text-[10px]">Próximo</Badge>}
          </div>
        );
      })}
    </div>
  );
}
