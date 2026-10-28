import { Outlet, Navigate } from "react-router-dom";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Ticket, HelpCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ProfileDialog from "@/components/ProfileDialog";
import ClientNotificationBell from "@/components/portal/ClientNotificationBell";

export default function PortalLayout() {
  const { user, profile, loading, signOut } = useClientAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal/login" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/portal/login");
  };

  const initials = (profile?.full_name || "C")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <img src="/images/logo-upmoveis-red.jpeg" alt="UP Móveis" className="h-8 rounded" />
              <h1 className="text-sm sm:text-lg font-semibold text-primary">Área do cliente</h1>
            </div>
            <nav className="hidden sm:flex items-center gap-1">
              <Button
                variant={location.pathname.startsWith("/portal/tickets") ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate("/portal/tickets")}
              >
                <Ticket className="mr-1.5 h-4 w-4" />
                Tickets
              </Button>
              <Button
                variant={location.pathname === "/portal/faq" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate("/portal/faq")}
              >
                <HelpCircle className="mr-1.5 h-4 w-4" />
                FAQ
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ClientNotificationBell />
            <ProfileDialog
              userId={user.id}
              fullName={profile?.full_name || ""}
              email={profile?.email || user.email || ""}
              avatarUrl={profile?.avatar_url}
              table="client_users"
              trigger={
                <Button variant="ghost" size="icon" aria-label="Editar perfil" className="flex items-center gap-2 group">
                  <Avatar className="h-8 w-8 border border-primary/20 transition-all group-hover:border-primary">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground hidden sm:inline group-hover:text-foreground transition-colors">
                    {profile?.full_name || user.email}
                  </span>
                </Button>
              }
            />
            <Button variant="ghost" size="icon" aria-label="Terminar sessão" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>
      <nav aria-label="Área do cliente" className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-2 border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden">
        <Button variant={location.pathname.startsWith("/portal/tickets") ? "secondary" : "ghost"} className="h-16 rounded-none" onClick={() => navigate("/portal/tickets")}><Ticket className="mr-2 h-5 w-5" />Atendimentos</Button>
        <Button variant={location.pathname === "/portal/faq" ? "secondary" : "ghost"} className="h-16 rounded-none" onClick={() => navigate("/portal/faq")}><HelpCircle className="mr-2 h-5 w-5" />Dúvidas</Button>
      </nav>
    </div>
  );
}
