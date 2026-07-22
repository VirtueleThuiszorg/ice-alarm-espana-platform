# FRONTEND_REDESIGN.md — public site redesign brief (Stage 4b)

> **Status: APPROVED (2026-07-22).** Execution remains gated on the AI-strip PR
> merging + Lee's screenshot sign-off checkpoint (§6). Decided 2026-07-22. Direction chosen:
> **warm-and-human primary, premium-product accents** (Lee delegated the call).
> This doc owns the redesign: direction, principles, page map, imagery, and the
> CC execution prompt. Runs AFTER the AI-strip PR merges (content final first).
> Constraint inherited from LAUNCH_SCOPE.md: pendant-only, Isabella chat is the
> only visible AI, EN/ES/NL, per-page audit gates everything.

---

## 1. Who we're designing for (the thesis)

Two people look at every page:
- **The wearer** (55–75+, expat in Spain, EN/NL speaking or local ES): wants to
  not feel old. Rejects anything that looks like a hospital or a stairlift ad.
  Needs big type, obvious buttons, no clutter (GOALS.md: usable by a
  75-year-old unaided).
- **The payer** (their adult child, often abroad): buying relief from worry.
  Needs trust fast: response times, real people, clear pricing, easy setup.

Design thesis in one line: **"Peace of mind that doesn't look like a medical
device."** Warmth sells it to the child; dignity makes the parent wear it.

## 2. Direction

- **Primary: warm and human.** Real photography of life being lived (garden,
  market, grandkids on a video call) — the pendant present but incidental.
  Soft, generous spacing. Rounded but not childish.
- **Accent: premium product.** The pendant itself gets one hero-grade,
  clean-background product shot treatment (consumer-electronics style, not
  catalog style). It should look chosen, not prescribed.
- **Supporting: quiet clinical trust.** Certifications, "calls answered in
  under X seconds", GDPR, Spanish emergency-services integration — present as
  calm proof points near CTAs, never as the personality.
- **Explicitly avoid:** stock photos of worried seniors clutching chests;
  red-alert fear messaging; hospital blues + white sterility; tiny grey text;
  anything that reads "mobility aid catalogue".

## 3. Design tokens (proposal — reconcile with BRAND_ASSETS.md)

BRAND_ASSETS.md remains the source of truth for logo + core palette. This
section proposes the *usage*, to be reconciled by CC in the first loop turn:
- **Palette roles:** one warm neutral background (paper/cream family, NOT pure
  clinical white); brand primary for CTAs only; ONE accent used sparingly;
  deep readable ink for text. Semantic red reserved exclusively for
  SOS/emergency contexts — never decorative.
- **Type:** friendly humanist display for headlines; highly legible body face;
  **minimum 18px body on public pages** (audience), 1.6 line height; type
  scale tuned so the landing hero headline is confident, not shouty.
- **Accessibility floor (non-negotiable, audited):** WCAG AA contrast
  everywhere, 48px minimum touch targets, visible keyboard focus, reduced
  motion respected, no information carried by colour alone.
- **Signature element (the one memorable thing):** a recurring soft
  "response ripple" motif — concentric rounded arcs radiating from the
  pendant/SOS button, used in the hero and section dividers. It visualises
  "press once, help radiates out" — the product's entire promise — and is
  ownable, unlike generic gradients. Used calmly; static or one gentle
  animation on the hero only.

## 4. Page-by-page map (public site)

Every page: keep / restructure / merge / hold. Nothing deleted (LAUNCH_SCOPE).

