import { useSyncExternalStore } from 'react';

/**
 * What a first-time visitor sees: all cities, so the page reads "Happening Around You"
 * wherever they are. Coimbatore, the pilot city, still heads the switcher's list.
 */
export const DEFAULT_CITY = '';

const STORAGE_KEY = 'nearby-events.city';

/**
 * The city the visitor is browsing, shared by the home page, Explore and the post form.
 * An empty string means "all cities". Remembered per browser; storage can be missing or
 * blocked (private windows, previews), so every access is guarded.
 */
function readStored(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_CITY : stored;
  } catch {
    return DEFAULT_CITY;
  }
}

let current = typeof window === 'undefined' ? DEFAULT_CITY : readStored();
const listeners = new Set<() => void>();

export function getSelectedCity(): string {
  return current;
}

export function setSelectedCity(city: string): void {
  const next = city.trim();
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered across visits, but still applies for this one.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** [city, setCity]: city is '' for all cities. */
export function useCity(): [string, (city: string) => void] {
  const city = useSyncExternalStore(subscribe, getSelectedCity, getSelectedCity);
  return [city, setSelectedCity];
}
