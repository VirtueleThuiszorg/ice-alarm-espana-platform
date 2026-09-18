-- ICE import: member_bank_details - the legacy direct-debit account, ADMIN-RESTRICTED.
--
-- WHY THIS EXISTS
-- ---------------
-- 85 rows of the karmaCRM export carry a bank account under "20 Digit Bank No", 57 of them a
-- parseable Spanish IBAN. These are the members Santander still direct-debits: the mandate is
-- not in Stripe or Mollie, so nothing in the platform can say which account a legacy member's
-- money comes out of, and `legacy_billing_date` records WHEN without WHAT.
--
-- Lee's decision, 18 September 2026, when the import screen told him the column was being
-- discarded: bring it across, into a field only admins can read.
--
-- POLICY IS member_access's, NOT the broad member-table one, and for the same reason. An IBAN
-- is an instruction to move somebody's money. Call-centre operators have no use for one during
-- an alert, and a broad is_staff policy would hand it to every shift.
--   - read: admin only (is_admin), never is_staff
--   - write: admin only
--   - the member themselves may read their own row, and nothing else
--
-- Every predicate is wrapped in a scalar sub-select, which is not decoration: a bare
-- `auth.uid()` in a policy is evaluated once PER ROW, and `is_admin` is itself a query against
-- `staff`. `20260911180000_rls_initplan` hoisted every policy that existed then; a policy
-- written after it has to arrive in that form or it reintroduces the problem one table at a
-- time. `scripts/rls/run.sh` checks this and refused this migration until it did.
--
-- WHAT IS NOT HERE, deliberately: card numbers. The same screen offered them and the answer was
-- no. Storing a PAN would put this business under PCI-DSS and make every one of those 94 cards
-- disclosable in a breach; Stripe and Mollie hold cards precisely so this database does not.
-- `Credit Card Details` stays unreadable at the accessor — see REDACTED_HEADERS.
--
-- `source_text` holds the cell as the CRM had it, because these cells are not clean: a typical
-- one reads "<bank name> IBAN ES.. .... .... visa <account holder> ...". Keeping the original
-- beside the parsed IBAN is what lets somebody settle a disagreement later without going back
-- to karmaCRM, which is being switched off.
--
-- Reverse: DROP TABLE public.member_bank_details;

CREATE TABLE IF NOT EXISTS public.member_bank_details (
  member_id   uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  iban        text,
  bank_name   text,
  source_text text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_bank_details IS
  'Legacy direct-debit bank details. Admin-restricted. Never log these values, and never put them in crm_import_rows.raw.';
COMMENT ON COLUMN public.member_bank_details.iban IS
  'Parsed IBAN where the source cell contained one. Treat as a credential.';
COMMENT ON COLUMN public.member_bank_details.source_text IS
  'The CRM cell verbatim - bank name, IBAN and account holder run together in most rows.';

DROP TRIGGER IF EXISTS update_member_bank_details_updated_at ON public.member_bank_details;
CREATE TRIGGER update_member_bank_details_updated_at
  BEFORE UPDATE ON public.member_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.member_bank_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view member bank details" ON public.member_bank_details;
CREATE POLICY "Admins can view member bank details" ON public.member_bank_details
  FOR SELECT TO authenticated USING ((SELECT public.is_admin((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Admins can manage member bank details" ON public.member_bank_details;
CREATE POLICY "Admins can manage member bank details" ON public.member_bank_details
  FOR ALL TO authenticated USING ((SELECT public.is_admin((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Members can view own bank details" ON public.member_bank_details;
CREATE POLICY "Members can view own bank details" ON public.member_bank_details
  FOR SELECT TO authenticated USING (member_id = (SELECT public.get_member_id((SELECT auth.uid()))));
