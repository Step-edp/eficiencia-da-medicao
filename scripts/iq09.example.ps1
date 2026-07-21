# Exemplo de script IQ09 (PowerShell).
# Configure no servidor:
# IQ09_SCRIPT_COMMAND=powershell -NoProfile -ExecutionPolicy Bypass -File "C:\caminho\iq09.ps1" -Month {month}

param(
  [Parameter(Mandatory = $false)]
  [string]$Month = $args[0]
)

if (-not $Month) {
  Write-Error "Informe o mês no formato AAAA-MM."
  exit 1
}

Write-Host "IQ09 executado para o mês $Month em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
exit 0
