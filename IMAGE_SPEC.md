# IMAGE_SPEC.md — every image the frontend needs

> READ-ONLY spec. Date: 2026-06-17. So Lee can create/source images and drop them in.
> "Wired" = code already points at it. "DB row" = needs an upload into the `website-images`
> Supabase storage bucket via Admin → Settings → Images (key = the `website_images` key).
> Product images are edited in **Admin → Products** (`products.hero_image_url`).

## LAUNCH-CRITICAL

| Image | Where code expects it | Used for | Dimensions / ratio | Format | Current state | Wiring |
|---|---|---|---|---|---|---|
| **Homepage hero** | `website_images` key `homepage_hero`, **fallback `/images/homepage1.png`** (LandingPage) | Home hero (right column) | ~1600×1200 (**4:3**) | webp/jpg | ⚠️ **present but 7.5 MB** (`homepage1.png`) — far too heavy; compress to <300 KB | wired (on `feat/asset-cleanup`); optional `homepage_hero` DB row overrides |
| **GPS Pendant product** | `products.hero_image_url` = `/assets/pendant-product.png` (seed) | /products card + /products/pendant + home product card | ~1200×900 (4:3), white/transparent bg | png/webp | ❌ **404 in prod on `main`** (real file is `src/assets/pendant-product.png`, not `public/assets/`). Fixed on `feat/frontend-polish` (copies to `public/assets/`) | wired via DB column; needs the file in `public/assets/` |
| **Pendant page hero** | `website_images` key `pendant_hero` | /pendant hero | ~1200×1200 (1:1) or 4:3 | png/webp | ⚠️ placeholder "Coming Soon" (key unseeded). Asset `src/assets/pendant-product.png` exists — upload it | needs `website_images` DB row |
| **Pendant page specs** | `website_images` key `pendant_specs` | /pendant specifications section | ~1200×900 | png/webp | ⚠️ placeholder. Asset `src/assets/pendant-specs.png` exists — upload it | needs `website_images` DB row |
| **OG / social card** | `public/og-image.png` (index.html `og:image`, `twitter:image`) | Link previews (FB/Twitter/WhatsApp) | **1200×630 (1.91:1)** | png/jpg | ✅ present (Care two-C on blue) — functional; a richer card w/ tagline is nice-to-have | wired (static path) |
| **Favicon** | `public/favicon.ico` | Browser tab | 16–256 multi-size .ico | ico | ✅ Care two-C | wired (manifest + index.html) |
| **PWA icon 192** | `public/icon-192.png` | Android/PWA | 192×192 | png | ✅ Care two-C | wired (manifest) |
| **PWA icon 512** | `public/icon-512.png` | PWA splash/install | 512×512 | png | ✅ Care two-C | wired (manifest) |
| **Apple touch icon** | `public/apple-touch-icon.png` | iOS home screen | 180×180 | png | ✅ Care two-C | wired (manifest + index.html) |

## NICE-TO-HAVE

| Image | Where | Used for | Dimensions | Format | State | Wiring |
|---|---|---|---|---|---|---|
| **Pill Dispenser product** | `products.hero_image_url` (slug `pill-dispenser`) | catalog (coming-soon card/detail) | ~1200×900 4:3 | webp/jpg | ⚠️ generic **Unsplash stock** (hotlinked) — replace with real/branded | wired via DB column |
| **Glucose Monitor product** | `products.hero_image_url` (slug `glucose-monitor`) | catalog (coming-soon card/detail) | ~1200×900 4:3 | webp/jpg | ⚠️ generic **Unsplash stock** | wired via DB column |
| **How-it-works hero** | `public/images/how-it-works-hero.jpg` (+ key `how_it_works_hero`) | /how-it-works hero | ~1600×1200 4:3 | jpg/webp | ✅ present (163 KB) | wired (path + optional DB row) |
| **Homepage pendant promo** | `website_images` key `homepage_pendant_promo` | (fetched in LandingPage but **never rendered** — dead) | — | — | n/a | ⚠️ orphaned lookup — remove from code, no image needed |
| **Logo (vector)** | `public/icon.svg` + inline SVG in `logo.tsx` | header/footer logo | vector | svg | ✅ present (Guardian shield) | wired |
| **Blog post images** | `blog_posts.image_url` (per post) | blog list/post cards | ~1200×630 | jpg/webp | n/a — author-supplied per post; **no default placeholder** | admin-supplied; a fallback placeholder is optional |

## Notes / flags
- **Homepage hero file size (7.5 MB) is the top issue** — it will hurt LCP/mobile badly. Re-export at ~1600px wide, webp, target <300 KB before launch.
- **GPS Pendant 404** is a launch blocker on `main` until `feat/frontend-polish` (copies the asset to `public/assets/`) is merged — or copy `src/assets/pendant-product.png` → `public/assets/pendant-product.png`.
- For `pendant_hero` / `pendant_specs`, the source assets already exist in `src/assets/` — they just need uploading into the `website-images` bucket (no new art required).
- The `og-image` and the full favicon/PWA set were regenerated from `public/icon.svg` for the ICE Alarm España rebrand (2026-09-02). See BRAND_ASSETS.md.
