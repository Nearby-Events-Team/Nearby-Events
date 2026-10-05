# Radius: hackathon presentation (12 slides)

**Cognizant NPN GCP Hackathon · Use Case 5: Local Event Bulletin Board · Team APEX · Mentor: M N Sujeeth**

> Text version of the final deck (the designed deck, with screenshots and speaker notes, is the Slides
> artifact). Everything listed as built runs on the live site; targets are labelled as targets.
> Live: https://nearby-events-x2gneiue7a-el.a.run.app · Who presents what: bottom of this file.

---

### 1 · Title
Radius. Everything happening within your radius. Use Case 5, grown into a smart, location-aware community
event platform, live on Google Cloud. Team APEX: Kanish Kumaran M · Suhas Nethi · Adithyaraman R ·
Kanishkhan J · Mohammed Thahseen A · Sanjay Thangavel. Mentor: M N Sujeeth.

### 2 · Problem understanding
- Today: organiser makes a poster or message → prints it or forwards it to WhatsApp groups → residents see
  it only if they are in that group → people turn up with no RSVP → the poster stays up after the day.
- Breaks: reach depends on the right group · buried within hours · free text, nothing to filter by ·
  no headcount · stale notices.
- Stakeholders: residents, organisers (college clubs, RWAs, sports clubs, sellers), venues and campuses,
  the platform admin.

### 3 · Use Case 5 requirements → our implementation
| Requirement | Live implementation |
|---|---|
| Grid of event cards | Event board: title, date and time, place, description |
| Post form | Create Event form, plus Snap-a-Poster (AI) |
| Date / time sorting | Soonest first, sorted in the Firestore query |
| Expiration | Hidden at end time, plus an hourly Cloud Scheduler sweep |
| "I'm Going" counter | One RSVP per user, in a Firestore transaction |
| Category badges | 8 colour-coded categories, same colours everywhere |
| Search by neighbourhood | Area and city filters, spelling-proof |
| Shareable links | Unique `/?event=<id>` link, WhatsApp, QR flyer |

Enhancements: AI poster and WhatsApp extraction · natural-language search · Recommended for you ·
Event Pulse · near-me radius filter · Google map and calendar · Pub/Sub alerts · QR check-in and points ·
Q&A · Insights · live on Cloud Run.

### 4 · How the system works
1 Create (Firebase Auth) → 2 Validate (Cloud Run) → 3 AI enrichment (Vertex AI) → 4 Store and publish
(Firestore, Cloud Storage) → 5 Discover (Firestore, Maps) → 6 Rank: Event Intelligence + Event Pulse →
7 Engage: RSVP, share, check in (Firestore transactions) → 8 Keep current: Pub/Sub alerts, Scheduler
expiry → 9 Measure: Insights, Cloud Logging and Monitoring.
Real time: ended events filtered on every request; changes published to Pub/Sub at once; trending from
the last 7 days of RSVPs. Reusable: any city or campus is data. Easy: one command to run locally, one to
deploy. Integrates: WhatsApp, Google Calendar, iCal, QR, JSON API.

### 5 · Cloud architecture (all live)
See `Architecture diagram.png` / `docs/architecture-diagram.svg`. Four lanes: people and browser
(Firebase Auth, React app, Maps Platform, free APIs) · Cloud Run in Mumbai (Express API + app, security
middleware, services) · data, AI and messaging (Firestore, Cloud Storage, Vertex AI Gemini, Pub/Sub) ·
operations (Scheduler + Secret Manager, Logging + Monitoring, Cloud Build + Artifact Registry, cost guardrails).

### 6 · Data, tools and Google Cloud services
Each service, its job and the alternative we rejected (Cloud Run over a VM / App Engine, Firestore over
Cloud SQL / SQLite, Vertex AI over an API key, Pub/Sub over polling, Maps over Geoapify / Ola Maps).
Data model: `events/{id}` (+ `rsvps`, `comments`), `users/{uid}` (+ `attending`, `saved`, `notifications`).
Sample data: 45 seeded events (37 upcoming, 8 past), 15 neighbourhoods, 7 categories in use, 5 Amrita
campus events, plus real posts.

### 7 · AI and automation
Snap-a-Poster (idea: Adithyaraman R): a poster photo or WhatsApp forward → Gemini 3.5 Flash-Lite on Vertex
AI → pre-filled form → the organiser publishes. Smart search: "events where i can dance" → Music + "dance".
Guardrails: structured JSON, never invents a place or date, 12 s timeout → fallback model → rules,
12 AI calls a minute per user.

### 8 · Smart intelligence
- Event Intelligence (is this relevant to me?): distance 30%, interest 25%, time 20%, freshness 15%,
  engagement 10%, with the reasons on each card.
- Event Pulse (is it gaining traction?): 50% RSVPs per day over 7 days + 35% growth vs the previous
  7 days + 15% total RSVPs → Trending ≥ 60, Growing ≥ 25, Normal < 25. 51 automated tests.

### 9 · Analytics and impact
Live Insights page (seeded demo data plus real posts). Residents: faster nearby discovery, personal picks
with reasons, alerts. Organisers: post from a poster, RSVPs and real check-ins, share page and QR.
Platform: trend detection, analytics, scales to zero. Adoption: pilot on Amrita + 2 neighbourhoods →
organisers snap posters they already have → links and QR bridge WhatsApp → measure, then widen.
No business-impact percentages until a pilot measures them.

### 10 · Security, performance and monitoring
Measured: 239 ms p95 board API (live) · 187 tests on every PR · 0 ended events shown · 1–2 s per Gemini call.
Security: ID token on every write, owner-only edits, verified email to post, Zod + Helmet, rate limits
(240 reads, 40 writes, 12 AI calls a minute), Firestore rules, checked uploads; privacy: only name, email
and RSVPs stored. Monitoring: structured logs, 7 log-based metrics, 36-tile dashboard, 2 SLOs, 5 alerts.
KPIs: p95 < 500 ms, 99.5% availability, 0 stale events, time to post < 60 s (target), show-up rate.

### 11 · Roadmap, limitations, risks and learnings
- Built now: everything above, live.
- Next (in order): report button → admin review · trusted users whose reports hide an event until
  reviewed · verified badge for trusted organisers · paid events (UPI / Google Pay via a payment gateway) ·
  reminders, recurring events, Tamil.
- Limitations → next step: in-memory search ranking → search index · per-instance rate limits → shared
  store · recommendations need location and interests · single-day events.
- Risks: spam, AI misreads, Gemini outage, cost, each with its mitigation.
- Learnings: managed services let us build features, not servers · clean place names make search and maps
  work · AI helps most when people check its work.

### 12 · Close and team
"From a simple local bulletin board to an intelligent, location-aware community event platform."
Who built what: see `docs/team.md`. Thank you; questions.

---

## Who presents what (about 12 minutes)
| Who | Slides |
|---|---|
| Suhas Nethi | 1, then drives the live demo, then 10 |
| Mohammed Thahseen A | 2, 3 |
| Kanishkhan J | 4, 5 |
| Sanjay Thangavel | 6, 11 |
| Adithyaraman R | 7, Snap-a-Poster in the demo, 12 |
| Kanish Kumaran M | 8, 9 |
