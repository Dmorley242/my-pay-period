import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

export default function Auth() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav("/", { replace: true }); }, [user, nav]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message); else nav("/", { replace: true });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { display_name: name } },
    });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("Account created!"); nav("/", { replace: true }); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-accent to-background">
      <Card className="w-full max-w-md shadow-[var(--shadow-lg)]">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Wallet className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Pay Period Money Tracker</CardTitle>
          <CardDescription>Take control of every dollar across every account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 mt-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 mt-4">
                <div><Label>Display name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating..." : "Create Account"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
