/**
 * NOMINATIM — the one place this app talks to a geocoder, in both directions.
 *
 * Both functions lived at the bottom of `LocationMap.tsx`, which is a component file, and
 * eslint said what the problem was: *"Fast refresh only works when a file only exports
 * components. Use a new file to share constants or functions between components."* Adding a
 * second one there would have made that two warnings instead of one, so they moved here — which
 * is also where a reader looks for them. `reverseGeocode` had no importers outside that file.
 *
 * WHY OPENSTREETMAP AND NOT GOOGLE. No API key, no billing account, and no per-request cost —
 * and the Google links this app already opens ("Open in Maps", "Directions") are a person
 * choosing to go there, which is a different thing from us handing over every member address we
 * hold. The tile server used by the pin picker is the same project's, for the same reasons.
 *
 * NEITHER MUST HANG. Nominatim is a free public service with no uptime promise, and a fetch with
 * no deadline is not slow but indefinite: the pin picker shows a loading skeleton while a
 * forward lookup is in flight, so a request that never settles leaves a member staring at a grey
 * box with no way forward. Measured in a real browser with the host unreachable, that is exactly
 * what happened. Eight seconds, then the caller falls back.
 */

/** How long either lookup may take before we give up and let the caller fall back. */
const GEOCODE_TIMEOUT_MS = 8_000;

async function nominatim(path: string): Promise<unknown | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/${path}`, {
      signal: abort.signal,
      headers: {
        "Accept-Language": "es,en",
        "User-Agent": "ICE-Alarm-Espana-App",
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Coordinates → a human address. Used to name a pendant fix on the operator screens. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const data = (await nominatim(
    `reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
  )) as { display_name?: string } | null;
  return data?.display_name || null;
}

/**
 * Address → coordinates. The other direction, and it exists for ONE job.
 *
 * It CENTRES the pin picker, so a member is nudging a marker that is already near the right
 * building instead of panning across Spain. Its answer is never saved as a home location on its
 * own: a geocoded rooftop in rural Almería is routinely a hundred metres from the gate, which is
 * exactly the problem the member-confirmed pin exists to fix. Anything stored from here would be
 * `source = 'geocoded'`, and the SOS card labels that as unconfirmed.
 *
 * Country-scoped to Spain: "Calle Mayor 1" matches in forty countries, and the members of this
 * service are in one.
 */
export async function forwardGeocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim();
  if (!query) return null;
  const data = await nominatim(
    `search?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(query)}`,
  );
  const first = Array.isArray(data) ? data[0] : null;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
