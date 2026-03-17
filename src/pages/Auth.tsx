import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const { session, loading, signIn } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (session) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get("email") as string, form.get("password") as string);
    if (error) toast({ title: "Erro no login", description: error.message, variant: "destructive" });
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm shadow-lg border-border/60">
        <CardHeader className="text-center pb-4">
          <img
            src="/images/logo-upmoveis-red.jpeg"
            alt="UP Móveis"
            className="mx-auto mb-3 h-14 w-14 rounded-xl object-cover"
          />
          <CardTitle className="text-xl font-semibold">UP Móveis</CardTitle>
          <CardDescription className="text-[13px]">Sistema de Suporte ao Cliente</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-[13px]">Email</Label>
              <Input id="login-email" name="email" type="email" required placeholder="agente@upmoveis.pt" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-[13px]">Password</Label>
              <Input id="login-password" name="password" type="password" required placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Contacte o supervisor para obter as suas credenciais de acesso.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
