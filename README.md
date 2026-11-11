# Agência de Franja — Acesso Assistido Android (MVP 1.0)

Portal responsivo para conectar um Android a um operador Windows via RustDesk oficial, mediante autorização. **A aplicação web não executa o controle remoto:** apenas comunica o ID RustDesk do Android ao operador.

## Arquivos

- `site/index.html`: link único de entrada no Android.
- `site/operador.html`: painel simples do operador Windows.
- `site/config.js`: URL pública HTTPS do Worker (nunca inclua senhas!).
- `worker/src`: API Cloudflare Worker.
- `worker/schema.sql`: banco de dados D1.
- `worker/test`: testes automatizados.
- `.github/workflows/pages.yml`: implantação GitHub Pages pela pasta `site`.
- `ESPECIFICACAO.md`: arquitetura, contrato REST, limites, critérios de aceite.
- `PUBLICACAO.md`: sequência específica para publicar este repositório e fazer o primeiro teste.

## Publicação rápida no Windows

Veja `scripts/LEIA-PRIMEIRO.txt` para a configuração assistida com dois scripts PowerShell; o repositório GitHub já existe. O deploy na Cloudflare e a ativação do GitHub Pages ainda precisam ser realizados na sua conta.

## Antes de começar

- Conta GitHub gratuita para publicar um repositório **público** (não publicar outros dados no repositório).
- Conta Cloudflare no plano Workers Free; a utilização deve permanecer dentro das cotas do plano.
- Node.js instalado no computador para deploy com Wrangler.
- RustDesk oficial instalado no Windows e no Android; Android presente para conceder as permissões.

## 1. Criar banco D1 e Worker

No terminal, dentro de `worker/`:

```bash
npm install
npx wrangler login
npx wrangler d1 create agencia-de-franja-sessoes
```

Anote o `database_id` retornado, copie `wrangler.toml.example` para `wrangler.toml` e altere:

- `database_id`: ID real da base recém-criada;
- `ALLOWED_ORIGIN`: somente a origem GitHub Pages, `https://josemelokjik.github.io` (sem `/repositorio`).

Depois crie a tabela **no banco remoto**:

```bash
npx wrangler d1 execute agencia-de-franja-sessoes --remote --file=schema.sql
```

Gere uma chave aleatória forte no terminal local:

```bash
openssl rand -hex 32
```

**Não cole essa chave em chat, repositório ou captura de tela.** Configure como segredo do Worker:

```bash
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

No comando `secret put`, digite a chave gerada quando o terminal solicitar. Copie apenas o endereço HTTPS `https://...workers.dev` retornado no deploy (sem token).

## 2. Configurar a página

Edite `site/config.js` para usar o endereço HTTPS do Worker, sem barra ao final:

```js
window.APP_CONFIG = Object.freeze({ apiBase: 'https://SEU-WORKER.SEUSUBDOMINIO.workers.dev' });
```

Este arquivo é público e não deve conter segredos. **Não publique a página enquanto `apiBase` estiver vazio.**

## 3. Publicar no GitHub Pages

1. Crie um **repositório público dedicado**, `agencia-de-franja`, na conta `josemelokjik`.
2. Envie somente estes arquivos de código e documentação (nenhuma senha, arquivo `.env` ou `worker/wrangler.toml`).
3. Nas configurações do repositório, abra **Settings > Pages**.
4. Em **Build and deployment**, escolha **GitHub Actions**.
5. Execute/acompanhe o workflow `Publicar GitHub Pages` (ele publica o conteúdo de `site/`).
6. A página do Android ficará em `https://josemelokjik.github.io/agencia-de-franja/`.
7. O painel do operador ficará em `https://josemelokjik.github.io/agencia-de-franja/operador.html`.

**Atenção:** este projeto não foi publicado automaticamente. É necessário entrar nas respectivas contas e concluir os passos.

## 4. Primeiro teste entre redes diferentes

1. No computador Windows, instale o cliente oficial RustDesk e abra `operador.html`.
2. No painel, digite o segredo privado `ADMIN_TOKEN`, autentique-se e crie um atendimento.
3. Envie o **link fixo** e o **código temporário** para o próprio celular de teste. Coloque o Android em dados móveis e deixe o Windows em outra rede.
4. No Android, instale o RustDesk oficial e inicie **Compartilhar tela** com captura e controle de entrada autorizados.
5. Copie o ID do RustDesk, abra a página pública, digite o código, use o botão **Colar ID** (ou cole manualmente), marque o consentimento e envie.
6. O ID aparecerá automaticamente no painel Windows. Copie-o e use no aplicativo RustDesk.
7. **No celular**, aprove o pedido de conexão no RustDesk. Faça o teste com movimento de mouse/touch.
8. Encerre a conexão no RustDesk e clique em **Encerrar solicitação** no painel.

## 5. Testes de código

```bash
node --test worker/test/*.test.mjs
```

Esses testes simulam a persistência, mas não substituem o teste remoto real do Worker com D1 nem a homologação em Android/Windows.

## Questões importantes

**Integração do ID:** o navegador não lê sozinho o ID de outro aplicativo. A automação aqui é o *envio/recebimento* do ID depois da autorização e da ação de colar. O link não instala nem abre permissões silenciosamente.

**Somente controle remoto:** o portal não possui recursos de áudio ou arquivos. O RustDesk oficial os oferece separadamente; não habilite permissões de áudio ou arquivos no Android durante esses testes.

**Um atendimento:** um código de pareamento de 10 caracteres só pode receber um ID uma vez. O backend rejeita a criação de uma segunda sessão até a anterior ser encerrada/expirar.

**Segurança:** nunca peça senha do RustDesk pelo portal. Use aprovação manual de conexão no Android. Conexões já abertas no RustDesk não são encerradas automaticamente pelo botão do painel. Não execute testes com dados de terceiros sem autorização explícita.

**Custos:** GitHub Pages (repositório público, conta Free), Workers Free e D1 Free têm cotas e políticas próprias; manter o uso dentro das cotas não implica uma garantia perpétua de custo zero.


### Revisão de implantação (Agent Skills)

O script da Cloudflare agora consulta a lista D1 em JSON antes de criar um banco e reutiliza o existente. O script Git utiliza array de argumentos passado explicitamente ao wrapper. Os testes de API executados em Node.js não substituem o teste dos scripts no PowerShell Windows nem o teste real dos serviços em produção.
