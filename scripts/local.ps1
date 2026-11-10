param(
  [ValidateSet('dev', 'check', 'build', 'preview', 'test', 'e2e')]
  [string]$Task = 'dev'
)
$ErrorActionPreference = 'Stop'
$env:ASTRO_TELEMETRY_DISABLED = '1'
$projectDir = Split-Path $PSScriptRoot -Parent
$runtime = Get-ChildItem -Path (Join-Path (Split-Path $projectDir -Parent) '.tools/node-v22.*-win-x64') -Directory -ErrorAction SilentlyContinue | Select-Object -Last 1
if ($runtime) { $env:PATH = $runtime.FullName + ';' + $env:PATH }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'Please install Node.js 22 (including npm) before running this script.'
}
# Placeholders match CI. They permit local guest flows, never real sign-in or
# cloud persistence. Existing .env/.env.local files take precedence.
if (-not (Test-Path (Join-Path $projectDir '.env')) -and -not (Test-Path (Join-Path $projectDir '.env.local'))) {
  if (-not $env:VITE_SUPABASE_URL -and -not $env:VITE_SUPABASE_ANON_KEY) {
    $env:VITE_SUPABASE_URL = 'https://placeholder.supabase.co'
    $env:VITE_SUPABASE_ANON_KEY = 'placeholder-anon-key-build-only'
    if (-not $env:PUBLIC_NOINDEX) { $env:PUBLIC_NOINDEX = 'true' }
  } elseif (-not $env:VITE_SUPABASE_URL -or -not $env:VITE_SUPABASE_ANON_KEY) {
    throw 'Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use a .env.local file.'
  }
}
if ($Task -eq 'e2e') {
  $env:PW_PORT = '4399'
  $env:PW_REUSE_SERVER = '0'
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Split-Path $projectDir -Parent) '.tools/browsers'
}
Push-Location $projectDir
try {
  if ($Task -eq 'e2e') {
    & npm.cmd run e2e -- --workers=3
  } else {
    & npm.cmd run $Task
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
