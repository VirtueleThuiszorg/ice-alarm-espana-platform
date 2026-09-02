# BRAND_IDENTITY.md — ICE Alarm España brand, single source of truth

**Settled 2 September 2026.** Supersedes the Care Conneqt two-C mark and the indigo/orange
"v" mark, both retired. If another document disagrees with this one, this one is right.

---

## 1. The mark — "The Guardian"

A shield with a heartbeat knocked out of it. Protection plus monitoring, in one shape.

Canonical source is `public/icon.svg`, `viewBox="0 0 100 100"`, two paths, no gradients:

```
shield:  M50 7 L87 21 V50 C87 71.5 71 87.5 50 93.5 C29 87.5 13 71.5 13 50 V21 Z
ecg:     M25 52 H37 L43 38 L52 66 L58 52 H75      (stroke-width 7, round cap + join)
ecg @≤18px:  M27 52 H38 L44 40 L52 64 L58 52 H73  (stroke-width 10)
```

The heartbeat is **knocked out, not drawn on top** — one shape, so it engraves, embroiders and faxes without a second colour pass.

**Lockup — settled.** The full name on one line: mark, then `ICE Alarm` (Archivo 700) + `España` (Archivo 500, Slate). Mark-to-type ratio ~2:1. It matches the registered company exactly and carries the Spain signal that reassures expats. The two alternatives (ICE-dominant, and dropping España) were considered and rejected — recorded on the Lockups board so the question does not reopen.

**Six approved forms, and no others:** primary lockup (one line) · stacked (mark above, `ICE Alarm` / `España`) · mark alone · reversed (white shield, Ink heartbeat) · one-colour Ink · outline (line work only, for engraving and embossing).

**Never:** stretched, recoloured, rotated, shadowed, gradient, on a busy ground, or with the name re-set in another face.

**Clear space:** half the shield's height on every side.
**Minimum size:** 16 px mark on screen · 8 mm mark in print · 150 px wide for the one-line lockup (below that, use the stacked form).

## 2. Colour

| Token | Hex | HSL | Use |
|---|---|---|---|
| ICE Red | `#C8102E` | `350 85% 42%` | brand, primary action |
| Red Deep | `#A00D24` | — | hover / pressed |
| Red Wash | `#FBEAEC` | — | tints, badges, focus halo |
| Ink | `#14181F` | — | text, call-centre chrome |
| Surface | `#1E242E` | — | raised dark cards |
| Slate | `#5A6470` | — | secondary text |
| Paper | `#FBF9F7` | — | page ground |

**Accessibility:** ICE Red on white is **5.9:1** (passes AA). The old coral `#E74C3C` was 3.8:1 and failed AA on every red button in the app — this fixes it in passing.

**Alert and status colours do not change.** `--alert-sos 0 84% 55%`, `--alert-fall 25 95% 53%`, `--alert-battery 45 93% 47%`, `--alert-checkin 210 100% 50%`, `--alert-resolved 142 76% 36%`, and all `--status-*`. They are interface, not identity.

For alert **label text** on white, use darkened variants so the type passes AA — the swatch, dot and left border keep the true colour: SOS `#B31414` · fall `#9A4A06` · battery `#7A5C00` · check-in `#005BB5` · resolved `#12813A`.

**The one rule:** brand red never appears on an alert, and an alert colour never appears on a button. Red meaning two things on one screen makes an operator hesitate.

## 3. Typography

- **Archivo** — display, headings, wordmark. Weights 600 / 700 / 800. Replaces DM Sans.
- **Source Sans 3** — body and UI. Weights 400 / 600.
- Both carry complete Spanish and Dutch diacritics including `ñ ¿ ¡ Ĳ`. The current logo file renders the accents in "España" incorrectly; this ends that.
- Scale: Display 56/800 · H1 40/800 · H2 28/700 · H3 20/700 · Body large 18/400 · Body 15/400 · Small 13/400 · Caption 10/600 uppercase 0.14em.
- **Member-facing pages start at 18px, not 15px.** The reader is the reason the company exists and is statistically likely to be long-sighted.

## 4. Icon set — one source, nine exports

All exported from `public/icon.svg`, never redrawn: `favicon.ico` · `favicon-16x16.png` · `favicon-32x32.png` · `favicon-48x48.png` · `icon-192.png` · `icon-512.png` · `apple-touch-icon.png` · maskable variant (shield inside the 80% safe circle) · `og-image.png` 1200×630.

🔴 **`public/favicon.ico` currently contains Lovable's own gradient-heart logo.** It has been in every browser tab since the platform was built. Highest-visibility single fix in the rebrand.

## 5. Media

| Surface | Rule |
|---|---|
| **Web** | One-line lockup at 38 px in the header. One red button per page (`Protéjase hoy`), repeated down the page; the secondary action is always an outline. |
| **Email** | Red band, white mark, one-line lockup. Sender `ICE Alarm España <info@icealarm.es>`. Alert emails use SOS `#ED2C2C` for the status band and brand red for the header — never the reverse. No no-reply addresses. |
| **Social** | Avatar is the **mark alone on red**, never the lockup — the name is unreadable at 32 px. Handle `@icealarmes`. Post templates: red statement 1:1, photo 1:1 with an Ink scrim from 62%, 9:16 story with 14% safe margins. |
| **Photography** | Members mid-activity, two generations together, the real operator at her desk. Never: a person on the floor, anonymous hands, studio stock smiles. Warm Mediterranean grade, no cold clinical blue. Ink scrim for text, never red. Written model release for every face. |
| **Motion** | Logo build 1.4 s, **at the end of the video, not the start**. Cross-fade 200 ms only. Lower third: Ink panel, red left rule. End card holds 2.5 s minimum. Captions on, safe margins enforced — the Video Hub brand locks stay locked. |
| **Documents** | Letterhead: mark top-left, red rule, entity in the footer — never a red band across a letter. Invoice: the only red is the total. Slides: full red for title and dividers only; mark alone at 15 px in the footer. |

Every document surface carries **ICE Alarm España S.L. · CIF B24731531**.

## 6. Voice

**Tagline — recommended:** "Someone always answers." / "Siempre responde alguien." / "Er neemt altijd iemand op." *(Two alternatives on the Voice board; not final.)*

**Name:** `ICE Alarm España` in full on first mention and anything legal; `ICE Alarm` in running copy; never `ICE` alone in body text, never `Ice Alarm`, `ICE-Alarm`, `I.C.E.`, or `Espana` without the ñ.

**Words:** member / socio (not customer, client, user) · pendant / colgante (not device, unit) · SOS button (not panic button) · older people (not the elderly) · lives with (not suffers from).

**Boilerplate:** ICE Alarm España provides 24-hour personal emergency response for residents and expatriates across Spain. GPS pendants with automatic fall detection connect to a monitoring centre staffed by real people in Spanish, English and Dutch — day and night, every day of the year.

**Legal footer:** ICE Alarm España S.L. · CIF B24731531 · [DOMICILIO SOCIAL]

## 7. Still open

1. **Tagline** — three options on the Voice board; recommended is "Someone always answers." Needs a native Spanish read before it ships.
2. **Photography** — direction is written, the shoot is not booked. Nothing on the Web or Social boards is finished until real images exist.
3. **The bracketed items** — registered address, 24 h phone number, and the invoice figures.
4. **The mark as vector files** — the SVG geometry is specified above; the nine icon exports still need producing.

Once the tagline is settled, Phase 1 of the rebrand plan can run: theme tokens, `logo.tsx`, `index.html`, `manifest.json`, the icon set and the 62 hardcoded hexes.
