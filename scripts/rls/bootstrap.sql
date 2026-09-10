-- Supabase-compatible scaffolding for a plain PostgreSQL instance.
--
-- WHY THIS EXISTS: RLS is a pure PostgreSQL feature, so tenant isolation can be
-- proven against any Postgres — no Supabase project, no Docker, no ephemeral
-- cluster. What the migrations DO assume is the surrounding furniture Supabase
-- provides: the `anon` / `authenticated` / `service_role` roles, an `auth` schema
-- with a `users` table, and the `auth.uid()` / `auth.jwt()` / `auth.role()`
-- helpers that every policy is written against.
--
-- This file creates exactly that furniture and nothing else. It deliberately does
-- NOT reimplement GoTrue, PostgREST or storage — none of them participate in a
-- policy decision. A policy calls `auth.uid()`, and `auth.uid()` reads the JWT
-- claims the connection set. That is the whole contract, and it is reproducible.
--
-- Impersonation works the way PostgREST does it: set the role, then set
-- `request.jwt.claims` as a GUC. So a test "becomes" a user with
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- which is the same input a real request produces.

-- ── roles ──────────────────────────────────────────────────────────────────
-- NOLOGIN: these are switched into with SET ROLE, never connected to directly,
-- which is also how Supabase uses them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- BYPASSRLS is what makes the service role dangerous and why golden rule 5
    -- exists. Modelled faithfully so a test can prove a policy is the only thing
    -- standing between two tenants.
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN;
  END IF;
END
$$;

GRANT anon, authenticated, service_role TO authenticator;

-- ── schemas ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
-- `storage` and `graphql_public` are referenced by some migrations' GRANTs but
-- never by a policy decision; the schema existing is enough for them to apply.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS graphql_public;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Some migrations call gen_random_uuid()/digest() unqualified.
GRANT USAGE ON SCHEMA extensions TO PUBLIC;
ALTER DATABASE :"DBNAME" SET search_path TO "$user", public, extensions;

-- ── auth.users ─────────────────────────────────────────────────────────────
-- Only the columns anything in this repo actually references. A faithful copy of
-- GoTrue's table would add noise without changing a single policy outcome.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email text UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  is_anonymous boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text,
  created_at timestamptz DEFAULT now()
);

-- ── the helpers every policy is written against ─────────────────────────────
-- Signatures and semantics match Supabase's: read the request GUCs, return NULL
-- when absent (an anonymous request), never raise.

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.sub', true),
      (auth.jwt() ->> 'sub')
    ),
    ''
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.role', true),
      (auth.jwt() ->> 'role')
    ),
    ''
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.email', true),
      (auth.jwt() ->> 'email')
    ),
    ''
  )::text
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- ── default privileges PostgREST relies on ─────────────────────────────────
-- Without these, a policy that WOULD allow a row is masked by a plain permission
-- error, and a test could pass for the wrong reason. Granting broadly here means
-- any denial observed later is RLS doing its job, not a missing GRANT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- pg_cron cannot be installed on a plain instance and is referenced only by the
-- scheduling migrations, never by a policy. Stubbed so those migrations apply
-- instead of aborting the run.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

-- ── pg_net: A STUB THAT RECORDS, because two triggers now reach the router through it ──
--
-- pg_net cannot be installed either, and until now this was a no-op returning 0 while the two
-- migrations that USE it were skipped entirely by run.sh. That was a hole: nothing in CI ever
-- compiled `emit_lead_new_to_router` or `emit_shift_swap_to_router`, so a plpgsql body only
-- production would ever execute went out unexamined — and one of them shipped a real bug (it
-- announced every swap request as a request for "cover", because it read `offered_shift_id`,
-- which is NULL until the counterparty answers). That was found by hand, on a throwaway
-- database, after it had merged.
--
-- run.sh now applies those migrations with only the `CREATE EXTENSION` line neutralised, and
-- this stub RECORDS what it was asked to send. "Did the trigger fire, and with what?" is the
-- only interesting question about an emit, and a function that discards its arguments cannot
-- answer it.
--
-- The signature matches real pg_net's — same parameter names, same order — because both callers
-- use named arguments (`url :=`, `headers :=`, `body :=`). Returning the row id rather than 0
-- matches the real function's "here is your request id" contract too.
CREATE SCHEMA IF NOT EXISTS net;

CREATE TABLE IF NOT EXISTS net.sent (
  id      bigserial PRIMARY KEY,
  url     text,
  body    jsonb,
  headers jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO net.sent (url, body, headers)
  VALUES (http_post.url, http_post.body, http_post.headers)
  RETURNING net.sent.id INTO v_id;
  RETURN v_id;
END $$;

/** The event type of the Nth-from-last thing the router was asked to send. Used by the suite. */
CREATE OR REPLACE FUNCTION net.last_event(p_back integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT body->'event' FROM net.sent ORDER BY id DESC OFFSET p_back LIMIT 1
$$;

CREATE OR REPLACE FUNCTION extensions.http_post(url text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;

-- Supabase exposes secrets via vault. The cron migrations read it, and so do both router emits:
-- absent, they RAISE WARNING and return, which would make every emit assertion in the suite pass
-- vacuously by never emitting. Seeded here so the NORMAL path is what the suite exercises; the
-- missing-key path is asserted explicitly, by removing it and putting it back.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.decrypted_secrets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text UNIQUE,
  decrypted_secret text
);

INSERT INTO vault.decrypted_secrets (name, decrypted_secret)
VALUES ('service_role_key', 'stub-service-role-key-for-the-harness')
ON CONFLICT (name) DO NOTHING;

-- ── realtime ───────────────────────────────────────────────────────────────
-- 18 migrations do `ALTER PUBLICATION supabase_realtime ADD TABLE ...`. Realtime
-- delivery is not an access-control decision — a client still only receives rows
-- RLS would have shown it — but the publication has to exist for those statements
-- to apply. Created empty; membership is then added by the migrations themselves.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- ── storage ────────────────────────────────────────────────────────────────
-- 12 migrations define bucket policies. Only the columns those policies read are
-- modelled. Storage RLS is a real concern but a separate one from tenant row
-- isolation; these exist so the migrations apply, not so storage is under test.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[]
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/')
$$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects, storage.buckets
  TO anon, authenticated, service_role;
