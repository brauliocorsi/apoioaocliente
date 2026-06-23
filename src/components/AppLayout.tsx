import { useEffect } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2 } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import OrderLookupDialog from "@/components/OrderLookupDialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function AppLayout() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  usePushNotifications(user?.id);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "l":
            e.preventDefault();
            navigate("/phone-calls?new=1");
            break;
          case "p":
            e.preventDefault();
            navigate("/post-delivery?new=1");
            break;
          case "t":
            e.preventDefault();
            navigate("/tickets/new");
            break;
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  const sidebarDefaultOpen =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("sidebar:state="))
          ?.split("=")[1] !== "false"
      : true;

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen}>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex h-12 items-center justify-between gap-4 border-b border-border bg-card px-5 sticky top-0 z-20">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
            <div className="flex items-center gap-1">
              <OrderLookupDialog />
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <div className="flex-1 p-5 fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
