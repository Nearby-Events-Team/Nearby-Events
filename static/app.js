/**
 * Local Event Bulletin Board — Frontend Application
 * Cognizant GCP Hackathon · Use Case 5
 *
 * Handles: Navigation, Event CRUD, RSVP, Snap-a-Poster, Ask the Board,
 * Community Pulse, filtering, search, modals, and toast notifications.
 */

(function () {
    "use strict";

    // ======================================================================
    // STATE
    // ======================================================================
    const state = {
        events: [],
        categories: {},
        activeView: "board",
        activeCategory: "",
        searchQuery: "",
        deviceId: getDeviceId(),
        rsvpSet: new Set(JSON.parse(localStorage.getItem("eb_rsvps") || "[]")),
        posterFile: null,
        posterBase64: null,
        // Auth
        currentUser: JSON.parse(localStorage.getItem("eb_user") || "null"),
        token: localStorage.getItem("eb_token") || null,
    };

    function getDeviceId() {
        let id = localStorage.getItem("eb_device_id");
        if (!id) {
            id = "dev_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            localStorage.setItem("eb_device_id", id);
        }
        return id;
    }

    // ======================================================================
    // API
    // ======================================================================
    const API = {
        async getEvents(params = {}) {
            const qs = new URLSearchParams(params).toString();
            const res = await fetch(`/api/events${qs ? "?" + qs : ""}`);
            return res.json();
        },
        async getEvent(id) {
            const res = await fetch(`/api/events/${id}`);
            return res.json();
        },
        async createEvent(data) {
            const headers = { "Content-Type": "application/json" };
            if (state.token) headers.Authorization = `Bearer ${state.token}`;
            const res = await fetch("/api/events", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            return { ok: res.ok, data: await res.json() };
        },
        async rsvp(eventId) {
            const res = await fetch(`/api/events/${eventId}/rsvp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_id: state.deviceId }),
            });
            return res.json();
        },
        async snapPoster(image, text) {
            const res = await fetch("/api/snap-poster", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image, text }),
            });
            return { ok: res.ok, data: await res.json() };
        },
        async askBoard(question) {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });
            return res.json();
        },
        async getPulse() {
            const res = await fetch("/api/pulse");
            return res.json();
        },
        async login(username, password) {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            return { ok: res.ok, data: await res.json() };
        },
        async register(username, password, display_name) {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, display_name }),
            });
            return { ok: res.ok, data: await res.json() };
        },
        async logout() {
            await fetch("/api/auth/logout", { method: "POST" });
        },
        async getDeleteRequests() {
            const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
            const res = await fetch("/api/delete-requests", { headers });
            return res.json();
        },
        async requestDelete(event_id, reason) {
            const headers = { "Content-Type": "application/json" };
            if (state.token) headers.Authorization = `Bearer ${state.token}`;
            const res = await fetch("/api/delete-requests", {
                method: "POST",
                headers,
                body: JSON.stringify({ event_id, reason }),
            });
            return { ok: res.ok, data: await res.json() };
        },
        async approveDeleteRequest(req_id) {
            const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
            const res = await fetch(`/api/delete-requests/${req_id}/approve`, { method: "POST", headers });
            return { ok: res.ok, data: await res.json() };
        },
        async rejectDeleteRequest(req_id) {
            const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
            const res = await fetch(`/api/delete-requests/${req_id}/reject`, { method: "POST", headers });
            return { ok: res.ok, data: await res.json() };
        },
        async adminDeleteEvent(event_id) {
            const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
            const res = await fetch(`/api/events/${event_id}`, { method: "DELETE", headers });
            return { ok: res.ok };
        },
    };

    // ======================================================================
    // DOM REFS
    // ======================================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        navLinks: $$("#nav-links .nav__link"),
        navToggle: $("#nav-toggle"),
        navLinksContainer: $("#nav-links"),
        navLogo: $("#nav-logo"),
        btnNewEvent: $("#btn-new-event"),
        heroStats: {
            events: $("#stat-events"),
            rsvps: $("#stat-rsvps"),
            neighborhoods: $("#stat-neighborhoods"),
        },
        searchInput: $("#search-input"),
        categoryChips: $("#category-chips"),
        eventGrid: $("#event-grid"),
        emptyState: $("#empty-state"),
        btnEmptyPost: $("#btn-empty-post"),
        // Create modal
        modalOverlay: $("#modal-overlay"),
        modalClose: $("#modal-close"),
        eventForm: $("#event-form"),
        btnCancelForm: $("#btn-cancel-form"),
        inputTitle: $("#input-title"),
        inputDate: $("#input-date"),
        inputCategory: $("#input-category"),
        inputLocation: $("#input-location"),
        inputNeighborhood: $("#input-neighborhood"),
        inputDescription: $("#input-description"),
        // Detail modal
        detailOverlay: $("#detail-overlay"),
        detailClose: $("#detail-close"),
        detailContent: $("#event-detail-content"),
        detailTitle: $("#detail-title"),
        // Snap-a-Poster
        posterDropzone: $("#poster-dropzone"),
        posterFileInput: $("#poster-file-input"),
        posterPreview: $("#poster-preview"),
        posterTextInput: $("#poster-text-input"),
        btnSnapExtract: $("#btn-snap-extract"),
        snapResult: $("#snap-result"),
        // Ask the Board
        askInput: $("#ask-input"),
        btnAskSubmit: $("#btn-ask-submit"),
        askAnswer: $("#ask-answer"),
        askAnswerText: $("#ask-answer-text"),
        askResults: $("#ask-results"),
        // Pulse
        pulseStats: $("#pulse-stats"),
        pulseCategories: $("#pulse-categories"),
        pulseNeighborhoods: $("#pulse-neighborhoods"),
        pulseTrending: $("#pulse-trending"),
        // Toast
        toastContainer: $("#toast-container"),
        // Auth
        navUser: $("#nav-user"),
        navUsername: $("#nav-username"),
        navRole: $("#nav-role"),
        navAdmin: $("#nav-admin"),
        btnLoginNav: $("#btn-login-nav"),
        btnLogout: $("#btn-logout"),
        authOverlay: $("#auth-overlay"),
        authModal: $("#auth-modal"),
        authModalClose: $("#auth-modal-close"),
        tabLogin: $("#tab-login"),
        tabRegister: $("#tab-register"),
        formLogin: $("#form-login"),
        formRegister: $("#form-register"),
        loginUsername: $("#login-username"),
        loginPassword: $("#login-password"),
        loginError: $("#login-error"),
        regDisplayName: $("#reg-display-name"),
        regUsername: $("#reg-username"),
        regPassword: $("#reg-password"),
        regError: $("#reg-error"),
        // Admin panel
        adminDeleteRequests: $("#admin-delete-requests"),
        adminEventsList: $("#admin-events-list"),
        adminReqCount: $("#admin-req-count"),
    };

    // ======================================================================
    // NAVIGATION
    // ======================================================================
    function switchView(view) {
        state.activeView = view;

        // Update nav links
        els.navLinks.forEach((link) => {
            link.classList.toggle("active", link.dataset.view === view);
        });

        // Switch visible view
        $$(".view").forEach((v) => v.classList.remove("view--active"));
        const target = $(`#view-${view}`);
        if (target) target.classList.add("view--active");

        // Close mobile menu
        els.navLinksContainer.classList.remove("open");

        // Load data for view
        if (view === "board") loadEvents();
        if (view === "pulse") loadPulse();
        if (view === "admin" && state.currentUser?.role === "admin") loadAdmin();
    }

    els.navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            switchView(link.dataset.view);
        });
    });

    els.navToggle.addEventListener("click", () => {
        els.navLinksContainer.classList.toggle("open");
    });

    els.navLogo.addEventListener("click", (e) => {
        e.preventDefault();
        switchView("board");
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // ======================================================================
    // AUTH STATE
    // ======================================================================
    function applyAuthUI() {
        const user = state.currentUser;
        if (user) {
            els.navUser.classList.remove("hidden");
            els.btnLoginNav.classList.add("hidden");
            els.navUsername.textContent = user.display_name || user.username;
            els.navRole.textContent = user.role;
            if (user.role === "admin") {
                els.navRole.classList.add("nav__role-pill--admin");
                els.navAdmin.classList.remove("hidden");
            } else {
                els.navRole.classList.remove("nav__role-pill--admin");
                els.navAdmin.classList.add("hidden");
            }
        } else {
            els.navUser.classList.add("hidden");
            els.btnLoginNav.classList.remove("hidden");
            els.navAdmin.classList.add("hidden");
        }
    }

    function saveAuth(token, user) {
        state.token = token;
        state.currentUser = user;
        localStorage.setItem("eb_token", token);
        localStorage.setItem("eb_user", JSON.stringify(user));
        applyAuthUI();
    }

    function clearAuth() {
        state.token = null;
        state.currentUser = null;
        localStorage.removeItem("eb_token");
        localStorage.removeItem("eb_user");
        applyAuthUI();
    }

    // Boot
    applyAuthUI();

    // Login nav button
    els.btnLoginNav.addEventListener("click", () => openAuthModal("login"));

    // Logout
    els.btnLogout.addEventListener("click", async () => {
        await API.logout();
        clearAuth();
        toast("Signed out", "info");
        switchView("board");
    });

    // ======================================================================
    // AUTH MODAL
    // ======================================================================
    function openAuthModal(tab = "login") {
        els.authOverlay.classList.remove("hidden");
        els.authOverlay.classList.add("modal-overlay--active");
        switchAuthTab(tab);
    }

    function closeAuthModal() {
        els.authOverlay.classList.add("hidden");
        els.authOverlay.classList.remove("modal-overlay--active");
    }

    function switchAuthTab(tab) {
        const isLogin = tab === "login";
        els.tabLogin.classList.toggle("auth-tab--active", isLogin);
        els.tabRegister.classList.toggle("auth-tab--active", !isLogin);
        els.formLogin.classList.toggle("hidden", !isLogin);
        els.formRegister.classList.toggle("hidden", isLogin);
        els.loginError.classList.add("hidden");
        els.regError.classList.add("hidden");
    }

    els.tabLogin.addEventListener("click", () => switchAuthTab("login"));
    els.tabRegister.addEventListener("click", () => switchAuthTab("register"));
    els.authModalClose.addEventListener("click", closeAuthModal);
    els.authOverlay.addEventListener("click", (e) => { if (e.target === els.authOverlay) closeAuthModal(); });

    els.formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = els.loginUsername.value.trim();
        const password = els.loginPassword.value;
        try {
            const result = await API.login(username, password);
            if (result.ok) {
                saveAuth(result.data.token, result.data.user);
                closeAuthModal();
                toast(`Welcome back, ${result.data.user.display_name}!`, "success");
            } else {
                els.loginError.textContent = result.data.error || "Login failed";
                els.loginError.classList.remove("hidden");
            }
        } catch (err) {
            els.loginError.textContent = "Network error. Please try again.";
            els.loginError.classList.remove("hidden");
        }
    });

    els.formRegister.addEventListener("submit", async (e) => {
        e.preventDefault();
        const display_name = els.regDisplayName.value.trim();
        const username = els.regUsername.value.trim();
        const password = els.regPassword.value;
        try {
            const result = await API.register(username, password, display_name);
            if (result.ok) {
                saveAuth(result.data.token, result.data.user);
                closeAuthModal();
                toast(`Account created! Welcome, ${result.data.user.display_name}!`, "success");
            } else {
                els.regError.textContent = result.data.error || "Registration failed";
                els.regError.classList.remove("hidden");
            }
        } catch (err) {
            els.regError.textContent = "Network error. Please try again.";
            els.regError.classList.remove("hidden");
        }
    });

    // ======================================================================
    // EVENTS — LOAD & RENDER
    // ======================================================================
    async function loadEvents() {
        try {
            const params = {};
            if (state.activeCategory) params.category = state.activeCategory;
            if (state.searchQuery) params.q = state.searchQuery;

            const data = await API.getEvents(params);
            state.events = data.events || [];
            state.categories = data.categories || {};

            renderCategoryChips();
            renderEventGrid();
            updateHeroStats();
        } catch (err) {
            console.error("Failed to load events:", err);
            toast("Failed to load events. Is the server running?", "error");
        }
    }

    function renderCategoryChips() {
        const container = els.categoryChips;
        // Keep "All" chip, remove others
        const allChip = container.querySelector('[data-category=""]');
        container.innerHTML = "";
        if (allChip) container.appendChild(allChip);

        for (const [key, cat] of Object.entries(state.categories)) {
            const chip = document.createElement("button");
            chip.className = `chip${state.activeCategory === key ? " chip--active" : ""}`;
            chip.dataset.category = key;
            chip.innerHTML = `<span class="chip__dot" style="background:${cat.color}"></span>${cat.label}`;
            chip.addEventListener("click", () => {
                state.activeCategory = state.activeCategory === key ? "" : key;
                // Update active states
                container.querySelectorAll(".chip").forEach((c) => {
                    c.classList.toggle("chip--active", c.dataset.category === state.activeCategory);
                });
                container.querySelector('[data-category=""]').classList.toggle("chip--active", !state.activeCategory);
                loadEvents();
            });
            container.appendChild(chip);
        }

        // "All" chip click
        allChip?.addEventListener("click", () => {
            state.activeCategory = "";
            container.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip--active"));
            allChip.classList.add("chip--active");
            loadEvents();
        });
    }

    function renderEventGrid() {
        const grid = els.eventGrid;
        grid.innerHTML = "";

        if (state.events.length === 0) {
            els.emptyState.classList.remove("hidden");
            return;
        }
        els.emptyState.classList.add("hidden");

        // Determine trending threshold
        const maxRsvp = Math.max(...state.events.map((e) => e.rsvp_count || 0), 0);
        const trendingThreshold = Math.max(maxRsvp * 0.7, 30);

        state.events.forEach((ev) => {
            const card = createEventCard(ev, trendingThreshold);
            grid.appendChild(card);
        });
    }

    function createEventCard(ev, trendingThreshold = 50) {
        const cat = state.categories[ev.category] || { label: "Other", color: "#64748b" };
        const isTrending = (ev.rsvp_count || 0) >= trendingThreshold;
        const isGoing = state.rsvpSet.has(ev.id);
        const dateStr = formatDate(ev.date);
        const timeStr = formatTime(ev.date);

        const card = document.createElement("div");
        card.className = "event-card";
        card.style.setProperty("--card-accent", cat.color);
        card.innerHTML = `
            <div class="event-card__header">
                <span class="event-card__badge" style="background:${cat.color}">${cat.label}</span>
                ${isTrending ? '<span class="event-card__trending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;vertical-align:text-bottom"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> Trending</span>' : ""}
            </div>
            <h3 class="event-card__title">${escHtml(ev.title)}</h3>
            <div class="event-card__meta">
                <div class="event-card__meta-item">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${dateStr} · ${timeStr}
                </div>
                <div class="event-card__meta-item">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    ${escHtml(ev.location)}${ev.neighborhood ? ` · ${escHtml(ev.neighborhood)}` : ""}
                </div>
            </div>
            ${ev.description ? `<p class="event-card__description">${escHtml(ev.description)}</p>` : ""}
            <div class="event-card__footer">
                <button class="event-card__rsvp-btn ${isGoing ? "event-card__rsvp-btn--going" : ""}" data-event-id="${ev.id}">
                    ${isGoing ? "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><polyline points='20 6 9 17 4 12'/></svg>" : "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><line x1='20' y1='8' x2='20' y2='14'/><line x1='23' y1='11' x2='17' y2='11'/></svg>"} ${isGoing ? "Going" : "I'm Going"} · ${ev.rsvp_count || 0}
                </button>
                <button class="event-card__share" data-event-id="${ev.id}" data-action="share">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Share
                </button>
            </div>
            ${ev.match_reason ? `<div class="match-reason"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:text-bottom"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2v1"/><path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg> ${escHtml(ev.match_reason)}</div>` : ""}
        `;

        // Click card → detail
        card.addEventListener("click", (e) => {
            if (e.target.closest(".event-card__rsvp-btn") || e.target.closest(".event-card__share") || e.target.closest(".event-card__delete-btn")) return;
            showEventDetail(ev);
        });

        // RSVP button
        const rsvpBtn = card.querySelector(".event-card__rsvp-btn");
        rsvpBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleRsvp(ev.id, rsvpBtn);
        });

        // Share button
        const shareBtn = card.querySelector(".event-card__share");
        shareBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleShare(ev);
        });

        // Delete / Request Delete button — show if user is creator or admin
        const user = state.currentUser;
        const isOwner = user && (ev.created_by === user.username);
        const isAdmin = user && user.role === "admin";
        if (isOwner || isAdmin) {
            const delBtn = document.createElement("button");
            delBtn.className = "event-card__delete-btn";
            delBtn.title = isAdmin ? "Delete event" : "Request deletion";
            delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> ${isAdmin ? "Delete" : "Request Delete"}`;
            card.querySelector(".event-card__footer").appendChild(delBtn);
            delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (isAdmin) {
                    if (!confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
                    const res = await API.adminDeleteEvent(ev.id);
                    if (res.ok) {
                        toast("Event deleted.", "success");
                        loadEvents();
                    } else {
                        toast("Delete failed.", "error");
                    }
                } else {
                    const reason = prompt("Reason for deletion request (optional):") || "";
                    const res = await API.requestDelete(ev.id, reason);
                    if (res.ok) {
                        toast("Deletion request sent to admin!", "success");
                    } else {
                        toast(res.data?.error || "Request failed.", "error");
                    }
                }
            });
        }

        return card;
    }

    async function handleRsvp(eventId, btn) {
        try {
            const result = await API.rsvp(eventId);
            if (result.going) {
                state.rsvpSet.add(eventId);
                btn.classList.add("event-card__rsvp-btn--going");
                btn.innerHTML = `<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><polyline points='20 6 9 17 4 12'/></svg> Going · ${result.rsvp_count}`;
                toast("You're going!", "success");
            } else {
                state.rsvpSet.delete(eventId);
                btn.classList.remove("event-card__rsvp-btn--going");
                btn.innerHTML = `<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><line x1='20' y1='8' x2='20' y2='14'/><line x1='23' y1='11' x2='17' y2='11'/></svg> I'm Going · ${result.rsvp_count}`;
                toast("RSVP removed", "info");
            }
            // Persist
            localStorage.setItem("eb_rsvps", JSON.stringify([...state.rsvpSet]));
            // Update event in state
            const ev = state.events.find((e) => e.id === eventId);
            if (ev) ev.rsvp_count = result.rsvp_count;
            updateHeroStats();
        } catch (err) {
            toast("Failed to RSVP. Try again.", "error");
        }
    }

    function handleShare(ev) {
        const url = `${window.location.origin}?event=${ev.id}`;
        if (navigator.share) {
            navigator.share({
                title: ev.title,
                text: `Check out "${ev.title}" on EventBoard!`,
                url,
            });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                toast("Link copied to clipboard!", "success");
            });
        }
    }

    function updateHeroStats() {
        const totalEvents = state.events.length;
        const totalRsvps = state.events.reduce((sum, e) => sum + (e.rsvp_count || 0), 0);
        const neighborhoods = new Set(state.events.map((e) => e.neighborhood).filter(Boolean));

        animateNumber(els.heroStats.events, totalEvents);
        animateNumber(els.heroStats.rsvps, totalRsvps);
        animateNumber(els.heroStats.neighborhoods, neighborhoods.size);
    }

    function animateNumber(el, target) {
        const current = parseInt(el.textContent) || 0;
        if (current === target) return;
        const diff = target - current;
        const steps = Math.min(Math.abs(diff), 30);
        const stepTime = 600 / steps;
        let i = 0;
        const interval = setInterval(() => {
            i++;
            const progress = i / steps;
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(current + diff * eased);
            if (i >= steps) {
                el.textContent = target;
                clearInterval(interval);
            }
        }, stepTime);
    }

    // ======================================================================
    // SEARCH & FILTER
    // ======================================================================
    let searchTimeout;
    els.searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = els.searchInput.value.trim();
            loadEvents();
        }, 300);
    });

    // ======================================================================
    // CREATE EVENT MODAL
    // ======================================================================
    function openCreateModal(prefill = {}) {
        // Require login
        if (!state.currentUser) {
            toast("Please sign in to post an event.", "info");
            openAuthModal("login");
            return;
        }
        els.modalOverlay.classList.remove("hidden");
        document.body.style.overflow = "hidden";

        // Set default date to tomorrow
        const tomorrow = new Date(Date.now() + 86400000);
        const defaultDate = tomorrow.toISOString().slice(0, 16);
        els.inputDate.value = prefill.date || defaultDate;
        els.inputTitle.value = prefill.title || "";
        els.inputLocation.value = prefill.location || "";
        els.inputNeighborhood.value = prefill.neighborhood || "";
        els.inputDescription.value = prefill.description || "";
        els.inputCategory.value = prefill.category || "other";

        setTimeout(() => els.inputTitle.focus(), 100);
    }

    function closeCreateModal() {
        els.modalOverlay.classList.add("hidden");
        document.body.style.overflow = "";
        els.eventForm.reset();
    }

    els.btnNewEvent.addEventListener("click", () => openCreateModal());
    els.btnEmptyPost?.addEventListener("click", () => openCreateModal());
    els.modalClose.addEventListener("click", closeCreateModal);
    els.btnCancelForm.addEventListener("click", closeCreateModal);
    els.modalOverlay.addEventListener("click", (e) => {
        if (e.target === els.modalOverlay) closeCreateModal();
    });

    els.eventForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = {
            title: els.inputTitle.value.trim(),
            date: els.inputDate.value,
            location: els.inputLocation.value.trim(),
            neighborhood: els.inputNeighborhood.value.trim(),
            category: els.inputCategory.value,
            description: els.inputDescription.value.trim(),
        };

        try {
            const result = await API.createEvent(data);
            if (result.ok) {
                toast("Event published!", "success");
                closeCreateModal();
                loadEvents();
            } else {
                toast(result.data.error || "Failed to create event", "error");
            }
        } catch (err) {
            toast("Failed to create event. Try again.", "error");
        }
    });

    // ======================================================================
    // EVENT DETAIL MODAL
    // ======================================================================
    function showEventDetail(ev) {
        const cat = state.categories[ev.category] || { label: "Other", color: "#64748b" };
        const isGoing = state.rsvpSet.has(ev.id);
        const dateStr = formatDate(ev.date);
        const timeStr = formatTime(ev.date);

        els.detailTitle.textContent = "Event Details";
        els.detailContent.innerHTML = `
            <span class="event-detail__category" style="background:${cat.color}">${cat.label}</span>
            <h3 class="event-detail__title">${escHtml(ev.title)}</h3>
            <div class="event-detail__meta">
                <div class="event-detail__meta-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${dateStr} at ${timeStr}
                </div>
                <div class="event-detail__meta-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    ${escHtml(ev.location)}
                </div>
                ${ev.neighborhood ? `
                <div class="event-detail__meta-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    ${escHtml(ev.neighborhood)}
                </div>` : ""}
                <div class="event-detail__meta-item">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    ${ev.rsvp_count || 0} people going
                </div>
            </div>
            ${ev.description ? `<p class="event-detail__description">${escHtml(ev.description)}</p>` : ""}
            <div class="event-detail__actions">
                <button class="btn btn--accent" id="detail-rsvp-btn">
                    ${isGoing ? "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><polyline points='20 6 9 17 4 12'/></svg> Going" : "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><line x1='20' y1='8' x2='20' y2='14'/><line x1='23' y1='11' x2='17' y2='11'/></svg> I'm Going"}
                </button>
                <button class="btn btn--outline" id="detail-share-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Share
                </button>
                <button class="btn btn--outline" id="detail-calendar-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Add to Calendar
                </button>
            </div>
        `;

        // RSVP in detail
        const detailRsvpBtn = $("#detail-rsvp-btn");
        detailRsvpBtn.addEventListener("click", async () => {
            const result = await API.rsvp(ev.id);
            if (result.going) {
                state.rsvpSet.add(ev.id);
                detailRsvpBtn.innerHTML = "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><polyline points='20 6 9 17 4 12'/></svg> Going";
            } else {
                state.rsvpSet.delete(ev.id);
                detailRsvpBtn.innerHTML = "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom;margin-right:4px'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><line x1='20' y1='8' x2='20' y2='14'/><line x1='23' y1='11' x2='17' y2='11'/></svg> I'm Going";
            }
            localStorage.setItem("eb_rsvps", JSON.stringify([...state.rsvpSet]));
            ev.rsvp_count = result.rsvp_count;
            loadEvents();
        });

        // Share
        $("#detail-share-btn").addEventListener("click", () => handleShare(ev));

        // Calendar
        $("#detail-calendar-btn").addEventListener("click", () => addToCalendar(ev));

        els.detailOverlay.classList.remove("hidden");
        document.body.style.overflow = "hidden";
    }

    function closeDetailModal() {
        els.detailOverlay.classList.add("hidden");
        document.body.style.overflow = "";
    }

    els.detailClose.addEventListener("click", closeDetailModal);
    els.detailOverlay.addEventListener("click", (e) => {
        if (e.target === els.detailOverlay) closeDetailModal();
    });

    function addToCalendar(ev) {
        try {
            const start = new Date(ev.date);
            const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2h
            const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
            const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(ev.description || "")}&location=${encodeURIComponent(ev.location)}&sf=true&output=xml`;
            window.open(url, "_blank");
            toast("Opening Google Calendar…", "info");
        } catch (err) {
            toast("Could not generate calendar link", "error");
        }
    }

    // ======================================================================
    // SNAP-A-POSTER
    // ======================================================================
    const dropzone = els.posterDropzone;

    // Drag & drop
    ["dragenter", "dragover"].forEach((evt) => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((evt) => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
        });
    });

    dropzone.addEventListener("drop", (e) => {
        const files = e.dataTransfer.files;
        if (files.length) handlePosterFile(files[0]);
    });

    dropzone.addEventListener("click", () => els.posterFileInput.click());

    els.posterFileInput.addEventListener("change", (e) => {
        if (e.target.files.length) handlePosterFile(e.target.files[0]);
    });

    function handlePosterFile(file) {
        if (!file.type.startsWith("image/")) {
            toast("Please upload an image file", "error");
            return;
        }
        state.posterFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            state.posterBase64 = e.target.result.split(",")[1]; // remove data:xxx;base64,
            els.posterPreview.src = e.target.result;
            els.posterPreview.classList.remove("hidden");
            dropzone.querySelector(".snap-poster__dropzone-content").style.display = "none";
            els.btnSnapExtract.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    // Text input enables extract
    els.posterTextInput.addEventListener("input", () => {
        els.btnSnapExtract.disabled = !els.posterTextInput.value.trim() && !state.posterBase64;
    });

    // Extract
    els.btnSnapExtract.addEventListener("click", async () => {
        const btn = els.btnSnapExtract;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div> Extracting…';

        try {
            const result = await API.snapPoster(state.posterBase64, els.posterTextInput.value.trim());

            if (result.ok) {
                const data = result.data;
                els.snapResult.classList.remove("hidden");
                els.snapResult.innerHTML = `
                    <h3 style="margin-bottom:16px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:text-bottom;margin-right:4px"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg> Extracted Details</h3>
                    ${data._notice ? `<div style="background:color-mix(in srgb, var(--flag) 12%, transparent);padding:8px 14px;border-radius:6px;margin-bottom:16px;font-size:0.9rem;color:var(--flag)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:text-bottom;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${escHtml(data._notice)}</div>` : ""}
                    <div style="display:grid;gap:8px;font-size:0.9rem">
                        <div><strong>Title:</strong> ${escHtml(data.title || "")}</div>
                        <div><strong>Date:</strong> ${escHtml(data.date || "")}</div>
                        <div><strong>Location:</strong> ${escHtml(data.location || "")}</div>
                        <div><strong>Neighborhood:</strong> ${escHtml(data.neighborhood || "")}</div>
                        <div><strong>Category:</strong> ${escHtml(data.category || "")}</div>
                        <div><strong>Description:</strong> ${escHtml(data.description || "")}</div>
                    </div>
                    <div style="display:flex;gap:12px;margin-top:20px">
                        <button class="btn btn--accent" id="btn-snap-publish">Publish Event</button>
                        <button class="btn btn--outline" id="btn-snap-edit">Edit First</button>
                    </div>
                `;

                // Publish directly
                const publishBtn = $("#btn-snap-publish");
                publishBtn?.addEventListener("click", async () => {
                    const createResult = await API.createEvent({
                        ...data,
                        is_ai_generated: true,
                    });
                    if (createResult.ok) {
                        toast("Event published from poster!", "success");
                        switchView("board");
                        resetSnapPoster();
                    } else {
                        toast(createResult.data.error || "Failed to publish", "error");
                    }
                });

                // Edit before publishing
                const editBtn = $("#btn-snap-edit");
                editBtn?.addEventListener("click", () => {
                    openCreateModal(data);
                    resetSnapPoster();
                });
            } else {
                toast(result.data.error || "Extraction failed", "error");
            }
        } catch (err) {
            toast("Extraction failed. Try again.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    function resetSnapPoster() {
        state.posterFile = null;
        state.posterBase64 = null;
        els.posterPreview.classList.add("hidden");
        els.posterPreview.src = "";
        dropzone.querySelector(".snap-poster__dropzone-content").style.display = "";
        els.posterTextInput.value = "";
        els.btnSnapExtract.disabled = true;
        els.snapResult.classList.add("hidden");
    }

    // ======================================================================
    // ASK THE BOARD
    // ======================================================================
    async function handleAsk() {
        const question = els.askInput.value.trim();
        if (!question) return;

        els.btnAskSubmit.disabled = true;
        els.btnAskSubmit.innerHTML = '<div class="spinner"></div>';
        els.askAnswer.classList.add("hidden");
        els.askResults.innerHTML = '<div class="loading-overlay"><div class="spinner"></div>Thinking…</div>';

        try {
            const result = await API.askBoard(question);
            // Show answer
            if (result.answer) {
                els.askAnswer.classList.remove("hidden");
                els.askAnswerText.textContent = result.answer;
            }

            // Show matched events
            els.askResults.innerHTML = "";
            const events = result.events || [];
            if (events.length) {
                events.forEach((ev) => {
                    const card = createEventCard(ev);
                    els.askResults.appendChild(card);
                });
            } else {
                els.askResults.innerHTML = '<div class="empty-state"><div class="empty-state__icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><p>No matching events found. Try rephrasing your question.</p></div>';
            }
        } catch (err) {
            toast("Ask the Board failed. Try again.", "error");
            els.askResults.innerHTML = "";
        } finally {
            els.btnAskSubmit.disabled = false;
            els.btnAskSubmit.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Ask
            `;
        }
    }

    els.btnAskSubmit.addEventListener("click", handleAsk);
    els.askInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleAsk();
    });

    // Suggestion chips
    $$(".ask-board__suggestion").forEach((chip) => {
        chip.addEventListener("click", () => {
            els.askInput.value = chip.dataset.q;
            handleAsk();
        });
    });

    // ======================================================================
    // COMMUNITY PULSE
    // ======================================================================
    async function loadPulse() {
        try {
            const data = await API.getPulse();
            renderPulseStats(data);
            renderPulseCategories(data);
            renderPulseNeighborhoods(data);
            renderPulseTrending(data);
        } catch (err) {
            toast("Failed to load Community Pulse", "error");
        }
    }

    // ======================================================================
    // ADMIN PANEL
    // ======================================================================
    async function loadAdmin() {
        try {
            // Load delete requests
            const reqData = await API.getDeleteRequests();
            const requests = reqData.requests || [];
            els.adminReqCount.textContent = requests.length;

            if (requests.length === 0) {
                els.adminDeleteRequests.innerHTML = `<div class="empty-state" style="padding:28px"><p style="color:var(--mute)">No pending deletion requests.</p></div>`;
            } else {
                els.adminDeleteRequests.innerHTML = "";
                requests.forEach((req) => {
                    const card = document.createElement("div");
                    card.className = "admin-req-card";
                    const ts = new Date(req.created_at).toLocaleString("en-IN");
                    card.innerHTML = `
                        <div class="admin-req-card__info">
                            <div class="admin-req-card__event-title">${escHtml(req.event_title)}</div>
                            <div class="admin-req-card__meta">
                                Requested by <strong>${escHtml(req.requested_by)}</strong> &middot; ${ts}
                            </div>
                            ${req.reason ? `<div class="admin-req-card__reason">"${escHtml(req.reason)}"</div>` : ""}
                        </div>
                        <div class="admin-req-card__actions">
                            <button class="btn btn--approve btn--sm" data-req-id="${req.id}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                Approve
                            </button>
                            <button class="btn btn--reject btn--sm" data-req-id="${req.id}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                Reject
                            </button>
                        </div>
                    `;
                    card.querySelector(".btn--approve").addEventListener("click", async () => {
                        const res = await API.approveDeleteRequest(req.id);
                        if (res.ok) {
                            toast("Event deleted and request approved.", "success");
                            loadAdmin();
                            if (state.activeView === "board") loadEvents();
                        } else {
                            toast(res.data?.error || "Failed to approve.", "error");
                        }
                    });
                    card.querySelector(".btn--reject").addEventListener("click", async () => {
                        const res = await API.rejectDeleteRequest(req.id);
                        if (res.ok) {
                            toast("Request rejected.", "info");
                            loadAdmin();
                        } else {
                            toast(res.data?.error || "Failed to reject.", "error");
                        }
                    });
                    els.adminDeleteRequests.appendChild(card);
                });
            }

            // Load all events for admin management
            const evData = await API.getEvents();
            const events = evData.events || [];
            if (events.length === 0) {
                els.adminEventsList.innerHTML = `<div class="empty-state" style="padding:28px"><p style="color:var(--mute)">No upcoming events.</p></div>`;
            } else {
                els.adminEventsList.innerHTML = "";
                events.forEach((ev) => {
                    const cats = evData.categories || {};
                    const cat = cats[ev.category] || { label: "Other", color: "#64748b" };
                    const row = document.createElement("div");
                    row.className = "admin-event-row";
                    row.innerHTML = `
                        <div class="admin-event-row__title">
                            <span class="event-card__badge" style="background:${cat.color};margin-right:8px;font-size:0.7rem;padding:2px 8px">${cat.label}</span>
                            ${escHtml(ev.title)}
                        </div>
                        <div class="admin-event-row__meta">
                            ${formatDate(ev.date)} &middot; <em>${escHtml(ev.created_by || "unknown")}</em>
                        </div>
                        <div class="admin-event-row__actions">
                            <button class="btn btn--reject btn--sm admin-del-ev" data-ev-id="${ev.id}">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                Delete
                            </button>
                        </div>
                    `;
                    row.querySelector(".admin-del-ev").addEventListener("click", async () => {
                        if (!confirm(`Delete "${ev.title}"?`)) return;
                        const res = await API.adminDeleteEvent(ev.id);
                        if (res.ok) {
                            toast("Event deleted.", "success");
                            loadAdmin();
                        } else {
                            toast("Delete failed.", "error");
                        }
                    });
                    els.adminEventsList.appendChild(row);
                });
            }
        } catch (err) {
            console.error("Admin panel load failed:", err);
            toast("Failed to load admin panel.", "error");
        }
    }


    function renderPulseStats(data) {
        els.pulseStats.innerHTML = `
            <div class="pulse__stat-card">
                <div class="pulse__stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
                <span class="pulse__stat-number">${data.total_events}</span>
                <span class="pulse__stat-label">Active Events</span>
            </div>
            <div class="pulse__stat-card">
                <div class="pulse__stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                <span class="pulse__stat-number">${data.total_rsvps}</span>
                <span class="pulse__stat-label">Total RSVPs</span>
            </div>
            <div class="pulse__stat-card">
                <div class="pulse__stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
                <span class="pulse__stat-number">${Object.keys(data.categories || {}).length}</span>
                <span class="pulse__stat-label">Categories</span>
            </div>
            <div class="pulse__stat-card">
                <div class="pulse__stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                <span class="pulse__stat-number">${Object.keys(data.neighborhoods || {}).length}</span>
                <span class="pulse__stat-label">Neighborhoods</span>
            </div>
        `;
    }

    function renderPulseCategories(data) {
        const categories = data.categories || {};
        const meta = data.category_meta || {};
        const maxCount = Math.max(...Object.values(categories), 1);

        els.pulseCategories.innerHTML = Object.entries(categories)
            .sort(([, a], [, b]) => b - a)
            .map(([key, count]) => {
                const catMeta = meta[key] || { label: key, color: "#64748b" };
                const pct = Math.round((count / maxCount) * 100);
                return `
                    <div class="pulse__bar">
                        <span class="pulse__bar-label">${catMeta.label}</span>
                        <div class="pulse__bar-track">
                            <div class="pulse__bar-fill" style="width:${pct}%;background:${catMeta.color}">${count}</div>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    function renderPulseNeighborhoods(data) {
        const neighborhoods = data.neighborhoods || {};
        const maxCount = Math.max(...Object.values(neighborhoods), 1);

        els.pulseNeighborhoods.innerHTML = Object.entries(neighborhoods)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => {
                const pct = Math.round((count / maxCount) * 100);
                return `
                    <div class="pulse__bar">
                        <span class="pulse__bar-label">${escHtml(name)}</span>
                        <div class="pulse__bar-track">
                            <div class="pulse__bar-fill" style="width:${pct}%;background:var(--accent)">${count}</div>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    function renderPulseTrending(data) {
        const trending = data.trending || [];
        const meta = data.category_meta || {};

        els.pulseTrending.innerHTML = trending
            .map((ev, i) => {
                const cat = meta[ev.category] || { label: "Other", color: "#64748b" };
                return `
                    <div class="pulse__trending-item">
                        <span class="pulse__trending-rank">${i + 1}</span>
                        <div class="pulse__trending-info">
                            <div class="pulse__trending-title">${escHtml(ev.title)}</div>
                            <div class="pulse__trending-meta">
                                <span style="color:${cat.color};font-weight:600">${cat.label}</span> · ${formatDate(ev.date)}
                            </div>
                        </div>
                        <span class="pulse__trending-rsvp">${ev.rsvp_count || 0} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:text-bottom;margin-left:2px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                    </div>
                `;
            })
            .join("");
    }

    // ======================================================================
    // UTILITY
    // ======================================================================
    function escHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
        } catch {
            return dateStr;
        }
    }

    function formatTime(dateStr) {
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        } catch {
            return "";
        }
    }

    function toast(message, type = "info") {
        const t = document.createElement("div");
        t.className = `toast toast--${type}`;
        t.innerHTML = `
            ${type === "success" ? "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom'><path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><polyline points='22 4 12 14.01 9 11.01'/></svg>" : type === "error" ? "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom'><circle cx='12' cy='12' r='10'/><line x1='15' y1='9' x2='9' y2='15'/><line x1='9' y1='9' x2='15' y2='15'/></svg>" : "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:text-bottom'><circle cx='12' cy='12' r='10'/><line x1='12' y1='16' x2='12' y2='12'/><line x1='12' y1='8' x2='12.01' y2='8'/></svg>"}
            <span>${escHtml(message)}</span>
        `;
        els.toastContainer.appendChild(t);
        setTimeout(() => {
            t.classList.add("toast-exit");
            setTimeout(() => t.remove(), 300);
        }, 3500);
    }

    // ======================================================================
    // KEYBOARD SHORTCUTS
    // ======================================================================
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeCreateModal();
            closeDetailModal();
        }
    });

    // ======================================================================
    // DEEP LINK — share URLs (?event=ID)
    // ======================================================================
    function checkDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const eventId = params.get("event");
        if (eventId) {
            API.getEvent(eventId).then((ev) => {
                if (ev && !ev.error) {
                    showEventDetail(ev);
                }
            });
        }
    }

    // ======================================================================
    // INIT
    // ======================================================================
    loadEvents();
    checkDeepLink();

    // Refresh events every 30 seconds (simulate live board)
    setInterval(() => {
        if (state.activeView === "board") loadEvents();
    }, 30000);
})();
