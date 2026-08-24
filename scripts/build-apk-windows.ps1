$ErrorActionPreference = "Stop"

Write-Host "Cricket Scorer - Standalone APK Build" -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed or is not available in PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not installed or is not available in PATH."
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing project dependencies..."
  npm install
}

if (-not (Get-Command eas -ErrorAction SilentlyContinue)) {
  Write-Host "Installing EAS CLI..."
  npm install --global eas-cli
}

Write-Host ""
Write-Host "If this is your first EAS build, you may be asked to sign in to Expo." -ForegroundColor Yellow
Write-Host "The generated APK is standalone and does not require Expo Go." -ForegroundColor Yellow
Write-Host ""

eas build -p android --profile apk
