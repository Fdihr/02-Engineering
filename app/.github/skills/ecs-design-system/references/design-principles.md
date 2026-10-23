<!-- Source: DESIGN.md from the gufbi-ai-dev branch of vestas/ecs-security-principles (the CAPE redesign brief given to Opus 5.5). Copied verbatim as the design authority for this skill. Where it says 'CAPE', read 'your app'. CAPE-only parts (the CAPE character, the CAPE panel, the proposal row) apply only to apps with an AI assistant. -->

---
name: CAPE
description: "Weather window: the offshore weather-window board inside the Vestas brand."
colors:
  night-sky: "#1f3144"
  blue-sky-action: "#005aff"
  blue-sky-observed: "#4ba6f7"
  blue-sky-ring: "#96c8f0"
  blue-sky-band: "#cbe3f8"
  blue-sky-tint: "#e5f1fb"
  shell-band: "rgb(150 200 240 / 0.35)"
  signal-red: "#c8102e"
  signal-red-tint: "#fbe8eb"
  shell-red: "#ff8a80"
  completion-green: "#1e7b34"
  completion-green-tint: "#e7f2ea"
  signal-yellow: "#f2b600"
  signal-yellow-tint: "#fdf4d6"
  caution-ink: "#7a5a00"
  canvas-white: "#ffffff"
  sunken-grey: "#f8f9f9"
  hover-grey: "#f1f2f3"
  rule-grey: "#e3e5e8"
  control-grey: "#88929c"
  ink-secondary: "#606d7b"
  partial-grey: "#8f98a1"
  shell-secondary: "#c7ccd0"
  shell-rule: "#576573"
  scrim: "rgb(31 49 68 / 0.45)"
typography:
  display:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 300
    lineHeight: "3rem"
  title:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 300
    lineHeight: "2.25rem"
  heading:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: "1.625rem"
  label:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: "1.375rem"
  body:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  ui:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  meta:
    fontFamily: "Vestas Sans, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  control: "4px"
  surface: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
components:
  button-accent:
    backgroundColor: "{colors.blue-sky-action}"
    textColor: "{colors.canvas-white}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-accent-hover:
    backgroundColor: "{colors.night-sky}"
  button-outline:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.night-sky}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.hover-grey}"
  button-danger:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.signal-red}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-danger-hover:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.canvas-white}"
  button-inverse:
    backgroundColor: "transparent"
    textColor: "{colors.canvas-white}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.night-sky}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  input-disabled:
    backgroundColor: "{colors.sunken-grey}"
    textColor: "{colors.ink-secondary}"
  tab:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.ui}"
    height: "40px"
  tab-active:
    textColor: "{colors.night-sky}"
    typography: "{typography.ui}"
    height: "40px"
  segmented-on:
    backgroundColor: "{colors.blue-sky-tint}"
    textColor: "{colors.night-sky}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  badge:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "24px"
  badge-selected:
    backgroundColor: "{colors.blue-sky-tint}"
    textColor: "{colors.night-sky}"
  top-bar:
    backgroundColor: "{colors.night-sky}"
    textColor: "{colors.canvas-white}"
    typography: "{typography.ui}"
    height: "56px"
  plate:
    backgroundColor: "{colors.night-sky}"
    textColor: "{colors.canvas-white}"
    rounded: "{rounded.surface}"
    padding: "16px 20px"
  table-header:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.meta}"
    padding: "8px 16px 8px 0"
  tooltip:
    backgroundColor: "{colors.night-sky}"
    textColor: "{colors.canvas-white}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
---

# Design System: CAPE

## Overview

**Creative North Star: "Weather window"**

CAPE reads like the board an offshore crew checks before a lift: a Night Sky bar across the top, a white working canvas below, and dense, aligned rows held apart by single hairline rules. Nothing is boxed for decoration. Hierarchy comes from scale contrast inside one family at three weights, from alignment and from rules; colour is spent on action, on assessment and on signals, and almost nowhere else. The system sits inside the pinned Vestas brand foundation (`.agents/skills/vestas-brand-guidelines/DESIGN.md`) and takes its palette and typeface as given; this file records only the working-tool layer CAPE adds on top.

The signature is the plate: a reversed Night Sky panel with time lanes, a clock axis, an expected-time band and a now-line, shown while work or a decision is in progress and gone when it is not. It is the weather window itself. While it is open, everything else on screen stays calm and white; because it is rare, it carries meaning.

