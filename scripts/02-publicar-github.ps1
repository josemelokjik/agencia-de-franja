# Agencia de Franja - Publicar codigo no repositorio existente do GitHub
# Execute da raiz: powershell -ExecutionPolicy Bypass -File .\scripts\02-publicar-github.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git([string[]]$GitArgs) {
    # Um unico array e passado ao Git; nao expandir parametros nomeados PowerShell.
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "Git falhou: git $($GitArgs -join ' ')" }
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git nao encontrado. Instale Git for Windows antes de executar.'
}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path '.gitignore') -or -not (Test-Path 'site\config.js')) {
    throw 'Pacote incompleto: .gitignore ou site/config.js nao encontrado.'
}
$siteConfig = Get-Content -Raw 'site\config.js'
if ($siteConfig -notmatch 'https://[a-zA-Z0-9.-]+\.workers\.dev') {
    throw 'Configure o Worker primeiro. O site nao pode ser publicado sem API.'
}
if (-not (Test-Path '.git')) { Invoke-Git -GitArgs @('init','-b','main') }
Invoke-Git -GitArgs @('add','--all')
$staged = @(& git diff --cached --name-only)
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel verificar os arquivos preparados.' }
$forbidden = $staged | Where-Object {
    $_ -match '(^|/)(\.env(\.|$)|\.dev\.vars$|wrangler\.toml$|node_modules/|\.wrangler/)' -or
    $_ -match '\.(pem|key|p12)$'
}
if ($forbidden) {
    throw "Arquivo sensivel preparado para envio: $($forbidden -join ', '). Remova do staging."
}
$existingRemotes = @(& git remote)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao listar remotes.' }
if ($existingRemotes -notcontains 'origin') {
    Invoke-Git -GitArgs @('remote','add','origin','https://github.com/josemelokjik/agencia-de-franja.git')
}
$origin = (& git remote get-url origin).Trim()
if ($origin -notmatch '^https://github\.com/josemelokjik/agencia-de-franja(\.git)?$') {
    throw "Remoto inesperado: $origin. Confira antes de enviar."
}
Write-Host "`nArquivos preparados: $($staged.Count)" -ForegroundColor Cyan
if ($staged.Count -gt 0) {
    Invoke-Git -GitArgs @('commit','-m','Publicar MVP Agencia de Franja')
} else {
    Write-Host 'Nenhuma alteracao pendente.'
}
Write-Host 'O Git podera solicitar autenticacao no seu proprio computador.' -ForegroundColor Yellow
Invoke-Git -GitArgs @('push','-u','origin','HEAD:main')
Write-Host 'Envio concluido. Ative Settings > Pages > GitHub Actions no repositorio.' -ForegroundColor Green
Write-Host 'https://github.com/josemelokjik/agencia-de-franja'
