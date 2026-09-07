#!/usr/bin/env python3
"""
Bring src/integrations/supabase/types.ts back in line with the migrations.

WHY THIS EXISTS. The generated types drifted from the schema: six tables were
missing outright (`pricing_plans` and `pricing_settings` — the canonical pricing
`submit-registration` computes every charge from — plus `webhook_events`,
`staff_invites`, `care_access_grants`, `shift_escalation_chain`), and eight more
had missing columns, including every Mollie column on `payments` and
`subscriptions`. The app was about to go live on Mollie with a type layer that
did not know Mollie existed.

`supabase gen types` is the right tool and should be used whenever it can be.
It needs Docker, which was not available here, so this reads the same source of
truth — `information_schema` on a database with every migration applied — and
edits only what has drifted. It never rewrites the whole file, so anything the
real generator produced that this cannot (function signatures, composite types,
relationship metadata) is left exactly as it is.

    python3 scripts/sync-supabase-types.py --db-url postgresql://... [--apply]

Dry-run by default: prints the diff it would make.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

TYPES = Path("src/integrations/supabase/types.ts")

# information_schema.data_type -> TypeScript, for everything the schema uses.
SCALARS = {
    "text": "string",
    "character varying": "string",
    "character": "string",
    "uuid": "string",
    "date": "string",
    "timestamp with time zone": "string",
    "timestamp without time zone": "string",
    "time without time zone": "string",
    "integer": "number",
    "bigint": "number",
    "smallint": "number",
    "numeric": "number",
    "real": "number",
    "double precision": "number",
    "boolean": "boolean",
    "jsonb": "Json",
    "json": "Json",
}


def ts_type(data_type: str, udt: str, elem_type: str, elem_udt: str) -> str:
    """One column's TypeScript type, before nullability."""
    if data_type == "ARRAY":
        inner = ts_type(elem_type, elem_udt, "", "") if elem_type else "string"
        return f"{inner}[]"
    if data_type == "USER-DEFINED":
        # An enum. Supabase names them through the Enums map so a rename shows up.
        return f'Database["public"]["Enums"]["{udt}"]'
    return SCALARS.get(data_type, "string")


