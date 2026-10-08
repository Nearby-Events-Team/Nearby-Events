// Generates the Radius architecture diagram as SVG. Edit the boxes below when the
// architecture changes, then:
//
//   node scripts/make-architecture-diagram.mjs docs/architecture-diagram.svg
//
// and export the PNG the README shows (headless Chrome, 2x for sharp text):
//
//   "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --hide-scrollbars ^
//     --force-device-scale-factor=2 --window-size=1600,1010 ^
//     --screenshot="%CD%\Architecture diagram.png" "file:///%CD%/docs/architecture-diagram.svg"
import fs from 'node:fs';

const W = 1600, H = 1010;
const FONT = "'Segoe UI', Roboto, Arial, sans-serif";
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const lanes = [
  { x: 24, w: 372, title: '1 · People & browser', tint: '#e8f0fe', ink: '#1a56c4' },
  { x: 412, w: 372, title: '2 · Compute (Cloud Run)', tint: '#e6f4ea', ink: '#137333' },
  { x: 800, w: 400, title: '3 · Data, AI & messaging', tint: '#fef7e0', ink: '#8a4b00' },
  { x: 1216, w: 360, title: '4 · Operations & delivery', tint: '#fce8e6', ink: '#b3261e' },
];

let out = [];
const add = (s) => out.push(s);

function box(x, y, w, h, title, lines, { accent = '#9aa7b8', titleColor = '#13213a', strong = false } = {}) {
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="${accent}" stroke-width="${strong ? 2.5 : 1.5}"/>`);
  add(`<text x="${x + 16}" y="${y + 28}" font-size="17" font-weight="700" fill="${titleColor}">${esc(title)}</text>`);
  lines.forEach((line, i) => add(`<text x="${x + 16}" y="${y + 52 + i * 20}" font-size="14" fill="#3c4858">${esc(line)}</text>`));
}
const arrow = (d, { dashed = false, color = '#4a5568' } = {}) =>
  add(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2"${dashed ? ' stroke-dasharray="7 5"' : ''} marker-end="url(#ah)"/>`);
