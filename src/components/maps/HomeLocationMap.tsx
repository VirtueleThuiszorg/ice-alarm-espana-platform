import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { round6 } from "@/lib/homeLocation";

/**
 * THE ONLY MAP IN THIS APP THAT WE DRAW OURSELVES — Leaflet over OpenStreetMap tiles.
 *
 * WHY A SECOND PROVIDER EXISTS AT ALL, since `LocationMap` already shows a map. That component
 * is a Google Maps *embed iframe*, and an iframe cannot carry a draggable pin: nothing outside
 * it can read where the pin ended up. A member nudging a marker onto their own front door is
 * the entire point of this feature, so the picker needs a map we render.
 *
 * Leaflet + OSM tiles, deliberately: no API key, no billing account, no per-load cost, and the
 * member's coordinates are not handed to Google on every page view of their own dashboard. The
 * Google links stay exactly where they were — "Open in Maps" and "Directions" are one click by
 * a person who has chosen to go there, which is a different thing from a silent iframe.
 *
 * This module is LAZY-LOADED (see SetHomeLocationDialog / HomeLocationRow). Leaflet and its
 * stylesheet are ~45 KB gzipped and belong nowhere near the first paint of an app read by people
 * on rural Spanish connections.
 *
 * KEYBOARD AND TOUCH ARE NOT AFTERTHOUGHTS. Dragging a pin with a mouse is the one interaction
 * an arthritic hand cannot do, so the pin also moves on a plain tap anywhere on the map, and
 * the four large nudge buttons beside it move it in fixed steps and a keyboard can
 * reach every one. A map with only a drag handle is a control some of our members cannot use at all.
 */

export interface HomeLocationMapProps {
  lat: number;
  lng: number;
  /** True in the picker: the pin can be moved. False in the preview: nothing is draggable. */
  interactive: boolean;
  onMove?: (coords: { lat: number; lng: number }) => void;
  /** Tailwind height class. Never a px font or size — the A/A control has to keep working. */
  heightClass?: string;
  /** What a screen reader is told this map is. Required: an unlabelled map is a blank div. */
  ariaLabel: string;
}

export default function HomeLocationMap({
  lat,
  lng,
  interactive,
  onMove,
  heightClass = "h-64",
  ariaLabel,
}: HomeLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Kept in a ref so re-renders do not have to tear the map down to see a new callback.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [lat, lng],
      zoom: 18, // A front door needs building-level zoom, not street-level.
      // The preview is a picture. Nothing about it should move under a member's thumb while
      // they are scrolling the page.
      dragging: interactive,
      scrollWheelZoom: false,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      zoomControl: interactive,
      keyboard: interactive,
      attributionControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      // Required by the OSM tile usage policy, and it is also just correct.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    /*
      A CSS PIN, NOT AN IMAGE. Leaflet's default marker resolves its icon relative to the
      stylesheet, which every bundler breaks in a different way — the classic "map with no
      marker". A divIcon has no asset to lose, and it can be made larger than the 25x41 default,
      which a 78-year-old looking for the pin actually needs.
    */
    const icon = L.divIcon({
      className: "home-location-pin",
      html: '<span class="home-location-pin__dot" aria-hidden="true"></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([lat, lng], {
      icon,
      draggable: interactive,
      keyboard: false,
      // Read out where the pin is, for anyone who cannot see it.
      alt: ariaLabel,
    }).addTo(map);

    if (interactive) {
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onMoveRef.current?.({ lat: round6(p.lat), lng: round6(p.lng) });
      });
      // A TAP MOVES THE PIN. The interaction a hand that cannot drag can still perform.
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onMoveRef.current?.({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) });
      });
    }

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Deliberately built once. Position changes are pushed to the existing map below rather than
    // remounting it, which would lose the member's zoom and pan mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position pushed in, so a nudge button or a fresh geolocation fix moves the pin the member
  // is looking at instead of rebuilding the map underneath them.
  useEffect(() => {
    markerRef.current?.setLatLng([lat, lng]);
    mapRef.current?.panTo([lat, lng], { animate: true });
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      /*
        THE PREVIEW IS A PICTURE; ONLY THE PICKER IS A WIDGET.

        Both were `role="application"`, which tells a screen reader to stop interpreting keys
        and hand every one of them to the page. That is the right trade for the picker: it is a
        custom control whose whole job is to move a pin under arrow keys and taps. It is the
        wrong trade for the preview on a member's account page, which has no interaction at all
        — dragging, zoom and keyboard are all off. There, application mode costs a member their
        browse-mode navigation and gives them nothing back: the pin is not reachable, because
        there is nothing to reach.

        `role="img"` is what the preview actually is. The same `aria-label` is then read as a
        described image the member can move past, instead of an application they are trapped in.
      */
      role={interactive ? "application" : "img"}
      aria-label={ariaLabel}
      className={`w-full ${heightClass} overflow-hidden rounded-lg border`}
      data-testid="home-location-map"
    />
  );
}
