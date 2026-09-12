"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  useEffect(() => {
    void supabase?.auth.getSession().finally(() => router.replace("/account"));
  }, [router]);
  return <main className="auth-page"><p className="auth-loading">Confirmando seu email…</p></main>;
}
