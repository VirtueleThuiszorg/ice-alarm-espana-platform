-- Seed a table with N rows, whatever its columns are.
--
-- GENERIC ON PURPOSE (CLAUDE.md: no per-entity one-offs). Hand-written INSERTs
-- for `members`, `alerts`, `staff_shifts` and `notification_log` would be four
-- fixtures to maintain against a schema that changes weekly, and the first
-- column added with NOT NULL and no default would break all four silently — a
-- seeder that inserts nothing makes every EXPLAIN below read 0.000 ms, which
-- looks like a spectacular optimisation.
--
-- Columns with a DEFAULT, or that are NULLable, are left to the database. What
-- is left — NOT NULL, no default — is filled BY TYPE, which is the only thing a
-- generic seeder can honestly know, with one exception noted at the text branch.
--
-- FOREIGN KEYS ARE NOT SATISFIED, they are switched off by the caller with
-- `session_replication_role = replica`, which skips FK triggers. Referential
-- integrity is not what is being measured here; row counts and query plans are,
-- and a seeder that had to topologically sort the schema to plant one row would
-- be a second migration engine. CHECK constraints are NOT skipped by that
-- setting and are still honoured — see the text branch.
CREATE OR REPLACE FUNCTION pg_temp.seed(tbl text, n int)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  col        record;
  cols       text := '';
  vals       text := '';
  enum_label text;
  allowed    text;
  v          text;
BEGIN
  FOR col IN
    SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS typ, t.typtype, a.atttypid
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = tbl::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attnotnull
      AND a.attgenerated = ''
      AND NOT EXISTS (
        SELECT 1 FROM pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum
      )
    ORDER BY a.attnum
  LOOP
    v := NULL;

    IF col.typtype = 'e' THEN
      /*
        EVERY LABEL, CYCLED PER ROW — not the first one for every row.

        This used to take `ORDER BY e.enumsortorder LIMIT 1`, so every row in the
        table got the SAME enum value. That is invisible until something filters
        on the column, and then it is badly misleading: `order_items.item_type`
        has four labels, every seeded row got the first, and
        `WHERE item_type = 'pendant'` therefore matched all 60,000 rows. The read
        measured 321 ms and looked like a missing index. It was a correct
        sequential scan over a filter that excluded nothing — an artefact of the
        seed, and one that nearly bought a migration on the strength of it.

        Cycling on `g` gives each label an equal share, so a filtered read
        touches roughly 1/n of the table and the planner faces the choice it
        would face in production.
      */
      SELECT 'ARRAY[' || string_agg(quote_literal(e.enumlabel), ',' ORDER BY e.enumsortorder)
             || ']::' || col.typ || '[]'
      INTO enum_label
      FROM pg_enum e WHERE e.enumtypid = col.atttypid;
      -- A single `%`: this string is substituted INTO format() as a %s argument,
      -- so its contents are not rescanned for format specifiers. `%%` emitted a
      -- literal `%%` and Postgres had no operator for it.
      v := '(' || enum_label || ')[1 + (g % ' ||
           (SELECT count(*) FROM pg_enum e WHERE e.enumtypid = col.atttypid)::text || ')]';

    ELSIF col.typ LIKE '%[]' THEN
      v := quote_literal('{}') || '::' || col.typ;

    ELSIF col.typ = 'uuid' THEN
      v := 'gen_random_uuid()';

    ELSIF col.typ LIKE 'timestamp%' THEN
      v := 'now() - (g || '' minutes'')::interval';

    ELSIF col.typ = 'date' THEN
      v := 'current_date - (g % 365)';

    ELSIF col.typ LIKE 'time%' THEN
      v := quote_literal('09:00') || '::' || col.typ;

    ELSIF col.typ IN ('integer', 'bigint', 'smallint') THEN
      v := 'g';

    ELSIF col.typ LIKE 'numeric%' OR col.typ IN ('double precision', 'real') THEN
      v := 'g::' || col.typ;

    ELSIF col.typ = 'boolean' THEN
      v := '(g % 2 = 0)';

    ELSIF col.typ IN ('json', 'jsonb') THEN
      v := quote_literal('{}') || '::' || col.typ;

    ELSE
      /*
        A TEXT COLUMN IS VERY OFTEN CONSTRAINED TO A SHORT LIST OF WORDS —
        `shift_type`, `status`, `channel`, `event_type`. A value like 'seed-1'
        satisfies the TYPE and violates the CHECK, which is exactly how the first
        run of this died, on `staff_shifts_shift_type_check`.

        So when a CHECK constraint mentions this column, the first quoted literal
        in its definition is used. It is a heuristic, and it is the right one: a
        value list is overwhelmingly the shape these constraints take, and any
        literal inside one is by definition an allowed value.
      */
      SELECT substring(pg_get_constraintdef(c.oid) from '''([^'']+)''')
      INTO allowed
      FROM pg_constraint c
      WHERE c.conrelid = tbl::regclass
        AND c.contype = 'c'
        AND (SELECT a.attnum FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attname = col.attname) = ANY (c.conkey)
      ORDER BY c.oid
      LIMIT 1;

      v := coalesce(quote_literal(allowed), quote_literal('seed-') || ' || g');
    END IF;

    cols := cols || quote_ident(col.attname) || ', ';
    vals := vals || v || ', ';
  END LOOP;

  IF cols = '' THEN
    -- Every column is nullable or defaulted: DEFAULT VALUES is the whole insert.
    EXECUTE format('INSERT INTO %s SELECT FROM generate_series(1, %s)', tbl, n);
    RETURN;
  END IF;

  EXECUTE format(
    'INSERT INTO %s (%s) SELECT %s FROM generate_series(1, %s) AS g',
    tbl, left(cols, -2), left(vals, -2), n
  );
END;
$$;
