# Team APEX: who did what

Cognizant NPN GCP Hackathon · Use Case 5 (Local Event Bulletin Board) · Mentor: M N Sujeeth

Taken from the git history (every branch), not from memory. Where work was not merged into `main`,
it says so, and why.

## In one line each (say this to the judges)

| Person | One line |
|---|---|
| **Kanishkhan J** | "I built the first full version of the app: the React site, the Express API and the Firestore database, plus calendar export and QR flyers." |
| **Kanish Kumaran M** | "I built the smart part of discovery: *Recommended for you*, which scores how relevant each event is to you, and *Event Pulse*, which spots events that are trending." |
| **Mohammed Thahseen A** | "I built the community features: QR check-in at the door, neighbour points and the leaderboard, Q&A on events, saved events and event-day weather." |
| **Sanjay Thangavel** | "I built the alerts: when an organiser cancels or changes an event, Google Cloud Pub/Sub tells everyone who RSVPd, through the bell icon." |
| **Adithyaraman R** | "I built our first prototype with Gemini AI, and the idea of reading a poster or WhatsApp message to fill the form, which became Snap-a-Poster." |
| **Suhas Nethi** | "I brought everyone's work together and put it live on Google Cloud: deployment, the AI on Vertex AI, monitoring, tests and security, plus Snap-a-Poster and smart search." |

## A little more detail (for us, and for follow-up questions)

**Kanishkhan J**
- First complete app (2 Oct, 103 files): event board, post form, sorting, expiry, RSVP, categories,
  search, share links, Firebase sign-in, Firestore, Cloud Storage, Cloud Run setup.
- Google Calendar sync, iCal export and printable QR flyers.
- First hackathon report, slide outline, README and architecture diagram.

**Kanish Kumaran M** (repo owner)
- Event Intelligence: a relevance score from distance 30%, interest 25%, time 20%, freshness 15%,
  engagement 10%, with the reasons shown on each card ("Happening today", "Popular in your area").
- Event Pulse: compares RSVPs in the last 7 days with the 7 days before; labels events Trending
  (score ≥ 60), Growing (≥ 25) or Normal. 51 automated tests cover both.
- Accessibility and polish pass (PR #10).

**Mohammed Thahseen A**
- QR check-in with a code, so organisers see who actually came, not just who said yes.
- Neighbour points, levels and the leaderboard on the Community page.
- Q&A thread on each event, save for later, event-day weather (Open-Meteo).
- Map pins found from the typed address, a draggable pin, an OpenStreetMap map when there is no
  Google key, voice search, and `npm run dev`: the whole app on a laptop with one command.

**Sanjay Thangavel**
- In-app notifications through Cloud Pub/Sub: cancel, reactivate, time or venue change and delete all
  reach everyone who RSVPd (PR #4).
- Early prototypes of the OpenStreetMap map, comments, weather and share menu on his own branch; `main`
  already had versions of these from others, so they were not merged.

**Adithyaraman R**
- A separate Flask prototype with sign-in, an admin panel, delete requests and Gemini AI.
- Ideas we kept: reading posters with AI (Snap-a-Poster) and admin review (the planned report button).
- The prototype itself was not merged: it stored events in memory, so they disappeared on restart.

**Suhas Nethi**
- Merged all branches into one working app and kept `main` releasable (PRs #2–#14).
- Put it live on Google Cloud: Cloud Run, Firestore, Vertex AI (Gemini), Cloud Storage, Pub/Sub,
  Cloud Scheduler, Secret Manager, Cloud Build, Maps key limits, budget alert.
- Built Snap-a-Poster, Places autocomplete, month calendar, smart search, city switcher, verified
  email and forgot password, the installable app, and the "street flyer" redesign.
- Monitoring (dashboard, SLOs, alerts), GitHub Actions CI (187 tests), security fixes, the deck.

## If someone asks "so what did *you* do?"

1. Say your one line above.
2. Point at it on screen if you can (the demo has every feature).
3. If it was a team effort, say so: "Kanishkhan built the first version, and I added …".
