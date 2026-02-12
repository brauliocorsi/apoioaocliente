import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  agents: { id: string; full_name: string }[];
  placeholder?: string;
  rows?: number;
  className?: string;
}

export default function MentionTextarea({ value, onChange, agents, placeholder, rows = 3, className }: MentionTextareaProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filtered = agents.filter((a) =>
    a.full_name.toLowerCase().includes(suggestionFilter.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || 0;
    onChange(val);
    setCursorPos(pos);

    // Check if we're typing after @
    const textBeforeCursor = val.slice(0, pos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setShowSuggestions(true);
      setSuggestionFilter(mentionMatch[1]);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertMention = (agent: { id: string; full_name: string }) => {
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const beforeMention = textBeforeCursor.slice(0, mentionMatch.index);
      const newValue = `${beforeMention}@${agent.full_name} ${textAfterCursor}`;
      onChange(newValue);
      setShowSuggestions(false);
      // Focus back on textarea
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = (beforeMention + `@${agent.full_name} `).length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative flex-1">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto">
          {filtered.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent textarea blur
                insertMention(agent);
              }}
            >
              <span className="font-medium">@{agent.full_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