The voice is plain and exact. Assessment states are drawn shapes paired with words, never colour alone. Counts sit in the tabs and filters that slice them. The CAPE agent proposes changes in sentences a reviewer can approve without reading the payload. Absent by construction: KPI tile rows, boxed page sections, nested cards, side stripes, glyph icons, eyebrow labels, all-caps labels, bold weights and decorative gradients.

**Key Characteristics:**
- Night Sky top bar over a white canvas; one reversed Night Sky plate, only while work or a decision is in progress.
- Dense rows on a 4px rhythm, separated by 1px rules; no boxed sections, no nested cards.
- One family, three weights (300, 400, 500), seven sizes with a 13px floor, sentence case throughout.
- Assessment drawn as shape plus word; Covered is Night Sky; green is kept for completion.
- Two radii (4px for controls, 8px for surfaces) and one shadow, for floating layers only.
- One easing curve; motion moves only opacity and transform, and reduced motion keeps every static cue.

## Colors

The Vestas palette assigned to jobs: Night Sky carries structure and assessment, Blue Sky 01 carries action, light greys carry the canvas and its rules, and the functional red, green and yellow carry signals only. A dark theme remaps the same roles (Night Sky canvas, white ink, lighter Blue Sky action); the rules below hold in both.

### Primary
- **Night Sky** (#1f3144): Body ink, the top bar, the plate, tooltips, the hover fill of the accent button and the Covered assessment fill.
- **Blue Sky Action** (#005aff): The single accent. Accent button fill, focus ring, active tab bar, input focus border, links, the text caret, and the selected border on badges and segmented filters.

### Secondary
- **Blue Sky Observed** (#4ba6f7): The elapsed span on plate lanes; observed time.
- **Blue Sky Ring** (#96c8f0): Focus ring and current-page bar on Night Sky.
- **Shell Band** (rgb(150 200 240 / 0.35)): The expected-time band on plate lanes.
- **Blue Sky Band** (#cbe3f8): Text selection, search-match highlights and inserted text in approval diffs.
- **Blue Sky Tint** (#e5f1fb): Selected fills: the pressed segmented option, the current admin section, subtle buttons, selected badges.

### Tertiary
- **Signal Red** (#c8102e): Errors, invalid fields, failed marks, destructive buttons and deletion consequences.
- **Signal Red Tint** (#fbe8eb): The ground under struck-through deletions in diffs.
- **Shell Red** (#ff8a80): Failed lanes and failed status text on the plate.
- **Completion Green** (#1e7b34): Completion only: approved, published, finished, the success notice.
- **Completion Green Tint** (#e7f2ea): The quiet ground behind a completion note.
- **Signal Yellow** (#f2b600): The centre dot of the Gap and attention marks; never text.
- **Signal Yellow Tint** (#fdf4d6): The quiet ground behind a caution note.
- **Caution Ink** (#7a5a00): Text for partial reads and warnings, where yellow would fail contrast.

### Neutral
- **Canvas White** (#ffffff): The working canvas and floating panels; ink on the Night Sky bar and plate.
- **Sunken Grey** (#f8f9f9): Disabled inputs, read-only previews, code and loading skeletons.
- **Hover Grey** (#f1f2f3): Row and ghost-button hover.
- **Rule Grey** (#e3e5e8): Every 1px rule and row divider; the Absent segment in coverage bars.
- **Control Grey** (#88929c): Borders of things you operate (inputs, outline buttons) and scrollbars.
- **Ink Secondary** (#606d7b): Secondary text, hints, table headers, inactive tabs and counts.
- **Partial Grey** (#8f98a1): The Partial segment in coverage bars.
- **Shell Secondary** (#c7ccd0): Secondary text, inactive links and clock ticks on Night Sky.
- **Shell Rule** (#576573): Rules and inverse-button borders on Night Sky.
- **Scrim** (rgb(31 49 68 / 0.45)): Behind dialogs and sheets.

### Named Rules
**The Covered Is Night Sky Rule.** Covered is a filled Night Sky disc, never green. Coverage is a judgement, not a success, and a green field would read as finished.

**The Green Means Done Rule.** Completion Green appears only where something finished: approved, published, complete. Never for coverage, health or emphasis.

**The One Accent Rule.** Blue Sky Action fills at most one button per view; a second filled action becomes outline.

## Typography

**Display Font:** Vestas Sans (with Arial, sans-serif)
**Body Font:** Vestas Sans (with Arial, sans-serif)
**Label/Mono Font:** Vestas Sans for labels; ui-monospace (with Cascadia Mono, Consolas, monospace) for code only

**Character:** One family does every job, separated by size and three weights: Light for calm headlines, Medium for the names of things, Regular for everything read. No synthetic styles; kerning on.

### Hierarchy
- **Display** (Light 300, 2.5rem/40px, 3rem): The home page question only.
- **Title** (Light 300, 1.75rem/28px, 2.25rem): Page titles.
- **Heading** (Medium 500, 1.125rem/18px, 1.625rem): Section headings, dialog titles, the CAPE wordmark.
- **Label** (Medium 500, 0.9375rem/15px, 1.375rem): Sub-headings, row titles, the plate title.
- **Body** (Regular 400, 0.9375rem/15px, 1.5rem): Prose and descriptions, held to 68ch; headings balance and paragraphs wrap without orphans.
- **UI** (Regular 400, Medium 500 for buttons and labels, 0.875rem/14px, 1.25rem): Controls, tabs, table cells. Inputs step up to 16px below 640px.
- **Meta** (Regular 400, 0.8125rem/13px, 1.125rem): Timestamps, hints, badges, table headers (Medium, secondary ink). The floor; nothing is smaller.

Numbers that compare (counts, clock ticks, durations, dates in rows) use tabular figures. Code is 13px monospace on Sunken Grey with a 1px rule.

### Named Rules
**The Three Weights Rule.** Light, Regular and Medium only. No semibold, no bold; emphasis inside prose is Medium.

**The Sentence Case Rule.** Every label, button, heading and tab is in sentence case and British English. No CSS uppercase, no letter-spacing, no eyebrow or kicker line above a heading.

## Layout

Content runs in one shell column up to 1564px wide, with 16, 24 and 32px side padding as the window widens and 80px clear at the foot. The top bar is 56px and sticky. Page headers open with 32px above and 24px below; sections follow with 32px of top space and a heading, never a box. Spacing runs on a 4px rhythm (4, 8, 12, 16, 24, 32, 48, 64). Rows take 12px of vertical padding over a rule; table cells take 10px, headers 8px, with 16px trailing space and no vertical rules.

Home splits 7 to 5 from 1024px with 64px between columns. The CAPE workspace is a three-pane board: a 17rem rail from 1024px, a 46rem thread, and a preview pane of clamp(22rem, 30vw, 30rem) from 1280px; on narrower screens rail and preview move into sheets. Administration uses a 13rem section nav from 1024px. Breakpoints: 640px (input size, padding), 720px (plate lanes collapse to one column without the axis), 1024px (top-bar links, rails), 1280px (search field, docked CAPE panel, preview pane). Dialogs sit 8vh from the top, at most 32rem wide and 84dvh tall; sheets are 24rem, the CAPE sheet 30rem.

**The Counts Live in Filters Rule.** Totals belong in the tabs, segmented filters and nav items that slice them, in tabular figures and secondary ink. No rows of KPI tiles.

## Elevation & Depth

Flat by default. Structure comes from 1px rules, whitespace and the Night Sky bar; surfaces at rest cast nothing, and depth is tonal: Sunken Grey for read-only and disabled matter, the Night Sky plate for live work. One shadow exists, for layers that float above the page and can be dismissed: the command palette, dialogs, sheets, popovers and menus, notices and tooltips. Floating layers pair it with a 1px Rule Grey ring and an 8px radius, and enter with a 2px drop and a slight scale. The docked CAPE panel (1280px and wider) belongs to the page and separates with a 1px rule; below 1280px it becomes a sheet and takes the float shadow. The plan had shadowed the docked panel; the build uses the rule, and this file records the build.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 32px -12px rgb(31 49 68 / 0.28), 0 2px 6px rgb(31 49 68 / 0.08)`): Floating, dismissible layers only. The dark theme deepens it to `0 16px 40px -12px rgb(0 0 0 / 0.55), 0 2px 6px rgb(0 0 0 / 0.3)`.

### Named Rules
**The One Shadow Rule.** Only floating layers cast a shadow, and they all cast the same one. Rows, buttons, the plate and the docked panel never do.

**The Rules Not Boxes Rule.** Sections are separated by headings, space and 1px rules. No boxed page sections, no cards inside cards.

## Shapes

Two radii and hairlines. Things you operate (buttons, inputs, segmented options, badges, tooltips, inline code) take 4px; things that hold (the plate, dialogs, popovers, menus, notices, the command palette, code blocks) take 8px. Keyboard hints take 3px and search highlights 2px so they sit inside text. Full rounds belong only to switches, spinners, avatars, the notice dot and the 12px status marks. Every structural line is 1px: rules, control borders, the floating ring, quotation bars. The only 2px lines are indicators: the active tab bar, the current-page bar and the focus ring.

**The Hairline Rule.** Structural lines are 1px and side borders never exceed it; 2px is reserved for the active tab, the current page and focus.

**The Two Radii Rule.** 4px for what you operate, 8px for what holds. Pills only for switches, spinners, avatars and dots.

## Components

**The One Curve Rule.** Every transition uses one curve (cubic-bezier(0.2, 0, 0, 1)) at 120ms for controls, 200ms for panels and 320ms for arrivals, and moves only opacity and transform. Under reduced motion everything settles at once and the CAPE character's scanning sweep gives way to static dots, so no state depends on movement.

### Buttons
Compact, quiet and sure; one filled button speaks per view.
- **Shape:** Gently squared (4px), 36px tall with 14px side padding; 32px with 12px in rows and on the plate. Labels in UI Medium, with 16px icons 8px away (6px when small).
- **Primary:** Accent: Blue Sky Action fill and border with a white label; hover deepens fill and border to Night Sky.
- **Hover / Focus:** Colour changes run 120ms on the shared curve; a press scales to 0.96. Focus is a 2px Blue Sky Action ring at 2px offset (Blue Sky Ring on Night Sky). Disabled drops to 45% opacity. Loading swaps the label for three pulsing dots.
- **Secondary / Ghost / Tertiary:** Outline is the default: white fill, Night Sky label, Control Grey border, filling Hover Grey with an ink border on hover. Subtle sits on Blue Sky Tint and gains an action border on hover. Ghost stays transparent until hover. Danger is white with a Signal Red label and border and fills red on hover. Inverse, for Night Sky, is transparent with a white label and Shell Rule border that brightens on hover.

### Chips
Badges name and select; they never carry state.
- **Style:** A small rectangle, 24px tall, 8px side padding, 4px radius, 1px Rule Grey border, Meta size in secondary ink. Framework tags use the same quiet form.
- **State:** Selected takes a Blue Sky Action border on Blue Sky Tint. Segmented filters (32px tall, 10px padding, 4px radius, 4px apart) are pressed toggles: on is an action border, tint fill and Medium; off is a rule border that darkens on hover. Counts inside sit in tabular figures and secondary ink.

### Cards / Containers
There are no cards in the usual sense; lists are rows.
- **Corner Style:** None on rows; 8px on the plate and floating layers.
- **Background:** Canvas White for rows, Hover Grey on row hover, Sunken Grey for read-only content, Night Sky for the plate.
- **Shadow Strategy:** None at rest; floating layers only (see Elevation & Depth).
- **Border:** A 1px Rule Grey line under each row; tables put a 1px ink line under the header.
- **Internal Padding:** Rows 12px top and bottom; the plate 16px top and bottom with 20px sides, growing to 20px and 24px from 640px; dialogs 24px at the sides with 20px at the top and foot.

### Inputs / Fields
Plain, firm and legible.
- **Style:** 36px tall, 12px side padding, 4px radius, 1px Control Grey border on white, Night Sky text, secondary-ink placeholder. Labels sit 6px above in UI Medium; hints and errors sit below in Meta.
- **Focus:** The border turns Blue Sky Action with a flush 2px action outline; hover darkens the border to ink. The border colour moves in 120ms.
- **Error / Disabled:** Invalid fields take a Signal Red border with the error in red beneath. Disabled fields go Sunken Grey with a Rule Grey border, secondary ink and a not-allowed cursor.

### Navigation
The Night Sky top bar is 56px, sticky and full bleed, with content held to 1564px. The CAPE wordmark (Heading Medium) sits beside the white Vestas logo at 16px. Links are UI size in Shell Secondary and turn white on hover; the current page is white with a 2px Blue Sky Ring bar along the bottom edge. Approvals carries its count in tabular figures. From 1280px a 240px search field (4px radius, Shell Rule border, "Search or go to" with Ctrl K) opens the command palette; below 1024px the links move into a sheet behind a 36px menu button. In-page tabs are 40px tall and 24px apart on a bottom rule; the active tab is Medium ink over a 2px Blue Sky Action bar, and counts follow labels in tabular figures. The admin section nav marks the current item with Blue Sky Tint and Medium. Icons are Lucide outlines at 1.75 stroke, 16px (20px in the top bar), always beside a word or carrying an accessible name.

### Status marks
Twelve-pixel drawn shapes, always followed by their word 6px away and never wrapped. (Planned as text glyphs; built as drawn shapes.)
- **Assessment:** Covered is a filled Night Sky disc; Partial a ring, half filled; Gap a ring with a Signal Yellow centre; Unclear a dashed ring; Not applicable a short secondary-ink dash.
- **Workflow:** Done is a filled disc; Running a ring with a Blue Sky Action centre; Waiting an empty ring; Attention a ring with a yellow centre; Failed a Signal Red ring with a cross; Closed a dash.
- **Coverage bars:** 12px tall segments of Covered, Partial and Absent (Unclear outlined, dashed) with 2px gaps and each count beneath its segment. On Night Sky, Covered turns white.

**The Mark Plus Word Rule.** Every state is a drawn shape and a word. Shape alone distinguishes the state without colour; colour alone never does.

### Weather-window plate
The signature: a reversed Night Sky panel, 8px radius, white text. A Label-weight title and a tabular Meta line sit beside small inverse buttons for what applies now (choose failed files again, refresh, cancel, dismiss). Below run the time lanes: a label column, an 8px track at 10% white, and a status column, under a clock axis in tabular Meta. Each track shows the expected-time band in Shell Band, the elapsed span in Blue Sky Observed, failures in Shell Red, and a 1px white now-line standing 4px proud of the track. The analysis lane sits below a Shell Rule. Below 720px lanes stack without the axis. The copy says what is known and what stays: "This is the last known state; CAPE keeps trying." Plates appear for work in progress on home, uploads and analysis in a workspace, the decision under review in approvals (its quote on a 1px white bar), compliance runs and the developer view, and leave when the work ends.

**The One Plate Rule.** At most one plate per screen, only while work or a decision is in progress, and never for emphasis. Where a page owns its plate, the CAPE panel reports its own running work as rows instead.

### CAPE proposal row
How the agent asks. Each proposal is a row over a rule: an imperative title in UI Medium ("Invite {email} to {workspace} as {level}"), a status mark with its word ("Waiting for you", "Running", "Done", "Declined", "Expired"), then one consequence sentence that starts "Confirming" and says what changes, for whom and what stays ("Confirming renames it for everyone with access. Its documents, analyses and history stay as they are."). Deletions say so in Signal Red and name what cannot be undone. The request and response hide under "Technical details". Confirm (accent, or danger "Confirm deletion") and Decline (outline) are small buttons whose accessible names carry the title, with "Declining leaves the app unchanged." beneath. Completion notices read "{title}: done."

**The Plain-Words Proposal Rule.** An agent proposal reads in words before code: an imperative title, a "Confirming" consequence, then technical detail on request. Never ask someone to approve a method and a path.

## Do's and Don'ts

### Do:
- **Do** separate sections with a heading, 32px of space and 1px Rule Grey lines, and let rows carry lists.
- **Do** pair every state with its drawn mark and its word, and keep Covered in Night Sky.
- **Do** put counts in the tabs, filters and nav items that slice them, in tabular figures.
- **Do** keep one accent button per view; make the rest outline, and put destructive actions in a menu or at the end in danger style, saying what happens and what stays.
- **Do** show the plate only while work or a decision is in progress, one per screen, and remove it when the work ends.
- **Do** write agent proposals as an imperative title plus a "Confirming" sentence, with the request under "Technical details".
- **Do** hold prose to 68ch and set comparable numbers in tabular figures.
- **Do** give every floating layer the Float shadow, an 8px radius and a 1px rule ring.

### Don't:
- **Don't** build rows of KPI or stat tiles.
- **Don't** box page sections, nest cards, or wrap a one-line note in a bordered box.
- **Don't** use colour alone for state, green for coverage, or tinted badges as status pills.
- **Don't** add side borders thicker than 1px, glyph or emoji icons, eyebrow or kicker lines, all-caps labels or letter-spacing.
- **Don't** use semibold or bold; Medium is the heaviest weight.
- **Don't** shadow rows, the plate or the docked panel.
- **Don't** animate width, height or other layout properties; move opacity and transform only.
- **Don't** use the Night Sky plate for emphasis, announcements or decoration.
