# Signals — backend foundation

Esta pasta contém a primeira etapa do backend de contas, trials, licenças,
assinaturas e administração.

## Antes de aplicar

- Escolher o provedor de pagamento.
- Trocar os preços `0` dos planos iniciais.
- Criar o primeiro usuário no site e inseri-lo manualmente em `admin_users`.
- Configurar confirmação de email e URLs do site no Supabase Auth.

Os três usuários do app antigo serão recriados manualmente no projeto destino;
não haverá migração de `auth.users` entre projetos. Após a criação, conceder
uma licença `lifetime` para cada conta usando seus novos UUIDs.

## Fluxo de assinatura Pro

1. O checkout autenticado cria uma assinatura recorrente em `/preapproval`.
2. A assinatura começa com 7 dias de trial e passa a cobrar R$ 10 por mês.
3. O webhook consulta o `/preapproval/{id}`, valida `x-signature` e sincroniza
   `subscriptions` e `trials`.
4. O acesso é decidido pelo status confirmado no banco, nunca pelo retorno do
   navegador.

## Fluxo legado de keys pagas

1. O checkout confirmado pelo webhook cria uma key para o usuário comprador.
2. Uma Edge Function envia a key por email e marca `delivery_status = sent`.
3. O painel do site mostra a key mascarada, o plano, a data da compra, a
   validade e o estado de ativação.
4. O usuário pode ativar a key no site ou no app Signals.
5. A ativação cria uma licença e registra `license_key_redemptions`.

Por segurança, a tabela guarda somente o hash e o prefixo da key. O painel
não deve revelar a key completa depois da emissão; deve oferecer reenvio por
uma Edge Function autenticada. Se for obrigatório permitir recuperação da key
completa dentro do painel, ela deverá ser armazenada criptografada usando um
segredo disponível apenas no servidor.

## Regras importantes

- O cliente público nunca deve escrever diretamente em `licenses`, `trials`,
  `subscriptions`, `license_keys` ou `payment_events`.
- Essas operações serão feitas por Edge Functions com validação de sessão e,
  no caso de webhooks, validação da assinatura do provedor.
- A chave `service_role` deve ficar somente nas variáveis de ambiente das
  Edge Functions.

## Próxima etapa

Implementar as Edge Functions `start-trial`, `license-status`, `activate-key`,
`create-checkout`, `payment-webhook` e `resend-license-key`, depois conectar as
páginas de autenticação e o painel do site.
