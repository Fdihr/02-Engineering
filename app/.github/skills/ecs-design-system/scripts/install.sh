#!/usr/bin/env bash
# Copies the ECS / CAPE design system into an existing React + Vite project.
#   ./install.sh <target>          existing project (keeps your App.tsx/main.tsx)
#   ./install.sh <target> --full   full starter (copies everything)
set -euo pipefail
TARGET="${1:?usage: install.sh <target> [--full]}"
TPL="$(cd "$(dirname "$0")/../template" && pwd)"

if [[ "${2:-}" == "--full" ]]; then
  mkdir -p "$TARGET" && cp -R "$TPL/." "$TARGET/"
  echo "Starter copied to $TARGET. Next: cd $TARGET && npm install && npm run dev"
  exit 0
fi

[[ -d "$TARGET/src" ]] || { echo "No src/ in $TARGET" >&2; exit 1; }
for i in index.css components/ui components/shell components/StateMark.tsx lib/utils.ts lib/theme.ts \
         lib/api.ts assets/vestas app.config.ts pages; do
  if [[ -d "$TPL/src/$i" ]]; then
    mkdir -p "$TARGET/src/$i" && cp -R "$TPL/src/$i/." "$TARGET/src/$i/"
  elif [[ "$i" == app.config.ts && -e "$TARGET/src/$i" ]]; then
    echo "skipped existing src/$i"; continue
  else
    mkdir -p "$(dirname "$TARGET/src/$i")" && cp "$TPL/src/$i" "$TARGET/src/$i"
  fi
  echo "copied src/$i"
done

(cd "$TARGET" && npm install lucide-react clsx tailwind-merge cmdk @tanstack/react-query react-router-dom \
  @radix-ui/react-alert-dialog @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover \
  @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-tooltip \
  && npm install -D tailwindcss @tailwindcss/vite)

cat <<'EOF'

Done. Remaining manual steps:
  1. vite.config.ts: add tailwindcss() plugin and alias '@' -> ./src (see template/vite.config.ts)
  2. tsconfig.json: "baseUrl": ".", "paths": { "@/*": ["src/*"] }
  3. index.html: copy the theme pre-paint <script> and <meta name="theme-color"> from template/index.html into <head>
  4. main.tsx: import "./index.css"; wrap in QueryClientProvider + ToastProvider + BrowserRouter (see template/src/main.tsx)
  5. Edit src/app.config.ts (product name, nav, admin sections, user); wrap pages in <AppShell>, admin pages in <AdminLayout title="...">
  6. src/pages/ holds example pages - copy the closest one, then delete the folder
EOF
