# Agência de Franja — Painel de relatórios Android (MVP)

Este módulo acrescenta ao portal uma central de **resumos autorizados de uso de aplicativos**.
O APK Android atual permanece local, sem permissão de INTERNET: o sistema **não coleta ou transmite automaticamente** dados dos aparelhos.

## Funcionalidades

- Autenticação administrativa com `ADMIN_TOKEN` já configurado no Worker.
- Importação manual do JSON produzido pelo aplicativo Android, com pré-visualização no navegador.
- Conversão **no navegador** dos eventos brutos em contagens por dia (UTC) e por pacote selecionado.
- Armazenamento remoto em D1 **somente** de identificador genérico, dia, pacote, total de aberturas e data de importação.
- Filtro e exclusão dos resumos de um dispositivo, com retenção de 30 dias.
- Nenhuma captura de tela, áudio, mensagens, geolocalização, comando remoto, leitura contínua ou envio automático pelo APK.

## Antes de publicar

1. Faça backup da base D1 e execute a migração aditiva **primeiro em ambiente de homologação**:

   ```bash
   cd worker
   npx wrangler d1 execute <NOME-DA-BASE-DE-TESTE> --remote --file=schema-monitor.sql
   ```

2. Execute testes de API e interface de dados:

   ```bash
   node --test worker/test/*.test.mjs tests/*.test.mjs
   ```

3. Após aprovação, migre a base D1 de produção com o mesmo SQL e publique o Worker com Wrangler.
4. Publique a pasta `site/` no GitHub Pages usando o workflow existente após revisar/mesclar a PR.
5. Abra `/agencia-de-franja/monitor.html`, informe o token privado e importe o JSON exportado do celular de teste.

**Nunca** coloque o `ADMIN_TOKEN` no GitHub ou em `config.js`.

## Fluxo de dados

Android exporta JSON local → operador seleciona arquivo no navegador → `monitor-model.mjs` reduz a contagens diárias → operador confirma upload → `POST /v1/monitor/reports` → D1 → `GET /v1/monitor/reports` no painel autenticado.

## Contrato REST

- `GET /v1/monitor/reports`: retorna `{rows, retentionDays, mode}` somente com `Authorization: Bearer <ADMIN_TOKEN>`.
- `POST /v1/monitor/reports`: recebe `{alias:"dispositivo-01", generatedAt:"...", summaries:[{day:"2026-11-10",package:"br.com.empresa.app",opens:2}]}`. Não aceita eventos individuais ou dados brutos.
- `DELETE /v1/monitor/reports/dispositivo-01`: remove todos os resumos associados ao identificador.

A tabela `monitor_daily` tem chave `(alias,day,package_name)` para importações idempotentes. Dados com mais de 30 dias são removidos pelo disparo cron do Worker. A consulta também filtra datas antigas.

## Limites e transparência

- Acesso às estatísticas de uso é concedido pelo usuário nas configurações do Android.
- O relatório remoto representa **somente arquivos que o operador importou**; não é monitoramento em tempo real.
- Não há transmissão automática a partir de celulares nem coleta de mensagens, conteúdo de tela ou atividade interna de aplicativos.
- Use identificadores genéricos sem nomes, telefones ou e-mails.
- O controlador deve verificar a base legal, informar os usuários, documentar a finalidade e restringir a retenção antes de qualquer uso com dados de clientes.


## Migração D1 auditável

O SQL de `worker/schema-monitor.sql` é **aditivo e idempotente**. A tabela `active_session` não é alterada.

Foi acrescentado um teste SQLite que aplica a migração duas vezes, preserva uma sessão RustDesk e verifica chave composta, índice e limites. O rollback por exclusão da tabela nova é ensaiado **somente em banco descartável**.

Para executar em D1, tenha uma sessão autenticada Cloudflare e o Wrangler instalado com `cd worker && npm ci && npx wrangler login`. Primeiro rode em banco de homologação, que já deve existir, com:

```powershell
powershell -File ./scripts/03-migrar-monitor-d1.ps1 -DatabaseName NOME_DO_D1_TESTE
powershell -File ./scripts/03-migrar-monitor-d1.ps1 -DatabaseName NOME_DO_D1_TESTE -Apply
```

Após homologação, repita em produção com `-DatabaseName agencia-de-franja-sessoes`. O script não cria banco; exige correspondência exata em `d1 list`, confere ponto Time Travel, consulta sessões antes e depois e **só altera algo com `-Apply`**.

**Importante:** restaurar o D1 a um momento anterior desfaz todas as gravações posteriores, inclusive atendimentos. Nunca executar restauração automaticamente. Por ser aditiva, uma reversão do Worker pode ocorrer mantendo `monitor_daily` sem prejuízo ao sistema anterior. Excluir a tabela nova requer operação separada e autorização específica.

O projeto não possui credenciais Cloudflare no GitHub. Publicar a PR ou executar testes no GitHub não executa automaticamente a migração remota.
