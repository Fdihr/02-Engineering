<#
.SYNOPSIS
  Copies the ECS / CAPE design system into an existing React + Vite project.
.EXAMPLE
  ./install.ps1 -Target C:\src\my-app            # existing project (keeps your App.tsx/main.tsx)
  ./install.ps1 -Target C:\src\new-app -Full     # full starter (copies everything)
#>
param(
  [Parameter(Mandatory)] [string]$Target,
  [switch]$Full,
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$tpl = Join-Path $PSScriptRoot "..\template" | Resolve-Path

if ($Full) {
  New-Item -ItemType Directory -Force $Target | Out-Null
  Copy-Item "$tpl\*" $Target -Recurse -Force:$Force
  Write-Host "Starter copied to $Target. Next: cd $Target; npm install; npm run dev"
  return
}

$src = Join-Path $Target "src"
if (-not (Test-Path $src)) { throw "No src/ folder in $Target" }

$items = @(
  "index.css",
  "components\ui",
  "components\shell",
  "components\StateMark.tsx",
  "lib\utils.ts",
  "lib\theme.ts",
  "lib\api.ts",
  "assets\vestas",
  "app.config.ts",
  "pages"
)
foreach ($i in $items) {
  $from = Join-Path "$tpl\src" $i
  $to = Join-Path $src $i
  if ((Test-Path $to) -and -not $Force -and -not (Test-Path $from -PathType Container)) {
    Write-Warning "Skipped existing $i (use -Force to overwrite)"; continue
  }
  if (Test-Path $from -PathType Container) {
    New-Item -ItemType Directory -Force $to | Out-Null
    Copy-Item "$from\*" $to -Recurse -Force
  } else {
    New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null
    Copy-Item $from $to -Force
  }
  Write-Host "copied src\$i"
}

Push-Location $Target
try {
  npm install lucide-react clsx tailwind-merge cmdk @tanstack/react-query react-router-dom @radix-ui/react-alert-dialog @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-tooltip
  npm install -D tailwindcss @tailwindcss/vite
} finally { Pop-Location }

Write-Host @"

Done. Remaining manual steps:
  1. vite.config.ts: add tailwindcss() plugin and alias '@' -> ./src (see template/vite.config.ts)
  2. tsconfig.json: "baseUrl": ".", "paths": { "@/*": ["src/*"] }
  3. index.html: copy the theme pre-paint <script> and <meta name="theme-color"> from template/index.html into <head>
  4. main.tsx: import "./index.css"; wrap in QueryClientProvider + ToastProvider + BrowserRouter (see template/src/main.tsx)
  5. Edit src/app.config.ts (product name, nav, admin sections, user); wrap pages in <AppShell>, admin pages in <AdminLayout title="...">
  6. src/pages/ holds example pages - copy the closest one, then delete the folder
"@

