import { LayoutDashboard, Ticket, MessageSquareText, Settings, LogOut, Phone, Truck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import ProfileDialog from "@/components/ProfileDialog";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Tickets", url: "/tickets", icon: Ticket },
  { title: "Ligações", url: "/phone-calls", icon: Phone },
  { title: "Macros", url: "/macros", icon: MessageSquareText },
  { title: "Configurações", url: "/settings", icon: Settings },
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
      {/* Brand header with gradient accent */}
      <SidebarHeader className="p-5 pb-6">
        <div className="flex items-center gap-3">
          <img src="/images/logo-upmoveis-red.jpeg" alt="UP Móveis" className="h-10 w-10 rounded-xl object-cover shadow-lg" />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-sidebar-foreground">UP Móveis</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/40">Suporte</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`
                          group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                          ${active
                            ? "bg-sidebar-primary/15 text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          }
                        `}
                        activeClassName=""
                      >
                        {/* Active indicator bar */}
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-gradient-to-b from-sidebar-primary to-[hsl(260,60%,55%)]" />
                        )}
                        <div className={`
                          flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200
                          ${active
                            ? "bg-gradient-to-br from-sidebar-primary to-[hsl(260,60%,55%)] text-white shadow-md shadow-sidebar-primary/20"
                            : "bg-sidebar-accent/50 text-sidebar-foreground/50 group-hover:bg-sidebar-accent group-hover:text-sidebar-foreground/80"
                          }
                        `}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <span>{item.title}</span>
                        {active && (
                          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary animate-pulse" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="rounded-xl bg-sidebar-accent/60 p-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <ProfileDialog
              userId={user?.id || ""}
              fullName={profile?.full_name || ""}
              email={profile?.email || ""}
              avatarUrl={profile?.avatar_url}
              table="profiles"
              trigger={
                <button className="shrink-0 group relative">
                  <Avatar className="h-9 w-9 border-2 border-sidebar-primary/30 transition-all group-hover:border-sidebar-primary">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-sidebar-primary to-[hsl(260,60%,55%)] text-[11px] font-bold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              }
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">
                {profile?.full_name || "Agente"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 capitalize">{role || "agent"}</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Terminar sessão</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
