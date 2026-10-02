import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Link } from 'react-router-dom';
import { ExternalLink, MapPin, MapPinOff, X } from 'lucide-react';
import { Badge, Card } from '@/components/ui/Primitives';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/common/States';
import { CategoryBadge } from './CategoryBadge';
import { cn, formatEventDate, formatRsvpCount, formatTimeRange, googleMapsLink } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** Coimbatore city centre — the fallback view when no event has coordinates. */
const DEFAULT_CENTER = { lat: 11.0168, lng: 76.9558 };

let googleLoaderPromise: Promise<typeof google.maps> | null = null;

function loadGoogleMaps(): Promise<typeof google.maps> {
  if (!MAPS_KEY) return Promise.reject(new Error('Google Maps API key is not configured.'));

  if (!googleLoaderPromise) {
    const loader = new Loader({ apiKey: MAPS_KEY, version: 'weekly' });
    googleLoaderPromise = loader.importLibrary('maps').then(() => google.maps);
  }

  return googleLoaderPromise;
}

let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).L) {
    return Promise.resolve((window as any).L);
  }
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => resolve((window as any).L);
      script.onerror = () => reject(new Error('Failed to load map library.'));
      document.head.appendChild(script);
    });
  }
  return leafletPromise;
}

const CATEGORY_PIN_COLORS: Record<string, string> = {
  Sports: '#10b981',
  Music: '#8b5cf6',
  Food: '#f97316',
  'Yard Sale': '#f59e0b',
  Community: '#0ea5e9',
  Education: '#3b82f6',
  Technology: '#6366f1',
  Other: '#64748b',
};

const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', stylers: [{ color: '#f6f7fb' }] },
  { featureType: 'water', stylers: [{ color: '#d9e4f5' }] },
];

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#18202f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8e9ab5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#18202f' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#242d3f' }] },
  { featureType: 'water', stylers: [{ color: '#0f1724' }] },
];

function pinIcon(color: string, selected: boolean): google.maps.Symbol {
  return {
    path: 'M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: selected ? 2.1 : 1.6,
    anchor: new google.maps.Point(12, 22),
  };
}

