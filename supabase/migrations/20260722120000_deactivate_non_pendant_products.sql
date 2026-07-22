-- Pendant-first launch — hide the multi-device catalog (LAUNCH_SCOPE.md §2).
--
-- Deactivate every product except the GPS SOS pendant so the non-pendant devices
-- (glucose monitor, medication dispenser, family pack, …) are hidden from the
-- public site and API. NOTHING is deleted — rows stay intact; phase 2 re-activates
-- them by flipping is_active back to true (see the reversal note below).
--
-- Generic and parameterised: keyed off slug, not per-product one-offs.

UPDATE public.products
SET is_active = false
WHERE slug IS DISTINCT FROM 'pendant'
  AND is_active IS DISTINCT FROM false;

-- Ensure the pendant itself stays live at launch.
UPDATE public.products
SET is_active = true
WHERE slug = 'pendant'
  AND is_active IS DISTINCT FROM true;

-- Reversal (phase 2 — un-hide the catalog):
--   UPDATE public.products SET is_active = true WHERE slug IS DISTINCT FROM 'pendant';