| Page | Verdict | Redesign notes |
|---|---|---|
| Landing `/` | **Restructure heavily** | New narrative order: (1) Hero — human photo + one-line promise + single CTA "Get protected" + trust strip (response time, IVA-incl price from DB); (2) How it works in 3 steps (press → we answer → help arrives), ripple motif; (3) The pendant — premium product shot + 4 benefit cards (waterproof, GPS, fall detection, battery); (4) Pricing — both plans, monthly/annual toggle, "IVA incluido"; (5) Human proof — real testimonial(s), no fake claims; (6) For families section (speaks to the payer: app/dashboard visibility); (7) Final CTA. Isabella chat widget bottom-right, restyled to brand. |
| Pendant `/pendant` | **Restructure** | Now canonical (PendantPage). Product-led: gallery/hero shot, specs as friendly benefits (not a spec table first), lifestyle photos, FAQ accordion, pricing block, CTA into /join. |
| How it works `/how-it-works` | **Keep, simplify** | Collapse to the 3-step story + what happens on an alert (timeline), family dashboard peek, CTA. Kill any AI-era leftovers post-strip. |
| Pricing | **Merge into landing + pendant** | No standalone pricing page at launch; pricing blocks read from DB with toggle. (If a /pricing route exists, it renders the same shared pricing component.) |
| Join `/join` wizard | **Keep flow, reskin** | 7 steps stay; redesign for the audience: one question group per screen, huge inputs, progress in plain words ("Step 2 of 7 — Your address"), reassurance microcopy near payment. Payment step shows exactly what's charged (device 21% IVA / subscription 10% IVA line items). |
| Partner public `/partner*` | **Keep, light reskin** | Same tokens; business-facing tone is fine. Commission proposition stated plainly. |
| Help/FAQ `/help` | **Keep, light reskin** | Bigger type, search prominent, categories as large tappable cards. |
| Blog | **Hold (skin only)** | Apply tokens/typography; no content redesign at launch. |
| Contact | **Keep, simplify** | Phone number huge (audience prefers calling), then form. |
| Legal (terms/privacy) | **Skin only** | Readable typography; GDPR AI-disclosure stays per AI-strip decision. |
| Login pages | **Reskin** | Same tokens; member login especially large-type. |
| Members `/dashboard` shell | **Tokens only in this stage** | Full member-area redesign is Stage 5 territory; this stage only applies the new tokens/nav styling so portals don't feel like two products. |
| Chat widget | **Restyle, keep name** | Isabella name stays; bubble/type/colours match new tokens; opening message reframed to service voice. |

## 5. Imagery brief (the human bottleneck)

CC cannot create these; they gate the redesign's final quality. Slots per
IMAGE_SPEC.md, replacing placeholders:
1. **Hero lifestyle** (landing): natural light, one person 60s–70s mid-activity
   (garden/terrace/market), pendant visible but incidental, Spain-plausible
   setting. Warm grade. Landscape ≥2400px.
2. **Product hero** (pendant page + landing section): EV-07B on clean warm
   background, soft shadow, consumer-electronics treatment. 3 angles.
3. **Worn detail**: close crop, pendant on a real person, hand/collar context.
4. **Family/payer shot**: adult child on phone/laptop seeing dashboard, warm.
5. **Response team** (optional but powerful): a real (or realistic) operator
   with headset, warm not call-center-grim — supports "real people answer".
Interim: CC may use high-quality licensed placeholders ONLY if flagged
`PLACEHOLDER-` in filename and listed in the PR; launch checklist blocks
go-live on real imagery for slots 1–2 minimum.

## 6. What "done" means (deterministic, per §16 + page audit)

- All public routes pass the page audit in EN/ES/NL (0 regressions, fewer
  fixmes than before where keys were the cause).
- Lighthouse accessibility ≥ 95 on landing, pendant, join step 1; performance
  ≥ 80 on mobile for landing (the 988 KB i18n bundle likely forces the
  namespace-split backlog item — if so, flag, don't silently absorb).
- Body text ≥18px, touch targets ≥48px, AA contrast — spot-audited.
- Pricing everywhere renders from DB (no literals), correct per-line IVA.
- No fear-based copy; no fake claims; copy voice consistent (service-centric,
  active voice, sentence case).
- Visual review checkpoint: CC posts full-page screenshots (desktop + 390px
  mobile) of landing + pendant + join step 1 BEFORE opening the PR; Lee
  approves look before merge. Aesthetic sign-off is human, always.

## 7. CC execution prompt (Stage 4b — run only after AI-strip PR merges)

/goal Execute FRONTEND_REDESIGN.md on branch feat/redesign-public. Read it
fully, plus BRAND_ASSETS.md and LAUNCH_SCOPE.md first. Reconcile §3 token
proposals with BRAND_ASSETS.md (brand doc wins on logo/core colours; this doc
wins on usage/scale/accessibility floor) and commit the resolved tokens as a
single tokens/theme change first. Then implement the §4 page map top to
bottom, one page per commit, audit-first (never commit a page before its
audit passes). Use PLACEHOLDER- imagery per §5 and maintain a
PLACEHOLDERS.md list. Meet every §6 criterion. Post the §6 screenshot set
and STOP for Lee's visual approval before opening the PR. PR only, no merge.
Cap: 60 turns.

## 8. Open items
- Lee: source/commission photography for §5 slots 1–3 (the only true
  human-world dependency).
- Reconcile: if BRAND_ASSETS.md core palette conflicts hard with the warm
  direction (e.g. clinical blue primary), CC flags it turn 1 and Lee decides.
- Post-redesign: members-area redesign (Stage 5) inherits the tokens.
