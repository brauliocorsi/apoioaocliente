import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Save, X } from "lucide-react";

interface Template {
  id: string;
  subject: string;
  body_html: string;
  description: string | null;
  updated_at: string;
}

const VARIABLE_LIST = [
  { var: "{nome_cliente}", desc: "Nome do cliente" },
  { var: "{email}", desc: "Email do cliente" },
  { var: "{password}", desc: "Password (só em welcome)" },
  { var: "{numero_ticket}", desc: "Número do ticket" },
  { var: "{assunto}", desc: "Assunto do ticket" },
  { var: "{estado}", desc: "Estado atual" },
  { var: "{ticket_url}", desc: "Link para o ticket no portal" },
  { var: "{portal_url}", desc: "Link para o portal" },
];

export default function EmailTemplatesTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const isSupervisor = role === "supervisor";

  useEffect(() => {
    supabase
      .from("email_templates")
      .select("*")
      .order("id")
      .then(({ data }) => {
        setTemplates((data as Template[]) || []);
        setLoading(false);
      });
  }, []);

  const startEdit = (t: Template) => {
    setEditing(t.id);
    setEditSubject(t.subject);
    setEditBody(t.body_html);
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("email_templates")
      .update({ subject: editSubject, body_html: editBody, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, subject: editSubject, body_html: editBody } : t))
      );
      setEditing(null);
      toast({ title: "Template guardado" });
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-medium text-muted-foreground">Variáveis disponíveis:</h3>
        {VARIABLE_LIST.map((v) => (
          <Badge key={v.var} variant="outline" className="text-xs font-mono">
            {v.var} <span className="font-sans ml-1 text-muted-foreground">– {v.desc}</span>
          </Badge>
        ))}
      </div>

      {templates.map((t) => (
        <Card key={t.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{t.id}</CardTitle>
              {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
            </div>
            {isSupervisor && editing !== t.id && (
              <Button variant="ghost" size="icon" onClick={() => startEdit(t)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editing === t.id ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Assunto</label>
                  <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Corpo (HTML)</label>
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} className="font-mono text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(t.id)}>
                    <Save className="mr-1 h-3 w-3" /> Guardar
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    <X className="mr-1 h-3 w-3" /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm"><strong>Assunto:</strong> {t.subject}</p>
                <div className="border rounded p-3 bg-muted/50 text-xs" dangerouslySetInnerHTML={{ __html: t.body_html }} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
