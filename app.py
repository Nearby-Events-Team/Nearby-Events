"""
Local Event Bulletin Board — Flask API
Cognizant GCP Hackathon · Use Case 5

Provides REST endpoints for event CRUD, Snap-a-Poster AI extraction,
Ask the Board semantic search, RSVP management, and Community Pulse analytics.
Designed for Cloud Run deployment with Firestore as the primary datastore.
"""

import os
import json
import uuid
import time
import base64
from datetime import datetime, timezone, timedelta
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# ---------------------------------------------------------------------------
# In-memory store (swap for Firestore in production)
# ---------------------------------------------------------------------------
EVENTS = {}       # event_id → event dict
RSVP_LOG = {}     # event_id → set of device fingerprints

# ---------------------------------------------------------------------------
# Category config
# ---------------------------------------------------------------------------
CATEGORIES = {
    "sports":    {"label": "Sports",    "color": "#2563eb"},
    "music":     {"label": "Music",     "color": "#7c3aed"},
    "food":      {"label": "Food",      "color": "#ea580c"},
    "tech":      {"label": "Tech",      "color": "#0891b2"},
    "art":       {"label": "Art",       "color": "#db2777"},
    "community": {"label": "Community", "color": "#059669"},
    "education": {"label": "Education", "color": "#4f46e5"},
    "health":    {"label": "Health",    "color": "#16a34a"},
    "yard_sale": {"label": "Yard Sale", "color": "#ca8a04"},
    "other":     {"label": "Other",     "color": "#64748b"},
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def is_past(event_date_str):
    """Return True if the event date has passed."""
    try:
        event_dt = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
        return event_dt < datetime.now(timezone.utc)
    except Exception:
        return False


def seed_demo_events():
    """Populate the board with sample events for demonstration."""
    demos = [
        {
            "title": "Weekend Farmers Market",
            "date": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT09:00"),
            "location": "Amrita Vishwa Vidyapeetham, Coimbatore",
            "neighborhood": "Ettimadai",
            "category": "food",
            "description": "Fresh organic produce, artisan bread, local honey and handmade crafts. Live music from 10 AM. Free entry!",
            "rsvp_count": 42,
        },
        {
            "title": "Community Yoga in the Park",
            "date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT06:30"),
            "location": "VOC Park, Coimbatore",
            "neighborhood": "RS Puram",
            "category": "health",
            "description": "Start your morning with a free community yoga session. All levels welcome. Bring your own mat.",
            "rsvp_count": 28,
        },
        {
            "title": "Indie Music Night",
            "date": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%dT19:00"),
            "location": "The BeeHive, Coimbatore",
            "neighborhood": "Race Course",
            "category": "music",
            "description": "Three local indie bands perform live. ₹200 cover charge includes one drink. Ages 18+.",
            "rsvp_count": 65,
        },
        {
            "title": "GCP Study Jam — Cloud Run Workshop",
            "date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT14:00"),
            "location": "AB2 Lab 4, Amrita Vishwa Vidyapeetham",
            "neighborhood": "Ettimadai",
            "category": "tech",
            "description": "Hands-on workshop: deploy a containerized app to Cloud Run in 90 minutes. Laptops required.",
            "rsvp_count": 35,
        },
        {
            "title": "Weekend Art Exhibition",
            "date": (datetime.now(timezone.utc) + timedelta(days=4)).strftime("%Y-%m-%dT10:00"),
            "location": "Government Museum, Coimbatore",
            "neighborhood": "Town Hall",
            "category": "art",
            "description": "Showcasing 50+ contemporary works by local artists. Free admission. Workshops for kids at 2 PM.",
            "rsvp_count": 19,
        },
        {
            "title": "Neighborhood Garage Sale",
            "date": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT08:00"),
            "location": "Saravanampatti Main Road",
            "neighborhood": "Saravanampatti",
            "category": "yard_sale",
            "description": "20+ households clearing out! Furniture, electronics, books, clothes. Cash only. Early birds welcome.",
            "rsvp_count": 15,
        },
        {
            "title": "College Basketball Tournament",
            "date": (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%dT16:00"),
            "location": "Amrita Sports Complex",
            "neighborhood": "Ettimadai",
            "category": "sports",
            "description": "Inter-college 3v3 basketball tournament. Register your team by Oct 3. Spectators free.",
            "rsvp_count": 88,
        },
        {
            "title": "Street Food Festival",
            "date": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%dT17:00"),
            "location": "Brookefields Mall, Coimbatore",
            "neighborhood": "Kuniyamuthur",
            "category": "food",
            "description": "30+ food stalls from across Tamil Nadu. Live cooking demos, eating contests, and family fun zone.",
            "rsvp_count": 120,
        },
    ]
    for demo in demos:
        eid = str(uuid.uuid4())[:8]
        EVENTS[eid] = {
            "id": eid,
            "title": demo["title"],
            "date": demo["date"],
            "location": demo["location"],
            "neighborhood": demo.get("neighborhood", ""),
            "category": demo.get("category", "other"),
            "description": demo["description"],
            "rsvp_count": demo.get("rsvp_count", 0),
            "created_at": now_iso(),
            "poster_url": None,
            "is_ai_generated": False,
            "trust_score": 1.0,
        }
        RSVP_LOG[eid] = set()


