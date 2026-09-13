"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase-browser";

type LicenseStatus = {
  active: boolean;
  trial: { starts_at: string; ends_at: string; status: "active" | "expired" | "revoked" } | null;
  subscriptions: { status: string; current_period_end: string | null }[];
};

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseError, setLicenseError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(data.user);
      if (!data.user) { router.replace("/auth"); return; }
      const { data: status, error } = await supabase.functions.invoke("license-status", { body: {} });
      if (!cancelled) {
        setLicenseError(Boolean(error));
        if (!error) setLicense(status as LicenseStatus);
        setLoading(false);
      }
    }
    void loadAccount();
    return () => { cancelled = true; };
  }, [router]);
  const signOut = async () => { await supabase?.auth.signOut(); router.replace("/auth"); };
  if (loading) return <main className="account-page"><p className="auth-loading">Carregando painel…</p></main>;
  if (!user) return null;
  const now = Date.now();
  const activeSubscription = license?.subscriptions.find((subscription) => ["active", "trialing"].includes(subscription.status) && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now));
  const trialActive = license?.trial?.status === "active" && new Date(license.trial.ends_at).getTime() > Date.now();
  const trialExpired = license?.trial && !trialActive;
  const daysRemaining = trialActive && license?.trial ? Math.max(1, Math.ceil((new Date(license.trial.ends_at).getTime() - Date.now()) / 86400000)) : 0;
  const statusTitle = activeSubscription ? "Signals Pro" : trialActive ? "Teste gratuito" : "Período encerrado";
  const statusDescription = activeSubscription
    ? "Plano Pro ativo por R$ 10/mês."
    : trialActive
      ? `${daysRemaining} ${daysRemaining === 1 ? "dia restante" : "dias restantes"} no acesso gratuito.`
      : "Seu trial terminou. Assine o Pro para continuar usando o Signals.";
  return <main className="account-page"><header className="account-header"><a className="brand" href="/"><img src="/signals-icon.png" alt="" width="27" height="27" /><span>SIGNALS</span></a><button className="account-signout" type="button" onClick={signOut}>Sair</button></header><section className="account-content" aria-labelledby="account-title"><p className="eyebrow">Minha conta</p><h1 id="account-title">Olá, {user.user_metadata?.display_name || user.email}</h1><p className="account-email">{user.email}</p>{licenseError ? <p className="form-error" role="alert">Não foi possível carregar o status da sua licença.</p> : <div className="account-grid"><article className="account-card"><span className="account-card-label">Acesso</span><strong>{statusTitle}</strong><p>{statusDescription}</p>{trialActive && license?.trial ? <p className="account-meta">Válido até {new Date(license.trial.ends_at).toLocaleDateString("pt-BR")}.</p> : null}{trialExpired && !activeSubscription ? <p className="account-meta">Nenhuma assinatura ativa.</p> : null}</article><article className="account-card"><span className="account-card-label">Plano</span><strong>{activeSubscription ? "R$ 10 / mês" : "Pro mensal"}</strong><p>{activeSubscription ? "Sua assinatura está ativa." : "Assine para manter o acesso após o trial."}</p>{!activeSubscription ? <a className="button button-primary account-cta" href="/checkout">Assinar Pro <span aria-hidden="true">→</span></a> : null}</article></div>}</section></main>;
}
