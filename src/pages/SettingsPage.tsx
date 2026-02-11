import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const { profile, role } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Perfil e preferências do sistema</p>
      </div>

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
    </div>
  );
}
