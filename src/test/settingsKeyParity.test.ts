// @vitest-environment node
//
// A SETTINGS SWITCH MUST WRITE THE ROW SOMETHING READS.
//
// Three of these have shipped now, all the same shape and none of them visible on screen:
//
//   B3   `SettingsPage` wrote `settings_registration_fee_enabled`; the wizard, the server and
//        the shared quote read `registration_fee_enabled`. Turning the fee off still charged
//        €59.99. The first fix changed the CONSTANT to the canonical name — and missed that
//        `save-api-keys` derives the row name from the `service` argument, so the write still
//        landed in `settings_registration_fee_enabled`. Half-fixed is not fixed.
//   D-17 The checkout card writes `checkout_payment_methods` and
//        `checkout_async_events_confirmed` under `service: "settings"`, so both landed under
//        `settings_checkout_*`, which nothing reads. Its switches did nothing at all — including
//        the one that decides whether SEPA is offered, i.e. whether a customer can pay and never
//        be activated.
//
// THE MECHANISM, once, because every one of these is the same sentence:
//
//     save-api-keys:  finalKey = key.startsWith(`${service}_`) ? key : `${service}_${key}`
//
// The `service` is not a label. It decides the row name. A card that passes the wrong one saves
// successfully, reports success, and writes a row no reader looks for.
//
// SO THIS TEST IS ABOUT THE STORED NAME, and it is generalised in both directions:
//   1. every key an admin settings card writes has at least one reader under the EXACT name it
//      is stored as;
//   2. every key a reader reads has a writer — a card, a direct upsert, or a migration seed.
//
// WHY SOURCE-READ AND NOT RENDERED. A rendered page reads and writes whichever string it holds,
// quite happily, and looks correct doing it. The defect is that two files disagree about a
// string, so the assertion has to be about those strings, taken from both sides.
//
// KNOWN ORPHANS ARE LISTED, NOT HIDDEN. `WRITER_ORPHANS` / `READER_ORPHANS` below are the pairs
// this scan found and nobody has ruled on yet — mostly credentials where choosing a family means
// moving a live value, which is a migration and a decision, not a rename. Both lists are asserted
// EXACTLY, so a new orphan turns this suite red instead of joining a list quietly.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** A `system_settings` key: lower snake_case with at least one underscore. */
const KEY_SHAPE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/** What `save-api-keys` actually stores, copied from its one line of arithmetic. */
const storedAs = (key: string, service: string) =>
  key.startsWith(`${service}_`) ? key : `${service}_${key}`;

// ── the files we scan ───────────────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const SOURCES = [...walk("src"), ...walk("supabase/functions")].filter(
  (f) =>
    !f.startsWith(join("src", "test")) &&
    // Generated, 20k lines, and names every column of every table.
    f !== join("src", "integrations", "supabase", "types.ts")
);

/**
 * Comments out, before anything is scanned.
 *
 * Not a nicety: this file's own subject matter is key names and `service` literals, so the fix
 * for D-17 arrived with a comment explaining that `service: "settings"` was wrong — and the
 * scanner read that sentence as a second service the card uses. A test that cannot tell code
 * from prose about code reports the bug it just fixed. Block comments and whole-line `//`
 * comments only, so a `https://` inside a string survives.
 */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const TEXT = new Map(SOURCES.map((f) => [f, stripComments(read(f))]));

// ── resolving a key expression to the literal(s) it stands for ─────────────────────────────────
//
// Settings keys in this codebase are always SCREAMING_CASE constants, members of a SCREAMING_CASE
// object, or plain literals. Resolution is deliberately restricted to those shapes: an earlier
// draft resolved any identifier and picked up `const key = "ice_session_id"` from the analytics
// tracker, which is not a settings key at all.

const CONSTANTS = new Map<string, string[]>();

