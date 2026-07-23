# BRAND_IDENTITY.md — Care Conneqt brand, single source of truth

> Supersedes the icon/mark sections of `BRAND_ASSETS.md`. As of 2026-07-22 there is
> **one** Care Conneqt mark — the interlocking **two-C** logo. The old indigo/orange
> **"v" mark is RETIRED** (favicon set, `public/icon.svg`, and the `docs/brand/` previews
> were regenerated/removed). The earlier "interim two-mark rule" no longer applies.

## The mark

Interlocking two-C "Connected" mark — a teal C locking into a deep-blue C.

- **Canonical vector:** `src/assets/care-conneqt-logo.svg` (`viewBox 0 0 100 100`, scalable).
- **In-app component:** `src/components/ui/logo.tsx` (`<Logo>`) — same geometry inline, plus
  the "Care Conneqt" wordmark (DM Sans ~600) and "Connected Health" tagline as text. Used by
  `PublicHeader` and the admin/staff headers.
- The whole favicon / app-icon set is **generated from the canonical SVG** (see below), so the
  browser-tab favicon now matches the in-app logo.

## Colours

| Role | Hex | HSL |
|---|---|---|
| Teal (left C, accents) | `#1CBAC8` | `hsl(185 75% 45%)` |
| Deep blue (right C, wordmark, primary) | `#0D4CA5` | `hsl(215 85% 35%)` |
| Cream (brand background / OG card) | `#FAF6F0` | `hsl(36 50% 96%)` |
| Ink (body text) | `#2E2E3A`-ish | via `--foreground` |

Variants (in `logo.tsx`): `default` / `dark` / `sidebar` = teal + blue · `white` = all-white
(reversed / mono, for dark or photographic backgrounds).

> Note: the public marketing surface (Stage 4b redesign) uses a **warm palette** whose primary
> is an indigo drawn from the same family; the two-C mark's teal + blue remain the brand
> constants and the logo is never recoloured outside the variants above.

## Generated icon / app-icon set

All rendered from `src/assets/care-conneqt-logo.svg` (regenerate with the same pipeline if the
mark changes — Chromium rasterise + Pillow for the `.ico`):

| File | Size | Background | Use |
|---|---|---|---|
| `public/icon.svg` | vector | transparent | Modern SVG favicon (`<link rel="icon" type="image/svg+xml">`) |
| `public/favicon.ico` | 16/32/48 | transparent | Legacy browser tab (multi-size ICO) |
| `public/favicon-16x16.png` / `-32x32` / `-48x48` | 16/32/48 | transparent | Explicit PNG favicons |
| `public/apple-touch-icon.png` | 180 | white | iOS home screen (opaque; iOS rounds it) |
| `public/icon-192.png` / `icon-512.png` | 192/512 | white | PWA / Android (`purpose: any maskable`, safe-zone padding) |
| `public/og-image.png` | 1200×630 | cream | Open Graph / Twitter share card: mark + wordmark + tagline |

Wired in `index.html` (`<link rel="icon">` set + `og:image`/`twitter:image`) and
`public/manifest.json` (`icons`). Service worker `CACHE_VERSION` is bumped whenever the icon
set changes so stale favicons invalidate (currently `care-conneqt-v5`).

## Typography
- **Display / headings / wordmark:** DM Sans (400–700), Google Fonts (`font-display`).
- **Body:** Open Sans (400–600).

## Tagline & voice
"Connected Health. Human Care." — 24/7 bilingual connected care for seniors and expats across
Spain. Service-centric, active voice, sentence case; no fear-based copy.

## Usage rules
- Use the two-C mark for all icon/favicon/app-icon/social surfaces. Do not reintroduce the "v" mark.
- Do not recolour the mark outside the defined variants; keep clear space ≈ the height of one C.
- On dark or photographic backgrounds use the `white` variant.
- Semantic red is reserved for SOS/emergency UI only — never brand decoration.
