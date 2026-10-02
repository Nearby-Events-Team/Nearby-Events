# Local Event Bulletin Board

A digital community board where users can post local events, meetups, or garage sales with a title, date, location, and brief description. Built for the Cognizant GCP Hackathon (Use Case 5).

## Features

### Core
- Card grid with next upcoming event first
- Post form: title, date/time, location, description
- Date-sorted query with expiry (hides past events)
- "I'm Going" RSVP counter (one per device, rate-limited)
- Color-coded category badges
- Neighborhood search
- Shareable links with unique event ID

### Standout (AI-Powered)
- **Snap-a-Poster**: Upload a poster photo → Gemini pre-fills event details
- **Ask the Board**: Natural-language event search
- **Smart Trust Layer**: AI moderation + duplicate detection
- **Plan My Trip**: Travel time, leave-by time, weather, calendar export
- **Live Board**: Real-time RSVP updates via Firestore listeners
- **Community Pulse**: Posts/day, hot categories, RSVP trends

## Architecture
```
User (PWA) → Cloud Run (Flask API) → Firestore / Vertex AI / Maps Platform
                                    → Cloud Storage (poster uploads)
Cloud Scheduler → Pub/Sub → Cloud Functions (cleanup, digests)
```

## Getting Started

### Local Development
```bash
pip install -r requirements.txt
python app.py
```

### Deploy to Cloud Run
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/event-board
gcloud run deploy event-board --image gcr.io/PROJECT_ID/event-board --allow-unauthenticated
```

## Environment Variables
Create a `.env` file:
```
GOOGLE_CLOUD_PROJECT=your-project-id
GEMINI_API_KEY=your-api-key
MAPS_API_KEY=your-maps-api-key
```
