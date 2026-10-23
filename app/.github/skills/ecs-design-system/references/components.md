# Components

Everything is exported from `@/components/ui` unless noted. Icons are `lucide-react` outlines at
16px (`strokeWidth={1.75}` where drawn standalone); always beside a word or with an accessible name.

## Actions

| Component | Props | Use |
|---|---|---|
| `Button` | `variant`: `accent` \| `outline` (default) \| `subtle` \| `ghost` \| `danger` \| `inverse`; `size`: `md` (36px) \| `sm` (32px, rows/plate) \| `icon` \| `icon-sm`; `loading` | One `accent` per view. `inverse` only on Night Sky. |
| `IconButton` | `label` (required, becomes tooltip + aria-label), `tooltip?`, plus Button props | Toolbar and row icons. |
| `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem` (`destructive`), `MenuLabel`, `MenuSeparator`, `MenuGroup` | Radix dropdown | Row actions (`MoreHorizontal`), destructive actions go last. |

## Inputs

| Component | Notes |
|---|---|
| `Field` | `label`, `hint`, `error`, `optional`; wraps ONE control and wires `id`/`aria-describedby`/`aria-invalid`. |
| `Input`, `Textarea`, `Select` (native) | 36px, 4px radius, control-grey border; `controlClass` for custom controls. |
| `Switch` | `checked`, `onChange(boolean)`, `ariaLabel`. Use in a row: label + meta left, switch right, `border-t border-rule py-4`. |

## Navigation inside a page

| Component | Props | Use |
|---|---|---|
| `Tabs` + `TabsContent` | `items: {key,label,count?}[]`, `value`, `onChange`, `label` | 40px tabs on a bottom rule; active = Medium + 2px action bar. |
| `ViewTabs` | `items`, `value`, `label`, `hrefFor(key)` | Same look, but links (URL-driven views). |
| `Segmented<T>` | `options: {value,label,count?,disabled?}[]`, `value`, `onChange`, `label` | Filters. Put counts here, not in tiles. |

## Page structure

| Component | Props | Use |
|---|---|---|
| `PageHeader` | `title`, `meta?`, `parent?: {to,label}`, `actions?` | Top of every non-home page. `text-title font-light`. |
| `Section` | `title?`, `meta?`, `actions?`, `id?`, `headingLevel?` | A heading + rule + content. Replaces cards. |
| `Facts` | `items: {label, value}[]` | Key/value figures. Replaces KPI tiles. |
| `Kbd` | children | Keyboard hints (`Ctrl K`). |
| `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` | `Table caption` | Ink line under header, rule under rows, row hover. Right-align numbers + `figures`. |

## Overlays (all: 8px radius, `shadow-float`, 1px rule ring)

| Component | Props |
|---|---|
| `Dialog` | `open`, `onClose`, `title`, `description`, `footer`, `ariaLabel` |
| `ConfirmDialog` | `open`, `onClose`, `onConfirm`, `title`, `description`, `confirmLabel`, `cancelLabel`, `destructive`, `busy` |
| `Sheet`, `SheetClose` | `open`, `onClose`, `side`: `start` \| `end`, `label` |
| `Popover*` | Radix popover; `floatingClass` for custom floating surfaces |
| `Tooltip`, `TooltipProvider` | `content`, `side`. `AppShell` already provides the provider. |
| `Command*` | cmdk primitives (used by the command palette) |
| `useToast()` | `toast(message, "success" \| "error" \| "info")`; needs `ToastProvider` in `main.tsx` |

Destructive copy: title is a question ("Delete this item?"), description starts "Confirming …" and
says what changes and what cannot be undone; the confirm label names the action ("Delete item").

## Feedback

| Component | Use |
|---|---|
| `Skeleton`, `SkeletonLines lines`, `Loading label` | Loading. |
| `EmptyState` | `icon?`, `title`, `description?`, `action?`, `align?: "start" \| "center"` |
| `ErrorState` | `title`, `detail?`, `action?` (usually "Try again") |
| `Spinner` | Inline work indicator with `label`. |
| `Badge` | `tone`: `neutral` \| `selected` \| `caution` \| `danger` \| `done`. Names and tags only; **never status**. |

## Status (`@/components/StateMark`)

| Export | Use |
|---|---|
| `StatusMark tone label?` | Workflow state: `done`, `active`, `waiting`, `attention`, `failed`, `neutral`. Always with a word. |
| `StateMark state withLabel?` | Assessment: `compliant`, `partial`, `gap`, `insufficient_evidence`, `not_applicable`. |
| `DistributionBar value compact?` | 12px segmented bar with counts beneath. |
| `STATE_LABEL`, `STATE_DESCRIPTION`, `STATE_PLURAL` | Wording for the above. |

## Shell (`@/components/shell/*`)

| Component | Notes |
|---|---|
| `AppShell` | `fullBleed?`. Top bar + `<main id="main">` capped at 1564px with 16/24/32px gutters. |
| `AdminLayout` | `title`, `meta?`, `actions?`. 13rem section nav (from `appConfig.adminSections`) + `PageHeader`. |
| `TopBar` | Reads `appConfig`; `notifications?` prop. Ctrl/⌘ K opens the palette. |
| `CommandPalette` | `open`, `onOpenChange`, `destinations`. |
| `AccountMenu` | Theme toggle, About, Sign out (with confirm). |
| `Notifications` | `items?: {id, kind, message, link}[]`; yellow count. |
