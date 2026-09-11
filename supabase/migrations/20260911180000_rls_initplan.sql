-- Every RLS policy evaluates auth.uid() ONCE PER QUERY, not once per row.
--
-- WHY. A policy expression is evaluated for every row the planner considers. When
-- that expression contains a bare `auth.uid()`, PostgreSQL treats it as a
-- per-row function call: reading 5,000 members means 5,000 calls to `auth.uid()`,
-- and where the policy reads `get_staff_role(auth.uid())` it means 5,000 calls to
-- `get_staff_role` as well — each of which is itself a query against `staff`.
--
-- Wrapping the call in a scalar sub-select — `(select auth.uid())` — turns it into
-- an InitPlan. The planner runs it ONCE, before the scan, and compares every row
-- against the constant it produced. Same answer, same security, one evaluation.
-- This is the documented Supabase guidance for RLS at scale, and it is the single
-- largest database win available here: it costs no schema change, no new index and
-- no application change.
--
-- WHAT IT IS NOT. This changes only HOW OFTEN an expression is evaluated, never
-- WHAT IT EVALUATES TO. `auth.uid()` is STABLE — by definition it returns the same
-- value throughout a statement — so hoisting it out of the per-row loop cannot
-- change which rows a policy admits. Golden rule 2 is untouched: every policy that
-- existed before this migration exists after it, on the same table, for the same
-- roles, for the same command, admitting exactly the same rows. The proof is
-- `scripts/rls/run.sh`, which runs the full cross-tenant isolation suite against
-- the real migration set and must be green on both sides of this file.
--
-- WHY A LOOP OVER pg_policies AND NOT 38 HAND-WRITTEN ALTER STATEMENTS.
-- Two reasons, and the second is the important one.
--   1. CLAUDE.md: generic, parameterised code, never per-entity one-offs. A list of
--      38 policy names is 38 chances to typo a name and silently skip one.
--   2. A hand-written list is a snapshot. This reads the policies that ACTUALLY
--      exist at the moment it runs, so it cannot miss one that a migration added
--      after this file was written but before it was applied — the exact drift the
--      repo has already been bitten by (STATE.md, 24 migrations behind production).
--
-- The rewrite is TEXTUAL, on `pg_get_expr` output, which is PostgreSQL's own
-- normalised rendering of the parsed expression — not on the source in the
-- migration files. That is what makes it safe to run against a database whose
-- policies arrived through any route.
--
-- IDEMPOTENT. An already-wrapped expression renders as `( SELECT auth.uid() AS
-- uid)`, which is recognised and left alone, so re-running this file changes
-- nothing and re-reports zero rewrites.
--
-- REVERSIBLE: the inverse is the same loop with the replacements reversed —
-- `( SELECT auth.uid() AS uid)` back to `auth.uid()`, and
-- `( SELECT get_staff_role(( SELECT auth.uid() AS uid)) )` back to
-- `get_staff_role(auth.uid())`. Nothing is dropped, nothing is created, no policy
-- name or role list changes, so a revert is a rewrite in the other direction and
-- never a re-CREATE.