function indexConstants() {
  for (const text of TEXT.values()) {
    // const NAME = "some_key"
    for (const m of text.matchAll(/(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*"([^"]+)"/g)) {
      if (KEY_SHAPE.test(m[2])) CONSTANTS.set(m[1], [m[2]]);
    }
    // const NAME = { … } / [ … ] — record both NAME.prop and the whole set as NAME
    for (const m of text.matchAll(/(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*([{[])/g)) {
      const [name, open] = [m[1], m[2]];
      const close = open === "{" ? "}" : "]";
      let depth = 0;
      let end = -1;
      for (let i = m.index! + m[0].length - 1; i < text.length; i++) {
        if (text[i] === open) depth++;
        else if (text[i] === close && --depth === 0) {
          end = i;
          break;
        }
      }
      if (end < 0) continue;
      const body = text.slice(m.index!, end + 1);
      const values: string[] = [];
      for (const p of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*"([^"]+)"/g)) {
        if (KEY_SHAPE.test(p[2])) {
          values.push(p[2]);
          CONSTANTS.set(`${name}.${p[1]}`, [p[2]]);
        }
      }
      for (const p of body.matchAll(/"([^"]+)"/g)) if (KEY_SHAPE.test(p[1])) values.push(p[1]);
      // `const HOLIDAY_POLICY_KEYS = [FESTIVOS_COUNT_KEY, …]` — a list of other constants.
      for (const p of body.matchAll(/^\s*([A-Z][A-Z0-9_]*),?\s*$/gm)) {
        values.push(...(CONSTANTS.get(p[1]) ?? []));
      }
      if (values.length) {
        CONSTANTS.set(name, [...new Set([...(CONSTANTS.get(name) ?? []), ...values])]);
      }
    }
  }
}
indexConstants();

function resolveKeys(expr: string): string[] {
  const e = expr.trim().replace(/^\.\.\./, "").replace(/^Object\.values\((.*)\)$/, "$1").trim();
  if (/^"[^"]+"$/.test(e)) {
    const literal = e.slice(1, -1);
    return KEY_SHAPE.test(literal) ? [literal] : [];
  }
  if (/^[A-Z][A-Z0-9_]*(?:\.[A-Za-z_$][\w$]*)?$/.test(e)) return CONSTANTS.get(e) ?? [];
  return [];
}

// ── READERS: who looks a key up ────────────────────────────────────────────────────────────────

/** key -> the files that read it. */
const readers = new Map<string, Set<string>>();
const note = (map: Map<string, Set<string>>, key: string, file: string) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(file);
};

for (const [file, text] of TEXT) {
  if (file.includes("save-api-keys")) continue; // the writer itself, not a reader
  if (!text.includes('from("system_settings")') && !text.includes("from('system_settings')")) {
    continue;
  }
  for (const m of text.matchAll(/\.eq\(\s*"key"\s*,\s*([^),]+?)\s*\)/g)) {
    for (const k of resolveKeys(m[1])) note(readers, k, file);
  }
  for (const m of text.matchAll(/\.in\(\s*"key"\s*,\s*\[?([^\])]*)/g)) {
    for (const part of m[1].split(",")) for (const k of resolveKeys(part)) note(readers, k, file);
  }
  // `.in("key", VOICE_KEYS)` / `.in("key", Object.values(DEVICE_KEYS))`
  for (const m of text.matchAll(/\.in\(\s*"key"\s*,\s*([^[)][^)]*)\)/g)) {
    for (const k of resolveKeys(m[1])) note(readers, k, file);
  }
  // `settingsMap[KEY.X]` — SettingsPage reads every row and looks them up by constant.
  for (const m of text.matchAll(/settingsMap\[\s*([^\]]+?)\s*\]/g)) {
    for (const k of resolveKeys(m[1])) note(readers, k, file);
  }
}

// ── WRITERS ────────────────────────────────────────────────────────────────────────────────────
//
// Three kinds, and all three count as "something writes this row":
//   a. an admin card, through `save-api-keys` — the service prefix applies
//   b. a direct `.upsert()` on `system_settings` from the screen that owns those keys — the key
//      is stored exactly as given
//   c. a migration seed

/**
 * Where each card's keys come from. Declared, because they arrive as constants from four
 * different modules and a shared object-builder; guessing at every snake_case literal in a
 * component would sweep up DB column names and call it a settings key.
 *
 * THE TABLE IS CHECKED FOR COMPLETENESS below: the set of files calling `save-api-keys` is
 * discovered by scanning, and a caller missing from here fails the suite. A new settings card
 * cannot skip this test by not being listed.
 */
