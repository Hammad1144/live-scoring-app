$ErrorActionPreference = "Stop"

Write-Host "Local Cricket Scorer - React Native / Expo" -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed or is not in PATH." -ForegroundColor Red
  Write-Host "Install Node.js LTS, reopen PowerShell, then run this script again."
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm is not available. Reinstall Node.js LTS." -ForegroundColor Red
  exit 1
}

Write-Host "Node: $(node --version)"
Write-Host "npm:  $(npm --version)"

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
}

Write-Host "Starting Expo..." -ForegroundColor Green
Write-Host "Install Expo Go on your phone and scan the QR code." -ForegroundColor Cyan
npx expo start
