"""
Local Event Bulletin Board — Flask API
Cognizant GCP Hackathon · Use Case 5

Provides REST endpoints for:
  - Auth: login / logout (JWT tokens, roles: admin | member)
  - Events CRUD with role-based access control
  - Delete Requests: members request → admin approves/rejects
  - Snap-a-Poster AI extraction (Gemini)
  - Ask the Board NL search (Gemini)
  - RSVP management
  - Community Pulse analytics

Storage: Google Cloud Firestore (with in-memory fallback for local dev)
"""

import os
import json
import uuid
import time
import base64
import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app, supports_credentials=True)

# ---------------------------------------------------------------------------
# JWT Secret
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "ev3ntboard-super-secret-change-in-prod")
JWT_EXPIRY_HOURS = 24

# ---------------------------------------------------------------------------
# GCP / Firestore setup (graceful fallback to in-memory)
# ---------------------------------------------------------------------------
USE_FIRESTORE = False
db = None

try:
    from google.cloud import firestore
    project_id = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
    if project_id:
        db = firestore.Client(project=project_id)
        USE_FIRESTORE = True
        print(f"[*] Firestore connected — project: {project_id}")
    else:
        print("[!] GCP_PROJECT_ID not set — using in-memory store")
except ImportError:
    print("[!] google-cloud-firestore not installed — using in-memory store")
except Exception as e:
    print(f"[!] Firestore init failed ({e}) — using in-memory store")


# ---------------------------------------------------------------------------
# In-memory stores (used when Firestore is unavailable)
# ---------------------------------------------------------------------------
EVENTS = {}        # event_id → event dict
RSVP_LOG = {}      # event_id → set of device_ids
USERS = {}         # username → user dict
SESSIONS = {}      # token → payload dict
DELETE_REQUESTS = {}  # req_id → delete_request dict


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
    try:
        event_dt = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
        return event_dt < datetime.now(timezone.utc)
    except Exception:
        return False


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Minimal JWT (HS256-like using HMAC + JSON, no external lib required)
# ---------------------------------------------------------------------------
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * pad)


