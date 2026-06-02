import { LayoutDashboard, Ticket, MessageSquareText, Settings, LogOut, Phone, Truck, ClipboardCheck, AlertTriangle, Inbox, Activity } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import ProfileDialog from "@/components/ProfileDialog";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Item = { title: string; url: string; icon: any; color: string };
type Group = { label: string; items: Item[] };

// Hue tokens per group/item — used as background tint behind icon
const groups: Group[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Painel Operacional", url: "/operational-dashboard", icon: Activity, color: "var(--cat-1)" },
      { title: "Dashboard", url: "/", icon: LayoutDashboard, color: "var(--cat-2)" },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { title: "Tickets", url: "/tickets", icon: Ticket, color: "var(--cat-4)" },
      { title: "Caixa de Entrada", url: "/inbound-events", icon: Inbox, color: "var(--cat-7)" },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Encomendas Atrasadas", url: "/delayed-orders", icon: AlertTriangle, color: "var(--cat-8)" },
      { title: "Pós-Entrega", url: "/post-delivery", icon: ClipboardCheck, color: "var(--cat-5)" },
      { title: "Ligações", url: "/phone-calls", icon: Phone, color: "var(--cat-6)" },
      { title: "Ligações por Ramal", url: "/extension-calls", icon: Activity, color: "var(--cat-3)" },
      { title: "Reg. Ligações", url: "/delivery-confirmations", icon: Truck, color: "var(--cat-2)" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Macros", url: "/macros", icon: MessageSquareText, color: "var(--cat-4)" },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Configurações", url: "/settings", icon: Settings, color: "var(--cat-1)" },
    ],
  },
];

export function AppSidebar() {
  const { user, profile, role, signOut } = useAuth();
  const location = useLocation();

  const initials = (profile?.full_name || "A")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src="/images/logo-upmoveis-red.jpeg" alt="UP Móveis" className="h-10 w-10 rounded-xl object-cover ring-2 ring-sidebar-primary/30" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-sidebar-background" />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold tracking-tight text-sidebar-foreground">UP Móveis</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/45">Apoio ao Cliente</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 overflow-y-auto">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40 px-3 mt-2">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          className={`group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                            active
                              ? "bg-sidebar-accent text-sidebar-primary-foreground shadow-soft"
                              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          }`}
                          activeClassName=""
                        >
                          {active && (
                            <span
                              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                              style={{ background: `hsl(${item.color})` }}
                            />
                          )}
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                              active ? "" : "group-hover:bg-sidebar-accent/60"
                            }`}
                            style={{
                              backgroundColor: active
                                ? `hsl(${item.color} / 0.18)`
                                : `hsl(${item.color} / 0.10)`,
                            }}
                          >
                            <item.icon
                              className="h-4 w-4"
                              style={{ color: `hsl(${item.color})` }}
                            />
                          </span>
                          <span className="truncate">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-2.5 py-2">
          <ProfileDialog
            userId={user?.id || ""}
            fullName={profile?.full_name || ""}
            email={profile?.email || ""}
            avatarUrl={profile?.avatar_url}
            table="profiles"
            trigger={
              <button className="shrink-0 group relative">
                <Avatar className="h-9 w-9 ring-2 ring-sidebar-primary/30 transition-all group-hover:ring-sidebar-primary/60">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-primary text-[11px] font-semibold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-sidebar-background" />
              </button>
            }
          />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-sidebar-foreground truncate">
              {profile?.full_name || "Agente"}
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 capitalize font-medium">{role || "agent"}</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Terminar sessão</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
