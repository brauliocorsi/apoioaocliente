import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plug, CheckCircle2, XCircle, Mail, Send } from "lucide-react";

interface SmtpConfig {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from_name: string;
  smtp_from_email: string;
}

const defaultConfig: SmtpConfig = {
  smtp_host: "",
  smtp_port: "465",
  smtp_user: "",
  smtp_pass: "",
  smtp_from_name: "Apoio ao Cliente",
  smtp_from_email: "noreply@upmoveis.pt",
};

export default function SmtpSettingsTab() {
  const [config, setConfig] = useState<SmtpConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", Object.keys(defaultConfig));

    if (!error && data) {
      const loaded = { ...defaultConfig };
      data.forEach((row: { key: string; value: string }) => {
        if (row.key in loaded) {
          (loaded as Record<string, string>)[row.key] = row.value;
        }
      });
      setConfig(loaded);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(config).map(([key, value]) =>
        supabase
          .from("system_settings")
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      );
      await Promise.all(updates);
      toast({ title: "Configuração SMTP guardada com sucesso" });
    } catch {
      toast({ title: "Erro ao guardar", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await supabase.functions.invoke("test-smtp", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.error) {
        setTestResult({ success: false, message: res.error.message || "Erro na conexão" });
      } else {
        const body = res.data;
        setTestResult({ success: body.success, message: body.message || (body.success ? "Conexão OK" : "Falha") });
      }
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message });
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConfigured = config.smtp_host && config.smtp_user && config.smtp_pass;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Servidor SMTP
              </CardTitle>
              <CardDescription>Configuração do servidor de email para envio de notificações</CardDescription>
            </div>
            {isConfigured ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Configurado
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                Não configurado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">Host SMTP</Label>
              <Input
                id="smtp_host"
                placeholder="smtp.exemplo.com"
                value={config.smtp_host}
                onChange={(e) => setConfig((c) => ({ ...c, smtp_host: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">Porta</Label>
              <Select
                value={config.smtp_port}
                onValueChange={(v) => setConfig((c) => ({ ...c, smtp_port: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="465">465 (SSL)</SelectItem>
                  <SelectItem value="587">587 (TLS)</SelectItem>
                  <SelectItem value="25">25 (Sem encriptação)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_user">Utilizador</Label>
              <Input
                id="smtp_user"
                placeholder="noreply@upmoveis.pt"
                value={config.smtp_user}
                onChange={(e) => setConfig((c) => ({ ...c, smtp_user: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_pass">Password</Label>
              <Input
                id="smtp_pass"
                type="password"
                placeholder="••••••••"
                value={config.smtp_pass}
                onChange={(e) => setConfig((c) => ({ ...c, smtp_pass: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_from_name">Nome do Remetente</Label>
              <Input
                id="smtp_from_name"
                placeholder="Apoio ao Cliente"
                value={config.smtp_from_name}
                onChange={(e) => setConfig((c) => ({ ...c, smtp_from_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_from_email">Email do Remetente</Label>
              <Input
                id="smtp_from_email"
                type="email"
                placeholder="noreply@upmoveis.pt"
                value={config.smtp_from_email}
                onChange={(e) => setConfig((c) => ({ ...c, smtp_from_email: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing || !isConfigured}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
          Testar Conexão
        </Button>
      </div>

      {testResult && (
        <Card className={testResult.success ? "border-green-300 dark:border-green-700" : "border-destructive"}>
          <CardContent className="py-4 flex items-center gap-3">
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
            )}
            <div>
              <p className="font-medium text-sm">
                {testResult.success ? "Conexão bem-sucedida" : "Falha na conexão"}
              </p>
              <p className="text-xs text-muted-foreground">{testResult.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Enviar Email de Teste
          </CardTitle>
          <CardDescription>Envia um email de prova para verificar que o SMTP está a funcionar corretamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="test_email">Email de destino</Label>
              <Input
                id="test_email"
                type="email"
                placeholder="exemplo@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={async () => {
                  if (!testEmail) return;
                  setSendingTest(true);
                  setSendResult(null);
                  try {
                    const res = await supabase.functions.invoke("test-smtp", {
                      body: { send_to: testEmail },
                    });
                    if (res.error) {
                      setSendResult({ success: false, message: res.error.message || "Erro ao enviar" });
                    } else {
                      setSendResult({ success: res.data.success, message: res.data.message || "Email enviado" });
                    }
                  } catch (err) {
                    setSendResult({ success: false, message: (err as Error).message });
                  }
                  setSendingTest(false);
                }}
                disabled={sendingTest || !isConfigured || !testEmail}
              >
                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar
              </Button>
            </div>
          </div>

          {sendResult && (
            <div className={`flex items-center gap-2 text-sm ${sendResult.success ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
              {sendResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              <span>{sendResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