# Seed on startup
seed_demo_events()


# ---------------------------------------------------------------------------
# Rate limiter (simple in-memory)
# ---------------------------------------------------------------------------
RATE_LIMIT = {}  # ip → [timestamps]

def rate_limit(max_requests=30, window=60):
    """Simple rate limiter decorator."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or "unknown"
            now = time.time()
            if ip not in RATE_LIMIT:
                RATE_LIMIT[ip] = []
            RATE_LIMIT[ip] = [t for t in RATE_LIMIT[ip] if now - t < window]
            if len(RATE_LIMIT[ip]) >= max_requests:
                return jsonify({"error": "Too many requests. Please wait."}), 429
            RATE_LIMIT[ip].append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Static file serving (PWA frontend)
# ---------------------------------------------------------------------------
@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("static", path)


# ---------------------------------------------------------------------------
# API: Events CRUD
# ---------------------------------------------------------------------------
@app.route("/api/events", methods=["GET"])
def get_events():
    """Return upcoming events, sorted by date. Filters: category, neighborhood, q (search)."""
    category = request.args.get("category", "").strip().lower()
    neighborhood = request.args.get("neighborhood", "").strip().lower()
    q = request.args.get("q", "").strip().lower()

    events = []
    for ev in EVENTS.values():
        # Skip past events
        if is_past(ev["date"]):
            continue
        # Category filter
        if category and ev.get("category", "") != category:
            continue
        # Neighborhood filter
        if neighborhood and neighborhood not in ev.get("neighborhood", "").lower():
            continue
        # Text search
        if q and q not in ev["title"].lower() and q not in ev.get("description", "").lower() and q not in ev.get("location", "").lower():
            continue
        events.append(ev)

    # Sort by date ascending (next event first)
    events.sort(key=lambda e: e["date"])
    return jsonify({"events": events, "categories": CATEGORIES})


@app.route("/api/events/<event_id>", methods=["GET"])
def get_event(event_id):
    """Get a single event by ID."""
    ev = EVENTS.get(event_id)
    if not ev:
        return jsonify({"error": "Event not found"}), 404
    return jsonify(ev)


@app.route("/api/events", methods=["POST"])
@rate_limit(max_requests=10, window=60)
def create_event():
    """Create a new event."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    required = ["title", "date", "location"]
    for field in required:
        if not data.get(field, "").strip():
            return jsonify({"error": f"'{field}' is required"}), 400

    eid = str(uuid.uuid4())[:8]
    event = {
        "id": eid,
        "title": data["title"].strip(),
        "date": data["date"].strip(),
        "location": data["location"].strip(),
        "neighborhood": data.get("neighborhood", "").strip(),
        "category": data.get("category", "other").strip().lower(),
        "description": data.get("description", "").strip(),
        "rsvp_count": 0,
        "created_at": now_iso(),
        "poster_url": data.get("poster_url"),
        "is_ai_generated": data.get("is_ai_generated", False),
        "trust_score": 1.0,
    }

    # Validate category
    if event["category"] not in CATEGORIES:
        event["category"] = "other"

    EVENTS[eid] = event
    RSVP_LOG[eid] = set()
    return jsonify(event), 201


