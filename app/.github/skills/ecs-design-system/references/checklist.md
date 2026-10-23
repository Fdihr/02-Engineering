# Review checklist

Check every page in **light and dark** mode, at 375px, 1024px and 1440px.

- [ ] `index.css` is the template's, unchanged; Vestas Sans loads (no Arial fallback visible).
- [ ] No hex colours or Tailwind palette colours (`blue-500`, `gray-200`…) in components; tokens only.
- [ ] No `font-semibold` / `font-bold`; only 300/400/500. Type uses the `text-display…text-meta` scale.
- [ ] Night Sky top bar from `AppShell`; no sidebar; current link has the 2px bar.
- [ ] No cards, boxed sections or KPI/stat tiles; sections are headings + rules; lists are rows.
- [ ] Exactly one `variant="accent"` button visible per view.
- [ ] Every state shows a mark **and** a word; no colour-only status, no status `Badge`s, green only for done.
- [ ] Counts sit in nav items, tabs or filters, in `.figures`.
- [ ] Only floating layers have a shadow (`shadow-float`); radii are 4px (controls) or 8px (surfaces).
- [ ] At most one Night Sky plate per screen, and only while work is in progress.
- [ ] Every async view has loading, error and empty states.
- [ ] Destructive actions go through `ConfirmDialog` with a "Confirming …" sentence.
- [ ] Admin pages use `AdminLayout`; the section is listed in `appConfig.adminSections`.
- [ ] Keyboard: skip link works, focus ring visible everywhere, Ctrl K opens the palette, Esc closes overlays.
- [ ] Icon-only buttons are `IconButton` with a `label`.
- [ ] Copy is sentence case British English; prose ≤ 68ch.
- [ ] `npm run typecheck` passes.
