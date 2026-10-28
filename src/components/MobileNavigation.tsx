import { NavLink } from "react-router-dom";
import { Ticket, Inbox, Bell, LayoutDashboard } from "lucide-react";

const items = [
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/inbound-events", label: "Entrada", icon: Inbox },
  { to: "/notifications", label: "Alertas", icon: Bell },
  { to: "/", label: "Resumo", icon: LayoutDashboard },
];

export function MobileNavigation() {
  return (
    <nav aria-label="Atendimento" className="fixed bottom-0 inset-x-0 z-30 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${isActive ? "text-primary bg-primary-soft" : "text-muted-foreground"}`}>
          <Icon className="h-5 w-5" />{label}
        </NavLink>
      ))}
    </nav>
  );
}