import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ClientAuthProvider } from "@/hooks/useClientAuth";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import TicketNew from "./pages/TicketNew";
import TicketDetail from "./pages/TicketDetail";
import Macros from "./pages/Macros";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import PortalLayout from "./components/PortalLayout";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalTickets from "./pages/portal/PortalTickets";
import PortalTicketDetail from "./pages/portal/PortalTicketDetail";
import PortalNewTicket from "./pages/portal/PortalNewTicket";
import PortalFAQ from "./pages/portal/PortalFAQ";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Agent routes */}
          <Route path="/auth" element={<AuthProvider><Auth /></AuthProvider>} />
          <Route element={<AuthProvider><AppLayout /></AuthProvider>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/tickets/new" element={<TicketNew />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/macros" element={<Macros />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Portal (client) routes */}
          <Route path="/portal/login" element={<ClientAuthProvider><PortalLogin /></ClientAuthProvider>} />
          <Route element={<ClientAuthProvider><PortalLayout /></ClientAuthProvider>}>
            <Route path="/portal/tickets" element={<PortalTickets />} />
            <Route path="/portal/tickets/new" element={<PortalNewTicket />} />
            <Route path="/portal/tickets/:id" element={<PortalTicketDetail />} />
            <Route path="/portal/faq" element={<PortalFAQ />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
