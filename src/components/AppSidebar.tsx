import { LayoutDashboard, Ticket, MessageSquareText, Settings, LogOut, Phone, Truck, ClipboardCheck, Mail, AlertTriangle, Inbox, Activity, Users, Tag, Timer, FolderTree } from "lucide-react";
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

type Item = { title: string; url: string; icon: any };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Painel Operacional", url: "/operational-dashboard", icon: Activity },
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { title: "Tickets", url: "/tickets", icon: Ticket },
      { title: "Email Tickets", url: "/email-tickets", icon: Mail },
      { title: "Caixa de Entrada", url: "/inbound-events", icon: Inbox },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Encomendas Atrasadas", url: "/delayed-orders", icon: AlertTriangle },
      { title: "Pós-Entrega", url: "/post-delivery", icon: ClipboardCheck },
      { title: "Ligações", url: "/phone-calls", icon: Phone },
      { title: "Reg. Ligações", url: "/delivery-confirmations", icon: Truck },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Macros", url: "/macros", icon: MessageSquareText },
      { title: "Categorias", url: "/categories", icon: FolderTree },
      { title: "Etiquetas", url: "/tags", icon: Tag },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Configurações", url: "/settings", icon: Settings },
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
          <img src="/images/logo-upmoveis-red.jpeg" alt="UP Móveis" className="h-9 w-9 rounded-lg object-cover" />
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">UP Móveis</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35">Suporte</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 overflow-y-auto">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35 px-3">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                            active
                              ? "bg-sidebar-accent text-sidebar-primary"
                              : "text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/90"
                          }`}
                          activeClassName=""
                        >
                          {active && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-primary" />
                          )}
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.title}</span>
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
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <ProfileDialog
            userId={user?.id || ""}
            fullName={profile?.full_name || ""}
            email={profile?.email || ""}
            avatarUrl={profile?.avatar_url}
            table="profiles"
            trigger={
              <button className="shrink-0 group">
                <Avatar className="h-8 w-8 border border-sidebar-border transition-colors group-hover:border-sidebar-primary/40">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-sidebar-accent text-[11px] font-semibold text-sidebar-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            }
          />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-sidebar-foreground truncate">
              {profile?.full_name || "Agente"}
            </p>
            <p className="text-[10px] text-sidebar-foreground/35 capitalize">{role || "agent"}</p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/35 transition-colors hover:bg-destructive/10 hover:text-destructive"
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
