const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'our', 'are', 'was',
  'will', 'you', 'all', 'can', 'has', 'have', 'into', 'out', 'about', 'near',
]);

export function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Matching key for neighbourhood and city names: lowercase letters and digits only.
 * Google writes "R.S. Puram", people write "R S Puram" or "RS Puram" — all become
 * "rspuram", so the neighbourhood filter treats them as the same place.
 * Kept separate from normalise(), which keyword search relies on.
 */
export function placeKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Tokens stored on the document so a keyword match never requires reading the whole
 * description. Firestore has no full-text index; keeping tokens on the document is
 * what makes the in-memory relevance pass cheap.
 */
export function buildKeywords(parts: Array<string | undefined | null>): string[] {
  const tokens = new Set<string>();

  for (const part of parts) {
    if (!part) continue;
    for (const raw of normalise(part).split(/[^a-z0-9]+/)) {
      if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
      tokens.add(raw);
    }
  }

  // Firestore caps array fields; 60 tokens is far more than enough for matching.
  return Array.from(tokens).slice(0, 60);
}

export interface Searchable {
  title: string;
  description: string;
  summary?: string;
  category: string;
  tags: string[];
  location: string;
  address: string;
  neighborhood: string;
  city: string;
}

/**
 * Words that carry no topic of their own ("events near me", "where can I find stuff").
 * Free-text search skips them, so "music events near me" searches for "music", and the
 * rule-based smart search drops them from its keywords.
 */
export const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'any', 'some', 'all', 'me', 'my', 'i', 'we', 'us', 'our', 'you', 'your',
  'show', 'find', 'search', 'looking', 'look', 'want', 'need', 'give', 'list', 'see', 'get',
  'event', 'events', 'thing', 'things', 'stuff', 'activity', 'activities', 'something',
  'anything', 'happening', 'going', 'on', 'to', 'do', 'for', 'with', 'in', 'at', 'near',
  'around', 'nearby', 'close', 'by', 'of', 'and', 'or', 'is', 'are', 'there', 'what',
  "what's", 'whats', 'where', 'when', 'this', 'that', 'please', 'can', 'could', 'would',
  'like', 'good', 'best', 'fun', 'cool', 'nice', 'local', 'area', 'from', 'up', 'coming',
  'upcoming', 'next',
]);

/**
 * Weighted relevance score. Returns 0 when the record does not match at all, so the
 * caller can both filter and order by the same number.
 */
export function relevanceScore(record: Searchable, query: string): number {
  const q = normalise(query);
  if (!q) return 1;

  // Every remaining term must match (below), so filler words would empty the results:
  // no event's text contains "events near me".
  const terms = q
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((term) => term && !FILLER_WORDS.has(term));
  if (!terms.length) return 1;

  const fields: Array<[string, number]> = [
    [normalise(record.title), 10],
    [normalise(record.category), 6],
    [normalise(record.neighborhood), 6],
    [normalise(record.city), 5],
    [normalise(record.location), 4],
    [normalise(record.address), 3],
    [normalise(record.tags.join(' ')), 3],
    [normalise(record.summary || ''), 2],
    [normalise(record.description), 2],
  ];

  let score = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    let termScore = 0;
    for (const [text, weight] of fields) {
      if (!text) continue;
      if (text === term) termScore = Math.max(termScore, weight * 3);
      else if (text.startsWith(term)) termScore = Math.max(termScore, weight * 2);
      else if (text.includes(term)) termScore = Math.max(termScore, weight);
    }
    if (termScore > 0) matchedTerms += 1;
    score += termScore;
  }

  // Every term has to land somewhere, otherwise "sports coimbatore" would match a
  // music event in Coimbatore.
  return matchedTerms === terms.length ? score : 0;
}

/** "music events near me", "anything nearby?" — the person wants the distance filter. */
export function wantsNearby(query: string): boolean {
  return /\b(near\s*me|nearby|near\s*by|around\s*me|close\s*to\s*me|close\s*by)\b/i.test(query);
}
