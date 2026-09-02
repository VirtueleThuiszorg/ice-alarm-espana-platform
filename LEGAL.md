# LEGAL.md — Regulated-surface map & review tripwire (Spain · Netherlands · UK)

> ## ⚠️ READ FIRST — what this file is and is NOT
> This is **NOT legal advice** and following it does **NOT** make ICE Alarm España
> compliant. It is a *map* of where the law touches this product and a *tripwire*
> that tells Claude Code to **stop and flag for human/legal review** before building
> anything on a regulated surface. Compliance requires **qualified legal counsel** —
> at minimum one EU adviser (Spain + Netherlands) and one UK adviser, given Brexit
> split the regimes. CC must **flag, never adjudicate.** Nothing here is a ruling;
> every item marked *needs counsel* must be confirmed by a lawyer before you rely on it.
>
> **Highest-priority real-world action: retain counsel in the EU and the UK.** This
> file's main job is to get you there with the right questions (§4), not to answer them.

> Last researched: **2026-06-16.** AI Act status is moving (see §2) — re-check before
> relying on any date.

---

## 0. How this works (the one rule)

`CLAUDE.md` §12 points here. The protocol is the same fail-safe philosophy as the
Isabella safety gate: **when in doubt, stop — do not give false legal comfort.**

- When CC is about to build or change anything on a **regulated surface** (§5 lists
  them), it must **pause and flag for legal review** in its report, not decide it's fine.
- CC may draft *options* and summarise *known* requirements, always labelled
  "starting point — needs counsel", never "this is compliant".
- Append anything learned to §6 with a date. Verified-by-counsel facts get marked ✅COUNSEL.

## 1. Jurisdictions & who must sign off

| Region | Regime sources | Sign-off |
|---|---|---|
| **Spain** | EU GDPR + LOPDGDD; EU AI Act; EU MDR; EU consumer & PLD | EU counsel (ES-qualified) |
| **Netherlands** | EU GDPR + UAVG (AVG); EU AI Act; EU MDR; EU consumer & PLD | EU counsel (NL-qualified) — relevant given the NL parent group |
| **UK** | UK GDPR + Data Protection Act 2018; UK medical devices (MHRA/UKCA); UK consumer law; UK AI guidance (no AI Act equivalent yet) | UK-qualified counsel |

The EU framework covers Spain + NL together at the top level, but each has national
specifics (LOPDGDD vs UAVG). The UK is **separate** post-Brexit — do not assume EU
work covers it.

## 2. Regulated-surface map

> Status legend: 🔴 needs counsel before launch · 🟡 actionable now (start without counsel) · ⚪ monitor

### A. Data protection — 🔴 (heaviest day-one obligation)
- You process **special-category data** (health) plus **location** data of **vulnerable
  people**. Under GDPR Art. 9 this needs an explicit lawful basis and almost certainly a
  **Data Protection Impact Assessment (DPIA)**.
- Cross-border angle: EU↔UK data transfers need a valid mechanism (UK adequacy /
  appropriate safeguards). The NL parent adds an intra-group transfer question.
- **Needs counsel:** lawful basis per data type, DPIA, retention periods, processor
  agreements (Supabase, Twilio, Stripe/Mollie, the Lovable/Gemini AI gateway), DSAR &
  deletion handling, breach-notification process.

### B. EU AI Act (Reg 2024/1689) — 🔴 high-risk + 🟡 transparency
- Isabella (emergency triage / patient monitoring in a health context) is very likely a
  **high-risk** AI system by the Act's design.
- **Timeline (provisional, 2026-06-16):** the "Digital Omnibus on AI" (political
  agreement 7 May 2026) postpones high-risk obligations — use-based to **2 Dec 2027**,
  product-embedded to **2 Aug 2028** — but only once formally adopted/published (~July
  2026); until then 2 Aug 2026 technically remains live. **Confirm current status with
  counsel — do not rely on the deferral until it's in the Official Journal.**
- **🟡 ACTIONABLE NOW — Article 50 transparency is NOT deferred:** users must be clearly
  told they are interacting with an AI. This applies from 2 Aug 2026 regardless of the
  high-risk deferral. → Isabella's chat and voice surfaces need a clear AI disclosure.
  *(Ties into the Isabella gate work — same "honest and safe" theme.)*

