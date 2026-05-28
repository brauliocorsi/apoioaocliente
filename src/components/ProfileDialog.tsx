import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, Lock, Save, PhoneCall } from "lucide-react";

interface ProfileDialogProps {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  /** Table to update: "profiles" for agents, "client_users" for clients */
  table: "profiles" | "client_users";
  onUpdated?: () => void;
  trigger: React.ReactNode;
}

export default function ProfileDialog({
  userId,
  fullName,
  email,
  avatarUrl,
  table,
  onUpdated,
  trigger,
}: ProfileDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState(fullName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [extension, setExtension] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Load Let's Call extension for agents
  useEffect(() => {
    if (!open || table !== "profiles") return;
    (async () => {
      const { data } = await supabase.from("profiles").select("letscall_extension").eq("id", userId).maybeSingle();
      setExtension(((data as any)?.letscall_extension ?? "")?.toString() || "");
    })();
  }, [open, table, userId]);

  const handleSaveExtension = async () => {
    const trimmed = extension.trim();
    const value = trimmed === "" ? null : parseInt(trimmed, 10);
    if (trimmed !== "" && (isNaN(value as number) || (value as number) <= 0)) {
      toast({ title: "Ramal inválido", description: "Digite apenas números (ex: 200)", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ letscall_extension: value } as any).eq("id", userId);
    setSaving(false);
    if (error) toast({ title: "Erro ao guardar ramal", description: error.message, variant: "destructive" });
    else toast({ title: "Ramal guardado" });
  };

  const initials = (fullName || "U")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 2MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Erro ao carregar foto", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    await supabase.from(table).update({ avatar_url: publicUrl } as any).eq("id", userId);

    setPreview(publicUrl);
    toast({ title: "Foto atualizada!" });
    setUploading(false);
    onUpdated?.();
  };

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from(table).update({ full_name: name.trim() } as any).eq("id", userId);
    toast({ title: "Nome atualizado!" });
    setSaving(false);
    onUpdated?.();
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Password deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As passwords não coincidem", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: "Erro ao alterar password", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password alterada com sucesso!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  };

  const displayAvatar = preview || avatarUrl;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <Avatar className="h-20 w-20 border-2 border-primary/20">
                <AvatarImage src={displayAvatar || undefined} alt={fullName} />
                <AvatarFallback className="text-lg bg-gradient-to-br from-primary to-[hsl(260,60%,55%)] text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <p className="text-xs text-muted-foreground">Clique para alterar a foto</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-xs">Nome</Label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                className="h-9 gap-1"
                onClick={handleSaveName}
                disabled={saving || name.trim() === fullName}
              >
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label className="text-xs">Email</Label>
            <Input value={email} disabled className="h-9 text-sm bg-muted" />
          </div>

          {/* Password change */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-semibold">Alterar Password</Label>
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Nova password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                type="password"
                placeholder="Confirmar nova password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-9 gap-1"
              onClick={handleChangePassword}
              disabled={saving || !newPassword}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              Alterar Password
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
