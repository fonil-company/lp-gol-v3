# GOL Distribuidora

Landing page em React com Vite e servidor Node.js para receber cadastros.

## Executar

Use Node.js 22 ou 24. Instale as dependências com `npm ci`, gere a página com
`npm run build` e inicie o servidor com `npm start`.

Copie `.env.example` para `.env` e preencha `SUPABASE_WEBHOOK_URL` e
`CRM_WEBHOOK_URL` com as URLs completas dos webhooks. O servidor carrega o
arquivo `.env` local automaticamente. Não publique esse arquivo.

## Hospedagem

O arquivo `nixpacks.toml` configura a instalação, compilação e inicialização.
Configure `SUPABASE_WEBHOOK_URL` e `CRM_WEBHOOK_URL` nas variáveis de ambiente
da hospedagem. Ambas são necessárias para enviar os cadastros.
`PORT` é opcional e usa `3000` por padrão.

O formulário usa `POST /api/leads`; a hospedagem precisa executar o servidor
Node.js, além de servir os arquivos da página.

## Pixel e atribuição

O Pixel existente é `2155316585266232`, inicializado em `index.html`, com um
`PageView` por abertura. `Lead` só entra na fila do Pixel após HTTP positivo
e JSON `{ "ok": true }` da API. O sucesso continua exigindo HTTP positivo dos
dois destinos: Supabase e CRM Fonil. Erros ou bloqueio do Pixel não desfazem
um cadastro confirmado. O checkbox continua sendo de contato comercial.

A atribuição usa a última entrada com algum parâmetro de campanha não vazio
na sessão da aba, na chave `gol-v3:attribution:v1` do `sessionStorage`.
Uma nova campanha substitui todos os campos; navegações sem campanha ou com
parâmetros vazios preservam o registro anterior. Sem histórico, acesso direto
envia campos vazios. Se o armazenamento estiver bloqueado, a atribuição
permanece somente em memória até sair ou recarregar a página.

São enviados `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
`utm_term`, `utm_id`, `fbclid` e `gclid`, sem uma segunda decodificação.
`entry_url` e `entry_referrer` descrevem a entrada atribuída; `referrer`
repete `entry_referrer` para compatibilidade. `page_url` é a URL do formulário
na tentativa original, e `submitted_at` é o instante UTC dessa tentativa.
`_fbc` e `_fbp` são lidos dos cookies existentes, quando disponíveis.
Nenhum dado de contato é salvo no armazenamento de atribuição.

## Contratos e reenvios

Supabase recebe o payload completo. O adaptador do CRM mantém `name`, `phone`
e `document` (telefone/documento somente com dígitos) e adiciona os campos de
atribuição acima, `event_id` e `event_name: "Lead"` no primeiro nível do JSON.
Esse mapeamento garante o envio pelo adaptador; o schema de persistência de
atribuição do CRM não consta neste projeto e precisa ser confirmado no receptor.
Não há evidência aqui de CAPI ativa: enviar esses dados ao Supabase não comprova
que o receptor os encaminha à Meta.

Cada conjunto de dados do formulário mantém uma tentativa em memória enquanto
a página estiver aberta. Reenvios compartilham payload, horário e `event_id`;
chamadas simultâneas compartilham a promessa, e repetir após sucesso não gera
outra solicitação nem outro `Lead`. Alterar o contato cria uma tentativa nova.
Recarregar a página encerra esse controle de tentativas no navegador.

A API usa `event_name: "Lead"` (também assume esse valor quando ausente em
versões anteriores da página) e exige um `event_id` de 1 a 128 caracteres
alfanuméricos, hífen ou sublinhado. Mesmo ID com outro payload retorna 409.
O servidor registra hash e confirmações por destino por até 24 horas, com
limite de 5.000 IDs por processo; a limpeza ocorre na próxima solicitação.
Ao atingir o limite, novos IDs recebem 503 até liberar entradas expiradas.
Reenvios repetem somente destinos que ainda não confirmaram. Os receptores
precisam deduplicar por `event_id` de forma durável para cobrir reinícios,
múltiplas réplicas e timeouts de resultado incerto (limite de 10 segundos).

## Desenvolvimento e verificação

Para desenvolver, execute `npm start` para a API na porta 3000 e, em outro
terminal, `npm run dev`. O Vite encaminha `/api` para `127.0.0.1:3000`;
esse proxy também está configurado em `npm run preview`, mas não inicia a API.
Se alterar a porta da API, ajuste o destino do proxy em `vite.config.js`.
Um POST com `{}` em `/api/leads` deve retornar 422 sem chamar os webhooks.

Execute `npm test` para os testes de atribuição, conversão e idempotência.
Instale o navegador de testes com `npx playwright install chromium` e execute
`npm run test:e2e` para compilar e testar o formulário no Chromium. Os testes
iniciam API e receptores locais em portas temporárias, substituem as URLs de
webhook e bloqueiam tráfego externo do navegador, incluindo o Pixel.

Os testes verificam o JSON efetivamente recebido pelos receptores locais e a
fila do Pixel. Recebimento no Gerenciador de Eventos e persistência no CRM
real dependem de verificação externa. A documentação oficial de
[conversões do Pixel](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking/)
retornou HTTP 429 durante esta alteração; foi preservada a chamada existente
`fbq('track', 'Lead', {}, { eventID })`, sem alterar o protocolo.
