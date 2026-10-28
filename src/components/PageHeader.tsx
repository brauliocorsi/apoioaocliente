import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: "primary" | "accent" | "success" | "warning" | "destructive";
  actions?: ReactNode;
  children?: ReactNode;
}

const accentBg: Record<NonNullable<PageHeaderProps["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function PageHeader({
  title,
  subtitle,
  icon,
  accent = "primary",
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="border-b border-border pb-5">
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {icon && (
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accentBg[accent]} shadow-soft`}>
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground break-words">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{actions}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}

export default PageHeader;