export function EventMap({
  events,
  theme,
  className,
}: {
  events: EventRecord[];
  theme: 'light' | 'dark';
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletLayerRef = useRef<any>(null);
  const googleMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const leafletMarkersRef = useRef<Map<string, any>>(new Map());

  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet' | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [selected, setSelected] = useState<EventRecord | null>(null);

  const mappable = useMemo(
    () => events.filter((event) => event.latitude !== null && event.longitude !== null),
    [events],
  );

  /* ------------------------------------------------------------ initialize map */
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    async function init() {
      // 1. Try Google Maps if API key is provided
      if (MAPS_KEY) {
        try {
          const maps = await loadGoogleMaps();
          if (cancelled || !containerRef.current) return;

          googleMapRef.current = new maps.Map(containerRef.current, {
            center: DEFAULT_CENTER,
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: true,
            clickableIcons: false,
            styles: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
          });

          setMapEngine('google');
          setStatus('ready');
          return;
        } catch {
          // If Google Maps fails (e.g. invalid key or billing issue), seamlessly fall back to Leaflet
        }
      }

      // 2. OpenStreetMap / Leaflet fallback (free, no API key needed)
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        // Clean container in case of previous instance
        if ((containerRef.current as any)._leaflet_id) {
          (containerRef.current as any)._leaflet_id = null;
          containerRef.current.innerHTML = '';
        }

        const map = L.map(containerRef.current, {
          center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
          zoom: 12,
          zoomControl: true,
        });

        const tileUrl =
          theme === 'dark'
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        const layer = L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        leafletMapRef.current = map;
        leafletLayerRef.current = layer;
        setMapEngine('leaflet');
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage('Unable to load map tiles. Please check your internet connection.');
        setStatus('error');
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  /* ------------------------------------------------------- theme updates */
  useEffect(() => {
    if (mapEngine === 'google') {
      googleMapRef.current?.setOptions({ styles: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE });
    } else if (mapEngine === 'leaflet' && leafletMapRef.current && (window as any).L) {
      const L = (window as any).L;
      if (leafletLayerRef.current) {
        leafletMapRef.current.removeLayer(leafletLayerRef.current);
      }
      const tileUrl =
        theme === 'dark'
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

      leafletLayerRef.current = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(leafletMapRef.current);
    }
  }, [theme, mapEngine]);

  /* ------------------------------------------------------------- markers */
  const syncMarkers = useCallback(() => {
    if (status !== 'ready') return;

    if (mapEngine === 'google') {
      const map = googleMapRef.current;
      if (!map) return;

      const existing = googleMarkersRef.current;
      const seen = new Set<string>();

      for (const event of mappable) {
        seen.add(event.id);
        const color = CATEGORY_PIN_COLORS[event.category] ?? CATEGORY_PIN_COLORS.Other!;
        const position = { lat: event.latitude!, lng: event.longitude! };

        const current = existing.get(event.id);
        if (current) {
          current.setPosition(position);
          current.setIcon(pinIcon(color, selected?.id === event.id));
          continue;
        }

        const marker = new google.maps.Marker({
          map,
          position,
          title: event.title,
          icon: pinIcon(color, false),
          optimized: false,
        });

        marker.addListener('click', () => setSelected(event));
        existing.set(event.id, marker);
      }

      for (const [id, marker] of existing) {
        if (!seen.has(id)) {
          marker.setMap(null);
          existing.delete(id);
        }
      }

      if (mappable.length === 0) return;

      const bounds = new google.maps.LatLngBounds();
      for (const event of mappable) bounds.extend({ lat: event.latitude!, lng: event.longitude! });

      if (mappable.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
      }
    } else if (mapEngine === 'leaflet') {
      const map = leafletMapRef.current;
      const L = (window as any).L;
      if (!map || !L) return;

      const existing = leafletMarkersRef.current;
      const seen = new Set<string>();

      for (const event of mappable) {
        seen.add(event.id);
        const color = CATEGORY_PIN_COLORS[event.category] ?? CATEGORY_PIN_COLORS.Other!;
        const isSel = selected?.id === event.id;

        const current = existing.get(event.id);
        if (current) {
          current.setLatLng([event.latitude!, event.longitude!]);
          continue;
        }

        const customIcon = L.divIcon({
          className: 'leaflet-custom-marker',
          html: `<div style="background-color: ${color}; width: ${isSel ? '26px' : '22px'}; height: ${isSel ? '26px' : '22px'}; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 3px 8px rgba(0,0,0,0.4); cursor: pointer; transition: transform 0.2s ease;"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });

        const marker = L.marker([event.latitude!, event.longitude!], {
          icon: customIcon,
          title: event.title,
        }).addTo(map);

        marker.on('click', () => setSelected(event));
        existing.set(event.id, marker);
      }

      for (const [id, marker] of existing) {
        if (!seen.has(id)) {
          map.removeLayer(marker);
          existing.delete(id);
        }
      }

      if (mappable.length === 0) return;

      if (mappable.length === 1) {
        map.setView([mappable[0].latitude!, mappable[0].longitude!], 14);
      } else {
        const bounds = L.latLngBounds(mappable.map((e) => [e.latitude!, e.longitude!]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      }
    }
  }, [mappable, selected?.id, status, mapEngine]);

  useEffect(() => {
    if (status === 'ready') syncMarkers();
  }, [status, syncMarkers]);

  useEffect(() => {
    if (selected && !mappable.some((event) => event.id === selected.id)) setSelected(null);
  }, [mappable, selected]);

  /* -------------------------------------------------------------- render */
  if (status === 'error') {
    return (
      <EmptyState
        icon={<MapPinOff className="h-7 w-7" aria-hidden="true" />}
        title="Map view is unavailable"
        description={errorMessage}
        className={className}
      />
    );
  }

  // Fallback direct link when one event is shown
  const singleEvent = mappable.length === 1 ? mappable[0] : null;

  return (
    <div className={cn('relative overflow-hidden rounded-panel ring-1 ring-border', className)}>
      <div
        ref={containerRef}
        className="h-full min-h-[22rem] w-full bg-surface-sunken"
        role="application"
        aria-label={`Map showing ${mappable.length} event${mappable.length === 1 ? '' : 's'}`}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-sunken">
          <div className="shimmer h-full w-full" />
          <p className="absolute text-sm font-medium text-ink-soft">Loading map…</p>
        </div>
      )}

      {/* Badge showing engine or unpinned count */}
      {status === 'ready' && (
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
          {mappable.length < events.length && (
            <Badge tone="warning" className="bg-surface/95 shadow-sm backdrop-blur">
              {events.length - mappable.length} event
              {events.length - mappable.length === 1 ? '' : 's'} without a pinned location
            </Badge>
          )}
          {mapEngine === 'leaflet' && (
            <Badge tone="neutral" className="bg-surface/90 text-[10px] shadow-sm backdrop-blur">
              OpenStreetMap
            </Badge>
          )}
        </div>
      )}

      {/* Quick link to open in Google Maps */}
      {singleEvent && (
        <a
          href={googleMapsLink(singleEvent)}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur transition-all hover:bg-surface hover:text-brand"
        >
          <MapPin className="h-3.5 w-3.5 text-brand" />
          Open in Google Maps
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      )}

      {/* ------------------------------------------------------ marker preview */}
      {selected && (
        <Card className="absolute bottom-4 left-4 right-4 z-[1000] animate-fade-up overflow-hidden shadow-lg sm:right-auto sm:w-80">
          <div className="flex gap-3 p-3">
            {selected.imageUrl && (
              <img
                src={selected.imageUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />
            )}

            <div className="min-w-0 flex-1">
              <CategoryBadge category={selected.category} size="sm" />

              <h3 className="clamp-2 mt-1.5 font-display text-sm font-bold leading-snug text-ink">
                {selected.title}
              </h3>

              <p className="mt-1 text-xs text-ink-soft">
                {formatEventDate(selected.startsAt)} · {formatTimeRange(selected.startTime, selected.endTime)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{formatRsvpCount(selected.rsvpCount)}</p>
            </div>

            <button
              type="button"
              onClick={() => setSelected(null)}
              className="-m-1 h-7 w-7 shrink-0 rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              aria-label="Close event preview"
            >
              <X className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="border-t border-border p-2">
            <ButtonLink to={`/events/${selected.id}`} variant="soft" size="sm" full>
              View full event
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* A plain list of the pins, so the map is not the only way to reach them. */}
      <ul className="sr-only">
        {mappable.map((event) => (
          <li key={event.id}>
            <Link to={`/events/${event.id}`}>
              {event.title} at {event.location}, {event.neighborhood}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
