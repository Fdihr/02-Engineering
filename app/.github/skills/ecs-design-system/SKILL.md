---
name: ecs-design-system
description: >-
  Make a web application look 1:1 like the ECS Security Principles / CAPE app (Vestas "weather
  window" design): Vestas Sans typography, Night Sky top bar, Blue Sky accent, light/dark theme,
  rules-not-boxes layout, buttons, inputs, tabs, segmented filters, tables, dialogs, sheets, menus,
  toasts, command palette (Ctrl K), status marks, account menu, notifications, login page and the
  administration area (section nav, settings, usage, history). Use when a user asks to style,
  theme, restyle or build a frontend, dashboard, admin panel or settings page "like ECS", "like
  CAPE", "like the security principles app", "in the Vestas design", or wants one consistent
  design across team apps.
license: Proprietary. Vestas internal use only (includes the licensed Vestas Sans font).
---

# ECS / CAPE design system

A copy-paste design system extracted from the **ECS Security Principles** app as redesigned on the
`gufbi-ai-dev` branch (CAPE). The `template/` folder is a complete, type-checked Vite + React 18 +
TypeScript + Tailwind v4 starter that renders exactly like the source app.
**Always reuse it. Never re-invent styles.**

All paths below (`template/`, `scripts/`, `references/`) are relative to **this skill's base
directory**. Copy files from there into the user's project; never edit the skill itself.

The design authority is `references/design-principles.md` (the `DESIGN.md` the redesign was built
from). Read it before designing anything the template does not already show.

## Workflow

1. **Detect the target stack.**
   - React + Tailwind v4 → steps 2–6 (gives the 1:1 result).
   - React without Tailwind, or Tailwind v3 → install Tailwind v4 (`tailwindcss @tailwindcss/vite`)
     first; v3 cannot read the `@theme inline` block.
   - Anything else (Blazor, Angular, Vue, server HTML, Streamlit…) → [Non-React fallback](#non-react-fallback).
2. **Copy the template.** New project: copy the whole `template/` folder, `npm install`, `npm run dev`.
   Existing project: run `scripts/install.ps1 -Target <path>` (or `scripts/install.sh <path>`), or copy:
   - `src/index.css` → the app's global CSS (replace it; it is the token source of truth)
   - `src/assets/vestas/` (Vestas Sans OTFs + logos; internal use only)
   - `src/components/ui/`, `src/components/shell/`, `src/components/StateMark.tsx`
   - `src/lib/utils.ts`, `src/lib/theme.ts` (and `src/lib/api.ts` for a JSON API)
   - `src/app.config.ts`
   - The theme pre-paint `<script>` and `<meta name="theme-color">` from `template/index.html`
   - Dependencies: see `template/package.json` (Radix primitives, `cmdk`, `lucide-react`, `clsx`,
     `tailwind-merge`, `@tanstack/react-query`, `react-router-dom`)
   - `@/*` → `src/*` alias in `tsconfig.json` and `vite.config.ts`
3. **Configure `src/app.config.ts`**: product name, top-bar nav (with counts), admin sections, user,
   sign-out. Most apps change nothing else in the shell.
4. **Wrap every page** in `<AppShell>` (from `@/components/shell/AppShell`); every admin page in
   `<AdminLayout title meta actions>` instead. `main.tsx` must provide `QueryClientProvider`,
   `ToastProvider` and `BrowserRouter`.
5. **Build pages from the examples** in `template/src/pages/`:
   | Page type | Example | Recipe |
   |---|---|---|
   | Home | `HomePage.tsx` | `text-display font-light` question, 7:5 split, ruled rows with `StatusMark` |
   | List | `ListPage.tsx` | `PageHeader` + one accent action → `Segmented` with counts + filter → `Table` → row `Menu` → `ConfirmDialog` |
   | Admin settings | `SettingsPage.tsx` | `AdminLayout` → `Tabs` → `Section`s of `Field`s / switch rows → one accent Save |
   | Admin usage | `UsagePage.tsx` | `Facts` + `DistributionBar` + `Segmented` + `Table` (never KPI tiles) |
   | Admin history | `HistoryPage.tsx` | `AdminLayout` + `EmptyState align="start"` |
   | About | `AboutPage.tsx` | `PageHeader parent` + `Facts` |
   | Sign in | `LoginPage.tsx` | Night Sky bar, narrow form on white, one accent button |
6. **Verify** with `references/checklist.md`, in light **and** dark mode.

## Hard rules (from DESIGN.md)

1. **Tokens only.** `bg-canvas/sunken/hover/tint`, `text-ink/ink-2`, `border-rule/control`,
   `text-action`, `bg-shell text-shell-ink`, `fn-red/green/yellow(-tint)`. **Never hard-code hex.**
2. **Rules, not boxes.** Sections are a heading + 32px space + 1px `border-rule` lines; lists are rows.
   No cards, no nested boxes, **no KPI/stat tiles**, no bordered one-line notes.
3. **One filled accent button per view** (`variant="accent"`). Others `outline` (default), `ghost`,
   `subtle`; destructive is `danger` or `ConfirmDialog destructive`, saying what happens and what stays.
4. **Vestas Sans 300/400/500 only.** Medium is the heaviest; never `font-semibold`/`font-bold`.
   Use the scale `text-display/title/heading/label/body/ui/meta`. Sentence case, British English,
   no all-caps, no letter-spacing, no eyebrow lines. Numbers in `.figures` (tabular).
5. **Mark plus word.** Every state is a `StateMark`/`StatusMark` **and** a word. Colour alone never
   carries meaning; green means *done* only; coverage is Night Sky, not green.
6. **Counts live in the nav, tabs and filters** that slice them (`count` props), in tabular figures.
7. **Two radii** (`--radius-control` 4px for things you operate, `--radius-surface` 8px for things
   that hold), **one shadow** (`shadow-float`, floating layers only), **one curve**
   (`--ease` at 120/200/320ms, opacity and transform only).
8. **Night Sky top bar, no sidebar.** At most one reversed `bg-shell on-shell` plate per screen, only
   while work or a decision is in progress; never for emphasis.
9. **Every async view has loading, error and empty states** (`SkeletonLines`/`Loading`,
   `ErrorState`, `EmptyState`). Mutations → invalidate the query and `toast("…", "success")`.
10. **Accessible:** WCAG 2.1 AA, visible 2px focus ring, `IconButton` always has `label`, skip link
    kept, prose ≤ 68ch.

## References

- `references/design-principles.md` — the full DESIGN.md: palette, type, layout, elevation, every
  component spec, named rules, do's and don'ts.
- `references/components.md` — the kit and shell components with props and usage.
- `references/layout-and-admin.md` — shell anatomy, page recipes, administration conventions, login.
- `references/checklist.md` — review checklist before shipping.

## Non-React fallback

Copy the `@font-face` rules and the `:root { … }` / `.dark { … }` blocks from
`template/src/index.css` (plus `src/assets/vestas/`) into the app's global stylesheet and use the
CSS variables directly (`var(--ink)`, `var(--rule)`, `var(--action)`, `var(--shell)`,
`var(--radius-control)`, `var(--shadow-float)`…). Rebuild the components from the specs in
`references/design-principles.md` (exact heights, paddings and radii are listed there). Keep the
structure: sticky 56px Night Sky top bar, content capped at 1564px with 16/24/32px gutters, white
canvas, ruled rows.
