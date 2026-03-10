import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { KeyRound, Loader2, Search, Trash2 } from "lucide-react";

export default function ClientsTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<{ id: string; full_name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["client-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_users")
        .select("id, full_name, email, phone, avatar_url, created_at, last_seen_at")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleResetPassword = async () => {
    if (!selectedClient) return;
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "A password deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As passwords não coincidem", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("reset-client-password", {
      body: { client_user_id: selectedClient.id, new_password: newPassword },
    });

    if (error || data?.error) {
      toast({ title: "Erro ao alterar password", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Password alterada com sucesso!", description: `Password do cliente ${selectedClient.full_name} foi atualizada.` });
      setSelectedClient(null);
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  };

  if (role !== "supervisor") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Apenas supervisores podem gerir clientes.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes do Portal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum cliente encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((client) => {
                      const initials = (client.full_name || "C")
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();
                      return (
                        <TableRow key={client.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={client.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{client.full_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{client.email}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{client.phone || "–"}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              onClick={() => setSelectedClient({ id: client.id, full_name: client.full_name, email: client.email })}
                            >
                              <KeyRound className="h-3 w-3" />
                              Senha
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedClient} onOpenChange={(open) => { if (!open) { setSelectedClient(null); setNewPassword(""); setConfirmPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Password do Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Cliente: </span>
              <span className="font-medium">{selectedClient?.full_name}</span>
              <span className="text-muted-foreground ml-2">({selectedClient?.email})</span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Nova Password</Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Confirmar Password</Label>
              <Input
                type="password"
                placeholder="Repetir password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button className="w-full h-9 gap-1" onClick={handleResetPassword} disabled={saving || !newPassword}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Alterar Password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
