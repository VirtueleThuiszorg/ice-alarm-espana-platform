# PLACEHOLDERS.md — imagery owed before go-live (Stage 4b redesign)

Per `FRONTEND_REDESIGN.md` §5 + `IMAGE_SPEC.md`. The redesign renders placeholder
slots via `ImageWithPlaceholder` where a real photo is not yet in the Supabase
`website-images` store. **Launch is blocked on slots 1–2** (`LAUNCH_CHECKLIST.md` →
Content & brand). Lee supplies the real photography.

Each slot below is keyed by the `website-images` DB key the component reads; uploading
a real image under that key replaces the placeholder automatically (no code change).

| # | Where | DB image key | Slot brief (§5) | Status |
|---|---|---|---|---|
| 1 | Landing hero | `homepage_hero` | Warm lifestyle, one person 60s–70s mid-activity, pendant incidental, Spain-plausible | ✅ real image present in store |
| 2 | Pendant page hero | `public/pendant1.webp` | Pendant + cradle, warm home context | ✅ REAL — `pendant1.webp` (optimised from Lee's `pendant1.png`, 8MB→31KB). Landing section still uses `homepage_pendant_promo` → `pendant-product.png` fallback. |
| 3 | Pendant page — worn lifestyle band | `public/pendant2.webp` | Pendant worn, active life (mountain trail, golden hour) | ✅ REAL — `pendant2.webp` (optimised, 1.9MB→148KB) |
| 4 | Pendant page — specs / at-home reassurance | `public/pendant3.webp` | Pendant worn at home, Spanish kitchen | ✅ REAL — `pendant3.webp` (optimised, 7.9MB→95KB) |

**Image optimisation (2026-07-22):** Lee's three source PNGs (`pendant1/2/3.png`, 1.4/1.9/**7.9**MB)
were re-encoded to WebP at display dimensions — **31KB / 148KB / 95KB** (all well under the
500KB target; ~275KB total vs ~11MB). The heavy source PNGs were removed from `public/`. A tiny
AI-artifact sparkle in `pendant1`'s corner was cropped out. Landing hero (`homepage_hero`) already
has a real image in the DB store.

Notes:
- Placeholder captions in-app are prefixed `PLACEHOLDER-` and read "Real photo to be
  supplied" so they are never mistaken for final art.
- Slots 3–4 on the pendant page are filled in as that page's restructure lands.
