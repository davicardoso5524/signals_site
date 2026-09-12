"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

export default function CheckoutPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function beginCheckout() {
      if (!supabase) {
        setError("O pagamento ainda não está configurado neste ambiente.");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth?next=/checkout");
        return;
      }
      const { data, error: checkoutError } = await supabase.functions.invoke("create-checkout", { body: { plan: "pro_monthly" } });
      if (cancelled) return;
      if (checkoutError || !data?.init_point) {
        setError("Não foi possível abrir o pagamento. Tente novamente em alguns instantes.");
        return;
      }
      window.location.assign(data.init_point);
    }
    void beginCheckout();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="checkout-page">
      <section className="checkout-state" aria-live="polite" aria-labelledby="checkout-title">
        <p className="eyebrow">SIGNALS / PRO</p>
        <h1 id="checkout-title">Abrindo pagamento</h1>
        {error ? <><p className="form-error" role="alert">{error}</p><a className="text-link" href="/account">Voltar para a conta <span aria-hidden="true">↗</span></a></> : <p className="auth-description">Você será encaminhado com segurança para o Mercado Pago.</p>}
      </section>
    </main>
  );
}
