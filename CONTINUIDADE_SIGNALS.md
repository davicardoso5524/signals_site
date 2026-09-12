# Continuidade — Signals Site

Atualizado em 2026-09-12.

## Contexto confirmado

- O app desktop Signals está em `C:\Users\cardo\Desktop\projeto`.
- O site está em `C:\Users\cardo\Desktop\projeto_site`.
- O app atualmente usa React, TypeScript, Vite, Tauri e Supabase Auth/Database.
- O cadastro continuará existindo no site, mas será removido do aplicativo.
- O site terá cadastro, confirmação de email, recuperação de senha, pagamento,
  emissão de key, painel do usuário e dashboard administrativo.
- O pagamento confirmado deverá gerar uma key enviada por email.
- O usuário poderá ativar a key no site ou no aplicativo.
- Usuários antigos do app receberão licença vitalícia após a migração.

## Projetos Supabase

- Projeto antigo/origem do app: `kqipxobveawdbbntefyi`.
- Projeto definitivo/destino do site: `kgtosxbnvxhtipebnbuj`.
- O CLI do projeto_site está atualmente vinculado ao destino `kgtos...`.
- Não apagar o projeto antigo até a migração e os testes terminarem.
- Não enviar senhas, tokens ou service role keys para o chat.

## O que foi feito no projeto_site

- `npx supabase init` foi executado.
- `npx supabase login` e `npx supabase link` foram concluídos.
- A migration `supabase/migrations/202609120001_billing_foundation.sql` foi
  aplicada inicialmente no projeto do site e depois também, por engano, no
  projeto antigo. As tabelas extras no projeto antigo não devem ser removidas
  agora.
- A migration de billing contempla planos, trials, assinaturas, licenças,
  keys com hash, entrega de keys, ativações, dispositivos, eventos de
  pagamento, admins e auditoria.
- A migration `supabase/migrations/202609120002_align_signals_profiles.sql`
  foi aplicada no projeto destino para alinhar `profiles` ao app antigo.
- A tabela `profiles` do destino agora suporta `username`, `display_name` e
  `avatar_url`, com trigger/policies compatíveis com o Signals.
- O build do site passou com `npm run build`.
- Foi instalado `@supabase/supabase-js` no site.
- Foram criados no site:
  - `lib/supabase-browser.ts`
  - `app/auth/page.tsx`
  - `app/auth/callback/page.tsx`
  - `app/reset-password/page.tsx`
  - `app/account/page.tsx`
- A página inicial ganhou link para login.
- O site tem uma primeira interface de autenticação e painel de conta; o
  painel de keys/licenças ainda é placeholder.

## Arquivos de backend

- `supabase/README.md` documenta a fundação e o fluxo de keys.
- O site deve usar `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `service_role` nunca deve ir para frontend ou app.

## Usuários antigos

A migração entre projetos foi descartada: existem somente três usuários.
Eles serão recriados manualmente no projeto destino, com novas contas e novos
UUIDs. Depois, cada novo usuário receberá uma licença vitalícia.

Após criar as três contas e confirmar os emails, executar o SQL abaixo no
projeto destino:

```sql
insert into public.licenses (
  user_id, license_type, status, starts_at, expires_at, metadata
)
select
  id, 'lifetime', 'active', coalesce(created_at, now()), null,
  jsonb_build_object(
    'reason', 'manual_recreation_of_original_signals'
  )
from auth.users u
where not exists (
  select 1 from public.licenses l
  where l.user_id = u.id
    and l.license_type = 'lifetime'
    and l.status = 'active'
);
```

Se salas, amizades, mensagens e conversas antigas também precisarem ser
preservadas, as tabelas públicas do app deverão ser migradas separadamente.

## Próxima ordem de trabalho

1. Criar manualmente as três contas no projeto destino e conceder lifetime.
2. Configurar as variáveis `.env.local` do site com o projeto destino.
3. Testar cadastro, confirmação, login e recuperação no site.
4. Implementar `license-status`, `activate-key` e `start-trial` como Edge
   Functions.
5. Implementar painel de keys/licenças do usuário.
6. Escolher provedor de pagamento e implementar checkout/webhooks.
7. Implementar dashboard admin.
8. Adaptar o app Signals para login sem cadastro e ativação por key.

## Prompt do agente do app

Foi preparado no chat um prompt para o agente do Signals: remover cadastro,
manter login/recuperação, adicionar tela de ativação de key, consultar Edge
Functions, usar cache offline limitado a aproximadamente 72 horas e nunca
confiar em flags locais para liberar recursos.
