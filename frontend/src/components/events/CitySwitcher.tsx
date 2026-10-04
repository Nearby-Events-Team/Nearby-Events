import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2, MapPin, Search } from 'lucide-react';
import { useCity } from '@/hooks/useCity';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Letters and digits only, lower-cased: the same matching the API uses for place names. */
function placeKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Edit distance between two place keys, for "Did you mean Coimbatore?" on a typo. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/**
 * The home page's "City" control. Lists the cities that have upcoming events (busiest
 * first), "All cities", and lets the visitor type any other city, which simply shows an
 * empty board with an invitation to post the first event there.
 *
 * Same dropdown behaviour as the share menu: closes on Escape and on an outside click,
 * and hands focus back to the trigger.
 */
export function CitySwitcher({ className }: { className?: string }) {
  const [city, setCity] = useCity();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [cities, setCities] = useState<Array<{ name: string; count: number }> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Loaded when first opened: the list is only needed once someone wants to switch.
  useEffect(() => {
    if (!open || cities) return;
    api
      .cities()
      .then((result) => setCities(result.cities))
      .catch(() => setCities([]));
  }, [open, cities]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const query = placeKey(typed);
  const shown = useMemo(
    () => (cities ?? []).filter((entry) => !query || placeKey(entry.name).includes(query)),
    [cities, query],
  );
  // A typed city that is not on the list yet can still be picked (it will be empty).
  const exact = (cities ?? []).find((entry) => placeKey(entry.name) === query);
  const canPickTyped = typed.trim().length >= 2 && !exact;
  // A near-miss of a city that has events ("Coimbatre"): about one typo per four letters.
  const suggestion =
    query.length >= 4 && !exact && shown.length === 0
      ? (cities ?? [])
          .map((entry) => ({ entry, distance: editDistance(query, placeKey(entry.name)) }))
          .filter(({ distance }) => distance <= Math.max(1, Math.floor(query.length / 4)))
          .sort((a, b) => a.distance - b.distance)[0]?.entry ?? null
      : null;

  const choose = (next: string) => {
    setCity(next);
    // The sections that change are below the fold, so confirm the switch up front.
    const count = (cities ?? []).find((entry) => placeKey(entry.name) === placeKey(next))?.count ?? 0;
    if (!next) toast.info('Showing all cities', 'Every upcoming event on the board.');
    else if (count > 0) toast.success(`Showing ${next}`, `${count} upcoming event${count === 1 ? '' : 's'} in ${next}.`);
    else toast.info(`No events in ${next} yet`, 'Be the first to post one.');
    setTyped('');
    setOpen(false);
    triggerRef.current?.focus();
  };

  const itemClass =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-sunken';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`City: ${city || 'All cities'}. Change city`}
        className="inline-flex items-center gap-1 rounded-md font-display text-sm font-bold text-ink underline decoration-dotted decoration-ink-muted underline-offset-4 transition-colors hover:text-brand sm:text-base"
      >
        {city || 'All cities'}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a city"
          // Opens upwards: the switcher sits at the bottom of the hero, which clips its
          // overflow (for the background glow), so a downward panel would be cut off.
          className="absolute bottom-full left-0 z-30 mb-2 w-72 animate-scale-in overflow-hidden rounded-xl bg-surface-raised p-1.5 shadow-lg ring-1 ring-border"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (exact) choose(exact.name);
              else if (canPickTyped) choose(typed.trim());
            }}
            className="relative p-1"
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type a city…"
              maxLength={100}
              aria-label="Type a city"
              className="w-full rounded-lg bg-surface py-2 pl-9 pr-3 text-sm text-ink ring-1 ring-border placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </form>

          <ul className="max-h-64 overflow-y-auto py-1">
            {!query && (
              <li>
                <button type="button" onClick={() => choose('')} className={itemClass}>
                  <Globe2 className="h-4 w-4 text-ink-soft" aria-hidden="true" />
                  <span className="flex-1">All cities</span>
                  {!city && <Check className="h-4 w-4 text-brand" aria-label="selected" />}
                </button>
              </li>
            )}

            {cities === null && <li className="px-3 py-2 text-sm text-ink-muted">Loading cities…</li>}

            {shown.map((entry) => (
              <li key={entry.name}>
                <button type="button" onClick={() => choose(entry.name)} className={itemClass}>
                  <MapPin className="h-4 w-4 text-ink-soft" aria-hidden="true" />
                  <span className="flex-1">{entry.name}</span>
                  <span className="text-xs tabular-nums text-ink-muted">{entry.count}</span>
                  {placeKey(city) === placeKey(entry.name) && (
                    <Check className="h-4 w-4 text-brand" aria-label="selected" />
                  )}
                </button>
              </li>
            ))}

            {suggestion && (
              <li>
                <button type="button" onClick={() => choose(suggestion.name)} className={itemClass}>
                  <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
                  <span className="flex-1">
                    Did you mean <span className="font-semibold">{suggestion.name}</span>?
                  </span>
                  <span className="text-xs tabular-nums text-ink-muted">{suggestion.count}</span>
                </button>
              </li>
            )}

            {canPickTyped && (
              <li>
                <button type="button" onClick={() => choose(typed.trim())} className={itemClass}>
                  <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
                  <span className="flex-1">
                    Show <span className="font-semibold">{typed.trim()}</span>
                    <span className="block text-xs font-normal text-ink-muted">No events there yet</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
