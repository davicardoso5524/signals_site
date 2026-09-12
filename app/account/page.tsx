"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase-browser";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void supabase?.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) router.replace("/auth");
    }).finally(() => setLoading(false));
  }, [router]);
  const signOut = async () => { await supabase?.auth.signOut(); router.replace("/auth"); };
  if (loading) return <main className="account-page"><p className="auth-loading">Carregando painel…</p></main>;
  if (!user) return null;
  return <main className="account-page"><header className="account-header"><a className="brand" href="/"><img src="/signals-icon.png" alt="" width="27" height="27" /><span>SIGNALS</span></a><button className="account-signout" type="button" onClick={signOut}>Sair</button></header><section className="account-content" aria-labelledby="account-title"><p className="eyebrow">Minha conta</p><h1 id="account-title">Olá, {user.user_metadata?.display_name || user.email}</h1><p className="account-email">{user.email}</p><div className="account-grid"><article className="account-card"><span className="account-card-label">Status</span><strong>Email confirmado</strong><p>Seu acesso ao Signals será controlado pela licença da sua conta.</p></article><article className="account-card"><span className="account-card-label">Licenças e keys</span><strong>Em breve</strong><p>Aqui você verá suas keys, plano, validade e histórico de pagamentos.</p></article></div></section></main>;
}
