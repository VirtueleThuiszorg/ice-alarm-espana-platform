/**
 * THE FACTS BEHIND A SHIFT NO-SHOW FLOOD — read from production, READ-ONLY, before anything changes.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 *
 * An operator worked a night shift with the platform open and the bell filled with `shift.no_show`
 * notifications about him. There are at least three candidate mechanisms in the code, and they
 * imply DIFFERENT fixes:
 *
 *   1. the dedupe read — `.maybeSingle()` returns `{data: null, error}` once two rows match, and
 *      the runner ignores the error, so "no existing alert" would be the answer for ever;
 *   2. duplicate `staff_shifts` rows (a cover row beside the original) — one alert per row;
 *   3. `staff_on_shift_now` keys on `CURRENT_DATE` (the database's clock) while the runner keys on
 *      `getShiftContext` (Europe/Madrid), so across midnight on a 23:00–07:00 night shift they can
 *      disagree about both the shift DATE and the shift TYPE, and each disagreement is a new
 *      dedupe key.
 *
 * Guessing between them is how the wrong one gets fixed and the flood comes back. So: ask
 * production, put the answer in the PR, then change code.
 *
 * ── WHY IT RUNS IN CI AND NOT ON SOMEBODY'S LAPTOP ──────────────────────────
 *
 * Same reason as the Stripe rehearsal (#419): the credentials already live there, as repository
 * secrets, and nobody has to copy a service-role key onto a laptop to answer a question. It is a
 * `workflow_dispatch` job — it runs when a human asks it to, never on a push.
 *
 * ── WHAT MAKES "READ-ONLY" A FACT RATHER THAN A PROMISE ─────────────────────
 *
 * Every request goes through `get()`, which is the only function here that calls `fetch`, and it
 * hard-codes `method: "GET"`. PostgREST maps GET to SELECT and nothing else — there is no request
 * this file can make that writes a row. `src/test/shiftNoShowFacts.test.ts` asserts that property
 * against the source, so a later edit cannot quietly add a POST.
 *
 * ── AND WHAT KEEPS IT OUT OF THE LOGS ───────────────────────────────────────
 *
 * A CI job's output is readable by everybody with repository access, so this prints COUNTS,
 * TIMESTAMPS and SHIFT KEYS. Column lists are explicit and narrow: no `select=*`, and no phone
 * number, email or address is ever requested — `personal_mobile` is on the same `staff` row this
 * reads and is deliberately not in any select list. The one name printed is the one the person
 * running the job typed in, which they already knew.
 */

