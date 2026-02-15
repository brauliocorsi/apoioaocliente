import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Loader2 } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function AppLayout() {
  const { session, user, loading } = useAuth();
  usePushNotifications(user?.id);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex h-14 items-center justify-between gap-4 border-b border-border/50 bg-card/80 backdrop-blur-sm px-6 sticky top-0 z-10">
            <SidebarTrigger />
            <NotificationBell />
          </header>
          <div className="flex-1 p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
