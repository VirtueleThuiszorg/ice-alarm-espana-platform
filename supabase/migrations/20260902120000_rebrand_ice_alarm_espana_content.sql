-- ═══════════════════════════════════════════════════════════════════════════
-- Care Conneqt → ICE Alarm España : brand strings living in LIVE ROWS
--
-- The code rename (scripts/rebrand-strings.py) changed the repository. It did
-- not change a single row that is already in the database, and this platform
-- keeps a great deal of member-facing copy there: the seeded email templates,
-- the product catalogue in three languages, the operator documentation, the
-- five AI agent system prompts. `git grep` finds none of it.
--
-- This migration is the other half. It is deliberately a forward migration and
-- not an edit to the seed files: those have already run against production, and
-- rewriting applied history gives you a schema that no longer matches its own
-- record.
--
-- SAFE BY CONSTRUCTION
--   * Idempotent. Every pair replaces a string that will not exist after the
--     first run, so a second run is a no-op.
--   * MedConneqt (alarm.medconneqt.nl — the third-party dispenser platform the
--     call centre works alongside) is untouched: no search term below matches
--     it. 'Care Conneqt' is not 'MedConneqt' and 'careconneqt' is not
--     'medconneqt'.
--   * SLUGS ARE NEVER REWRITTEN. documentation.slug, products.slug,
--     blog_posts.slug and email_templates.slug are identifiers and, in the blog
--     case, live URLs. Renaming them breaks links and foreign lookups for a
--     cosmetic gain.
--   * Tables and columns are checked against information_schema before use, so
--     this runs cleanly against a database where an optional table was never
--     created.
--   * Nothing here touches alerts, members, medical_information, subscriptions,
--     payments, RLS policies or any safety-critical path.
--
-- NOT DONE HERE, because SQL cannot:
--   * Upload the new logo to storage at email-assets/logo.png. Until that is
--     replaced, transactional email shows the old mark. Do it before the first
--     member email goes out.
--   * The Supabase dashboard Auth email templates (Signup, Magic Link, Password
--     Reset, Change Email) — those live in the dashboard, not in Postgres.
-- ═══════════════════════════════════════════════════════════════════════════