def fetch(db_url: str) -> dict[str, list[tuple]]:
    sql = """
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable,
           (c.column_default IS NOT NULL)::text,
           COALESCE(e.data_type,''), COALESCE(e.udt_name,'')
    FROM information_schema.columns c
    LEFT JOIN information_schema.element_types e
      ON e.object_catalog = c.table_catalog AND e.object_schema = c.table_schema
     AND e.object_name = c.table_name AND e.object_type = 'TABLE'
     AND e.collection_type_identifier = c.dtd_identifier
    WHERE c.table_schema = 'public'
      AND EXISTS (SELECT 1 FROM information_schema.tables t
                  WHERE t.table_schema='public' AND t.table_name=c.table_name
                    AND t.table_type='BASE TABLE')
    ORDER BY c.table_name, c.ordinal_position;
    """
    out = subprocess.run(
        ["psql", db_url, "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True, text=True, check=True,
    ).stdout
    tables: dict[str, list[tuple]] = {}
    for line in out.strip().splitlines():
        if not line.strip():
            continue
        t, col, dt, udt, nullable, has_def, et, eu = line.split("|")
        tables.setdefault(t, []).append(
            (col, ts_type(dt, udt, et, eu), nullable == "YES", has_def == "true")
        )
    return tables


def table_block(name: str, cols: list[tuple], relationships: str) -> str:
    """A whole table entry in the shape `supabase gen types` emits."""
    def row(col, ts, nullable, _has_def):
        return f"          {col}: {ts}{' | null' if nullable else ''}"

    def insert(col, ts, nullable, has_def):
        opt = "?" if (nullable or has_def) else ""
        return f"          {col}{opt}: {ts}{' | null' if nullable else ''}"

    def update(col, ts, nullable, _has_def):
        return f"          {col}?: {ts}{' | null' if nullable else ''}"

    parts = [f"      {name}: {{", "        Row: {"]
    parts += [row(*c) for c in cols]
    parts += ["        }", "        Insert: {"]
    parts += [insert(*c) for c in cols]
    parts += ["        }", "        Update: {"]
    parts += [update(*c) for c in cols]
    parts += ["        }", relationships, "      }"]
    return "\n".join(parts)


def relationships_block(rels: list[tuple]) -> str:
    if not rels:
        return "        Relationships: []"
    out = ["        Relationships: ["]
    for fk, col, ref_t, ref_c, one in rels:
        out += [
            "          {",
            f'            foreignKeyName: "{fk}"',
            f'            columns: ["{col}"]',
            f"            isOneToOne: {'true' if one else 'false'}",
            f'            referencedRelation: "{ref_t}"',
            f'            referencedColumns: ["{ref_c}"]',
            "          },",
        ]
    out.append("        ]")
    return "\n".join(out)


def existing_relationships(src: str, start: int, end: int) -> str | None:
    """The table's current Relationships block, verbatim — it is hand-curated by
    the real generator and must survive a column patch untouched."""
    body = src[start:end]
    m = re.search(r"^        Relationships: (\[\]|\[\n.*?^        \])", body, re.S | re.M)
    return m.group(0) if m else None


def fetch_relationships(db_url: str) -> dict[str, list[tuple[str, str, str, str, bool]]]:
    """table -> [(fk_name, column, referenced_table, referenced_column, is_one_to_one)].

    Supabase's typed joins are driven entirely by this metadata. An empty list
    is not a harmless placeholder: every `.select("*, members(...)")` against
    that table degrades to SelectQueryError<"could not find the relation">.
    """
    sql = """
    SELECT tc.table_name, tc.constraint_name, kcu.column_name,
           ccu.table_name, ccu.column_name,
           EXISTS (
             SELECT 1 FROM pg_index i
             JOIN pg_class c ON c.oid = i.indrelid
             JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
             WHERE c.relname = tc.table_name AND i.indisunique
               AND a.attname = kcu.column_name
               AND array_length(i.indkey, 1) = 1
           )::text
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
    """
    out = subprocess.run(["psql", db_url, "-t", "-A", "-F", "|", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    rels: dict[str, list] = {}
    for line in out.strip().splitlines():
        if not line.strip():
            continue
        t, fk, col, ref_t, ref_c, one = line.split("|")
        rels.setdefault(t, []).append((fk, col, ref_t, ref_c, one == "true"))
    return rels


def fetch_enums(db_url: str) -> dict[str, list[str]]:
    sql = """
    SELECT t.typname, string_agg(quote_literal(e.enumlabel), ' | ' ORDER BY e.enumsortorder)
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname;
    """
    out = subprocess.run(["psql", db_url, "-t", "-A", "-F", "|", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    enums = {}
    for line in out.strip().splitlines():
        if not line.strip():
            continue
        name, labels = line.split("|", 1)
        enums[name] = labels
    return enums


def parse_existing(src: str) -> dict[str, tuple[int, int, set[str]]]:
    """table -> (start, end, Row column names), found by matching braces.

    A regex cannot do this reliably: the entries nest, and the closing brace of
    a table looks exactly like the closing brace of its Row. Counting braces
    from the table's opening line is the only honest way to find where it ends.
    """
    tables_at = src.index("    Tables: {")
    views_at = src.index("    Views: {", tables_at)
    region = src[tables_at:views_at]

    found: dict[str, tuple[int, int, set[str]]] = {}
    for line_match in re.finditer(r"^      (\w+): \{$", region, re.M):
        name = line_match.group(1)
        i = line_match.end() - 1          # at the opening brace
        depth, j = 0, i
        while j < len(region):
            if region[j] == "{":
                depth += 1
            elif region[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = region[line_match.start():j + 1]
        row = re.search(r"Row: \{\n(.*?)\n        \}", body, re.S)
        cols = set(re.findall(r"^\s{10}(\w+)\??:", row.group(1), re.M)) if row else set()
        found[name] = (tables_at + line_match.start(), tables_at + j + 1, cols)
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    src = TYPES.read_text(encoding="utf-8")
    real = fetch(args.db_url)
    rels = fetch_relationships(args.db_url)
    existing = parse_existing(src)

    added, patched = [], []

    # 1. Tables absent from types.ts entirely — insert alphabetically.
    for name in sorted(set(real) - set(existing)):
        block = table_block(name, real[name], relationships_block(rels.get(name, [])))
        after = [t for t in sorted(existing) if t < name]
        anchor = existing[after[-1]][1] if after else None
        if anchor is None:
            m = re.search(r"    Tables: \{\n", src)
            src = src[: m.end()] + block + "\n" + src[m.end():]
        else:
            src = src[:anchor] + "\n" + block + src[anchor:]
        existing = parse_existing(src)
        added.append(name)

    # 2. Tables present but drifted — regenerate the whole entry from the schema.
    for name in sorted(set(real) & set(existing)):
        start, end, cols = existing[name]
        db_cols = {c[0] for c in real[name]}
        if cols == db_cols:
            continue
        keep = existing_relationships(src, start, end) or relationships_block(rels.get(name, []))
        src = src[:start] + table_block(name, real[name], keep) + src[end:]
        existing = parse_existing(src)
        patched.append((name, sorted(db_cols - cols), sorted(cols - db_cols)))

    # 3. Enums: ones the file has never heard of, AND ones whose VALUES have drifted.
    #
    # The second half was missing and it mattered. This repo widens enums routinely —
    # order_status gained 'confirmed' and 'awaiting_stock' (20260228170000), device_status
    # gained four (20260202165732), app_role gained 'call_centre_supervisor', invite_status
    # gained 'viewed', fulfilment_state gained 'cancelled' (20260907110000). Adding a value is
    # an ALTER TYPE on an EXISTING enum, so the "have I heard of this name" check passed every
    # time and the union stayed stale.
    #
    # That fails in the worst direction for a TypeScript codebase: a `switch` over the union is
    # believed exhaustive when the database can hand you a value not in it, and the compiler
    # agrees. `orders.status` is the live example — FULFILMENT_MODEL.md §1-B records that
    # useOrderActions typed five values while the enum had seven, so an order in
    # `awaiting_stock` could not be seen or moved by the admin UI. That is this bug, one layer up.
    enums = fetch_enums(args.db_url)

    # The Enums block for the `public` schema specifically. There is more than one Enums block
    # in this file (graphql_public has its own), and src.index would find whichever comes first.
    enum_at = src.index("    Enums: {", src.index("  public: {"))
    enum_end = src.index("\n    }", enum_at)

    def read_enum(block: str, name: str):
        """
        One enum's current union, or None if it is not present.

        TWO FORMATS, both real in this file. Prettier wraps a long union across lines:

            payment_type:
              | "registration"
              | "subscription"

        and leaves a short one inline:

            plan_type: "single" | "couple"

        Reading only the inline form is what made the first version of this report claim
        payment_type had "gained" all five of its existing values — and the replace it would
        then have performed keyed on an empty string, which would have corrupted the file. It
        was caught by the dry run, which is what the dry run is for.
        """
        m = re.search(rf"^      {re.escape(name)}:(.*)$", block, re.M)
        if m is None:
            return None
        inline = m.group(1).strip()
        if inline:
            return inline, m.group(0)
        lines = block[m.end():].split("\n")[1:]
        parts, consumed = [], [m.group(0)]
        for line in lines:
            if not line.startswith("        | "):
                break
            parts.append(line.strip()[2:].strip())
            consumed.append(line)
        if not parts:
            return None
        return " | ".join(parts), "\n".join(consumed)

    new_enums = []
    changed_enums = []
    for name in sorted(enums):
        want = enums[name].replace(chr(39), chr(34))
        enum_block = src[enum_at:enum_end]
        current = read_enum(enum_block, name)

        if current is None:
            new_enums.append(name)
            src = src[:enum_end] + f"\n      {name}: {want}" + src[enum_end:]
        else:
            have, literal = current
            if {v.strip() for v in have.split("|")} == {v.strip() for v in want.split("|")}:
                continue
            have_set = {v.strip() for v in have.split("|")}
            want_set = {v.strip() for v in want.split("|")}
            # Report the DIRECTION of the drift: a value disappearing from the database is a
            # different event from one being added, and must not read the same in the log.
            changed_enums.append((name, sorted(want_set - have_set), sorted(have_set - want_set)))
            src = src.replace(literal, f"      {name}: {want}", 1)

        enum_at = src.index("    Enums: {", src.index("  public: {"))
        enum_end = src.index("\n    }", enum_at)

    # ── the second representation ─────────────────────────────────────────
    # types.ts carries every enum TWICE: the type union under `Enums`, and a runtime array
    # under `Constants` at the end of the file. The generator writes both; this script only
    # ever wrote the first, so after a widening the two disagreed — the union knew about
    # 'mollie' and 'nl' while the array did not.
    #
    # `Constants` is referenced nowhere in src/ today, so nothing was broken by it. It is
    # still a trap: the first dropdown built from Constants.public.Enums.preferred_language
    # silently omits Dutch, and the compiler cannot see the omission because the array is the
    # source of the values rather than a check on them. Kept in step rather than left as a
    # thing that is only wrong when someone finally uses it.
    const_at = src.find("  public: {", src.find("export const Constants"))
    const_touched = []
    if const_at != -1:
        for name in sorted(set(new_enums) | {n for n, _, _ in changed_enums}):
            want_list = [v.strip().strip('"') for v in enums[name].replace(chr(39), chr(34)).split("|")]
            block = src[const_at:]
            m = re.search(rf"^      {re.escape(name)}: \[(.*?)\],$", block, re.M | re.S)
            rendered = ", ".join(f'"{v}"' for v in want_list)
            if m is None:
                # A brand-new enum has no array yet. Insert alphabetically-agnostically at the
                # top of the Enums map inside Constants, which is where the generator would.
                anchor_m = re.search(r"^    Enums: \{$", block, re.M)
                if anchor_m is None:
                    continue
                ins = const_at + anchor_m.end()
                src = src[:ins] + f"\n      {name}: [{rendered}]," + src[ins:]
            else:
                src = src[:const_at] + block.replace(m.group(0), f"      {name}: [{rendered}],", 1)
            const_touched.append(name)
            const_at = src.find("  public: {", src.find("export const Constants"))

    if const_touched:
        print(f"Constants kept in step: {', '.join(const_touched)}")

    print(f"enums added:    {', '.join(new_enums) or 'none'}")
    for name, gained, lost in changed_enums:
        bits = []
        if gained:
            bits.append("+" + ", +".join(gained))
        if lost:
            bits.append("-" + ", -".join(lost))
        print(f"enums patched:  {name}  ({'; '.join(bits)})")
    print(f"tables added:   {', '.join(added) or 'none'}")
    for name, gained, lost in patched:
        bits = []
        if gained:
            bits.append("+" + ", +".join(gained))
        if lost:
            bits.append("-" + ", -".join(lost))
        print(f"tables patched: {name}  ({'; '.join(bits)})")
    if not added and not patched and not new_enums and not changed_enums:
        print("types.ts already matches the schema")
        return 0

    if args.apply:
        TYPES.write_text(src, encoding="utf-8")
        print(f"\nwrote {TYPES}")
    else:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
