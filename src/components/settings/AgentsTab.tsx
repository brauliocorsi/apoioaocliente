import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, UserPlus, Shield, User, Trash2, Power, PowerOff } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

type Agent = {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  role: string;
  agent_color: string;
  is_active: boolean;
};

export default function AgentsTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "agent" });

  const isSupervisor = role === "supervisor";

  const fetchAgents = async () => {
    const { data: profs } = await supabase.rpc("get_agent_profiles");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    const roleMap: Record<string, string> = {};
    roles?.forEach((r) => { roleMap[r.user_id] = r.role; });

    const agentList = ((profs as any[]) || []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: "",
      created_at: "",
      role: roleMap[p.id] || p.role || "agent",
      agent_color: "#6b7280",
    }));

    // Fetch emails and colors for the filtered agents
    if (agentList.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, email, created_at, agent_color").in("id", agentList.map((a) => a.id));
      (profiles as any[] || []).forEach((p: any) => {
        const agent = agentList.find((a) => a.id === p.id);
        if (agent) { agent.email = p.email; agent.created_at = p.created_at; agent.agent_color = p.agent_color || "#6b7280"; }
      });
    }

    setAgents(agentList);
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const createAgent = async () => {
    if (!form.email || !form.full_name || !form.password) return;
    setCreating(true);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await supabase.functions.invoke("create-agent", {
      body: { email: form.email, full_name: form.full_name, password: form.password, role: form.role },
    });

    if (response.error || response.data?.error) {
      toast({
        title: "Erro ao criar agente",
        description: response.data?.error || response.error?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } else {
      toast({ title: "Agente criado com sucesso" });
      setForm({ email: "", full_name: "", password: "", role: "agent" });
      setShowForm(false);
      fetchAgents();
    }
    setCreating(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Agentes de Atendimento</CardTitle>
          {isSupervisor && (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <UserPlus className="mr-2 h-4 w-4" /> Novo Agente
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && isSupervisor && (
            <div className="p-4 rounded-lg border border-dashed space-y-3">
              <p className="text-sm font-medium">Criar novo agente</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome completo</Label>
                  <Input className="h-8 text-sm" placeholder="Nome do agente" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-8 text-sm" type="email" placeholder="agente@upmoveis.pt" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <Input className="h-8 text-sm" type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Papel</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agente</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createAgent} disabled={creating || !form.email || !form.full_name || !form.password}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Criar Agente
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: agent.agent_color }}
                  >
                    {agent.role === "supervisor" ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{agent.full_name || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{agent.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isSupervisor && (
                    <input
                      type="color"
                      value={agent.agent_color}
                      onChange={async (e) => {
                        const newColor = e.target.value;
                        setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, agent_color: newColor } : a));
                        const { error } = await supabase.from("profiles").update({ agent_color: newColor } as any).eq("id", agent.id);
                        if (error) {
                          toast({ title: "Erro ao atualizar cor", description: error.message, variant: "destructive" });
                          fetchAgents();
                        } else {
                          toast({ title: `Cor de ${agent.full_name} atualizada` });
                        }
                      }}
                      className="h-7 w-7 rounded cursor-pointer border-0 p-0"
                      title="Cor do agente"
                    />
                  )}
                  <Badge variant={agent.role === "supervisor" ? "default" : "secondary"} className="capitalize">
                    {agent.role === "supervisor" ? "Supervisor" : "Agente"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