### C. Medical device regulation — 🔴 (TOP question for counsel)
- **Is the pendant / fall-detection / SOS device a "medical device"?** Under EU MDR (and
  UK MHRA/UKCA) this turns on the **intended-purpose claims you make**. The answer
  forks your entire regulatory load: a medical device pulls in conformity assessment,
  CE/UKCA marking, and (under the AI Act) automatic high-risk status with the longer
  2028 timeline.
- **Do not let marketing copy make a medical claim until counsel rules on this.** Words
  like "detects", "monitors health", "diagnoses" can flip classification.

### D. Product liability — ⚪ (know the exposure)
- Revised EU PLD treats software/AI as products under **strict liability**; a system
  failing mandatory safety requirements can be **presumed defective**. Raises the cost of
  getting A–C wrong. Inform insurance/counsel decisions.

### E. Sector & professional rules — 🔴
- **Telecare / emergency-response** services may have country-specific licensing or
  standards (ES/NL/UK each differ).
- **Clinical staffing:** if nurses give clinical advice, professional-regulation and
  scope-of-practice rules apply per country.
- **Needs counsel:** whether ICE Alarm España is regulated as a care provider in each market.

### F. Consumer / marketing / accessibility — 🟡/🔴
- Distance-selling & consumer-rights rules (cancellation, pricing transparency) across
  all three markets.
- Advertising rules — especially **no unsubstantiated health/medical claims** (links to C).
- Accessibility obligations matter given the vulnerable, often older user base.

## 3. Actionable now (start without waiting for counsel)

- 🟡 **Isabella AI disclosure** — make chat & voice clearly state users are talking to an
  AI (Art. 50). Low effort, legally required from Aug 2026, and the right thing for
  vulnerable users.
- 🟡 **Record of processing** — list every data type, where it's stored, which processor
  touches it (Supabase, Twilio, Stripe, Mollie, Lovable/Gemini), and why. Counsel needs
  this to do anything; you can compile it now.
- 🟡 **Surface the existing GDPR plumbing** — the prior audit flagged a GDPR-deletion
  path; confirm it works and document it (feeds DSAR/deletion duties under A).
- 🟡 **Audit marketing copy for medical claims** — flag every "detect/monitor/health"
  phrase for counsel's device-classification call (C).

## 4. Questions for counsel (take this list to a lawyer)

1. Is the wearable/fall-detection device a **medical device** in EU (MDR) and UK (MHRA)?
   What claims keep it out of that class — or what does CE/UKCA require if it's in?
2. Is ICE Alarm España a **regulated care/telecare provider** in ES, NL, and UK?
3. Lawful basis + **DPIA** for processing health + location data of vulnerable adults.
4. Is Isabella **high-risk under the AI Act**, and what's our real deadline given the
   Digital Omnibus deferral once it's adopted?
5. EU↔UK and intra-group (NL parent) **data-transfer** mechanisms.
6. Processor/DPA agreements with Supabase, Twilio, Stripe, Mollie, Lovable/Gemini.
7. **Liability & insurance** posture given strict product liability for AI.
8. Consumer-contract, cancellation, and **advertising-claim** rules per market.
9. Clinical scope-of-practice for the nursing team in each country.

## 5. Tripwire — CC must STOP and flag before doing any of these

- Adding/changing a **consent flow**, privacy policy, or cookie/tracking behaviour.
- Adding a **new personal-data field**, or a new processor/integration that sees user data.
- Anything touching **data export, deletion, or retention** periods.
- Changing **Isabella's AI disclosure** or what she tells users about herself.
- Writing **marketing/product copy** that could be read as a medical/health claim.
- Any feature that sends user data **across borders** (EU↔UK) or to a new third party.
- Changing **emergency-escalation** logic in a way that affects what's promised to users.

For any of the above: CC drafts options, labels them "starting point — needs counsel",
and flags for Lee + legal review. CC does **not** ship it as "compliant".

## 6. Counsel-verified log (append-only) & review cadence

> Mark items ✅COUNSEL once a qualified lawyer confirms them, with date and who advised.
> Re-review this whole file quarterly and whenever entering a new market or adding a
> data-processing integration. *(No counsel-verified items yet — engage advisers first.)*