DO $rebrand$
DECLARE
  -- Ordered longest-first: the specific forms must win before the general one.
  pairs   text[][] := ARRAY[
    ARRAY['Care Conneqt España',            'ICE Alarm España'],
    ARRAY['Care Conneqt Spain',             'ICE Alarm España'],
    ARRAY['CARE CONNEQT',                   'ICE ALARM ESPAÑA'],
    ARRAY['Care Conneqt',                   'ICE Alarm España'],
    ARRAY['CareConneqt',                    'ICEAlarmEspana'],
    ARRAY['careconneqt.es',                 'icealarm.es'],
    ARRAY['careconneqt.com',                'icealarm.es'],
    ARRAY['careconneqt',                    'icealarm'],
    ARRAY['Connected Health. Human Care.',  'Siempre responde alguien.'],
    ARRAY['Connected Health, Human Care',   'Siempre responde alguien'],
    ARRAY['icehealthsync.com',              'icealarm.es']
  ];

  -- table, column, kind ('text' | 'jsonb'). Slug/identifier columns excluded.
  targets text[][] := ARRAY[
    ARRAY['email_templates',   'subject_en',         'text'],
    ARRAY['email_templates',   'subject_es',         'text'],
    ARRAY['email_templates',   'body_html_en',       'text'],
    ARRAY['email_templates',   'body_html_es',       'text'],
    ARRAY['email_templates',   'body_text_en',       'text'],
    ARRAY['email_templates',   'body_text_es',       'text'],
    ARRAY['email_templates',   'name',               'text'],
    ARRAY['email_templates',   'description',        'text'],

    ARRAY['products',          'name',               'text'],
    ARRAY['products',          'description',        'text'],
    ARRAY['products',          'name_i18n',          'jsonb'],
    ARRAY['products',          'short_description_i18n', 'jsonb'],
    ARRAY['products',          'long_description_i18n',  'jsonb'],
    ARRAY['products',          'features_i18n',      'jsonb'],

    ARRAY['documentation',     'title',              'text'],
    ARRAY['documentation',     'content',            'text'],

    ARRAY['ai_agent_configs',  'system_instruction', 'text'],
    ARRAY['ai_agent_configs',  'business_context',   'text'],
    ARRAY['ai_agent_configs',  'language_policy',    'text'],
    ARRAY['ai_agent_configs',  'tool_policy',        'text'],

    ARRAY['ai_agents',         'name',               'text'],
    ARRAY['ai_agents',         'description',        'text'],

    ARRAY['testimonials',      'quote_en',           'text'],
    ARRAY['testimonials',      'quote_es',           'text'],

    ARRAY['blog_posts',        'title',              'text'],
    ARRAY['blog_posts',        'excerpt',            'text'],
    ARRAY['blog_posts',        'content',            'text'],
    ARRAY['blog_posts',        'ai_intro',           'text'],
    ARRAY['blog_posts',        'seo_title',          'text'],
    ARRAY['blog_posts',        'seo_description',    'text'],

    ARRAY['video_templates',   'name',               'text'],
    ARRAY['video_templates',   'description',        'text'],

    ARRAY['media_goals',       'name',               'text'],
    ARRAY['media_goals',       'description',        'text'],
    ARRAY['media_audiences',   'name',               'text'],
    ARRAY['media_audiences',   'description',        'text'],

    ARRAY['ai_memory',         'title',              'text'],
    ARRAY['ai_memory',         'content',            'text'],

    ARRAY['system_settings',   'value',              'text']
  ];

  t          text;
  c          text;
  kind       text;
  expr       text;
  pred       text;
  i          int;
  j          int;
  changed    bigint;
  grand      bigint := 0;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    t    := targets[i][1];
    c    := targets[i][2];
    kind := targets[i][3];

    -- Skip anything this database does not have, rather than failing the whole
    -- migration over an optional table.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = c
    );

    -- Build replace(replace(... col ...)) once per column.
    expr := CASE WHEN kind = 'jsonb' THEN format('%I::text', c) ELSE format('%I', c) END;
    -- Wrap forward so pairs[1] ends up INNERMOST and therefore runs FIRST:
    -- 'Care Conneqt España' must be consumed before the shorter 'Care Conneqt'
    -- can match its prefix.
    pred := '';
    FOR j IN 1 .. array_length(pairs, 1) LOOP
      expr := format('replace(%s, %L, %L)', expr, pairs[j][1], pairs[j][2]);
      pred := pred || format('%s%I::text LIKE %L',
                             CASE WHEN pred = '' THEN '' ELSE ' OR ' END,
                             c, '%' || pairs[j][1] || '%');
    END LOOP;
    IF kind = 'jsonb' THEN
      expr := format('(%s)::jsonb', expr);
    END IF;

    EXECUTE format('UPDATE public.%I SET %I = %s WHERE %s', t, c, expr, pred);
    GET DIAGNOSTICS changed = ROW_COUNT;

    IF changed > 0 THEN
      grand := grand + changed;
      RAISE NOTICE 'rebrand: %.% — % row(s)', t, c, changed;
    END IF;
  END LOOP;

  RAISE NOTICE 'rebrand: % row(s) updated in total', grand;
END
$rebrand$;

-- ── Settings that are a whole value rather than a substring ────────────────
DO $settings$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'system_settings') THEN
    UPDATE public.system_settings
       SET value = 'info@icealarm.es'
     WHERE key IN ('support_email', 'sender_email', 'from_email')
       AND value LIKE '%careconneqt%';

    UPDATE public.system_settings
       SET value = 'ICE Alarm España'
     WHERE key IN ('company_name', 'sender_name', 'brand_name')
       AND value LIKE '%Care Conneqt%';

    RAISE NOTICE 'rebrand: system_settings reconciled';
  END IF;
END
$settings$;

-- ── The browser-notification tag, so a stale notification cannot resurface
--    under the old brand name after the rebrand ships. Cosmetic, but free.
COMMENT ON SCHEMA public IS 'ICE Alarm España — 24-hour personal emergency response (rebranded from Care Conneqt, 2026-09-02)';
