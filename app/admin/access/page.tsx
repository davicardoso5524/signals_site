"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase-browser";

type UserSummary = { id: string; email: string | null };
type Grant = { id: string; starts_at: string; ends_at: string; reason: string | null; created_at: string; revoked_at: string | null };

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminAccessPage() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<UserSummary | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [duration, setDuration] = useState("7");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  async function callAdmin(body: Record<string, unknown>) {
    if (!supabase) throw new Error("Supabase indisponível");
    const result = await supabase.functions.invoke("admin-access", { body });
    if (result.error) throw new Error(result.data?.error || "Operação não autorizada");
    return result.data;
  }

  async function searchUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage(""); setUser(null); setGrants([]);
    try {
      const data = await callAdmin({ action: "find_user", email });
      setUser(data.user);
      const list = await callAdmin({ action: "list", user_id: data.user.id });
      setGrants(list.grants ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível localizar o usuário.");
    } finally { setBusy(false); }
  }

  async function grantAccess() {
    if (!user) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await callAdmin({ action: "grant", user_id: user.id, duration_days: Number(duration), reason: reason || null });
      setGrants((current) => [data.grant, ...current]);
      setReason(""); setMessage("Acesso Pro concedido.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível conceder o acesso.");
    } finally { setBusy(false); }
  }

  async function revokeAccess(grantId: string) {
    if (!user) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await callAdmin({ action: "revoke", user_id: user.id, grant_id: grantId });
      setGrants((current) => current.map((grant) => grant.id === grantId ? data.grant : grant));
      setMessage("Concessão revogada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível revogar a concessão.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    void callAdmin({ action: "me" }).then(() => setAuthorized(true)).catch(() => setAuthorized(false));
  }, []);

  if (authorized === null) return <main className="admin-page"><p className="auth-loading">Verificando acesso…</p></main>;
  if (!authorized) return <main className="admin-page"><section className="admin-content"><p className="form-error" role="alert">Acesso restrito a administradores.</p><a className="text-link" href="/account">Voltar para a conta</a></section></main>;
  return <main className="admin-page"><header className="account-header"><a className="brand" href="/"><img src="/signals-icon.png" alt="" width="27" height="27" /><span>SIGNALS / ADMIN</span></a><a className="account-signout" href="/account">Minha conta</a></header><section className="admin-content" aria-labelledby="admin-title"><p className="eyebrow">Access control</p><h1 id="admin-title">Concessões Pro</h1><p className="auth-description">Libere acesso temporário sem alterar trial ou assinatura.</p><form className="admin-search" onSubmit={searchUser}><label htmlFor="admin-email">Email do usuário</label><div className="admin-search-row"><input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="usuario@exemplo.com" /><button className="button button-primary" type="submit" disabled={busy}>Pesquisar <span aria-hidden="true">→</span></button></div></form>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}{user && <div className="admin-result"><div className="admin-user"><span className="account-card-label">Usuário</span><strong>{user.email}</strong><span className="admin-id">{user.id}</span></div><section className="admin-grant-form" aria-labelledby="grant-title"><span className="account-card-label" id="grant-title">Nova concessão</span><div className="admin-form-row"><label htmlFor="admin-duration">Duração</label><select id="admin-duration" value={duration} onChange={(event) => setDuration(event.target.value)}><option value="1">1 dia</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="365">365 dias</option></select><label htmlFor="admin-reason">Motivo (opcional)</label><input id="admin-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></div><button className="button button-primary" type="button" onClick={() => void grantAccess()} disabled={busy}>Conceder acesso <span aria-hidden="true">→</span></button></section><section className="admin-grants" aria-labelledby="grants-title"><span className="account-card-label" id="grants-title">Histórico</span>{grants.length === 0 ? <p className="auth-description">Nenhuma concessão registrada.</p> : grants.map((grant) => <div className="admin-grant-row" key={grant.id}><div><strong>{grant.revoked_at ? "Revogada" : "Pro temporário"}</strong><p>{formatDate(grant.starts_at)} → {formatDate(grant.ends_at)}</p>{grant.reason && <p>{grant.reason}</p>}</div>{!grant.revoked_at && <button className="account-signout" type="button" onClick={() => void revokeAccess(grant.id)} disabled={busy}>Revogar</button>}</div>)}</section></div>}</section></main>;
}