const label = (x, y, text, anchor = 'middle') =>
  add(`<text x="${x}" y="${y}" font-size="13" font-weight="600" fill="#2d3748" text-anchor="${anchor}" paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round">${esc(text)}</text>`);

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`);
add(`<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4a5568"/></marker></defs>`);
add(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

// Header
add(`<text x="24" y="44" font-size="30" font-weight="800" fill="#13213a">Radius · System architecture</text>`);
add(`<text x="24" y="72" font-size="16" fill="#4a5568">Live on Google Cloud · project nearby-events-510418 · Cloud Run + Firestore in asia-south1 (Mumbai)</text>`);

// Lanes
for (const l of lanes) {
  add(`<rect x="${l.x}" y="92" width="${l.w}" height="830" rx="16" fill="${l.tint}"/>`);
  add(`<text x="${l.x + 16}" y="120" font-size="16" font-weight="800" fill="${l.ink}" letter-spacing="0.3">${esc(l.title)}</text>`);
}

// Lane 1
box(44, 140, 332, 128, 'Firebase Authentication', ['Email + password (verified email)', 'or Google sign-in', 'Signed ID tokens (JWT) · password reset'], { accent: '#1a56c4' });
box(44, 318, 332, 172, 'Browser · React 18 + TypeScript', ['Event grid · Google map · month calendar', 'Post form + Snap-a-Poster', 'Notification bell · city switcher', 'Share links (?event=id) · QR flyer', 'Installable on phones (PWA)'], { accent: '#1a56c4', strong: true });
box(44, 540, 332, 112, 'Google Maps Platform', ['Maps JavaScript API + Places API (New)', 'Key locked to our site + daily caps'], { accent: '#1a56c4' });
box(44, 702, 332, 132, 'Free external APIs (no key)', ['Open-Meteo: event-day weather', 'OpenStreetMap fallback: Nominatim', 'geocoding, Photon suggestions, Leaflet', '(called by the API, cached)'], { accent: '#9aa7b8' });

arrow('M210,318 L210,272'); label(210, 300, 'sign in · ID token');
arrow('M210,490 L210,536'); label(210, 518, 'map · address search');

// Lane 2
box(432, 140, 332, 150, 'Cloud Run · nearby-events', ['Node 20 + Express (TypeScript)', 'Serves the website and /api/*', 'Autoscales 0 → 10 instances', 'Docker image · TZ Asia/Kolkata'], { accent: '#137333', strong: true });
box(432, 340, 332, 172, 'Security middleware', ['Helmet security headers (CSP)', 'Firebase ID-token check (Admin SDK)', 'Verified email required to post', 'Zod validation on every input', 'Rate limits · 12 AI calls/min/user'], { accent: '#137333' });
box(432, 562, 332, 172, 'Services', ['Events · sorting · expiry', 'RSVP + check-in (transactions)', 'Points · Q&A · saved events', 'AI: extract · assist · smart search', 'Notifications · recommendations'], { accent: '#137333' });

arrow('M376,404 L428,404'); label(402, 392, 'HTTPS');
add(`<text x="402" y="424" font-size="12" fill="#4a5568" text-anchor="middle">+ token</text>`);
arrow('M598,290 L598,336');
arrow('M598,512 L598,558');
arrow('M432,720 L380,720'); // services → free external APIs

// Lane 3
box(820, 140, 360, 152, 'Cloud Firestore (Native)', ['events → rsvps, comments', 'users → attending, saved, notifications', 'Transactions keep RSVP counts exact', '7 composite indexes · rules deny', 'client writes and event reads'], { accent: '#8a4b00' });
box(820, 322, 360, 92, 'Cloud Storage', ['Event photos · ≤ 5 MB', 'File type checked from the bytes'], { accent: '#8a4b00' });
box(820, 444, 360, 132, 'Vertex AI · Gemini', ['3.5 Flash-Lite (global endpoint)', '→ 3.1 Flash-Lite → built-in rules', 'Snap-a-Poster · AI assist · smart search', 'Structured JSON · 12 s timeout'], { accent: '#8a4b00' });
box(820, 606, 360, 152, 'Cloud Pub/Sub', ['Topic: event-notifications', 'Cancel · time/venue change · delete', 'Push subscription → token-protected', '/api/notifications/pubsub-push', '→ bell of everyone who RSVPd'], { accent: '#8a4b00', strong: true });

// Data bus from Services
add(`<path d="M764,640 L792,640 L792,216" fill="none" stroke="#4a5568" stroke-width="2"/>`);
arrow('M792,216 L816,216');
arrow('M792,368 L816,368');
arrow('M792,510 L816,510');
arrow('M792,640 L816,640'); label(792, 668, 'publish');
arrow('M820,730 L768,730', { dashed: true }); label(794, 750, 'push');

// Lane 4
box(1236, 140, 320, 96, 'Cloud Scheduler', ['Hourly: POST /api/maintenance/expire', 'with a secret header'], { accent: '#b3261e' });
box(1236, 262, 320, 92, 'Secret Manager', ['Maintenance token, injected', 'into Cloud Run at start-up'], { accent: '#b3261e' });
box(1236, 380, 320, 152, 'Cloud Logging + Monitoring', ['Structured JSON logs · 7 log-based metrics', 'Live Operations dashboard (36 tiles)', 'SLOs: 99.5% available, 95% < 500 ms', 'Alerts: 5xx, p95, AI failures, burn rate', 'Uptime check every 5 min → email'], { accent: '#b3261e' });
box(1236, 558, 320, 152, 'Delivery', ['GitHub → GitHub Actions CI:', 'typecheck, build, 187 tests on PRs', 'deploy.ps1 → Cloud Build →', 'Artifact Registry → Cloud Run', '(manual, after testing)'], { accent: '#b3261e' });
box(1236, 736, 320, 98, 'Cost guardrails', ['$300 free trial · $25 budget alert', 'Maps quota caps · cheapest model', 'Cloud Run scales to zero'], { accent: '#b3261e' });

// Scheduler → Cloud Run over the top
arrow('M1236,170 L1222,170 L1222,132 L700,132 L700,136'); label(1112, 128, 'hourly expiry call');

// Footer legend
add(`<line x1="24" y1="952" x2="64" y2="952" stroke="#4a5568" stroke-width="2" marker-end="url(#ah)"/>`);
add(`<text x="74" y="957" font-size="14" fill="#3c4858">request / data</text>`);
add(`<line x1="200" y1="952" x2="240" y2="952" stroke="#4a5568" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#ah)"/>`);
add(`<text x="250" y="957" font-size="14" fill="#3c4858">asynchronous push (Pub/Sub)</text>`);
add(`<text x="${W - 24}" y="957" font-size="14" fill="#4a5568" text-anchor="end">Radius · everything happening within your radius · github.com/Nearby-Events-Team/Nearby-Events</text>`);
add(`<text x="24" y="990" font-size="13" fill="#6b7686">Without keys the same code runs locally: Firebase emulators, photos on disk, OpenStreetMap maps and a rule-based AI fallback (npm run dev).</text>`);

add('</svg>');
const svg = out.join('\n');
fs.writeFileSync(process.argv[2], svg);
console.log('wrote', process.argv[2], Math.round(svg.length / 1024), 'KB');