@app.route("/api/events/<event_id>", methods=["DELETE"])
def delete_event(event_id):
    """Delete an event."""
    if event_id not in EVENTS:
        return jsonify({"error": "Event not found"}), 404
    del EVENTS[event_id]
    RSVP_LOG.pop(event_id, None)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# API: RSVP
# ---------------------------------------------------------------------------
@app.route("/api/events/<event_id>/rsvp", methods=["POST"])
@rate_limit(max_requests=5, window=60)
def rsvp_event(event_id):
    """Toggle RSVP for an event. One per device (identified by fingerprint or IP)."""
    if event_id not in EVENTS:
        return jsonify({"error": "Event not found"}), 404

    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id") or request.remote_addr or "anon"

    if event_id not in RSVP_LOG:
        RSVP_LOG[event_id] = set()

    if device_id in RSVP_LOG[event_id]:
        # Un-RSVP
        RSVP_LOG[event_id].discard(device_id)
        EVENTS[event_id]["rsvp_count"] = max(0, EVENTS[event_id]["rsvp_count"] - 1)
        going = False
    else:
        # RSVP
        RSVP_LOG[event_id].add(device_id)
        EVENTS[event_id]["rsvp_count"] += 1
        going = True

    return jsonify({
        "going": going,
        "rsvp_count": EVENTS[event_id]["rsvp_count"],
    })


# ---------------------------------------------------------------------------
# API: Snap-a-Poster (AI extraction mock / real Gemini)
# ---------------------------------------------------------------------------
@app.route("/api/snap-poster", methods=["POST"])
@rate_limit(max_requests=5, window=60)
def snap_poster():
    """
    Accept a poster image (base64) or text (WhatsApp forward).
    Use Gemini to extract event details, or fall back to a mock.
    """
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image")
    text_input = data.get("text", "").strip()

    if not image_b64 and not text_input:
        return jsonify({"error": "Provide 'image' (base64) or 'text'"}), 400

    # Try real Gemini extraction
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-3.8-flash")

            prompt = """Extract event details from this content and return ONLY a JSON object with these fields:
            - title (string): the event name
            - date (string): in ISO format YYYY-MM-DDTHH:MM if possible
            - location (string): venue or address
            - neighborhood (string): area or neighborhood name
            - category (string): one of sports, music, food, tech, art, community, education, health, yard_sale, other
            - description (string): brief 1-2 sentence description
            Return ONLY valid JSON, nothing else."""

            if image_b64:
                import base64 as b64mod
                image_bytes = b64mod.b64decode(image_b64)
                response = model.generate_content([
                    prompt,
                    {"mime_type": "image/jpeg", "data": image_bytes}
                ])
            else:
                response = model.generate_content(f"{prompt}\n\nContent:\n{text_input}")

            result_text = response.text.strip()
            # Clean markdown code fences if present
            if result_text.startswith("```"):
                result_text = result_text.split("\n", 1)[-1]
                result_text = result_text.rsplit("```", 1)[0]
            
            extracted = json.loads(result_text)
            extracted["is_ai_generated"] = True
            return jsonify(extracted)

        except Exception as e:
            app.logger.warning(f"Gemini extraction failed: {e}")
            # Fall through to mock

    # Graceful degradation: mock extraction
    if text_input:
        return jsonify({
            "title": text_input[:60],
            "date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT18:00"),
            "location": "Check the poster for details",
            "neighborhood": "",
            "category": "other",
            "description": text_input[:200],
            "is_ai_generated": False,
            "_notice": "AI extraction unavailable. Please review and edit the details.",
        })
    else:
        return jsonify({
            "title": "Event from Poster",
            "date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%dT18:00"),
            "location": "Check the poster for details",
            "neighborhood": "",
            "category": "other",
            "description": "Details extracted from uploaded poster. Please review and edit.",
            "is_ai_generated": False,
            "_notice": "AI extraction unavailable. Please review and edit the details.",
        })


