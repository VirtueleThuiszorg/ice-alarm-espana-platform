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
| 2 | Landing "premium pendant" section + Pendant page hero | `homepage_pendant_promo` | EV-07B clean warm-background product shot, consumer-electronics treatment | ⛔ PLACEHOLDER — real photo owed |
| 3 | Pendant page — worn detail | (pendant page lifestyle slots) | Close crop, pendant on a real person, hand/collar context | ⛔ PLACEHOLDER — real photo owed |
| 4 | Pendant page — lifestyle | (pendant page lifestyle slots) | Everyday life with the pendant present but incidental | ⛔ PLACEHOLDER — real photo owed |

Notes:
- Placeholder captions in-app are prefixed `PLACEHOLDER-` and read "Real photo to be
  supplied" so they are never mistaken for final art.
- Slots 3–4 on the pendant page are filled in as that page's restructure lands.
