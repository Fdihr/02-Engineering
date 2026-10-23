# Layout, pages and administration

## Shell anatomy

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Night Sky bar 56px: Product  Items  Reviews 3  Administration   [Search or go to Ctrl K] 🔔 👤  VESTAS │
├──────────────────────────────────────────────────────────────────────────────────┤
│                     white canvas, content max 1564px, gutters 16/24/32px          │
│  PageHeader (title font-light, meta, one accent action)                           │
│  ─────────────────────────────────── rule ───────────────────────────────────     │
│  rows / tables / sections                                                         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **No sidebar.** Primary links live in the top bar; below 1024px they move into a start-side `Sheet`.
- Current link: white text + 2px `shell-ring` bar on the bottom edge. Counts after labels in `figures`.
- From 1280px a 240px "Search or go to" field opens the command palette; Ctrl/⌘ K always does.
- Right side: notifications, account menu, then the white Vestas logo (16px tall).
- Everything is configured in `src/app.config.ts`.

## Page recipes

- **Home:** `text-display font-light` question ("What are you working on?"), grid
  `lg:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] gap-x-16`, ruled rows with `StatusMark` + word.
- **List:** `PageHeader` (count in `meta`, one accent "New …") → `Segmented` filter with counts +
  filter input right → `Table` → row `Menu` → `ConfirmDialog` for deletion.
- **Detail:** `PageHeader parent={{to, label}}` → `ViewTabs` → `Section`s. Read-only blocks may use
  `bg-sunken`.
- **Work in progress:** at most one `rounded-[var(--radius-surface)] bg-shell on-shell text-shell-ink px-5 py-4`
  plate per screen, with `Button variant="inverse" size="sm"` actions; remove it when work ends.

## Administration

- Admins see an **Administration** top-bar link (active for any `/admin*` path).
- Every admin page uses `<AdminLayout title meta actions>`; the left 13rem nav lists
  `appConfig.adminSections` (current = `bg-tint font-medium`). On mobile it becomes a horizontal
  scrolling row with edge fades.
- **Settings:** `Tabs` for groups (Users, Integrations…) → `Section` per group → `Field`s in a
  `max-w-xl grid gap-5` → switch rows → **one** accent Save + ghost Cancel. Integrations each get
  their own Section and Save.
- **Usage / statistics:** `Facts` for totals, `DistributionBar` for proportions, `Segmented` for the
  period, `Table` with right-aligned tabular figures. **Never KPI tiles.**
- **History / audit:** `Table` of who/what/when; `EmptyState align="start"` when empty.
- **Users & groups:** `Table` with a row `Menu` (Edit, Disable, Delete last + destructive). Create
  and edit in a `Dialog` with `Field`s.

## Sign in

Night Sky bar with the product name and white logo; a `max-w-sm` column on white with
`text-title font-light` "Sign in", one accent SSO button, a ruled "or with a local account" divider,
then `Field`s and an outline submit.

## Copy

Sentence case, British English, plain words. Buttons are verbs ("Save changes", "Delete item").
Confirmations start "Confirming …" and say what changes and what stays. Errors say what happened and
what to do. No exclamation marks, no emoji.
