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