const CARD_KEY_SOURCES: Record<string, string[]> = {
  "src/pages/admin/SettingsPage.tsx": ["KEY"],
  "src/components/admin/settings/CheckoutPaymentMethodsCard.tsx": [
    "CHECKOUT_PAYMENT_METHODS_KEY",
    "ASYNC_EVENTS_CONFIRMED_KEY",
  ],
  "src/components/admin/settings/FirebaseConfigCard.tsx": ["FIREBASE_SETTING_KEYS"],
  "src/components/admin/settings/SocialMediaSection.tsx": ["@inline-properties"],
  "src/components/admin/HolidayPolicyCard.tsx": ["HOLIDAY_POLICY_KEYS"],
};

const cardCallers = SOURCES.filter((f) => TEXT.get(f)!.includes('invoke("save-api-keys"'));

/** All of a card's declared keys, from the table above. */
function declaredKeys(file: string): string[] {
  const text = TEXT.get(file)!;
  const keys = new Set<string>();
  for (const source of CARD_KEY_SOURCES[file] ?? []) {
    if (source === "@inline-properties") {
      // `saveDefaultsMutation.mutate({ settings_youtube_default_visibility: … })` — the keys are
      // written out as property names in the component itself.
      for (const m of text.matchAll(/^\s*([a-z][a-z0-9_]*)\s*:/gm)) {
        if (KEY_SHAPE.test(m[1])) keys.add(m[1]);
      }
    } else for (const k of resolveKeys(source)) keys.add(k);
  }
  return [...keys];
}

