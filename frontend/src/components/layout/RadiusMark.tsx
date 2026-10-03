/**
 * The Radius brand mark: two rings around a teal centre dot. Rings use currentColor so
 * the mark takes the badge's text colour; size it with className.
 */
export function RadiusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="2" opacity="0.85" />
      <circle cx="12" cy="12" r="2.4" fill="#5eead4" />
    </svg>
  );
}