const REST = `${process.env.SUPABASE_URL ?? ""}/rest/v1`;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Every read in this file. GET only — see the header. */
async function get(path) {
  const res = await fetch(`${REST}/${path}`, {
    method: "GET",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET ${path.split("?")[0]} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

const out = [];
const say = (line = "") => {
  out.push(line);
  console.log(line);
};

/** A count per key, printed as a table, largest first. */
function tally(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function table(header, pairs) {
  say(`| ${header} | rows |`);
  say("| --- | ---: |");
  for (const [k, n] of pairs) say(`| ${k} | ${n} |`);
  say("");
}

const NAME = process.env.STAFF_NAME ?? "Travis Nelison";
const DAYS = Number(process.env.DAYS ?? 7);

async function main() {
  if (!REST.startsWith("http") || !KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
  }

  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const sinceDate = since.slice(0, 10);

  say(`# Shift no-show facts — ${NAME}, last ${DAYS} days`);
  say();
  say(`Read from production at ${new Date().toISOString()}, GET requests only.`);
  say();

  // ── who ───────────────────────────────────────────────────────────────────
  const [first, ...restName] = NAME.split(" ");
  const last = restName.join(" ");
  const staff = await get(
    `staff?select=id,first_name,last_name,role,is_on_call,is_active&first_name=ilike.${encodeURIComponent(first)}&last_name=ilike.${encodeURIComponent(last)}`,
  );

  if (staff.length === 0) {
    say(`**No staff row matches "${NAME}".** Nothing else can be keyed without an id.`);
    return;
  }
  if (staff.length > 1) {
    // Worth saying out loud: two staff rows for one person is itself a cause of doubled alerts.
    say(`**${staff.length} staff rows match "${NAME}"** — that alone would double every alert.`);
  }

  const person = staff[0];
  say(`**staff.is_on_call = \`${person.is_on_call}\`** · role \`${person.role}\` · active \`${person.is_active}\``);
  say();

  const ids = staff.map((s) => s.id);
  const inList = `in.(${ids.join(",")})`;

  // ── 1. the alert log ──────────────────────────────────────────────────────
  say("## shift_alert_log");
  say();
  const alerts = await get(
    `shift_alert_log?select=id,alert_type,shift_date,shift_type,created_at,resolved_at&staff_id=${inList}&shift_date=gte.${sinceDate}&order=created_at.asc`,
  );
  say(`**${alerts.length} rows** in the last ${DAYS} days.`);
  say();
  if (alerts.length > 0) {
    table(
      "alert_type · shift_date · shift_type · resolved",
      tally(
        alerts,
        (r) =>
          `\`${r.alert_type}\` · ${r.shift_date} · ${r.shift_type} · ${r.resolved_at ? "resolved" : "**OPEN**"}`,
      ),
    );
    const open = alerts.filter((r) => !r.resolved_at);
    say(`Open (unresolved) rows: **${open.length}**.`);
    say();
    /*
      THE DECIDING NUMBER for cause (1). A partial unique index already exists on
      (alert_type, COALESCE(staff_id,…), shift_date, shift_type) WHERE resolved_at IS NULL, so two
      OPEN rows on one key should be impossible. If this prints a key with more than one open row,
      the index is not doing what its definition says and the dedupe read is reading a set, not a
      row. If every key has exactly one, the flood is NOT the dedupe read and cause (1) is out.
    */
    const openKeys = tally(open, (r) => `${r.alert_type}|${r.shift_date}|${r.shift_type}`);
    const collided = openKeys.filter(([, n]) => n > 1);
    say(
      collided.length > 0
        ? `**${collided.length} dedupe key(s) hold MORE THAN ONE open row** — ${collided
            .map(([k, n]) => `\`${k}\` ×${n}`)
            .join(", ")}. The unique index is not holding, and \`.maybeSingle()\` returns an error for those.`
        : "No dedupe key holds more than one open row, so `.maybeSingle()` never saw a set here.",
    );
    say();
    say(`First row \`${alerts[0].created_at}\`, last \`${alerts[alerts.length - 1].created_at}\`.`);
    say();
  }

  // ── 2. the shifts themselves ──────────────────────────────────────────────
  say("## staff_shifts");
  say();
  const shifts = await get(
    `staff_shifts?select=id,shift_date,shift_type,start_time,end_time,is_confirmed,created_at&staff_id=${inList}&shift_date=gte.${sinceDate}&order=shift_date.asc`,
  );
  say(`**${shifts.length} rows** in the last ${DAYS} days.`);
  say();
  if (shifts.length > 0) {
    const perKey = tally(shifts, (r) => `${r.shift_date} · ${r.shift_type} · ${r.start_time}–${r.end_time}`);
    table("shift_date · shift_type · window", perKey);
    // Cause (2): one alert per scheduled ROW, so two rows for one shift is two alerts.
    const dupes = tally(shifts, (r) => `${r.shift_date}|${r.shift_type}`).filter(([, n]) => n > 1);
    say(
      dupes.length > 0
        ? `**${dupes.length} (date, type) pair(s) have more than one shift row** — ${dupes
            .map(([k, n]) => `\`${k}\` ×${n}`)
            .join(", ")}. The runner loops over rows, so each one is its own pass.`
        : "No (date, type) pair has more than one shift row, so duplicate scheduling is out.",
    );
    say();
  }

  // ── 3. was he actually there? ─────────────────────────────────────────────
  say("## staff_presence");
  say();
  const presence = await get(
    `staff_presence?select=staff_id,is_online,last_heartbeat_at,updated_at&staff_id=${inList}`,
  );
  if (presence.length === 0) {
    say("**No staff_presence row at all** — he has never been seen online by the heartbeat.");
  } else {
    for (const p of presence) {
      say(
        `- is_online \`${p.is_online}\` · last_heartbeat_at \`${p.last_heartbeat_at}\` · updated_at \`${p.updated_at}\``,
      );
    }
    say();
    say(
      "A heartbeat inside the staleness window while `is_on_call` is false is the exact case the brief calls *present but not on duty* — online, working, and alerted as absent.",
    );
  }
  say();

  // ── 4. what actually reached the bell ─────────────────────────────────────
  say("## notification_log — what the bell is holding");
  say();
  const notes = await get(
    `notification_log?select=id,event_type,entity_id,admin_user_id,status,created_at&event_type=eq.shift.no_show&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc`,
  );
  say(`**${notes.length} \`shift.no_show\` rows** in the last ${DAYS} days (all staff).`);
  say();
  const his = notes.filter((n) => ids.includes(n.entity_id));
  say(`Of those, **${his.length}** name ${NAME} as the entity.`);
  say();
  if (notes.length > 0) {
    table("recipient (admin_user_id)", tally(notes, (n) => `\`${n.admin_user_id ?? "null"}\``));
    table("day", tally(notes, (n) => n.created_at.slice(0, 10)));
    /*
      THE OTHER HALF OF THE ARITHMETIC. `notify-admin` dispatches to every admin and super_admin,
      so ONE no-show event writes one row per recipient. If the bell holds 65 and there are 5
      recipients, that is 13 events, not 65 — and 13 events is a different bug from 65.
    */
    const recipients = new Set(notes.map((n) => n.admin_user_id ?? "null")).size;
    say(
      `**${recipients} distinct recipient(s)**, so ${notes.length} rows ≈ **${(notes.length / Math.max(recipients, 1)).toFixed(1)} events** fanned out one row per admin.`,
    );
    say();
    say(`First \`${notes[0].created_at}\`, last \`${notes[notes.length - 1].created_at}\`.`);
    say();
  }

  // ── 5. do the two clocks agree? ───────────────────────────────────────────
  say("## The two clocks");
  say();
  /*
    `staff_on_shift_now` filters on CURRENT_DATE/CURRENT_TIME — the DATABASE's clock — while the
    runner keys its rows on `getShiftContext` in Europe/Madrid. This prints the database's own
    answer beside Madrid's, which is the only way to tell whether cause (3) is live: if the
    database runs in UTC, then between 07:00 and 09:00 Madrid the view still returns last night's
    NIGHT shift while the runner has already moved to MORNING — a second dedupe key for one
    person, one shift.
  */
  const nowRows = await get("staff_on_shift_now?select=staff_id,shift_type,shift_date");
  const madrid = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date());
  say(`Madrid now: \`${madrid}\` · UTC now: \`${new Date().toISOString()}\``);
  say(`\`staff_on_shift_now\` currently returns **${nowRows.length} row(s)**:`);
  for (const r of nowRows) {
    say(`- shift_date \`${r.shift_date}\` · shift_type \`${r.shift_type}\`${ids.includes(r.staff_id) ? ` ← ${NAME}` : ""}`);
  }
  say();
  say(
    "Compare each row's `shift_type` with the shift Madrid says it is right now. A row whose `shift_type` differs from Madrid's current shift is cause (3) happening live: the runner would log that person under ITS shift key, not the scheduled one.",
  );
}

main()
  .then(async () => {
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) await (await import("node:fs/promises")).writeFile(summary, out.join("\n"), { flag: "a" });
  })
  .catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
  });
