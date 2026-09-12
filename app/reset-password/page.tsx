"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    try {
      if (!supabase) throw new Error("Supabase unavailable");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Senha atualizada. Você já pode entrar no Signals.");
      setTimeout(() => router.push("/account"), 900);
    } catch { setError("Não foi possível atualizar a senha. Solicite um novo link."); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card" aria-labelledby="reset-title"><a className="auth-back" href="/">← Voltar para o Signals</a><p className="eyebrow">SIGNALS</p><h1 id="reset-title">Escolha uma nova senha</h1><form className="auth-form" onSubmit={submit}><label htmlFor="new-password">Nova senha</label><input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete="new-password" required />{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Aguarde…" : "Atualizar senha"}</button></form></section></main>;
}
