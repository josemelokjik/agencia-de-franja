# Migracao aditiva do painel. Nao cria bancos nem altera o RustDesk.
# Requer npm ci no diretorio worker e login previo: npx wrangler login
# Simular: powershell -File ./scripts/03-migrar-monitor-d1.ps1 -DatabaseName agencia-de-franja-sessoes
# Aplicar: powershell -File ./scripts/03-migrar-monitor-d1.ps1 -DatabaseName agencia-de-franja-sessoes -Apply
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{1,100}$')]
  [string]$DatabaseName,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$worker = Join-Path (Split-Path -Parent $PSScriptRoot) 'worker'
Set-Location $worker
if (-not (Test-Path 'node_modules/.bin/wrangler')) {
  throw 'Wrangler ausente. Execute npm ci dentro de worker/ antes da migracao.'
}
$listed = & npx --no-install wrangler d1 list --json
if ($LASTEXITCODE -ne 0) { throw 'Falha ao verificar os bancos D1 da conta autenticada.' }
try {
  $dbs = ConvertFrom-Json -InputObject ($listed | Out-String)
} catch { throw 'Lista D1 nao retornou JSON valido; abortando.' }
if ($dbs.PSObject.Properties.Name -contains 'result') { $dbs = $dbs.result }
$matches = @($dbs | Where-Object { $_.name -eq $DatabaseName })
if ($matches.Count -ne 1) { throw 'Banco nao encontrado de forma unica na conta Cloudflare autenticada.' }
Write-Host "Banco remoto confirmado: $DatabaseName"
Write-Host 'Conferindo ponto de recuperacao Time Travel...'
& npx --no-install wrangler d1 time-travel info $DatabaseName
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel confirmar ponto de recuperacao. Abortando.' }
Write-Host 'Sessao antiga (leitura):'
& npx --no-install wrangler d1 execute $DatabaseName --remote --command 'SELECT COUNT(*) AS sessions FROM active_session'
if ($LASTEXITCODE -ne 0) { throw 'Tabela de sessoes nao encontrada; interrompendo para revisao.' }
if (-not $Apply) {
  Write-Host 'Preflight concluido: nenhuma alteracao foi aplicada. Use -Apply para migrar.'
  exit 0
}
Write-Host 'Aplicando apenas schema-monitor.sql (aditivo)...'
& npx --no-install wrangler d1 execute $DatabaseName --remote --file=schema-monitor.sql
if ($LASTEXITCODE -ne 0) { throw 'Falha na migracao; verificar Cloudflare D1 antes de prosseguir.' }
Write-Host 'Verificando nova tabela e sessao existente...'
& npx --no-install wrangler d1 execute $DatabaseName --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_daily'"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao verificar monitor_daily.' }
& npx --no-install wrangler d1 execute $DatabaseName --remote --command 'SELECT COUNT(*) AS sessions FROM active_session'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao verificar sessoes existentes.' }
Write-Host 'Migração SQL enviada. Confira os resultados antes de publicar o Worker.'