# ---------------------------------------------------------------------------
# API: Ask the Board (NL search — Gemini or fallback)
# ---------------------------------------------------------------------------
@app.route("/api/ask", methods=["POST"])
@rate_limit(max_requests=10, window=60)
def ask_the_board():
    """Natural-language search over events using Gemini or keyword fallback."""
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"error": "Provide a 'question'"}), 400

    # Gather upcoming events
    upcoming = [ev for ev in EVENTS.values() if not is_past(ev["date"])]
    if not upcoming:
        return jsonify({"answer": "There are no upcoming events on the board right now.", "events": []})

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-3.8-flash")

            events_json = json.dumps(upcoming, default=str)
            prompt = f"""You are an assistant for a Local Event Bulletin Board.
The user asked: "{question}"

Here are all upcoming events:
{events_json}

Return a JSON object with:
- "answer": a friendly 1-3 sentence response addressing their question
- "event_ids": an array of event IDs that best match their query, ranked by relevance (most relevant first)
- "reasons": a dict mapping each event_id to a short reason why it matches

Return ONLY valid JSON."""

            response = model.generate_content(prompt)
            result_text = response.text.strip()
            if result_text.startswith("```"):
                result_text = result_text.split("\n", 1)[-1]
                result_text = result_text.rsplit("```", 1)[0]
            
            result = json.loads(result_text)
            # Attach full event objects
            matched_events = []
            for eid in result.get("event_ids", []):
                if eid in EVENTS:
                    ev = dict(EVENTS[eid])
                    ev["match_reason"] = result.get("reasons", {}).get(eid, "")
                    matched_events.append(ev)
            result["events"] = matched_events
            return jsonify(result)

        except Exception as e:
            app.logger.warning(f"Gemini Ask the Board failed: {e}")

    # Fallback: simple keyword search
    q_lower = question.lower()
    keywords = q_lower.split()
    scored = []
    for ev in upcoming:
        score = 0
        text_blob = f"{ev['title']} {ev.get('description','')} {ev.get('location','')} {ev.get('category','')}".lower()
        for kw in keywords:
            if kw in text_blob:
                score += 1
        if score > 0:
            scored.append((score, ev))
    scored.sort(key=lambda x: -x[0])
    matched = [ev for _, ev in scored[:5]]

    return jsonify({
        "answer": f"I found {len(matched)} event(s) matching your query. AI-powered search is available when Gemini is configured.",
        "events": matched,
    })


# ---------------------------------------------------------------------------
# API: Community Pulse (analytics)
# ---------------------------------------------------------------------------
@app.route("/api/pulse", methods=["GET"])
def community_pulse():
    """Return community analytics: event counts, category breakdown, trending."""
    upcoming = [ev for ev in EVENTS.values() if not is_past(ev["date"])]
    
    # Category breakdown
    cat_counts = {}
    for ev in upcoming:
        cat = ev.get("category", "other")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    
    # Top RSVP events (trending)
    trending = sorted(upcoming, key=lambda e: e.get("rsvp_count", 0), reverse=True)[:5]

    # Neighborhood breakdown
    hood_counts = {}
    for ev in upcoming:
        hood = ev.get("neighborhood", "Unknown") or "Unknown"
        hood_counts[hood] = hood_counts.get(hood, 0) + 1

    # Total RSVPs
    total_rsvps = sum(ev.get("rsvp_count", 0) for ev in upcoming)

    return jsonify({
        "total_events": len(upcoming),
        "total_rsvps": total_rsvps,
        "categories": cat_counts,
        "category_meta": CATEGORIES,
        "neighborhoods": hood_counts,
        "trending": trending,
    })


# ---------------------------------------------------------------------------
# API: Categories list
# ---------------------------------------------------------------------------
@app.route("/api/categories", methods=["GET"])
def list_categories():
    return jsonify(CATEGORIES)


# ---------------------------------------------------------------------------
# Health check (for Cloud Run)
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": now_iso()})


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    print(f"[*] Event Bulletin Board starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