/** From `i`, where `text[i]` is `open`, the index of the matching `close`. */
function balanced(text: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** Split an argument list on its top-level commas. */
function args(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((a) => a.trim()).filter(Boolean);
}

/**
 * ONE SAVE, PAIRED WITH THE SERVICE IT PASSES.
 *
 * The first draft of this asked the weaker question — "is there ANY service in this file under
 * which this key would keep its name?" — and a mutant walked through it: reverting the test-mode
 * toggle to the default service left `"registration"` in the file at the fee's call site, so the
 * check still found a match for `registration_test_mode_enabled` and went green while the toggle
 * wrote a dead row. A file-wide answer cannot see a key handed to the wrong handler, which is
 * exactly the defect. So each call is its own group.
 */
interface Group {
  file: string;
  service: string;
  keys: string[];
  /** For the failure message: the first line of the call. */
  where: string;
}

function groupsIn(file: string): Group[] {
  const text = TEXT.get(file)!;
  const fallback = declaredKeys(file);
  const defaultService = text.match(/service\s*=\s*"([a-z][a-z0-9_]*)"/)?.[1];
  const groups: Group[] = [];

  /** The keys an argument expression carries. */
  const keysOf = (expr: string): string[] => {
    if (expr.startsWith("{")) {
      const keys = new Set<string>();
      for (const m of expr.matchAll(/\[\s*([^\]]+?)\s*\]\s*:/g)) {
        for (const k of resolveKeys(m[1])) keys.add(k);
      }
      for (const m of expr.matchAll(/(?:^|[{,]\s*)"?([a-z][a-z0-9_]*)"?\s*:/g)) {
        if (KEY_SHAPE.test(m[1])) keys.add(m[1]);
      }
      if (keys.size) return [...keys];
    }
    if (/^[a-z][\w$]*$/.test(expr)) {
      // `saveKeys(updates)` — the object was filled in by `updates[KEY.X] = …` above it. Taken
      // file-wide, which over-approximates when two handlers share the name: it can attribute a
      // key to a service it is not actually sent under, and that direction only ever ADDS a
      // failure. It cannot hide one.
      const keys = new Set<string>();
      const assign = new RegExp(`\\b${expr}\\[\\s*([^\\]]+?)\\s*\\]\\s*=`, "g");
      for (const m of text.matchAll(assign)) for (const k of resolveKeys(m[1])) keys.add(k);
      if (keys.size) return [...keys];
    }
    // A builder call (`holidayPolicyToSettings(next)`) or a constant: fall back to everything the
    // card declares. Over-approximating again, and in the same safe direction.
    return fallback;
  };

  // `saveKeys({ … })` / `saveKeys({ … }, "registration")` — a card's own helper.
  for (const m of text.matchAll(/\bsaveKeys\(/g)) {
    const open = m.index! + m[0].length - 1;
    const close = balanced(text, open, "(", ")");
    if (close < 0) continue;
    const parts = args(text.slice(open + 1, close));
    const literal = parts[1]?.match(/^"([a-z][a-z0-9_]*)"$/)?.[1];
    const service = literal ?? defaultService;
    if (!service) continue;
    groups.push({
      file,
      service,
      keys: keysOf(parts[0] ?? ""),
      where: `saveKeys(…${literal ? `, "${literal}"` : ""})`,
    });
  }

  // `invoke("save-api-keys", { body: { service: "x", keys: … } })` — the direct shape.
  for (const m of text.matchAll(/invoke\(\s*"save-api-keys"\s*,/g)) {
    const open = text.indexOf("{", m.index!);
    const close = balanced(text, open, "{", "}");
    if (open < 0 || close < 0) continue;
    const body = text.slice(open, close + 1);
    const service = body.match(/service:\s*"([a-z][a-z0-9_]*)"/)?.[1];
    // `service` may be a variable here (SettingsPage forwards its helper's argument); those
    // saves are covered by the `saveKeys` groups above.
    if (!service) continue;
    const keysAt = body.indexOf("keys:");
    const expr = keysAt < 0 ? "" : args(body.slice(keysAt + 5))[0] ?? "";
    groups.push({ file, service, keys: keysOf(expr), where: `invoke(save-api-keys, "${service}")` });
  }

  return groups;
}

const groups = cardCallers.flatMap(groupsIn);

/** Keys that at least one group stores under their own name. */
const savedCorrectly = new Set<string>();
for (const g of groups) {
  for (const key of g.keys) if (storedAs(key, g.service) === key) savedCorrectly.add(key);
}

/** storedKey -> the group that writes it. */
const cardWrites = new Map<string, { file: string; service: string; sent: string }>();
for (const g of groups) {
  for (const key of g.keys) {
    const stored = storedAs(key, g.service);
    // A key that IS saved properly by some group does not also get reported as an orphan for the
    // group that renames it — that group is a defect, and it is the rename check's to report.
    if (stored !== key && savedCorrectly.has(key)) continue;
    if (!cardWrites.has(stored)) cardWrites.set(stored, { file: g.file, service: g.service, sent: key });
  }
}

/** Keys written straight to the table, and template prefixes for the computed ones. */
const directWrites = new Set<string>();
const writtenPrefixes = new Set<string>();

for (const [file, text] of TEXT) {
  if (file.includes("save-api-keys")) continue;
  if (!/from\("system_settings"\)[\s\S]{0,400}?\.(upsert|insert|update)\(/.test(text)) continue;
  // Everything this file names as a settings key, from its own constants and reads. A screen
  // that upserts `system_settings` owns the keys it also reads.
  for (const m of text.matchAll(/"([a-z][a-z0-9_]+)"/g)) {
    if (KEY_SHAPE.test(m[1])) directWrites.add(m[1]);
  }
  for (const m of text.matchAll(/\.in\(\s*"key"\s*,\s*([^)]+)\)/g)) {
    for (const k of resolveKeys(m[1].replace(/^\[|\]$/g, ""))) directWrites.add(k);
  }
  // A computed key — `partner_pricing_${type}_…`, `notify_channel_${c}` — cannot be matched
  // exactly, so its stem counts as a writer for anything under it.
  for (const m of text.matchAll(/`([a-z][a-z0-9_]*_)\$\{/g)) writtenPrefixes.add(m[1]);
}

/** Keys a migration seeds or renames. */
const seeded = new Set<string>();
for (const file of readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"))) {
  const text = read(join("supabase/migrations", file));
  const statements = [...text.matchAll(/INSERT\s+INTO\s+(?:public\.)?system_settings[\s\S]*?;/gi)];
  for (const s of statements) {
    for (const m of s[0].matchAll(/'([a-z][a-z0-9_]+)'/g)) if (KEY_SHAPE.test(m[1])) seeded.add(m[1]);
  }
  for (const m of text.matchAll(/system_settings[\s\S]{0,200}?key\s*=\s*'([a-z][a-z0-9_]+)'/gi)) {
    if (KEY_SHAPE.test(m[1])) seeded.add(m[1]);
  }
}

const hasWriter = (key: string) =>
  cardWrites.has(key) ||
  directWrites.has(key) ||
  seeded.has(key) ||
  [...writtenPrefixes].some((p) => key.startsWith(p));

// ── the known orphans, listed on purpose ───────────────────────────────────────────────────────

/**
 * Keys the page's own constants name unprefixed while the save stores them prefixed. Left alone
 * DELIBERATELY: for two of them the prefixed row is the one the live system reads, so "fixing"
 * the constant would move a working credential. What is wrong here is the `KEY` entry and the
 * page's masked display, not the write — and choosing a family for the other two means moving a
 * live value, which is a migration and Lee's call.
 */
const RENAMED_ON_THE_WAY_IN: Record<string, string> = {
  stripe_secret_key:
    "Stored as `settings_stripe_secret_key`, which create-checkout, stripe-webhook, " +
    "stripe-sync-prices, send-payment-link and admin-subscription-action all read. The WRITE IS " +
    "CORRECT; the page's masked display reads the unprefixed row, so a live key shows as unset.",
  stripe_webhook_secret:
    "Same: stored and consumed as `settings_stripe_webhook_secret`, displayed from the " +
    "unprefixed row. The write is right, the read is not.",
  stripe_publishable_key:
    "Stored as `settings_stripe_publishable_key` and read by nothing at all — the page writes " +
    "one row and reads another, and no function consumes either.",
  google_maps_api_key:
    "Stored as `settings_google_maps_api_key`; nothing reads that, and the page reads the " +
    "unprefixed row. A key typed into this field reaches nothing.",
};

/**
 * A card writes this row and nothing reads it. Each one needs a ruling on which family wins and,
 * where a live value already exists, a P5-style migration to move it — so they are listed rather
 * than renamed here.
 */
const WRITER_ORPHANS: Record<string, string> = {
  settings_stripe_publishable_key:
    "SettingsPage saves it here and reads `stripe_publishable_key`; nothing else reads either. " +
    "Publishable, so not a leak — but the field shows blank after saving.",
  settings_google_maps_api_key:
    "Same shape: written prefixed, read unprefixed by the page alone. Nothing on the map path " +
    "reads a settings row at all, so a key typed here reaches nothing.",
};

/**
 * A reader looks this row up and no card, upsert or migration writes it. Every one is a value
 * somebody set by hand in the SQL editor or in Edge secrets; the row is real, the screen for it
 * is not.
 */
const READER_ORPHANS: Record<string, string> = {
  stripe_secret_key:
    "SettingsPage's masked display reads the unprefixed row while the page writes — and five " +
    "functions correctly read — `settings_stripe_secret_key`. The WRITE is right; this read " +
    "shows the live key as unset.",
  stripe_publishable_key: "The read half of settings_stripe_publishable_key above.",
  stripe_webhook_secret:
    "Same again: written and consumed as `settings_stripe_webhook_secret`, displayed from the " +
    "unprefixed row.",
  google_maps_api_key: "The read half of settings_google_maps_api_key above.",
  admin_whatsapp_number: "Read by ai-execute-action. Set by hand; no screen offers it.",
  settings_call_centre_phone: "Read by voice-handler. Set by hand; no screen offers it.",
  settings_email_provider:
    "Read by send-member-update-request and send-payment-link. Set by hand; no screen offers it.",
  settings_twilio_api_key_sid:
    "Read by notify-staff-whatsapp. Its sibling `_secret` is on the notification matrix; the sid " +
    "is not, so the pair cannot be set from one place.",
};

describe("what an admin settings card writes is what something reads", () => {
  it("every save-api-keys caller is covered by this test", () => {
    // Discovery, not a hardcoded list: a new card that saves settings and is not declared above
    // fails here rather than escaping the parity check.
    expect([...cardCallers].sort()).toEqual(Object.keys(CARD_KEY_SOURCES).sort());
    // And the declaration has to actually resolve to keys, or "covered" would mean nothing.
    for (const file of cardCallers) {
      const mine = groups.filter((g) => g.file === file);
      expect(mine.length, `${file}: no save site found`).toBeGreaterThan(0);
      expect(
        mine.flatMap((g) => g.keys).length,
        `${file}: no keys resolved from ${CARD_KEY_SOURCES[file]}`
      ).toBeGreaterThan(0);
      // Every key the card declares must belong to some group, or a save could slip past the
      // pairing below by being made in a shape this cannot see.
      const grouped = new Set(mine.flatMap((g) => g.keys));
      for (const key of declaredKeys(file)) {
        expect(grouped.has(key), `${file}: "${key}" is not saved by any site this test can see`)
          .toBe(true);
      }
    }
  });

  it("no save sends a key that the service it passes would rename", () => {
    // THE DEFECT, DIRECTLY. B3 and D-17 are both this: the key was right, the service was not,
    // and `save-api-keys` renamed the row on the way in.
    // A Set, because `saveKeys(updates)` appears at four call sites in SettingsPage and they all
    // resolve to the same keys; the question is WHICH keys get renamed, not how many sites do it.
    const renamed = new Set<string>();
    for (const g of groups) {
      for (const key of g.keys) if (storedAs(key, g.service) !== key) renamed.add(key);
    }
    // The four that remain are listed above with what each one actually does today. Anything new
    // joining them is a settings control that does nothing, and fails here.
    expect([...renamed].sort()).toEqual(Object.keys(RENAMED_ON_THE_WAY_IN).sort());
  });

  it("every key a card writes has a reader under the exact name it is stored as", () => {
    const orphans: string[] = [];
    for (const [stored, w] of cardWrites) {
      if (readers.has(stored)) continue;
      const note = stored === w.sent ? "" : ` (sent as "${w.sent}" under service "${w.service}")`;
      orphans.push(`${stored}${note} — written by ${relative("", w.file)}`);
    }
    // Listed, with a reason each, above.
    expect(orphans.map((o) => o.split(" ")[0]).sort()).toEqual(Object.keys(WRITER_ORPHANS).sort());
  });

  it("every key a reader reads has a writer, an upsert or a migration seed", () => {
    const unwritten = [...readers.keys()].filter((k) => !hasWriter(k));
    expect(unwritten.sort()).toEqual(Object.keys(READER_ORPHANS).sort());
  });

  it("each listed orphan carries a reason, so the list cannot become a dumping ground", () => {
    const listed = [
      ...Object.entries(RENAMED_ON_THE_WAY_IN),
      ...Object.entries(WRITER_ORPHANS),
      ...Object.entries(READER_ORPHANS),
    ];
    for (const [key, why] of listed) {
      expect(why.length, `${key} is listed with no reason`).toBeGreaterThan(40);
    }
  });

  it("the stored-name arithmetic is the same one save-api-keys performs", () => {
    // If the function's rule changes, every assertion above is measuring the wrong thing. So the
    // rule is read back out of the function and compared with this file's copy of it.
    const fn = read("supabase/functions/save-api-keys/index.ts");
    expect(fn).toContain("key.startsWith(`${service}_`) ? key : `${service}_${key}`");
    expect(storedAs("payment_methods", "checkout")).toBe("checkout_payment_methods");
    expect(storedAs("checkout_payment_methods", "checkout")).toBe("checkout_payment_methods");
    expect(storedAs("checkout_payment_methods", "settings")).toBe("settings_checkout_payment_methods");
  });
});

describe("D-17 — the checkout payment-method switches reach the checkout", () => {
  const CARD = "src/components/admin/settings/CheckoutPaymentMethodsCard.tsx";

  it("the card saves under the service its keys belong to", () => {
    const src = read(CARD);
    const service = src.match(/service:\s*"([a-z_]+)"/)?.[1];
    expect(service, "the card names no service").toBeDefined();
    for (const key of ["checkout_payment_methods", "checkout_async_events_confirmed"]) {
      expect(storedAs(key, service!), `${key} is stored under a name nothing reads`).toBe(key);
    }
  });

  it("and the function that builds the Stripe session reads those exact rows", () => {
    // The reader side, from its own source. `payment_method_types` is decided here, so this is
    // the row that decides whether a customer can pay by a method that settles days later.
    const shared = read("supabase/functions/_shared/checkout-payment-methods.ts");
    expect(shared).toContain('"checkout_payment_methods"');
    expect(shared).toContain('"checkout_async_events_confirmed"');
    expect(shared).not.toContain("settings_checkout_");
  });
});

describe("B3 — the registration-fee switch writes what the money path reads", () => {
  /** The `KEY` constant the admin Settings page writes through. */
  function adminKey(name: string): string {
    const src = read("src/pages/admin/SettingsPage.tsx");
    const m = src.match(new RegExp(`${name}:\\s*"([a-z0-9_]+)"`));
    expect(m, `SettingsPage KEY.${name} not found`).not.toBeNull();
    return m![1];
  }

  /** Every `system_settings` key a file names in a plain string. */
  function keysIn(path: string): string[] {
    return [...read(path).matchAll(/"([a-z0-9_]*registration_fee[a-z0-9_]*)"/g)].map((m) => m[1]);
  }

  /**
   * The three readers on the money path. Each one decides what a customer is charged, so each one
   * is a place the admin switch has to reach:
   *
   *   usePricingSettings.ts        the join wizard's own quote, shown to the customer
   *   submit-registration          the order it writes when they submit
   *   _shared/checkout-pricing.ts  the amount the checkout session is created with
   */
  const READERS = [
    "src/hooks/usePricingSettings.ts",
    "supabase/functions/submit-registration/index.ts",
    "supabase/functions/_shared/checkout-pricing.ts",
  ];

  it("every reader reads the same key, and it is the unprefixed one", () => {
    for (const reader of READERS) {
      const keys = keysIn(reader);
      expect(keys.length, `${reader} names no registration-fee key`).toBeGreaterThan(0);
      expect(keys, `${reader} must read the canonical key`).toContain("registration_fee_enabled");
      // The prefixed family was deleted from production by 20260908120000. A reader that still
      // named it would be reading a row that does not exist.
      expect(keys, `${reader} still reads the deleted prefixed row`)
        .not.toContain("settings_registration_fee_enabled");
    }
  });

  it("the admin page writes that exact key, not a prefixed cousin", () => {
    expect(adminKey("REG_FEE_ENABLED")).toBe("registration_fee_enabled");
    expect(adminKey("REG_FEE_DISCOUNT")).toBe("registration_fee_discount");
  });

  it("and the SAVE stores it under that name — the half B3's first fix missed", () => {
    // The constant was canonical and the row still landed in `settings_registration_fee_enabled`,
    // because the page saved everything under `service: "settings"`. This asserts the service the
    // fee handler actually passes, from the source, and applies the function's own arithmetic.
    const src = read("src/pages/admin/SettingsPage.tsx");
    const handler = src.slice(src.indexOf("const handleSaveRegistrationFee"));
    const call = handler.slice(0, handler.indexOf("};"));
    const service = call.match(/,\s*"([a-z_]+)"\s*\)/)?.[1] ?? "settings";
    for (const key of [
      "registration_fee_enabled",
      "registration_fee_discount",
      "registration_test_mode_enabled",
    ]) {
      expect(storedAs(key, service), `${key} is saved under a name no reader looks for`).toBe(key);
    }
  });

  it("and the page's own read uses the same constant, so the screen cannot disagree with the charge", () => {
    // The bug that landed in between: the page wrote one key and read another, so what it
    // DISPLAYED and what it CHARGED could differ in either direction.
    const src = read("src/pages/admin/SettingsPage.tsx");
    const block = src.slice(src.indexOf("setRegistrationFeeSettings({"));
    expect(block.slice(0, 300)).toContain("KEY.REG_FEE_ENABLED");
    expect(block.slice(0, 300)).not.toContain('"settings_registration_fee');
  });

  it("P5 is a migration in the repo, so the prefixed rows really are gone from production", () => {
    // Without this the test above asserts a convention; with it, it asserts the state of the
    // database the convention exists to match.
    const p5 = read("supabase/migrations/20260908120000_settings_read_policies.sql");
    expect(p5).toContain("DELETE FROM public.system_settings");
    expect(p5).toContain("settings_registration_fee_enabled");
    const applied = read("supabase/migrations/APPLIED_TO_PROD.txt");
    expect(applied, "P5 must be applied for the unprefixed key to be the live one")
      .toContain("20260908120000");
  });
});
