import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plug, CheckCircle2, XCircle, Mail, Send, Inbox } from "lucide-react";

interface SmtpConfig {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from_name: string;
  smtp_from_email: string;
}

interface ImapConfig {
  imap_host: string;
  imap_port: string;
  imap_user: string;
  imap_pass: string;
  imap_folder: string;
  imap_enabled: string;
}

interface ResendConfig {
  resend_enabled: string;
  resend_from_email: string;
}

const defaultSmtp: SmtpConfig = {
  smtp_host: "",
  smtp_port: "465",
  smtp_user: "",
  smtp_pass: "",
  smtp_from_name: "Apoio ao Cliente",
  smtp_from_email: "noreply@upmoveis.pt",
};

const defaultImap: ImapConfig = {
  imap_host: "",
  imap_port: "993",
  imap_user: "",
  imap_pass: "",
  imap_folder: "INBOX",
  imap_enabled: "false",
};

const defaultResend: ResendConfig = {
  resend_enabled: "false",
  resend_from_email: "noreply@upmoveis.pt",
};

export default function SmtpSettingsTab() {
  const [resend, setResend] = useState<ResendConfig>(defaultResend);
  const [savingResend, setSavingResend] = useState(false);
  const [smtp, setSmtp] = useState<SmtpConfig>(defaultSmtp);
  const [imap, setImap] = useState<ImapConfig>(defaultImap);
  const [notifyStatusChange, setNotifyStatusChange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingImap, setSavingImap] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingImap, setTestingImap] = useState(false);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    const allKeys = [...Object.keys(defaultSmtp), ...Object.keys(defaultImap), ...Object.keys(defaultResend), "notify_status_change_email"];
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", allKeys);

    if (!error && data) {
      const loadedSmtp = { ...defaultSmtp };
      const loadedImap = { ...defaultImap };
      data.forEach((row: { key: string; value: string }) => {
        if (row.key in loadedSmtp) {
          (loadedSmtp as Record<string, string>)[row.key] = row.value;
        }
        if (row.key in loadedImap) {
          (loadedImap as Record<string, string>)[row.key] = row.value;
        }
        if (row.key === "notify_status_change_email") {
          setNotifyStatusChange(row.value === "true");
        }
      });
      setSmtp(loadedSmtp);
      setImap(loadedImap);
    }
    setLoading(false);
  };

  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    try {
      const updates = Object.entries(smtp).map(([key, value]) =>
        supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      );
      await Promise.all(updates);
      toast({ title: "Configuração SMTP guardada com sucesso" });
    } catch {
      toast({ title: "Erro ao guardar", variant: "destructive" });
    }
    setSavingSmtp(false);
  };

  const handleSaveImap = async () => {
    setSavingImap(true);
    try {
      const updates = Object.entries(imap).map(([key, value]) =>
        supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      );
      await Promise.all(updates);
      toast({ title: "Configuração IMAP guardada com sucesso" });
    } catch {
      toast({ title: "Erro ao guardar", variant: "destructive" });
    }
    setSavingImap(false);
  };

  const handleTestSmtp = async () => {
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
        setTestResult({ success: res.data.success, message: res.data.message || (res.data.success ? "Conexão OK" : "Falha") });
      }
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message });
    }
    setTesting(false);
  };

  const handleTestImap = async () => {
    setTestingImap(true);
    setImapTestResult(null);
    try {
      // Save IMAP config first
      await handleSaveImap();
      const res = await supabase.functions.invoke("fetch-inbound-emails", {
        body: { test_only: true },
      });
      if (res.error) {
        setImapTestResult({ success: false, message: res.error.message || "Erro na conexão" });
      } else {
        setImapTestResult({ success: res.data.success, message: res.data.message || "Resultado desconhecido" });
      }
    } catch (err) {
      setImapTestResult({ success: false, message: (err as Error).message });
    }
    setTestingImap(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSmtpConfigured = smtp.smtp_host && smtp.smtp_user && smtp.smtp_pass;
  const isImapConfigured = imap.imap_host && imap.imap_user && imap.imap_pass;

  const handleToggleNotifyStatus = async (checked: boolean) => {
    setNotifyStatusChange(checked);
    await supabase.from("system_settings").upsert(
      { key: "notify_status_change_email", value: checked ? "true" : "false", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    toast({ title: checked ? "Notificação de mudança de estado activada" : "Notificação de mudança de estado desactivada" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Notificações por Email
          </CardTitle>
          <CardDescription>Controlar quando os emails automáticos são enviados ao cliente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Enviar email ao cliente quando o estado do ticket muda</p>
              <p className="text-xs text-muted-foreground">Inclui mudanças no Kanban e no detalhe do ticket</p>
            </div>
            <Switch
              checked={notifyStatusChange}
              onCheckedChange={handleToggleNotifyStatus}
            />
          </div>
        </CardContent>
      </Card>

      {/* SMTP Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Servidor SMTP (Envio)
              </CardTitle>
              <CardDescription>Configuração do servidor de email para envio de notificações</CardDescription>
            </div>
            {isSmtpConfigured ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Configurado</Badge>
            ) : (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Não configurado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">Host SMTP</Label>
              <Input id="smtp_host" placeholder="smtp.exemplo.com" value={smtp.smtp_host} onChange={(e) => setSmtp((c) => ({ ...c, smtp_host: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">Porta</Label>
              <Select value={smtp.smtp_port} onValueChange={(v) => setSmtp((c) => ({ ...c, smtp_port: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Input id="smtp_user" placeholder="noreply@upmoveis.pt" value={smtp.smtp_user} onChange={(e) => setSmtp((c) => ({ ...c, smtp_user: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_pass">Password</Label>
              <Input id="smtp_pass" type="password" placeholder="••••••••" value={smtp.smtp_pass} onChange={(e) => setSmtp((c) => ({ ...c, smtp_pass: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_from_name">Nome do Remetente</Label>
              <Input id="smtp_from_name" placeholder="Apoio ao Cliente" value={smtp.smtp_from_name} onChange={(e) => setSmtp((c) => ({ ...c, smtp_from_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_from_email">Email do Remetente</Label>
              <Input id="smtp_from_email" type="email" placeholder="noreply@upmoveis.pt" value={smtp.smtp_from_email} onChange={(e) => setSmtp((c) => ({ ...c, smtp_from_email: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSaveSmtp} disabled={savingSmtp}>
          {savingSmtp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar SMTP
        </Button>
        <Button variant="outline" onClick={handleTestSmtp} disabled={testing || !isSmtpConfigured}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
          Testar Conexão
        </Button>
      </div>

      {testResult && (
        <Card className={testResult.success ? "border-green-300 dark:border-green-700" : "border-destructive"}>
          <CardContent className="py-4 flex items-center gap-3">
            {testResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" /> : <XCircle className="h-5 w-5 text-destructive shrink-0" />}
            <div>
              <p className="font-medium text-sm">{testResult.success ? "Conexão bem-sucedida" : "Falha na conexão"}</p>
              <p className="text-xs text-muted-foreground">{testResult.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send test email */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4" />Enviar Email de Teste</CardTitle>
          <CardDescription>Envia um email de prova para verificar que o SMTP está a funcionar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="test_email">Email de destino</Label>
              <Input id="test_email" type="email" placeholder="exemplo@email.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                onClick={async () => {
                  if (!testEmail) return;
                  setSendingTest(true);
                  setSendResult(null);
                  try {
                    const res = await supabase.functions.invoke("test-smtp", { body: { send_to: testEmail } });
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
                disabled={sendingTest || !isSmtpConfigured || !testEmail}
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

      {/* IMAP Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Servidor IMAP (Receção)
              </CardTitle>
              <CardDescription>Configuração para receber emails e criar tickets automaticamente</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {isImapConfigured ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Configurado</Badge>
              ) : (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Não configurado</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Receção automática</p>
              <p className="text-xs text-muted-foreground">Verifica a caixa de entrada a cada 5 minutos</p>
            </div>
            <Switch
              checked={imap.imap_enabled === "true"}
              onCheckedChange={(checked) => setImap((c) => ({ ...c, imap_enabled: checked ? "true" : "false" }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imap_host">Host IMAP</Label>
              <Input id="imap_host" placeholder="imap.exemplo.com" value={imap.imap_host} onChange={(e) => setImap((c) => ({ ...c, imap_host: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap_port">Porta</Label>
              <Select value={imap.imap_port} onValueChange={(v) => setImap((c) => ({ ...c, imap_port: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="993">993 (SSL/TLS)</SelectItem>
                  <SelectItem value="143">143 (Sem encriptação)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imap_user">Utilizador</Label>
              <Input id="imap_user" placeholder="suporte@upmoveis.pt" value={imap.imap_user} onChange={(e) => setImap((c) => ({ ...c, imap_user: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap_pass">Password</Label>
              <Input id="imap_pass" type="password" placeholder="••••••••" value={imap.imap_pass} onChange={(e) => setImap((c) => ({ ...c, imap_pass: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imap_folder">Pasta</Label>
            <Input id="imap_folder" placeholder="INBOX" value={imap.imap_folder} onChange={(e) => setImap((c) => ({ ...c, imap_folder: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSaveImap} disabled={savingImap}>
          {savingImap ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar IMAP
        </Button>
        <Button variant="outline" onClick={handleTestImap} disabled={testingImap || !isImapConfigured}>
          {testingImap ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
          Testar Conexão IMAP
        </Button>
      </div>

      {imapTestResult && (
        <Card className={imapTestResult.success ? "border-green-300 dark:border-green-700" : "border-destructive"}>
          <CardContent className="py-4 flex items-center gap-3">
            {imapTestResult.success ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" /> : <XCircle className="h-5 w-5 text-destructive shrink-0" />}
            <div>
              <p className="font-medium text-sm">{imapTestResult.success ? "Conexão IMAP bem-sucedida" : "Falha na conexão IMAP"}</p>
              <p className="text-xs text-muted-foreground">{imapTestResult.message}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
