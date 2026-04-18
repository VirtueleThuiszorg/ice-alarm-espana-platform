# Care Conneqt — Rebrand Checklist

This is the ticklist for converting your duplicated ICE v1 codebase into a live, fully-independent Care Conneqt platform. Work through it top to bottom. Commit often.

> **Golden rule:** the platform (features, code, dashboards, SOS, GPS, fall detection, nurse portal, family portal, AI agents, devices) stays 100% intact. Only branding + infrastructure changes.

---

## Phase 1 — Duplicate the repo ✅

- [ ] `git clone https://github.com/LeeSpain/ice-alarm-espanav1.git care-conneqt-platform`
- [ ] `cd care-conneqt-platform`
- [ ] `rm -rf .git .lovable` (break all links to ICE)
- [ ] `git init && git branch -M main && git add . && git commit -m "Initial from ICE v1"`
- [ ] Create new empty repo on GitHub: `care-conneqt-platform` (or your chosen name)
- [ ] `git remote add origin <new-repo-url>` and `git push -u origin main`
- [ ] Create a **new Lovable project** and connect it to the new GitHub repo (do NOT link to ICE's Lovable project)

## Phase 2 — Stand up new infrastructure (BEFORE touching code)

- [ ] **New Supabase project** — name it `care-conneqt-prod` (or similar). Note the project ref (e.g. `abcd1234`).
- [ ] `supabase link --project-ref <new-ref>` from within `supabase/` folder
- [ ] `supabase db push` to run ICE's migrations against the new project
- [ ] Deploy ICE's edge functions to the new project: `supabase functions deploy`
- [ ] **New Vercel project** linked to the new GitHub repo
- [ ] Copy `.env.example` → `.env` and fill in NEW Supabase URL + anon key + service role key
- [ ] Add the same env vars to Vercel project settings
- [ ] **New domain** — buy/point `careconneqt.com` (or similar) at Vercel
- [ ] Redeploy `gps-gateway/` as a separate service (Render/Railway/Fly) with new env vars
- [ ] Redeploy `render-worker/` the same way

## Phase 3 — Drop in the rebrand files

Overwrite these files in the new repo with the ones I generated:

- [ ] `index.html` → replace entirely (then fill in `<YOUR_NEW_SUPABASE_REF>` placeholders with your actual Supabase project ref)
- [ ] `public/manifest.json` → replace entirely
- [ ] `src/components/ui/logo.tsx` → replace entirely
- [ ] `src/index.css` → replace ONLY the top section (up to and including the `@layer base` `body` block). Keep everything below (animations, `@layer components`) untouched — paste it back in verbatim.

### Favicon & icon

- [ ] Export the two-C logo to a 512×512 PNG (white or transparent background) → save as `public/icon-512.png`
- [ ] Export to a `.ico` (64×64) → save as `public/favicon.ico`
  - Easy online tool: realfavicongenerator.net
- [ ] Optional: also generate 192×192 and 180×180 (apple-touch-icon) for better device coverage, and add entries to `manifest.json`

## Phase 4 — Find-and-replace brand strings

- [ ] Drop `rebrand-strings.sh` into the repo root
- [ ] Dry run first: `bash rebrand-strings.sh` — review every file it would touch
- [ ] Apply: `bash rebrand-strings.sh --apply`
- [ ] `git diff` — eyeball every change carefully
- [ ] Pay special attention to: `public/locales/*.json`, marketing pages, email templates in code
- [ ] Commit: `git add -A && git commit -m "Rebrand: ICE Alarm España → Care Conneqt"`
- [ ] Delete `rebrand-strings.sh` after (it's a one-shot tool)

## Phase 5 — Manual cleanups the script can't do

- [ ] `src/assets/ice-alarm-espana-logo.jpg` → rename or replace with a Care Conneqt logo asset
- [ ] Search for `"ICE"` as a standalone word (the script only catches phrases) — grep it, review each hit manually:
  - `grep -rn '\bICE\b' src/ public/`
- [ ] Check email templates in `supabase/functions/` for branded copy
- [ ] Update Supabase **Auth email templates** in the Supabase dashboard (Signup, Magic Link, Password Reset, Change Email) — use Care Conneqt copy
- [ ] Update Supabase **Auth redirect URLs** → new Care domain
- [ ] Update `package.json` → `"name"`, `"description"`, `"author"` fields
- [ ] Update `README.md` → describe Care Conneqt (or just delete ICE's and write a short new one)
- [ ] Delete or update `AUDIT_REPORT.md` (it references ICE)

## Phase 6 — External services

- [ ] Update the Service Worker (`public/sw.js` if present) — check for any ICE brand strings
- [ ] If using Stripe: create new products under Care Conneqt, update API keys in env vars
- [ ] If using Twilio/SMS: new sender ID/number if required
- [ ] Set up `noreply@careconneqt.com` email — configure SPF, DKIM, DMARC
- [ ] New analytics property (GA4 / Plausible / PostHog) — update tracking ID in code/env
- [ ] New Sentry project (if used)
- [ ] Social media handles — create `@CareConneqt` on relevant platforms

## Phase 7 — Legal & compliance

- [ ] Privacy policy — new page with Care Conneqt as data controller
- [ ] Terms & Conditions — Care Conneqt entity name, registered address
- [ ] Cookie notice — update brand name
- [ ] Company registration details in footer
- [ ] If handling health data: check if new AEPD (Spain) / ICO (UK) / AP (Netherlands) registration is needed, or update existing
- [ ] Update any compliance docs referencing ICE

## Phase 8 — Sanity pass

- [ ] Run locally: `npm install && npm run dev` — visually confirm Care branding
- [ ] Click through every major page:
  - [ ] Homepage / marketing pages
  - [ ] Auth (signup, login, password reset)
  - [ ] Member dashboard
  - [ ] Family dashboard
  - [ ] Nurse dashboard
  - [ ] Admin dashboard
  - [ ] Facility dashboard (if applicable)
  - [ ] Devices pages
  - [ ] AI chat (Clara / Guardian)
  - [ ] Pricing
  - [ ] Emergency alert flow (SOS button, fall detection simulation)
  - [ ] Onboarding
- [ ] Test email flows end-to-end (signup email, password reset, alerts)
- [ ] Run any existing tests: `npm test` or `npx vitest`
- [ ] Deploy preview to Vercel, test on real mobile device (PWA install, theme color, splash)
- [ ] Lighthouse audit — should score similarly to ICE

## Phase 9 — Go live

- [ ] Point production domain at Vercel
- [ ] Final Supabase RLS audit (same policies as ICE but on new project)
- [ ] Enable Supabase leaked-password protection (flagged in ICE's PRODUCTION_CHECKLIST)
- [ ] Set up monitoring/uptime checks
- [ ] Announce launch 🎉

---

## What will NOT change

Just to be explicit — none of this is touched:
- Any feature, page, component, hook, util, context, route, or page logic
- Supabase schema, RLS policies, edge function logic
- GPS gateway, render worker
- i18n structure (only the *strings inside* change where they mention "ICE Alarm")
- Auth flow, role system, dashboards
- Emergency alert types, SOS logic, fall detection, device integrations
- AI agents (Clara, Guardian)
- Pricing structure, Stripe integration logic

Care Conneqt IS ICE, just with different paint.
