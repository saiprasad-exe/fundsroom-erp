import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loginSchema, signupSchema } from "@/lib/validators";
import { errorMessage } from "@/lib/api-error";
import type { AppRole } from "@/types";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Fundsroom ERP" },
      { name: "description", content: "Sign in to the Fundsroom ERP and CRM operations portal." },
      { property: "og:title", content: "Sign in · Fundsroom ERP" },
      { property: "og:description", content: "Employee access to the Fundsroom operations portal." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const role: AppRole = "SALES";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    const parsed =
      mode === "login"
        ? loginSchema.safeParse({ email, password })
        : signupSchema.safeParse({ email, password, name, role });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        const { error: setupError } = await supabase.rpc("setup_account", {
          _name: name.trim(),
          _role: role,
        });
        if (setupError) throw setupError;
        toast.success("Account created", { description: `Signed in as ${role}.` });
      }
      await router.navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(mode === "login" ? "Sign in failed" : "Sign up failed", {
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <Boxes className="size-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Fundsroom ERP + CRM</h1>
            <p className="text-xs text-muted-foreground">Internal operations portal</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-4 p-5">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Create account
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "signup" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                {errors["name"] ? (
                  <p className="text-xs text-destructive">{errors["name"]}</p>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors["email"] ? <p className="text-xs text-destructive">{errors["email"]}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors["password"] ? (
              <p className="text-xs text-destructive">{errors["password"]}</p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
