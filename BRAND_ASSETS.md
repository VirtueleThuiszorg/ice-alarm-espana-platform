# Care Conneqt — Brand Assets Reference

> ⚠️ **SUPERSEDED for logo/mark/icons by `BRAND_IDENTITY.md` (2026-07-22).** There is now
> **one** mark — the interlocking **two-C** logo — and the whole favicon/app-icon set is
> generated from it. The old indigo/orange **"v" mark is RETIRED**; the "two coexisting marks"
> and "interim two-mark rule" notes below are historical. This file is kept for the fuller
> palette/typography reference; `BRAND_IDENTITY.md` wins on the mark and icons.

## Colors

**~~Retired "v" icon mark~~** (indigo/orange; replaced 2026-07-22 by the two-C mark):
| Element | Hex | HSL |
|---|---|---|
| ~~Left arm (indigo/navy)~~ | `#3B3B7A` | `240 35% 35%` |
| ~~Right arm + dot (orange)~~ | `#F7941E` | `33 93% 54%` |
| Background (cream, still the brand bg) | `#FAF6F0` | `36 50% 96%` |

**Legacy app theme tokens** (still live in `src/index.css` / manifest — unchanged):
| Token | HSL | Hex |
|---|---|---|
| Primary (Deep Blue) | `215 85% 35%` | `#0D4CA5` |
| Secondary (Teal) | `185 75% 45%` | `#1CBAC8` |
| Theme color (meta/manifest) | — | `#1e5a9c` |

## Typography
- **Display / headings & logo wordmark:** DM Sans (400/500/600/700) — Google Fonts.
  Tailwind token `font-display`; applied to `h1–h6` and the "Care Conneqt" wordmark (~600).
- **Body:** Open Sans (400/500/600) — Google Fonts. (Tagline "Connected Health" stays sans.)
- *Changed 2026-06-17 from Fraunces → DM Sans for display/headings (Fraunces dropped from the
  font load). Earlier 2026-06-16 change was Poppins → Fraunces; Poppins still loaded for any
  legacy `font-['Poppins']` usages.*

## Marks — two currently in use

**1. Icon / favicon mark ("v" mark) — SHIPPED 2026-07-14 (`b805825`)**
- A single stylised "v" / check formed by two curved strokes with a dot above (a
  person raising an arm). Indigo left arm `#3B3B7A`, orange right arm + dot `#F7941E`,
  on a cream `#FAF6F0` field.
- Canonical vector source: `public/icon.svg` (viewBox `0 0 100 100`; two `stroke-linecap:round`
  paths + one circle — see file for exact geometry).
- Used by: `favicon.ico`, `favicon-16/32/48`, `icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`.

**2. In-app wordmark logo (two interlocking C's) — UNCHANGED (legacy palette)**
- Canonical vector source: `src/assets/care-conneqt-logo.svg`
- Two interlocking C's: left = teal `hsl(185 75% 45%)`, right = deep blue `hsl(215 85% 35%)`
- Component: `src/components/ui/logo.tsx`
- **Note:** this mark still uses the legacy palette and does **not** match the shipped
  icon mark above. Not yet reconciled — see mismatch note.

## Icon files (in `public/`)
- `icon.svg` — canonical vector of the "v" mark
- `favicon.ico` — multi-size (16/32) for browser tabs
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` — explicit PNG favicons
- `icon-192.png` — PWA (192×192)
- `icon-512.png` — PWA primary (512×512)
- `apple-touch-icon.png` — iOS home screen (180×180)
- `og-image.png` — Social sharing (brand blue background)
- Marketing previews kept out of `public/` in `docs/brand/` (`favicon-preview.png`,
  `favicon-tab-preview.png`) so they don't deploy.

## Interim two-mark rule (DECIDED 2026-07-22 — Lee)
Both marks are **kept** for now, each with a defined role. This is the interim
rule until the Stage 4b redesign (`FRONTEND_REDESIGN.md`) decides the logo
treatment properly:

| Mark | Where it is used |
|---|---|
| **"v" mark** (indigo `#3B3B7A` / orange `#F7941E` on cream `#FAF6F0`) | Icon / favicon set only — `favicon.ico`, `favicon-16/32/48`, `icon-192/512`, `apple-touch-icon`, `icon.svg`. |
| **Two-C wordmark** (teal `hsl(185 75% 45%)` / deep blue `hsl(215 85% 35%)`) | `og-image.png` (social) + in-app headers / the `Logo` component (`src/components/ui/logo.tsx`). |

Do not "fix" the palette divergence between the two marks ad hoc — full
reconciliation to a single system is owned by the Stage 4b redesign.

## ⚠️ Palette divergence (context for the Stage 4b reconciliation)
The favicon "v" mark uses the warm indigo/orange/cream palette; the app theme
(`src/index.css`, `public/manifest.json`, `index.html`, `public/sw.js`) and the
two-C wordmark still use the legacy deep-blue `#1e5a9c` / teal palette. Under the
interim rule above this is intentional and staged; the Stage 4b redesign resolves
it (note: the "v" mark's warm palette is closer to that redesign's
"warm-and-human" direction than the legacy clinical blue).

## Tagline
"Connected Health. Human Care."

## Voice & positioning
Care Conneqt provides 24/7 bilingual connected care for seniors and expats across Spain, UK, and Netherlands. GPS tracking, fall detection, nurse-led monitoring, and instant help at the push of a button.
