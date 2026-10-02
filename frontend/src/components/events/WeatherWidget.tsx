import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  Wind,
  Droplets,
} from 'lucide-react';
import { Card } from '@/components/ui/Primitives';
import { cn } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

/* Open-Meteo WMO weather codes → description + icon */
function describeWeather(code: number): { label: string; Icon: React.ElementType; color: string } {
  if (code === 0) return { label: 'Clear sky', Icon: Sun, color: 'text-amber-500' };
  if (code <= 2) return { label: 'Partly cloudy', Icon: Cloud, color: 'text-slate-400' };
  if (code === 3) return { label: 'Overcast', Icon: Cloud, color: 'text-slate-500' };
  if (code <= 49) return { label: 'Foggy / haze', Icon: Cloud, color: 'text-slate-400' };
  if (code <= 57) return { label: 'Drizzle', Icon: CloudDrizzle, color: 'text-sky-400' };
  if (code <= 67) return { label: 'Rain', Icon: CloudRain, color: 'text-sky-500' };
  if (code <= 77) return { label: 'Snow', Icon: CloudSnow, color: 'text-blue-300' };
  if (code <= 82) return { label: 'Rain showers', Icon: CloudRain, color: 'text-sky-500' };
  if (code <= 86) return { label: 'Snow showers', Icon: CloudSnow, color: 'text-blue-300' };
  if (code <= 99) return { label: 'Thunderstorm', Icon: CloudLightning, color: 'text-violet-500' };
  return { label: 'Unknown', Icon: Cloud, color: 'text-slate-400' };
}

interface WeatherDay {
  date: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  windSpeed: number;
  precipProb: number;
}

async function fetchWeather(lat: number, lng: number, date: string): Promise<WeatherDay | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,precipitation_probability_max',
    start_date: date,
    end_date: date,
    timezone: 'auto',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weathercode: number[];
      windspeed_10m_max: number[];
      precipitation_probability_max: number[];
    };
  };

  if (!json.daily?.time?.length) return null;

  return {
    date: json.daily.time[0] ?? date,
    tempMax: Math.round(json.daily.temperature_2m_max[0] ?? 0),
    tempMin: Math.round(json.daily.temperature_2m_min[0] ?? 0),
    weatherCode: json.daily.weathercode[0] ?? 0,
    windSpeed: Math.round(json.daily.windspeed_10m_max[0] ?? 0),
    precipProb: Math.round(json.daily.precipitation_probability_max[0] ?? 0),
  };
}

/* In-memory cache for geocoded city coordinates to avoid repeated lookups */
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

async function geocodeLocation(city?: string, neighborhood?: string): Promise<{ lat: number; lng: number } | null> {
  const target = city?.trim() || neighborhood?.trim();
  if (!target) return null;
  if (geocodeCache.has(target)) return geocodeCache.get(target)!;

  try {
    let res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(target)}&count=1`);
    let data = res.ok ? await res.json() : null;

    if (!data?.results?.length && neighborhood && target !== neighborhood.trim()) {
      res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(neighborhood.trim())}&count=1`);
      data = res.ok ? await res.json() : null;
    }

    if (data?.results?.[0]?.latitude != null && data?.results?.[0]?.longitude != null) {
      const coords = {
        lat: Number(data.results[0].latitude),
        lng: Number(data.results[0].longitude),
      };
      geocodeCache.set(target, coords);
      return coords;
    }
  } catch {
    // network or parse error, ignore
  }

  geocodeCache.set(target, null);
  return null;
}

/** Check if a date (YYYY-MM-DD) is within the next 16 days, which is Open-Meteo's forecast window. */
function isWithinForecastWindow(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return false;

  const eventDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 16);

  return eventDate >= today && eventDate <= maxDate;
}

export function WeatherWidget({ event, className }: { event: EventRecord; className?: string }) {
  const [weather, setWeather] = useState<WeatherDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const inWindow = isWithinForecastWindow(event.date);

  useEffect(() => {
    if (!inWindow) return;

    let active = true;
    setLoading(true);
    setError(false);

    async function loadForecast() {
      let lat = event.latitude;
      let lng = event.longitude;

      if (lat === null || lng === null) {
        if (event.city || event.neighborhood) {
          const coords = await geocodeLocation(event.city, event.neighborhood);
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }
      }

      if (lat === null || lng === null) {
        if (active) setLoading(false);
        return;
      }

      try {
        const data = await fetchWeather(lat, lng, event.date);
        if (!active) return;
        setWeather(data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadForecast();

    return () => {
      active = false;
    };
  }, [event.latitude, event.longitude, event.city, event.neighborhood, event.date, inWindow]);

  // Check if event is in the past (before today)
  const isPast = (() => {
    if (!event.date) return false;
    const parts = event.date.split('-').map(Number);
    if (parts.length < 3) return false;
    const eventDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return eventDate < today;
  })();

  /* If the event already finished, don't show the forecast */
  if (isPast) return null;

  /* If the event is far out (>16 days in future), show info note */
  if (!inWindow) {
    return (
      <Card className={cn('flex items-start gap-3 p-4', className)}>
        <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Weather forecast</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Available within 16 days of the event date.
          </p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={cn('p-4', className)}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Weather forecast</p>
        <div className="mt-3 flex animate-pulse gap-4">
          <div className="h-10 w-10 rounded-xl bg-surface-sunken" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-surface-sunken" />
            <div className="h-3 w-32 rounded bg-surface-sunken" />
          </div>
        </div>
      </Card>
    );
  }

  if (error || !weather) return null;

  const { label, Icon, color } = describeWeather(weather.weatherCode);

  return (
    <Card className={cn('p-4', className)} aria-label="Weather forecast for event day">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Weather forecast
        <span className="ml-1 font-normal normal-case text-ink-muted/60">· Open-Meteo</span>
      </p>

      <div className="mt-3 flex items-center gap-4">
        {/* Big icon */}
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken', color)}>
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>

        {/* Condition + temps */}
        <div className="min-w-0">
          <p className={cn('text-base font-bold', color)}>{label}</p>
          <div className="mt-0.5 flex items-baseline gap-1.5 text-sm text-ink">
            <span className="font-semibold">{weather.tempMax}°</span>
            <span className="text-ink-muted">/ {weather.tempMin}°C</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-sunken px-3 py-2">
          <Droplets className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink">{weather.precipProb}%</span>
          <span className="text-xs text-ink-muted">rain chance</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-sunken px-3 py-2">
          <Wind className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink">{weather.windSpeed}</span>
          <span className="text-xs text-ink-muted">km/h wind</span>
        </div>
      </div>

      {/* Outdoor warning */}
      {(weather.precipProb >= 60 || weather.weatherCode >= 60) && (
        <p className="mt-2 rounded-lg bg-sky-500/8 px-3 py-1.5 text-xs text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/20">
          Wet weather likely — consider packing a raincoat!
        </p>
      )}
      {weather.weatherCode >= 95 && (
        <p className="mt-2 rounded-lg bg-violet-500/8 px-3 py-1.5 text-xs text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/20">
          Thunderstorms possible — check for event updates.
        </p>
      )}
    </Card>
  );
}
