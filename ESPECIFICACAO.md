# Especificação técnica — Acesso Assistido Android / MVP 1.0

**Data da especificação:** 11/11/2026  
**Estado:** implementação local concluída; publicação e homologação em dispositivos reais pendentes.

## 1. Escopo

Um endereço público e reutilizável recebe solicitações de atendimento assistido em Android. Um único operador usa o Windows para emitir um código temporário, receber o ID do RustDesk do celular e iniciar a conexão exclusivamente pelo cliente Windows do RustDesk. Cada sessão exige consentimento explícito do usuário.

**Incluído**: página pública, painel do operador, transmissão autorizada de ID, código de 10 caracteres de uso único, expiração de 20 minutos, uma solicitação ativa por vez, botão de encerramento e testes automatizados.

**Excluído**: controle de tela pelo navegador, transferência de arquivos, áudio, coleta de senhas, acesso oculto, captura silenciosa, instalação automática de APK, desbloqueio de aparelho, VPN, servidor RustDesk próprio, aplicativo Android personalizado e leitura automática do ID interno do app RustDesk.

## 2. Componentes

- **GitHub Pages**: site estático público (`site/index.html`) e painel administrativo (`site/operador.html`). A página administrativa é acessível publicamente mas não permite ler/alterar sessões sem o token privado.
- **Cloudflare Worker Free**: API REST stateless, HTTPS, CORS restrito à origem configurada, autenticação Bearer exclusiva do operador.
- **Cloudflare D1 Free**: banco SQLite com um registro ativo por vez e substituição atômica somente quando o atendimento anterior estiver encerrado ou expirado.
- **RustDesk oficial**: controle e transmissão da tela diretamente entre clientes, fora da API web.

## 3. Fluxo

1. O operador abre `operador.html`, autentica usando o token privado e cria uma solicitação.
2. O Worker gera um código criptograficamente aleatório de **10 caracteres** (50 bits de entropia), armazena **somente seu SHA-256** e uma expiração de 20 minutos.
3. O operador envia **o link fixo** e o código ao dono do Android por canal combinado.
4. No celular, o usuário instala ou abre o RustDesk, ativa a captura de tela e o serviço de acessibilidade, e inicia o serviço. **Não deve habilitar áudio ou permissão de arquivos.**
5. O usuário copia seu ID no RustDesk, retorna ao portal, informa o código e usa "Colar ID" ou a inserção manual.
6. O usuário marca o consentimento e envia o ID. A API atualiza atomicamente o estado de `waiting` para `ready`. Envio duplicado é rejeitado.
7. O operador vê automaticamente o ID no painel (sondagem a cada 4 s) e o copia para o cliente RustDesk Windows.
8. A pessoa que está com o Android **aprova a solicitação de conexão no próprio RustDesk**; o painel nunca recebe a senha remota.
9. O operador encerra a conexão no RustDesk e, separadamente, encerra a solicitação no painel. O ID é apagado no banco ativo.

## 4. Limite funcional da automação

Um site GitHub Pages não pode consultar o ID privado de outro aplicativo Android nem acionar a API MediaProjection ou habilitar acessibilidade por conta própria. O RustDesk oficial não disponibiliza nesta arquitetura uma API pública gratuita para que o browser leia automaticamente o ID do dispositivo. Portanto, o MVP **automatiza a transmissão do ID após uma ação consciente de copiar/colar** — não a extração do ID.

Para uma futura coleta automática integral do ID seria necessária uma integração Android nativa explícita (cliente RustDesk personalizado, bridge autorizada ou integração formal disponibilizada pelo fabricante), exigindo desenvolvimento, manutenção e revisão de segurança adicionais. Não confundir API de gerenciamento paga do RustDesk Server Pro com API de leitura de ID em Android.

## 5. Contrato da API

As respostas são sempre JSON com `Cache-Control: no-store`, exceto preflight `OPTIONS` sem corpo. Falhas usam `{ "error": "mensagem" }`.