-- ── the rewriter ───────────────────────────────────────────────────────────
--
-- In pg_temp, so it exists for exactly this session and leaves no artefact behind.
--
-- Placeholders rather than one pass of regexp_replace, because the strings NEST:
-- `( SELECT auth.uid() AS uid)` itself contains `auth.uid()`, so a naive global
-- replace would wrap the already-wrapped and produce
-- `( SELECT ( SELECT auth.uid() AS uid) AS uid)` — valid SQL that grows on every
-- run. Protecting the wrapped form first is what makes the pass idempotent.
CREATE OR REPLACE FUNCTION pg_temp.wrap_initplan(expr text, helpers text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  out text := expr;
  fn  text;
BEGIN
  IF out IS NULL THEN
    RETURN NULL;
  END IF;

  -- ORDER MATTERS, AND THE ORDER IS OUTSIDE-IN, because these strings NEST.
  -- `( SELECT is_staff(( SELECT auth.uid() AS uid)) AS is_staff)` contains a
  -- wrapped `auth.uid()`, which contains a bare one. Protect the largest
  -- already-correct form first, or a second pass wraps the wrapped and produces
  -- `( SELECT ( SELECT auth.uid() AS uid) AS uid)` — valid SQL that grows on
  -- every run. This is what makes the whole file idempotent.

  -- 1. Helper calls that are ALREADY an InitPlan. BOTH SPELLINGS, and the
  --    unqualified one is not hypothetical: this file writes `public.`, but
  --    ALTER POLICY re-renders from the parse tree and drops the schema when
  --    `public` is on the search_path. The first version protected only the
  --    qualified form, so its own output came back unrecognised and the
  --    verification at the bottom failed on 25 policies it had just correctly
  --    rewritten.
  FOREACH fn IN ARRAY helpers LOOP
    out := replace(out,
      '( SELECT public.' || fn || '(( SELECT auth.uid() AS uid)) AS ' || fn || ')',
      '@@H:' || fn || '@@');
    out := replace(out,
      '( SELECT ' || fn || '(( SELECT auth.uid() AS uid)) AS ' || fn || ')',
      '@@H:' || fn || '@@');
  END LOOP;

  -- 2. auth.* calls that are already an InitPlan, in the spellings PostgreSQL
  --    and a hand-written migration each produce.
  out := replace(out, '( SELECT auth.uid() AS uid)', '@@UID@@');
  out := replace(out, '(SELECT auth.uid() AS uid)',  '@@UID@@');
  out := replace(out, '( SELECT auth.uid())',        '@@UID@@');
  out := replace(out, '(SELECT auth.uid())',         '@@UID@@');
  out := replace(out, '( SELECT auth.role() AS role)', '@@ROLE@@');
  out := replace(out, '(SELECT auth.role() AS role)',  '@@ROLE@@');
  out := replace(out, '( SELECT auth.jwt() AS jwt)',   '@@JWT@@');
  out := replace(out, '(SELECT auth.jwt() AS jwt)',    '@@JWT@@');

  -- 3. Every remaining bare call.
  out := replace(out, 'auth.uid()',  '@@UID@@');
  out := replace(out, 'auth.role()', '@@ROLE@@');
  out := replace(out, 'auth.jwt()',  '@@JWT@@');

  -- 4. The helpers. `is_staff(@@UID@@)` is now a single literal string, so
  --    wrapping it needs no balanced-paren parsing — which is exactly why the
  --    uid substitution happens first.
  --
  --    MATCHING ON `fn(@@UID@@)` IS THE SAFETY PROPERTY, not a shortcut. It
  --    matches only a call whose SOLE argument is the current user, which is by
  --    definition constant for the whole statement. A helper that also takes a
  --    COLUMN — `has_care_consent(member_id, 'alerts')` is the one that matters
  --    here — does not match, and must not: its value varies per row, and
  --    hoisting it out of the loop would change which rows the policy admits.
  FOREACH fn IN ARRAY helpers LOOP
    out := replace(out, 'public.' || fn || '(@@UID@@)', '@@H:' || fn || '@@');
    out := replace(out, fn || '(@@UID@@)',              '@@H:' || fn || '@@');
  END LOOP;

  -- 5. Expand.
  FOREACH fn IN ARRAY helpers LOOP
    out := replace(out, '@@H:' || fn || '@@',
      '( SELECT public.' || fn || '(( SELECT auth.uid() AS uid)) AS ' || fn || ')');
  END LOOP;
  out := replace(out, '@@UID@@',  '( SELECT auth.uid() AS uid)');
  out := replace(out, '@@ROLE@@', '( SELECT auth.role() AS role)');
  out := replace(out, '@@JWT@@',  '( SELECT auth.jwt() AS jwt)');

  RETURN out;
END;
$fn$;

-- ── the rewrite ────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol       record;
  helpers   text[];
  new_qual  text;
  new_check text;
  stmt      text;
  rewritten int := 0;
  seen      int := 0;
BEGIN
  /*
    WHICH FUNCTIONS COUNT AS A SECURITY HELPER — discovered, not listed.

    Every function in `public` that takes EXACTLY ONE uuid and is not VOLATILE.
    That is the shape of "answer a question about the current user": `is_staff`,
    `is_admin`, `get_staff_role`, `get_member_id`. A hand-written list would go
    stale the first time somebody adds a fifth, and the failure mode of a stale
    list is silent — the new helper keeps being called once per row and nothing
    says so.

    NOT VOLATILE is the correctness condition, and it is not a formality:
    hoisting a VOLATILE function out of the per-row loop would change how many
    times it runs and therefore what it does. STABLE and IMMUTABLE both promise
    the same answer throughout a statement, which is exactly the promise an
    InitPlan relies on.

    The single-uuid-argument rule does the rest: a helper that also takes a
    column, like `has_care_consent(member_id, 'alerts')`, is never a candidate.
  */
  SELECT array_agg(p.proname ORDER BY p.proname)
  INTO helpers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.pronargs = 1
    AND p.proargtypes[0] = 'uuid'::regtype
    AND p.provolatile IN ('s', 'i');

  helpers := coalesce(helpers, ARRAY[]::text[]);
  RAISE NOTICE 'initplan: hoisting auth.uid() and % helper(s): %',
    array_length(helpers, 1), array_to_string(helpers, ', ');

  /*
    THE POLICY LIST IS SNAPSHOT FIRST, and then iterated. It is not a nicety.

    `pg_policies` is a view over the `pg_policy` catalog, and the loop below
    ALTERs exactly the rows it is reading. Iterating a catalog while rewriting it
    left one policy untouched — `system_settings / Staff can view non-credential
    settings` came out of a full run still reading `is_staff(auth.uid())` while
    the other 310 were rewritten, and it came out that way reproducibly. Whatever
    the mechanism, a loop whose input changes underneath it is not something to
    reason about; it is something to remove.

    So: read everything into a temp table, close the read, then write. The
    verification at the bottom of this file is what caught the one that got away,
    and it is why that block is not optional.
  */
  CREATE TEMP TABLE initplan_targets ON COMMIT DROP AS
  SELECT schemaname, tablename, policyname, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public';

  FOR pol IN
    SELECT * FROM initplan_targets ORDER BY tablename, policyname
  LOOP
    seen := seen + 1;
    new_qual  := pg_temp.wrap_initplan(pol.qual, helpers);
    new_check := pg_temp.wrap_initplan(pol.with_check, helpers);

    CONTINUE WHEN new_qual  IS NOT DISTINCT FROM pol.qual
              AND new_check IS NOT DISTINCT FROM pol.with_check;

    -- ALTER POLICY keeps the policy's name, table, command and role list and
    -- replaces only the expressions. A DROP + CREATE would have to restate all
    -- four, which is where a policy silently widens from one role to PUBLIC.
    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    rewritten := rewritten + 1;
  END LOOP;

  RAISE NOTICE 'initplan: rewrote % of % policies in public', rewritten, seen;
END;
$$;

-- ── the proof, in the same transaction that did the work ───────────────────
--
-- Without this the migration would be a hope.
--
-- The check CANNOT be "does the text still contain auth.uid()", because the
-- CORRECT answer contains it — inside a sub-select. PostgreSQL's regex engine has
-- no lookbehind, so instead every WRAPPED occurrence is deleted from a copy of
-- the expression and whatever survives is examined. A bare call survives that
-- deletion; a wrapped one does not.
--
-- Helper wrappers are removed before `SELECT auth.uid()`, for the nesting reason
-- in `wrap_initplan`: a helper wrapper contains a uid wrapper.
--
-- If anything survives, this file FAILS rather than reporting a speed-up it did
-- not deliver. It has already earned its place twice: it caught the missing
-- unqualified spelling, and it caught the helpers that were still being called
-- once per row while `get_staff_role` alone was being hoisted.
DO $$
DECLARE
  helpers   text[];
  fn        text;
  leftovers text;
  pattern   text;
BEGIN
  SELECT array_agg(p.proname ORDER BY p.proname)
  INTO helpers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.pronargs = 1
    AND p.proargtypes[0] = 'uuid'::regtype
    AND p.provolatile IN ('s', 'i');
  helpers := coalesce(helpers, ARRAY[]::text[]);

  CREATE TEMP TABLE initplan_residue ON COMMIT DROP AS
  SELECT schemaname, tablename, policyname,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') AS residue
  FROM pg_policies
  WHERE schemaname = 'public';

  FOREACH fn IN ARRAY helpers LOOP
    UPDATE initplan_residue SET residue = replace(
      replace(residue, 'SELECT public.' || fn || '(', ''), 'SELECT ' || fn || '(', '');
  END LOOP;
  UPDATE initplan_residue SET residue = replace(residue, 'SELECT auth.uid()', '');

  pattern := '%auth.uid()%';
  SELECT string_agg(format('%s.%s / %s', schemaname, tablename, policyname), E'\n'
                    ORDER BY tablename, policyname)
  INTO leftovers
  FROM initplan_residue
  WHERE residue LIKE pattern
     OR EXISTS (
       SELECT 1 FROM unnest(helpers) h WHERE initplan_residue.residue LIKE '%' || h || '(%'
     );

  IF leftovers IS NOT NULL THEN
    RAISE EXCEPTION
      'RLS initplan rewrite missed these policies, so the per-row evaluation is still there:%s%s',
      E'\n', leftovers;
  END IF;

  RAISE NOTICE 'initplan: every policy in public resolves the current user once per query';
END;
$$;

DROP FUNCTION IF EXISTS pg_temp.wrap_initplan(text, text[]);
