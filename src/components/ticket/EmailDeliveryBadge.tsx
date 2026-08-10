import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, CheckCheck, Clock, MailWarning, MailX, Ban, Eye } from "lucide-react";

/** Estados de entrega registados em email_logs.delivery_status */
export type DeliveryStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "opened"
  | "clicked"
  | string;

interface Meta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  hint: string;
}

export const DELIVERY_META: Record<string, Meta> = {
  accepted: {
    label: "Aceite (SMTP)",
    icon: Check,
    className: "border-muted-foreground/30 text-muted-foreground",
    hint: "O servidor SMTP aceitou a mensagem. Este método não permite confirmar a entrega real na caixa do cliente.",
  },
  sent: {
    label: "Enviado",
    icon: Clock,
    className: "border-info/40 text-info",
    hint: "Aceite pelo fornecedor de e-mail. A aguardar confirmação de entrega.",
  },
  delivered: {
    label: "Entregue",
    icon: CheckCheck,
    className: "border-success/40 text-success",
    hint: "O servidor do destinatário confirmou a entrega da mensagem.",
  },
  opened: {
    label: "Aberto",
    icon: Eye,
    className: "border-success/40 text-success",
    hint: "O destinatário abriu a mensagem.",
  },
  clicked: {
    label: "Clicado",
    icon: Eye,
    className: "border-success/40 text-success",
    hint: "O destinatário clicou numa ligação da mensagem.",
  },
  delivery_delayed: {
    label: "Atrasado",
    icon: Clock,
    className: "border-warning/40 text-warning",
    hint: "A entrega está a ser reencaminhada com atraso pelo servidor do destinatário.",
  },
  bounced: {
    label: "Devolvido",
    icon: MailX,
    className: "border-destructive/40 text-destructive",
    hint: "A mensagem foi devolvida — o endereço pode estar errado ou a caixa cheia.",
  },
  complained: {
    label: "Marcado como spam",
    icon: Ban,
    className: "border-destructive/40 text-destructive",
    hint: "O destinatário marcou a mensagem como spam.",
  },
  failed: {
    label: "Falhou",
    icon: MailWarning,
    className: "border-destructive/40 text-destructive",
    hint: "Não foi possível enviar a mensagem.",
  },
};

export function isDeliveryProblem(status?: string | null) {
  return status === "bounced" || status === "complained" || status === "failed";
}

export function EmailDeliveryBadge({
  status,
  detail,
  className = "",
}: {
  status?: string | null;
  detail?: string | null;
  className?: string;
}) {
  const meta = DELIVERY_META[status || ""] || DELIVERY_META.sent;
  const Icon = meta.icon;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-5 gap-1 ${meta.className} ${className}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">
          <p>{meta.hint}</p>
          {detail && <p className="mt-1 text-muted-foreground">{detail}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
