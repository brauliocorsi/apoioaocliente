import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "😊", "👀", "✅"];

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface MessageReactionsProps {
  messageId: string;
  userId: string;
  align?: "left" | "right";
}

export default function MessageReactions({ messageId, userId, align = "left" }: MessageReactionsProps) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const fetchReactions = async () => {
    const { data } = await supabase
      .from("message_reactions")
      .select("emoji, user_id")
      .eq("message_id", messageId);

    if (!data) return;

    const map = new Map<string, { count: number; reacted: boolean }>();
    data.forEach((r: any) => {
      const existing = map.get(r.emoji) || { count: 0, reacted: false };
      existing.count++;
      if (r.user_id === userId) existing.reacted = true;
      map.set(r.emoji, existing);
    });

    setReactions(
      Array.from(map.entries()).map(([emoji, { count, reacted }]) => ({
        emoji,
        count,
        reacted,
      }))
    );
  };

  useEffect(() => {
    fetchReactions();
  }, [messageId, userId]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter: `message_id=eq.${messageId}` },
        () => { fetchReactions(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [messageId]);

  const toggleReaction = async (emoji: string) => {
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing?.reacted) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
    }
    setShowPicker(false);
    fetchReactions();
  };

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", align === "right" ? "justify-end" : "justify-start")}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggleReaction(r.emoji)}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border transition-colors hover:bg-accent",
            r.reacted
              ? "border-primary/40 bg-primary/10"
              : "border-border bg-background"
          )}
        >
          <span>{r.emoji}</span>
          <span className="text-muted-foreground">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
          title="Reagir"
        >
          😀
        </button>
        {showPicker && (
          <div className={cn(
            "absolute bottom-full mb-1 flex gap-1 p-1.5 rounded-lg border bg-popover shadow-md z-50",
            align === "right" ? "right-0" : "left-0"
          )}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-base transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
