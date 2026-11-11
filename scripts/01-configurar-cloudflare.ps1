# Agencia de Franja - Instalar Worker + D1, reutilizando o banco existente.
# Execute da raiz: powershell -ExecutionPolicy Bypass -File .\scripts\01-configurar-cloudflare.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked([string]$Step, [scriptblock]$Action) {
    Write-Host "`n== $Step ==" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "Falha na etapa: $Step (codigo $LASTEXITCODE)" }
}

function Get-ExistingD1Id([string]$Name) {
    # Usamos JSON documentado, em vez de extrair um TOML da saida de 'd1 create',
    # que varia entre versoes do Wrangler.
    $jsonLines = & npx wrangler d1 list --json 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw 'Nao foi possivel listar D1 na Cloudflare. Verifique login e permissao de acesso.' }
    $jsonText = ($jsonLines | Out-String).Trim()
    try { $parsed = ConvertFrom-Json -InputObject $jsonText }
    catch { throw 'Saida JSON inesperada do Wrangler D1 list. Interrompendo para evitar criacao duplicada.' }
    $dbs = @($parsed)
    if ($parsed -and $parsed.PSObject.Properties.Name -contains 'result') { $dbs = @($parsed.result) }
    $matchingDbs = @($dbs | Where-Object { $_.name -eq $Name })
    if ($matchingDbs.Count -gt 1) { throw "Mais de um D1 chamado $Name encontrado; resolva antes de continuar." }
    if ($matchingDbs.Count -eq 0) { return '' }
    $item = $matchingDbs[0]
    $id = ''
    foreach ($key in @('uuid','database_id','id')) {
        if ($item.PSObject.Properties.Name -contains $key) {
            $id = [string]$item.$key
            if ($id) { break }
        }
    }
    if ($id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') {
        throw "D1 $Name encontrado, mas o identificador nao e um UUID valido. Abortando."
    }
    return $id
}

$root = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $root 'worker'
$config = Join-Path $worker 'wrangler.toml'
$example = Join-Path $worker 'wrangler.toml.example'
$siteConfig = Join-Path $root 'site\config.js'
$databaseName = 'agencia-de-franja-sessoes'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm nao encontrados. Instale Node.js LTS antes de executar.'
}
if (-not (Test-Path $example)) { throw 'Arquivo worker/wrangler.toml.example ausente.' }
Set-Location $worker

Invoke-Checked 'Instalar dependencias do Worker' { npm install }
Write-Host "`nAutentique-se na Cloudflare no navegador, se solicitado." -ForegroundColor Yellow
Invoke-Checked 'Login Cloudflare' { npx wrangler login }

$databaseId = ''
if (Test-Path $config) {
    $existingText = Get-Content -Raw -Path $config
    if ($existingText -match 'database_id\s*=\s*"([0-9a-fA-F-]{36})"') {
        $databaseId = $Matches[1]
    } else {
        throw 'wrangler.toml existente sem database_id valido. Corrija antes de repetir.'
    }
} else {
    $databaseId = Get-ExistingD1Id $databaseName
    if (-not $databaseId) {
        Invoke-Checked 'Criar banco D1' { npx wrangler d1 create $databaseName }
        # Se create funcionou e a execucao caiu depois, o proximo run recupera por nome.
        $databaseId = Get-ExistingD1Id $databaseName
        if (-not $databaseId) { throw 'Banco criado, mas nao localizado em d1 list. Nao tente criar outro banco.' }
    } else {
        Write-Host "D1 existente localizado: $databaseName. Reutilizando o banco." -ForegroundColor Green
    }
    $toml = (Get-Content -Raw -Path $example).Replace('SUBSTITUIR-PELO-ID-DA-D1', $databaseId)
    [System.IO.File]::WriteAllText($config, $toml, [System.Text.UTF8Encoding]::new($false))
}

Invoke-Checked 'Aplicar esquema no D1 remoto' { npx wrangler d1 execute $databaseName --remote --file=schema.sql }
Write-Host "`n== Publicar Worker ==" -ForegroundColor Cyan
$deploy = & npx wrangler deploy 2>&1
$deployExit = $LASTEXITCODE
$deploy | ForEach-Object { Write-Host $_ }
if ($deployExit -ne 0) { throw 'Falha no deploy. Confira a configuracao workers.dev na Cloudflare.' }

Write-Host "`nDefina um token ADMIN_TOKEN aleatorio forte (minimo 32 caracteres)." -ForegroundColor Yellow
Write-Host 'O segredo sera solicitado pelo Wrangler; NUNCA salve no repositorio ou envie no chat.'
Invoke-Checked 'Configurar segredo privado' { npx wrangler secret put ADMIN_TOKEN }

$deployText = ($deploy | Out-String)
$apiUrl = ''
if ($deployText -match 'https://[a-zA-Z0-9.-]+\.workers\.dev') {
    $apiUrl = $Matches[0].TrimEnd('/')
}
if (-not $apiUrl) {
    $apiUrl = (Read-Host 'Informe a URL HTTPS publica do Worker (https://xxx.workers.dev)').Trim().TrimEnd('/')
}
if ($apiUrl -notmatch '^https://[a-zA-Z0-9.-]+\.workers\.dev$') {
    throw 'URL invalida. Configure site/config.js manualmente apos verificar a URL do Worker.'
}
$js = "window.APP_CONFIG = Object.freeze({ apiBase: '$apiUrl' });`n"
[System.IO.File]::WriteAllText($siteConfig, $js, [System.Text.UTF8Encoding]::new($false))
Write-Host "`nWorker configurado: $apiUrl" -ForegroundColor Green
Write-Host 'Proximo comando: powershell -ExecutionPolicy Bypass -File .\scripts\02-publicar-github.ps1' -ForegroundColor Green
