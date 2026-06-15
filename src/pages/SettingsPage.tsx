import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon } from "lucide-react";
import StatusPage from "./StatusPage";
import CategoriesPage from "./CategoriesPage";
import TagsPage from "./TagsPage";
import AgentsTab from "@/components/settings/AgentsTab";
import EmailTemplatesTab from "@/components/settings/EmailTemplatesTab";
import FaqTab from "@/components/settings/FaqTab";
import SmtpSettingsTab from "@/components/settings/SmtpSettingsTab";
import EmailLogsTab from "@/components/settings/EmailLogsTab";
import ClientsTab from "@/components/settings/ClientsTab";
import SlaConfigTab from "@/components/settings/SlaConfigTab";
import HolidaysTab from "@/components/settings/HolidaysTab";
import DecisionRulesTab from "@/components/settings/DecisionRulesTab";
import CompanyDocumentsTab from "@/components/settings/CompanyDocumentsTab";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  const { profile, role } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        subtitle="Perfil, estados, categorias, etiquetas, SLA e integrações"
        icon={<SettingsIcon className="h-6 w-6" />}
        accent="primary"
      />

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="agents">Agentes</TabsTrigger>
          <TabsTrigger value="statuses">Estados</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="tags">Etiquetas</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="holidays">Calendário SLA</TabsTrigger>
          <TabsTrigger value="rules">Motor de Regras</TabsTrigger>
          <TabsTrigger value="templates">Templates Email</TabsTrigger>
          <TabsTrigger value="faq">FAQs</TabsTrigger>
          <TabsTrigger value="smtp">Email SMTP</TabsTrigger>
          <TabsTrigger value="email-logs">Logs Email</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="company-docs">Documentos IA</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="max-w-2xl space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Perfil do Agente</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium">{profile?.full_name || "–"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{profile?.email || "–"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Papel</span>
                <Badge variant="secondary" className="capitalize">{role || "agent"}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Horário de Operação (SLA)</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Segunda a Sábado: 08:00 – 20:00</p>
              <p className="mt-1">Os SLAs são calculados automaticamente com base na categoria e prioridade do ticket.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents">
          <AgentsTab />
        </TabsContent>

        <TabsContent value="statuses">
          <StatusPage />
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesPage />
        </TabsContent>

        <TabsContent value="tags">
          <TagsPage />
        </TabsContent>


        <TabsContent value="sla">
          <SlaConfigTab />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>


        <TabsContent value="rules">
          <DecisionRulesTab />
        </TabsContent>

        <TabsContent value="templates">
          <EmailTemplatesTab />
        </TabsContent>

        <TabsContent value="faq">
          <FaqTab />
        </TabsContent>

        <TabsContent value="smtp">
          <SmtpSettingsTab />
        </TabsContent>

        <TabsContent value="email-logs">
          <EmailLogsTab />
        </TabsContent>

        <TabsContent value="clients">
          <ClientsTab />
        </TabsContent>

        <TabsContent value="company-docs">
          <CompanyDocumentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
