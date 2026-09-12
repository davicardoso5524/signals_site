"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authRedirect, isSupabaseConfigured, supabase } from "../../lib/supabase-browser";

type Mode = "login" | "register" | "forgot";
type AuthStep = "form" | "awaiting_email_confirmation";

const pendingSignupEmailKey = "signals.pending_signup_email";
const pendingSignupResendKey = "signals.pending_signup_resend_at";

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
  const [authStep, setAuthStep] = useState<AuthStep>("form");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const pendingEmail = window.sessionStorage.getItem(pendingSignupEmailKey);
    if (pendingEmail) {
      const resendAt = Number(window.sessionStorage.getItem(pendingSignupResendKey) || 0);
      setEmail(pendingEmail);
      setMode("register");
      setAuthStep("awaiting_email_confirmation");
      setResendIn(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
      window.setTimeout(() => otpRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const goToAccount = () => {
    window.sessionStorage.removeItem(pendingSignupEmailKey);
    window.sessionStorage.removeItem(pendingSignupResendKey);
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") ? next : "/account");
  };

  const leaveConfirmation = () => {
    window.sessionStorage.removeItem(pendingSignupEmailKey);
    setAuthStep("form"); setOtp(""); setError(""); setMessage(""); setResendIn(0);
  };

  const verifySignup = async (token: string) => {
    if (!supabase || token.length !== 6 || busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "signup",
      });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("Verification did not create a session");
      setMessage("Email confirmado. Entrando no Signals…");
      goToAccount();
    } catch (verifyError) {
      const rawMessage = verifyError instanceof Error ? verifyError.message.toLowerCase() : "";
      if (rawMessage.includes("expired") || rawMessage.includes("invalid token") || rawMessage.includes("otp")) {
        setError("Código inválido ou expirado. Confira o email ou solicite um novo código.");
      } else if (rawMessage.includes("rate limit") || rawMessage.includes("too many")) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setError("Não foi possível confirmar o email agora. Tente novamente.");
      }
    } finally { setBusy(false); }
  };

  const resendSignup = async () => {
    if (!supabase || resendIn > 0 || busy || !email.trim()) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: authRedirect("/auth/callback") },
      });
      if (resendError) throw resendError;
      setOtp(""); setResendIn(45); window.sessionStorage.setItem(pendingSignupResendKey, String(Date.now() + 45000)); setMessage("Um novo código foi enviado para seu email.");
    } catch (resendError) {
      const rawMessage = resendError instanceof Error ? resendError.message.toLowerCase() : "";
      if (rawMessage.includes("already") || rawMessage.includes("confirmed")) {
        setError("Este email já foi confirmado. Tente entrar com sua senha.");
      } else if (rawMessage.includes("rate limit") || rawMessage.includes("too many")) {
        setError("Muitos reenvios. Aguarde um pouco antes de tentar novamente.");
      } else {
        setError("Não foi possível reenviar o código agora. Tente novamente.");
      }
    } finally { setBusy(false); }
  };

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
        if (data.user && data.user.identities?.length === 0) {
          throw new Error("already registered");
        }
        if (!data.session) {
          window.sessionStorage.setItem(pendingSignupEmailKey, email.trim());
          window.sessionStorage.setItem(pendingSignupResendKey, String(Date.now() + 45000));
          setAuthStep("awaiting_email_confirmation");
          setResendIn(45);
          setMessage("Enviamos um código de 6 dígitos para seu email.");
          window.setTimeout(() => otpRef.current?.focus(), 0);
        }
        if (data.session) {
          goToAccount();
        }
      }
    } catch (submitError) {
      setError(friendlyError(submitError instanceof Error ? submitError.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const title = authStep === "awaiting_email_confirmation" ? "Verifique seu email" : mode === "login" ? "Entrar no Signals" : mode === "register" ? "Criar sua conta" : "Recuperar senha";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="auth-back" href="/">← Voltar para o Signals</a>
        <p className="eyebrow">SIGNALS</p>
        <h1 id="auth-title">{title}</h1>
        {authStep === "awaiting_email_confirmation" ? <p className="auth-description">Enviamos um código para <strong>{email.replace(/(^.).*(@.*$)/, "$1•••$2")}</strong>. Digite-o para confirmar sua conta.</p> : mode === "forgot" && <p className="auth-description">Enviaremos um link seguro para redefinir sua senha.</p>}
        {!isSupabaseConfigured && <p className="form-error" role="alert">Configure as variáveis NEXT_PUBLIC_SUPABASE no ambiente do site.</p>}
        {authStep === "awaiting_email_confirmation" ? <form className="auth-form otp-form" onSubmit={(event) => { event.preventDefault(); void verifySignup(otp); }} noValidate>
          <label htmlFor="signup-otp">Código de confirmação</label>
          <input ref={otpRef} id="signup-otp" className="otp-input" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={otp} onChange={(event) => { const value = event.target.value.replace(/\D/g, "").slice(0, 6); setOtp(value); if (value.length === 6) void verifySignup(value); }} aria-describedby="otp-help" required />
          <p id="otp-help" className="auth-hint">O código tem 6 dígitos e expira em breve.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy || otp.length !== 6}>{busy ? "Aguarde…" : "Confirmar email"}</button>
          <button className="auth-resend" type="button" onClick={() => void resendSignup()} disabled={busy || resendIn > 0}>{resendIn > 0 ? `Reenviar em ${resendIn}s` : "Reenviar código"}</button>
        </form> : <form className="auth-form" onSubmit={submit} noValidate>
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
        </form>}
        <div className="auth-links">
          {authStep === "awaiting_email_confirmation" && <button type="button" onClick={leaveConfirmation}>← Trocar email</button>}
          {mode === "login" && <button type="button" onClick={() => setMode("forgot")}>Esqueci minha senha</button>}
          {mode === "forgot" && <button type="button" onClick={() => setMode("login")}>Voltar para login</button>}
          {authStep !== "awaiting_email_confirmation" && mode !== "register" && <button type="button" onClick={() => setMode("register")}>Criar uma conta</button>}
          {authStep !== "awaiting_email_confirmation" && mode === "register" && <button type="button" onClick={() => setMode("login")}>Já tenho uma conta</button>}
        </div>
      </section>
    </main>
  );
}
