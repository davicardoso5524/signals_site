"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authRedirect, isSupabaseConfigured, supabase } from "../../lib/supabase-browser";

type Mode = "login" | "register" | "forgot";

function friendlyError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login") || value.includes("invalid credentials")) return "Email ou senha incorretos.";
  if (value.includes("already registered")) return "Este email já está cadastrado. Faça login.";
  if (value.includes("username") || value.includes("duplicate") || value.includes("unique")) return "Esse nome de usuário já está em uso.";
  if (value.includes("rate limit") || value.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  return "Não foi possível concluir. Confira os dados e tente novamente.";
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) {
      setError("O Supabase ainda não foi configurado neste ambiente.");
      return;
    }
    const normalizedUsername = username.trim().toLowerCase().replace(/^@/, "");
    if (mode === "register" && (!name.trim() || !/^[a-z0-9._]{3,20}$/.test(normalizedUsername))) {
      setError("Informe um nome e um username com 3–20 caracteres minúsculos, números, pontos ou underscores.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirect("/reset-password"),
        });
        if (resetError) throw resetError;
        setMessage("Se esse email estiver cadastrado, enviaremos um link de recuperação.");
      } else if (mode === "login") {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (loginError) throw loginError;
        const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
        router.push(next?.startsWith("/") ? next : "/account");
      } else {
        const { data, error: registerError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim(), username: normalizedUsername },
            emailRedirectTo: authRedirect("/auth/callback"),
          },
        });
        if (registerError) throw registerError;
        setMessage(data.session ? "Conta criada. Você já pode acessar o painel." : "Conta criada. Confirme seu email para continuar.");
        if (data.session) {
          const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
          router.push(next?.startsWith("/") ? next : "/account");
        }
      }
    } catch (submitError) {
      setError(friendlyError(submitError instanceof Error ? submitError.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Entrar no Signals" : mode === "register" ? "Criar sua conta" : "Recuperar senha";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="auth-back" href="/">← Voltar para o Signals</a>
        <p className="eyebrow">SIGNALS</p>
        <h1 id="auth-title">{title}</h1>
        {mode === "forgot" && <p className="auth-description">Enviaremos um link seguro para redefinir sua senha.</p>}
        {!isSupabaseConfigured && <p className="form-error" role="alert">Configure as variáveis NEXT_PUBLIC_SUPABASE no ambiente do site.</p>}
        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === "register" && <>
            <label htmlFor="name">Nome</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            <label htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._@]/g, ""))} autoComplete="username" required />
          </>}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          {mode !== "forgot" && <>
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required />
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Enviar link"}</button>
        </form>
        <div className="auth-links">
          {mode === "login" && <button type="button" onClick={() => setMode("forgot")}>Esqueci minha senha</button>}
          {mode === "forgot" && <button type="button" onClick={() => setMode("login")}>Voltar para login</button>}
          {mode !== "register" && <button type="button" onClick={() => setMode("register")}>Criar uma conta</button>}
          {mode === "register" && <button type="button" onClick={() => setMode("login")}>Já tenho uma conta</button>}
        </div>
      </section>
    </main>
  );
}
