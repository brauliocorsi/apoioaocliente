import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function PortalNewTicket() {
  const { user, profile } = useClientAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setLoading(true);

    const { data, error } = await supabase.from("tickets").insert({
      subject,
      description,
      product_name: productName || null,
      client_name: profile.full_name,
      client_email: profile.email,
      client_phone: profile.phone,
      client_user_id: user.id,
      created_by: user.id,
    }).select("id").single();

    if (error) {
      toast({ title: "Erro ao criar ticket", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ticket criado com sucesso" });
      navigate(`/portal/tickets/${data.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Novo Ticket</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Descreva o seu problema</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Assunto *</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Resumo do problema" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição *</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5} placeholder="Descreva o seu problema com o máximo detalhe possível..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Produto (opcional)</label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Nome do produto" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/portal/tickets")}>Cancelar</Button>
              <Button type="submit" disabled={loading || !subject.trim() || !description.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Ticket
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
