# Agência de Franja — publicação e homologação

**Estado verificado em 11/11/2026:** o repositório `josemelokjik/agencia-de-franja` já existe no GitHub, mas está vazio. O GitHub Pages, o Worker e o D1 ainda não foram publicados. Não afirmar que os endereços de produção estão ativos.

## Publicação assistida no Windows (recomendada)

O pacote inclui dois scripts para reduzir a operação manual, sem armazenar tokens em arquivos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\01-configurar-cloudflare.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\02-publicar-github.ps1
```

Execute **na pasta raiz extraída**, na ordem indicada. O primeiro usa o login interativo do Wrangler, reutiliza o D1 existente ou cria um novo, aplica o schema, publica o Worker, solicita um segredo administrativo forte e grava somente a URL pública do Worker em `site/config.js`. O segundo verifica arquivos sensíveis, prepara o commit e envia para `josemelokjik/agencia-de-franja` utilizando as credenciais do Git no seu computador. **O repositório já existe e não precisa ser criado novamente.**

Após o envio, configure **Settings > Pages > Source: GitHub Actions**, confira o workflow e faça a homologação presencial do Android. Se algum script falhar, ele deve ser corrigido antes de continuar; não cole segredos em mensagens. Abaixo estão as instruções manuais alternativas.

## Dependências mínimas

- Conta GitHub `josemelokjik` autenticada, com permissão de criar repositórios públicos.
- Conta Cloudflare Workers Free, autenticação via navegador ou `wrangler login`.
- Node.js 22 ou superior e Git no Windows para os comandos abaixo.
- Android com RustDesk oficial e acesso físico para aceitar permissões e sessão.

## 1) GitHub (criação do repositório)

Abra <https://github.com/new> e crie um repositório **público** chamado `agencia-de-franja` na conta `josemelokjik`, sem README inicial. Você pode pedir ao assistente para enviar os arquivos pela integração GitHub depois que o repositório existir.

Alternativamente, no terminal, a partir da pasta raiz deste pacote extraído (uma pasta que contém `site/`, `worker/` e `.github/`):

```powershell
git init -b main
git add .
git commit -m "Publicar MVP Agência de Franja"
git remote add origin https://github.com/josemelokjik/agencia-de-franja.git
git push -u origin main
```

Se `git commit` reclamar de nome/e-mail, configure sua identidade no Git. Nunca inclua tokens, arquivos `.env` ou `worker/wrangler.toml` na publicação.

## 2) Cloudflare D1 e Worker

Abra um PowerShell dentro de `worker/` e execute:

```powershell
npm install
npx wrangler login
npx wrangler d1 create agencia-de-franja-sessoes
```

Copie o `database_id` retornado pela Cloudflare. Crie `worker/wrangler.toml` copiando `worker/wrangler.toml.example` e substitua a única ocorrência de `SUBSTITUIR-PELO-ID-DA-D1` pelo ID real. Mantenha `ALLOWED_ORIGIN = "https://josemelokjik.github.io"` (sem a parte `/agencia-de-franja`).

```powershell
npx wrangler d1 execute agencia-de-franja-sessoes --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

No `secret put`, informe uma senha aleatória de alto valor de entropia, preferencialmente 32 bytes aleatórios. Use gerenciador de senhas. Nunca salve ou divulgue o token no GitHub, chat ou URL.

Ao final, copie somente a URL pública do Worker retornada pelo `wrangler deploy`, sem nenhum segredo. Em caso de erro, o script consulta o D1 existente pelo nome para evitar bancos duplicados em novas tentativas. A execução dos scripts PowerShell ainda precisa ser validada no Windows.

## 3) Configurar portal e ativar GitHub Pages

Edite `site/config.js`:

```javascript
window.APP_CONFIG = Object.freeze({ apiBase: 'https://URL-REAL-DO-WORKER.workers.dev' });
```

Atualize esse arquivo no repositório. No GitHub, abra **Settings > Pages > Build and deployment > Source: GitHub Actions**. O workflow `.github/workflows/pages.yml` publica `site/`. Verifique na guia **Actions** que a execução terminou com sucesso.

A **URL prevista** após ativação é <https://josemelokjik.github.io/agencia-de-franja/>. Não confundir URL prevista com URL verificada online. O painel previsto é `/operador.html` na mesma URL.

## 4) Homologação: Windows em Wi-Fi, Android em 4G/5G

1. No Windows, instale o RustDesk oficial e abra o painel `operador.html`. Autentique-se com `ADMIN_TOKEN`; o token permanece somente na memória da página.
2. Gere um código temporário de atendimento. Envie o link fixo público e esse código ao Android sob seu controle.
3. No Android, instale e inicie o RustDesk oficial; em Compartilhar tela, habilite captura de tela e controle de entrada. Não autorize áudio nem transferência de arquivos.
4. Copie o ID no próprio aplicativo RustDesk. Abra o portal, cole o ID, informe o código e marque consentimento. Clique em Enviar.
5. Confirme no painel Windows que o ID apareceu. Cole o ID no cliente RustDesk Windows, solicite conexão e **aprove no Android**. Teste apenas interação consentida.
6. Interrompa a sessão no RustDesk e encerre a solicitação no painel.

**Limites:** a página não obtém automaticamente o ID interno do aplicativo; o usuário deve copiá-lo. O portal não instala apps nem concede permissões e não encerra automaticamente conexões RustDesk já abertas.

## 5) Verificações

```powershell
node --test worker/test/*.test.mjs
```

Depois de publicar, acesse `https://URL-REAL-DO-WORKER.workers.dev/v1/health` para verificar resposta `{"status":"ok"}`. Não envie credenciais nessa URL. No teste real, confira CORS, bloqueio de segunda solicitação e expiração.

## Segurança e privacidade

Não guarde ID RustDesk, senhas de conexão ou token de administrador no repositório. GitHub Pages é público. Realize o teste apenas nos seus aparelhos ou com autorização expressa e permaneça com o Android disponível para conceder permissões. Para uso público mais amplo, acrescentar rate limiting e defesa contra abuso.