def create_token(payload: dict) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = dict(payload)
    payload["exp"] = (datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp()
    body = _b64url(json.dumps(payload).encode())
    sig = _b64url(
        hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{body}.{sig}"


def verify_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, body, sig = parts
        expected_sig = _b64url(
            hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None
        return payload
    except Exception:
        return None


def get_current_user():
    """Extract and verify JWT from Authorization header or cookie."""
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("eb_token")
    if not token:
        return None
    return verify_token(token)


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        request.current_user = user
        return f(*args, **kwargs)
    return wrapper


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        request.current_user = user
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Firestore helpers
# ---------------------------------------------------------------------------
def fs_get_all_events():
    if USE_FIRESTORE:
        docs = db.collection("events").stream()
        return {doc.id: doc.to_dict() for doc in docs}
    return dict(EVENTS)


def fs_get_event(event_id):
    if USE_FIRESTORE:
        doc = db.collection("events").document(event_id).get()
        return doc.to_dict() if doc.exists else None
    return EVENTS.get(event_id)


def fs_set_event(event_id, event):
    if USE_FIRESTORE:
        db.collection("events").document(event_id).set(event)
    else:
        EVENTS[event_id] = event


def fs_delete_event(event_id):
    if USE_FIRESTORE:
        db.collection("events").document(event_id).delete()
        db.collection("rsvp_log").document(event_id).delete()
    else:
        EVENTS.pop(event_id, None)
        RSVP_LOG.pop(event_id, None)


def fs_get_rsvp_set(event_id):
    if USE_FIRESTORE:
        doc = db.collection("rsvp_log").document(event_id).get()
        return set(doc.to_dict().get("device_ids", [])) if doc.exists else set()
    return RSVP_LOG.get(event_id, set())


def fs_set_rsvp(event_id, device_set):
    if USE_FIRESTORE:
        db.collection("rsvp_log").document(event_id).set({"device_ids": list(device_set)})
    else:
        RSVP_LOG[event_id] = device_set


def fs_get_user(username):
    if USE_FIRESTORE:
        doc = db.collection("users").document(username).get()
        return doc.to_dict() if doc.exists else None
    return USERS.get(username)


def fs_set_user(username, user):
    if USE_FIRESTORE:
        db.collection("users").document(username).set(user)
    else:
        USERS[username] = user


def fs_get_all_delete_requests():
    if USE_FIRESTORE:
        docs = db.collection("delete_requests").stream()
        return {doc.id: doc.to_dict() for doc in docs}
    return dict(DELETE_REQUESTS)


def fs_get_delete_request(req_id):
    if USE_FIRESTORE:
        doc = db.collection("delete_requests").document(req_id).get()
        return doc.to_dict() if doc.exists else None
    return DELETE_REQUESTS.get(req_id)


def fs_set_delete_request(req_id, req):
    if USE_FIRESTORE:
        db.collection("delete_requests").document(req_id).set(req)
    else:
        DELETE_REQUESTS[req_id] = req


def fs_delete_delete_request(req_id):
    if USE_FIRESTORE:
        db.collection("delete_requests").document(req_id).delete()
    else:
        DELETE_REQUESTS.pop(req_id, None)


# ---------------------------------------------------------------------------
# Seed default users
# ---------------------------------------------------------------------------
def seed_users():
    if not fs_get_user("admin"):
        fs_set_user("admin", {
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "display_name": "Board Admin",
            "created_at": now_iso(),
        })
    if not fs_get_user("member"):
        fs_set_user("member", {
            "username": "member",
            "password_hash": hash_password("member123"),
            "role": "member",
            "display_name": "Community Member",
            "created_at": now_iso(),
        })


# ---------------------------------------------------------------------------
# Seed demo events (only in-memory)
# ---------------------------------------------------------------------------
def seed_demo_events():
    if USE_FIRESTORE:
        existing = db.collection("events").limit(1).get()
        if list(existing):
            return  # already seeded in Firestore

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
            "description": "20+ households clearing out! Furniture, electronics, books, clothes. Cash only.",
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
        event = {
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
            "created_by": "admin",
            "created_by_role": "admin",
        }
        fs_set_event(eid, event)
        if not USE_FIRESTORE:
            RSVP_LOG[eid] = set()


seed_users()
seed_demo_events()


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
RATE_LIMIT = {}

def rate_limit(max_requests=30, window=60):
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
# Static file serving
# ---------------------------------------------------------------------------
@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("static", path)


# ===========================================================================
# AUTH ENDPOINTS
# ===========================================================================
@app.route("/api/auth/login", methods=["POST"])
def login():
    """Authenticate a user and return a JWT token."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    user = fs_get_user(username)
    if not user or user["password_hash"] != hash_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_token({
        "username": user["username"],
        "role": user["role"],
        "display_name": user.get("display_name", username),
    })

    resp = jsonify({
        "ok": True,
        "token": token,
        "user": {
            "username": user["username"],
            "role": user["role"],
            "display_name": user.get("display_name", username),
        },
    })
    resp.set_cookie("eb_token", token, httponly=True, max_age=86400 * JWT_EXPIRY_HOURS, samesite="Lax")
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    resp = jsonify({"ok": True})
    resp.delete_cookie("eb_token")
    return resp


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    """Return current user info."""
    u = request.current_user
    return jsonify({
        "username": u["username"],
        "role": u["role"],
        "display_name": u.get("display_name", u["username"]),
    })


@app.route("/api/auth/register", methods=["POST"])
def register():
    """Register a new member account."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")
    display_name = data.get("display_name", username).strip()

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if fs_get_user(username):
        return jsonify({"error": "Username already taken"}), 409

    user = {
        "username": username,
        "password_hash": hash_password(password),
        "role": "member",   # new registrations are always members
        "display_name": display_name,
        "created_at": now_iso(),
    }
    fs_set_user(username, user)

    token = create_token({"username": username, "role": "member", "display_name": display_name})
    resp = jsonify({
        "ok": True,
        "token": token,
        "user": {"username": username, "role": "member", "display_name": display_name},
    })
    resp.set_cookie("eb_token", token, httponly=True, max_age=86400 * JWT_EXPIRY_HOURS, samesite="Lax")
    return resp, 201


# ===========================================================================
# EVENTS CRUD
# ===========================================================================
@app.route("/api/events", methods=["GET"])
def get_events():
    """Return upcoming events with optional filters."""
    category = request.args.get("category", "").strip().lower()
    neighborhood = request.args.get("neighborhood", "").strip().lower()
    q = request.args.get("q", "").strip().lower()

    all_events = fs_get_all_events()
    events = []
    for ev in all_events.values():
        if is_past(ev.get("date", "")):
            continue
        if category and ev.get("category", "") != category:
            continue
        if neighborhood and neighborhood not in ev.get("neighborhood", "").lower():
            continue
        if q and q not in ev["title"].lower() and q not in ev.get("description", "").lower() and q not in ev.get("location", "").lower():
            continue
        events.append(ev)

    events.sort(key=lambda e: e.get("date", ""))
    return jsonify({"events": events, "categories": CATEGORIES})


@app.route("/api/events/<event_id>", methods=["GET"])
def get_event(event_id):
    ev = fs_get_event(event_id)
    if not ev:
        return jsonify({"error": "Event not found"}), 404
    return jsonify(ev)


@app.route("/api/events", methods=["POST"])
@require_auth
@rate_limit(max_requests=10, window=60)
def create_event():
    """Create a new event. Requires authentication."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    required = ["title", "date", "location"]
    for field in required:
        if not data.get(field, "").strip():
            return jsonify({"error": f"'{field}' is required"}), 400

    user = request.current_user
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
        "created_by": user["username"],
        "created_by_role": user["role"],
    }
    if event["category"] not in CATEGORIES:
        event["category"] = "other"

    fs_set_event(eid, event)
    if not USE_FIRESTORE:
        RSVP_LOG[eid] = set()
    return jsonify(event), 201


@app.route("/api/events/<event_id>", methods=["DELETE"])
@require_admin
def delete_event(event_id):
    """Admin-only: directly delete an event."""
    ev = fs_get_event(event_id)
    if not ev:
        return jsonify({"error": "Event not found"}), 404
    fs_delete_event(event_id)
    return jsonify({"ok": True})


# ===========================================================================
# DELETE REQUESTS (member workflow)
# ===========================================================================
@app.route("/api/delete-requests", methods=["POST"])
@require_auth
def request_delete():
    """Member submits a deletion request for an event."""
    user = request.current_user
    data = request.get_json(silent=True) or {}
    event_id = data.get("event_id", "").strip()
    reason = data.get("reason", "").strip()

    ev = fs_get_event(event_id)
    if not ev:
        return jsonify({"error": "Event not found"}), 404

    # Only the creator OR admin can request deletion
    if user["role"] != "admin" and ev.get("created_by") != user["username"]:
        return jsonify({"error": "You can only request deletion of your own events"}), 403

    req_id = str(uuid.uuid4())[:8]
    delete_req = {
        "id": req_id,
        "event_id": event_id,
        "event_title": ev.get("title", ""),
        "requested_by": user["username"],
        "requested_by_role": user["role"],
        "reason": reason,
        "status": "pending",  # pending | approved | rejected
        "created_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
    }
    fs_set_delete_request(req_id, delete_req)
    return jsonify(delete_req), 201


@app.route("/api/delete-requests", methods=["GET"])
@require_admin
def list_delete_requests():
    """Admin-only: list all pending delete requests."""
    all_reqs = fs_get_all_delete_requests()
    pending = [r for r in all_reqs.values() if r.get("status") == "pending"]
    pending.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return jsonify({"requests": pending})


@app.route("/api/delete-requests/<req_id>/approve", methods=["POST"])
@require_admin
def approve_delete_request(req_id):
    """Admin approves a delete request — event is permanently deleted."""
    req = fs_get_delete_request(req_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404
    if req["status"] != "pending":
        return jsonify({"error": "Request already reviewed"}), 409

    admin = request.current_user
    # Delete the event
    fs_delete_event(req["event_id"])

    # Mark request as approved
    req["status"] = "approved"
    req["reviewed_at"] = now_iso()
    req["reviewed_by"] = admin["username"]
    fs_set_delete_request(req_id, req)
    return jsonify({"ok": True, "request": req})


@app.route("/api/delete-requests/<req_id>/reject", methods=["POST"])
@require_admin
def reject_delete_request(req_id):
    """Admin rejects a delete request — event stays."""
    req = fs_get_delete_request(req_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404
    if req["status"] != "pending":
        return jsonify({"error": "Request already reviewed"}), 409

    admin = request.current_user
    req["status"] = "rejected"
    req["reviewed_at"] = now_iso()
    req["reviewed_by"] = admin["username"]
    fs_set_delete_request(req_id, req)
    return jsonify({"ok": True, "request": req})


# ===========================================================================
# RSVP
# ===========================================================================
@app.route("/api/events/<event_id>/rsvp", methods=["POST"])
@rate_limit(max_requests=5, window=60)
def rsvp_event(event_id):
    ev = fs_get_event(event_id)
    if not ev:
        return jsonify({"error": "Event not found"}), 404

    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id") or request.remote_addr or "anon"

    rsvp_set = fs_get_rsvp_set(event_id)
    if device_id in rsvp_set:
        rsvp_set.discard(device_id)
        ev["rsvp_count"] = max(0, ev.get("rsvp_count", 0) - 1)
        going = False
    else:
        rsvp_set.add(device_id)
        ev["rsvp_count"] = ev.get("rsvp_count", 0) + 1
        going = True

    fs_set_rsvp(event_id, rsvp_set)
    fs_set_event(event_id, ev)
    return jsonify({"going": going, "rsvp_count": ev["rsvp_count"]})


# ===========================================================================
# SNAP-A-POSTER
# ===========================================================================
@app.route("/api/snap-poster", methods=["POST"])
@rate_limit(max_requests=5, window=60)
def snap_poster():
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image")
    text_input = data.get("text", "").strip()

    if not image_b64 and not text_input:
        return jsonify({"error": "Provide 'image' (base64) or 'text'"}), 400

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-2.0-flash")

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
            if result_text.startswith("```"):
                result_text = result_text.split("\n", 1)[-1]
                result_text = result_text.rsplit("```", 1)[0]

            extracted = json.loads(result_text)
            extracted["is_ai_generated"] = True
            return jsonify(extracted)

        except Exception as e:
            app.logger.warning(f"Gemini extraction failed: {e}")

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


# ===========================================================================
# ASK THE BOARD
# ===========================================================================
@app.route("/api/ask", methods=["POST"])
@rate_limit(max_requests=10, window=60)
def ask_the_board():
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"error": "Provide a 'question'"}), 400

    all_events = fs_get_all_events()
    upcoming = [ev for ev in all_events.values() if not is_past(ev.get("date", ""))]
    if not upcoming:
        return jsonify({"answer": "There are no upcoming events on the board right now.", "events": []})

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-2.0-flash")

            events_json = json.dumps(upcoming, default=str)
            prompt = f"""You are an assistant for a Local Event Bulletin Board.
The user asked: "{question}"

Here are all upcoming events:
{events_json}

Return a JSON object with:
- "answer": a friendly 1-3 sentence response addressing their question
- "event_ids": an array of event IDs that best match their query, ranked by relevance
- "reasons": a dict mapping each event_id to a short reason why it matches

Return ONLY valid JSON."""

            response = model.generate_content(prompt)
            result_text = response.text.strip()
            if result_text.startswith("```"):
                result_text = result_text.split("\n", 1)[-1]
                result_text = result_text.rsplit("```", 1)[0]

            result = json.loads(result_text)
            matched_events = []
            for eid in result.get("event_ids", []):
                ev = fs_get_event(eid)
                if ev:
                    ev = dict(ev)
                    ev["match_reason"] = result.get("reasons", {}).get(eid, "")
                    matched_events.append(ev)
            result["events"] = matched_events
            return jsonify(result)

        except Exception as e:
            app.logger.warning(f"Gemini Ask the Board failed: {e}")

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
        "answer": f"Found {len(matched)} event(s) matching your query.",
        "events": matched,
    })


# ===========================================================================
# COMMUNITY PULSE
# ===========================================================================
@app.route("/api/pulse", methods=["GET"])
def community_pulse():
    all_events = fs_get_all_events()
    upcoming = [ev for ev in all_events.values() if not is_past(ev.get("date", ""))]

    cat_counts = {}
    for ev in upcoming:
        cat = ev.get("category", "other")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    trending = sorted(upcoming, key=lambda e: e.get("rsvp_count", 0), reverse=True)[:5]

    hood_counts = {}
    for ev in upcoming:
        hood = ev.get("neighborhood", "Unknown") or "Unknown"
        hood_counts[hood] = hood_counts.get(hood, 0) + 1

    total_rsvps = sum(ev.get("rsvp_count", 0) for ev in upcoming)

    return jsonify({
        "total_events": len(upcoming),
        "total_rsvps": total_rsvps,
        "categories": cat_counts,
        "category_meta": CATEGORIES,
        "neighborhoods": hood_counts,
        "trending": trending,
        "firestore_active": USE_FIRESTORE,
    })


# ===========================================================================
# CATEGORIES
# ===========================================================================
@app.route("/api/categories", methods=["GET"])
def list_categories():
    return jsonify(CATEGORIES)


# ===========================================================================
# HEALTH CHECK (Cloud Run)
# ===========================================================================
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "timestamp": now_iso(),
        "firestore": USE_FIRESTORE,
        "storage": "firestore" if USE_FIRESTORE else "in-memory",
    })


# ===========================================================================
# RUN
# ===========================================================================
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    print(f"[*] Event Bulletin Board starting on http://localhost:{port}")
    print(f"[*] Storage backend: {'Firestore' if USE_FIRESTORE else 'In-memory'}")
    app.run(host="0.0.0.0", port=port, debug=debug)
