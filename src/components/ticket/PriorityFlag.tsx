import { Flag } from "lucide-react";

const flagColors: Record<string, string> = {
  P1: "#ef4444",
  P2: "#f59e0b",
  P3: "#9ca3af",
};

const labels: Record<string, string> = {
  P1: "Urgente",
  P2: "Normal",
  P3: "Baixa",
};

interface PriorityFlagProps {
  priority: string;
  showLabel?: boolean;
  size?: number;
}

export default function PriorityFlag({ priority, showLabel = false, size = 16 }: PriorityFlagProps) {
  const color = flagColors[priority] || "#9ca3af";

  return (
    <span className="inline-flex items-center gap-1">
      <Flag style={{ color, fill: color }} size={size} />
      {showLabel && <span className="text-xs font-medium">{priority} – {labels[priority] || priority}</span>}
    </span>
  );
}
