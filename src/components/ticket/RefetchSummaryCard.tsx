import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, X, RefreshCw } from "lucide-react";
import type { RefetchResult } from "@/hooks/useTicketRefetch";

interface Props {
  result: RefetchResult;
  onRetry: (filename: string) => void;
  onClose: () => void;
  busy?: boolean;
}

export function RefetchSummaryCard({ result, onRetry, onClose, busy }: Props) {
  const hasError = !!result.error;
  return (
    <Card className={hasError ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}>
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-start gap-2">
          {hasError ? (
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {hasError ? "Erro na re-importação" : "Re-importação concluída"}
            </p>
            <p className="text-xs text-muted-foreground">{result.summary}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {result.imported.length > 0 && (
          <ul className="text-xs text-muted-foreground pl-6 space-y-0.5">
            {result.imported.map((a) => (
              <li key={a.filename} className="truncate">• {a.filename}</li>
            ))}
          </ul>
        )}

        {result.failed.length > 0 && (
          <div className="pl-6 space-y-1">
            {result.failed.map((a) => (
              <div key={a.filename} className="flex items-center gap-2 text-xs">
                <span className="truncate text-destructive">{a.filename}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] gap-1"
                  disabled={busy}
                  onClick={() => onRetry(a.filename)}
                >
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
