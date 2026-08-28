# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained static HTML file (`skincare-routine.html`) — a personal weekly skincare/hair/body-care
routine tracker in Vietnamese. No build tools, no package manager, no dependencies beyond a Google Fonts
`<link>`. There is no server, no test suite, and no git repo initialized.

## Running / developing

Open `skincare-routine.html` directly in a browser (double-click, or `start skincare-routine.html` on
Windows). There is no build, lint, or test command — all HTML, CSS, and JS live inline in the one file.
After editing, just refresh the browser to see changes.

## Architecture

The page is one file with three parts, in this order: `<style>`, static markup (`<body>`), and a `<script>`
that renders the day-by-day content from JS data arrays. To make changes, know how these pieces connect:

- **Three categories, one shared layout.** The `.cat-switcher` buttons toggle which top-level `<section
  class="category">` is visible (`#cat-face`, `#cat-hair`, `#cat-body`). Each section reuses the same
  hero/gallery/tabs/panel structure but is populated by its own data block in the script.
- **Theming via scoped CSS variables.** Colors are defined once on `:root` (rose/blush palette for the face
  section) and overridden by `.theme-yellow` (hair) and `.theme-almond` (body) classes on each `<section>`.
  Add a new palette by defining a new `.theme-*` block that redeclares the same variable names — don't
  hardcode colors in component rules.
- **Content is data, not markup.** Each category has a `*Products` array (feeds the "tủ đồ" gallery via
  `renderGallery`) and a `*Days` array of 7 day objects (feeds the tab/panel UI via `buildWeekTabs`). The face
  and body sections use `{am: [...], pm: [...]}` steps per day; the hair section uses a flat `steps: [...]`
  list. Each step is a `[productName, noteText]` tuple — `noteText` may be `""`.
  - To change what routine is shown on a given day, edit the relevant entry in `faceDays`, `hairDays`, or
    `bodyDays` — no other code needs to change.
  - `buildWeekTabs(tabsId, panelsId, daysData, panelHtmlFn)` is generic: it builds the tab bar and panels for
    whichever category calls it, using a template function you pass in (see the three
    `buildWeekTabs('tabs-*', ...)` calls near the bottom of the script for the per-category panel HTML).
- **Icons are picked by keyword matching.** `pickIcon(name)` inspects the Vietnamese product name string and
  returns one of the hand-drawn inline SVGs in the `ICONS` map (e.g. names containing `"tẩy da chết"` get the
  exfoliant icon). When adding a new product name, check `pickIcon` to make sure it matches an existing rule
  or falls back sensibly to `ICONS.flower`; add a new `if(n.includes(...))` branch for a genuinely new product
  type.
- **Everything is rendered client-side on load.** There's no persistence, no routing, and no state beyond
  which category/tab is currently `.active` — switching tabs/categories just toggles CSS classes via the
  click handlers at the bottom of the script.
