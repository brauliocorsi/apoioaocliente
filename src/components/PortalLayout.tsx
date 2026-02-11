import { Outlet, Navigate } from "react-router-dom";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Ticket, HelpCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-primary tracking-tight">Portal do Cliente</h1>
            <nav className="flex items-center gap-1">
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
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {profile?.full_name || user.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
