-- Enable realtime on public.members so the admin roster updates without a reload.
--
-- Writes to `members` come from several places (add-member wizard, CRM import,
-- payment webhook activation, another admin's tab). React Query is configured
-- with a 2-minute staleTime and refetchOnWindowFocus off, so a new member did
-- not appear in Admin -> Members until a hard refresh.
--
-- The client subscription (src/hooks/useMembersRealtime.ts) ignores the payload
-- and only invalidates its cached queries, so the refetch still runs under the
-- viewer's own RLS policies. Realtime is not a read path here.
--
-- Reverse with:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.members;
--   ALTER TABLE public.members REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
  END IF;
END $$;

-- UPDATE and DELETE events need the old row in the WAL for Realtime to apply
-- RLS to them; with the default replica identity those events can be dropped.
-- `members` is a low-write table in the hundreds of rows, so the extra WAL is
-- immaterial.
ALTER TABLE public.members REPLICA IDENTITY FULL;