| Método | Endpoint | Permissão | Resposta | Efeito |
|---|---|---|---|---|
| GET | `/v1/health` | Pública | `{ "status": "ok" }` | Verifica API |
| POST | `/v1/session` | Operador Bearer | 201 `{ "session": {...}, "code":"XXXXX-XXXXX" }` ou 409 | Cria uma sessão; não é segura para retentativas indiscriminadas |
| GET | `/v1/session` | Operador Bearer | `{ "session": null \| {sessionId,state,rustdeskId,expiresAt,consentedAt} }` | Consulta estado e ID registrado |
| POST | `/v1/join` | Código de pareamento + consentimento | `{ "registered": true }` | Envia ID uma vez; `422` para dados inválidos, `404` para código errado/usado |
| POST | `/v1/session/close` | Operador Bearer | `{ "closed": true }` | Encerra solicitação e apaga ID armazenado |

**POST /v1/join**, corpo:

```json
{ "code":"ABCDE-FGHIJ", "rustdeskId":"123456789", "consent":true }
```

Campos extras são rejeitados (inclusive `password`). Nunca trafegar senha RustDesk nessa API.

## 6. Estados e invariantes

`idle -> waiting -> ready -> closed/expired -> idle`

- Apenas **uma solicitação em espera ou pronta** por vez, garantida pela PK `singleton = 1` no SQLite.
- Códigos de uso único: `ready` não admite novo `join`.
- O relógio de expiração começa na criação da solicitação; não altera a duração de uma eventual sessão RustDesk.
- O token de operador é segredo do Worker, nunca está no repositório. O portal não usa cookies nem `localStorage`.
- Encerra a solicitação **não encerra uma conexão RustDesk** já estabelecida: o usuário ou operador deve terminá-la no próprio aplicativo.

## 7. Requisitos não funcionais e limites

- HTTPS obrigatório em produção; a origem GitHub Pages autorizada é definida por `ALLOWED_ORIGIN`.
- Token operador de pelo menos 16 caracteres; recomendam-se 32 bytes aleatórios.
- Dados enviados: identificador RustDesk e hash de pareamento. Não são enviados arquivos, áudio ou senha.
- ID em banco por até 20 minutos, podendo permanecer até o próximo job de limpeza horário depois da expiração. O fechamento apaga o ID no registro ativo imediatamente. Serviços de hospedagem podem manter logs e backups além desse prazo; não se promete deleção forense total.
- O código secreto gerado é exibido **uma vez** no browser do operador. Se a página for recarregada, encerre a solicitação e gere outra.
- O controle remoto depende de versão do Android, fabricante, autorização de captura e acessibilidade. Em Android 14+ pode haver pedido de consentimento por sessão.
- Proteção básica: código com 50 bits, token operador, CORS, HTTPS e limites de entrada. Para uso público amplo: adicionar proteção contra abuso (Turnstile/rate limit), monitoramento e política de privacidade antes da produção.

## 8. Critérios de aceite

1. Uma nova sessão é gerada a partir do painel com código único.
2. Uma segunda tentativa simultânea recebe HTTP 409.
3. Código incorreto ou expirado não registra ID.
4. Sem checkbox de consentimento o ID não é aceito.
5. ID correto chega ao operador automaticamente após ser enviado pelo Android.
6. Credenciais e permissões RustDesk não são extraídas, concedidas ou contornadas pelo portal.
7. Sessão fechada remove ID de consulta e habilita novo atendimento.
8. Operador controla apenas após aprovação no Android.
9. GitHub Pages e Worker são implantados sem segredos no repositório.

## 9. Status dos testes

Testes unitários/funcionais do controlador HTTP: `worker/test/api.test.mjs` usando `node --test` (sem serviços de rede). O comportamento real de Workers + D1 e do RustDesk exige homologação após publicação e em aparelhos reais.
