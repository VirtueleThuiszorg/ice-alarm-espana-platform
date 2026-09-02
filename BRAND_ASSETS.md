# BRAND_ASSETS.md — where the ICE Alarm España files live

The rules live in **`BRAND_IDENTITY.md`**. This file is only the inventory.

## Canonical vector
- `public/icon.svg` — the Guardian mark. Two paths, `viewBox="0 0 100 100"`, no gradients.
  Every raster below is exported from this file and none is redrawn by hand.
- `src/assets/ice-alarm-espana-mark.svg` — the same geometry for in-app import.
- `src/components/ui/logo.tsx` — the mark plus the one-line lockup, as a component.
  Its path data must stay in step with `public/icon.svg`.

## Exports (in `public/`)
| File | Size | Used by |
|---|---|---|
| `favicon.ico` | 16 / 32 / 48 | browser tabs |
| `favicon-16x16.png` · `favicon-32x32.png` · `favicon-48x48.png` | as named | explicit tab icons |
| `icon-192.png` | 192 | PWA |
| `icon-512.png` | 512 | PWA primary |
| `icon-maskable-512.png` | 512 | Android maskable — mark inside the 80% safe circle |
| `apple-touch-icon.png` | 180 | iOS home screen |
| `og-image.png` | 1200 × 630 | link previews |

## Regenerating
The whole set is produced from `public/icon.svg`. If the mark ever changes, change
the SVG and re-export — never touch a PNG by hand and never let the component's
inline path drift from the file.

## What was deleted
- `src/assets/care-conneqt-logo.svg` — the two interlocking C's.
- The indigo/orange "v" icon set, and with it the two-coexisting-marks problem
  recorded in this file's previous version.
- The Lovable gradient-heart that had been shipping as `favicon.ico` since the
  platform was built.
