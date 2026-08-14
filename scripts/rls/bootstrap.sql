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

-- pg_cron / pg_net are unavailable on a plain instance and are referenced only by
-- the scheduling migrations, never by a policy. Stubbed so those migrations apply
-- instead of aborting the run.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;

CREATE OR REPLACE FUNCTION extensions.http_post(url text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;

-- Supabase exposes secrets via vault; only referenced by the cron migrations.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.decrypted_secrets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text UNIQUE,
  decrypted_secret text
);

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
