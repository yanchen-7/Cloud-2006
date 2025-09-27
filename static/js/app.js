(() => {
    const page = document.body?.dataset?.page || "home";
    if (page !== "home") return;

    // Be resilient if shared modules aren't ready; still bring up the map.
    const dataApi = window.CloudData || {};
    const storage = window.CloudStorage || {
        getSavedPlaces: () => [],
        setSavedPlaces: () => {},
        getUserReviews: () => [],
        setUserReviews: () => {},
        addUserReview: () => {},
        getUserReviewsByPlace: () => [],
        removeUserReview: () => {},
    };

    const {
        SENTOSA = { lat: 1.249404, lng: 103.830321 },
        SINGAPORE_BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.2 },
        loadPlacesData = async () => [],
        computeOpenStatus = () => ({ isOpen: null, state: "unknown", label: "Status unknown" }),
        haversine = () => 0,
    } = dataApi;

    const WEATHER_API = "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast";
    const RAINFALL_API = "https://api.data.gov.sg/v1/environment/rainfall";
    const PSI_API = "https://api.data.gov.sg/v1/environment/psi";
    const TEMPERATURE_API = "https://api.data.gov.sg/v1/environment/air-temperature";

    const RECS_MAX = 5;
    const MAX_PINS = 10;
    const REVIEW_PREVIEW_LIMIT = 5;
    const REVIEW_SNIPPET_LIMIT = 200;
    const SLIDE_INTERVAL_MS = 6500;

    const els = {
        placePanel: document.getElementById("placePanel"),
        placePlaceholder: document.getElementById("placePlaceholder"),
        placeDetails: document.getElementById("placeDetails"),
        placeName: document.getElementById("placeName"),
        placeCategory: document.getElementById("placeCategory"),
        placeRating: document.getElementById("placeRating"),
        placeReviewsCount: document.getElementById("placeReviewsCount"),
        placePrice: document.getElementById("placePrice"),
        placeDistance: document.getElementById("placeDistance"),
        placeStatus: document.getElementById("placeStatus"),
        placeAddress: document.getElementById("placeAddress"),
        placePhone: document.getElementById("placePhone"),
        placeWebsite: document.getElementById("placeWebsite"),
        placeWebsiteLink: document.getElementById("placeWebsiteLink"),
        placeHours: document.getElementById("placeHours"),
        placeReviewsSummary: document.getElementById("placeReviewsSummary"),
        placeReviewsList: document.getElementById("placeReviewsList"),
        placeReviewsToggle: document.getElementById("placeReviewsToggle"),
        saveBtn: document.getElementById("savePlace"),
        reviewForm: document.getElementById("userReviewForm"),
        reviewName: document.getElementById("reviewerName"),
        reviewRating: document.getElementById("reviewerRating"),
        reviewText: document.getElementById("reviewerText"),
        reviewMessage: document.getElementById("reviewFormMessage"),
        locateBtn: document.getElementById("locateMe"),
        refreshBtn: document.getElementById("refreshData"),
        categorySelect: document.getElementById("categorySelect"),
        placeCount: document.getElementById("placeCount"),
        map: document.getElementById("map"),
        mapHint: document.getElementById("mapHint"),
        savedList: document.getElementById("savedList"),
        reviewsList: document.getElementById("reviewsList"),
        navSaved: document.getElementById("navSaved"),
        navReviews: document.getElementById("navReviews"),
        ratingsChart: document.getElementById("ratingsChart"),
        recTrack: document.getElementById("recommendationTrack"),
        recDots: document.getElementById("recommendationDots"),
        recPrev: document.getElementById("recPrev"),
        recNext: document.getElementById("recNext"),
        weatherArea: document.getElementById("weatherArea"),
        weatherDescription: document.getElementById("weatherDescription"),
        weatherUpdated: document.getElementById("weatherUpdated"),
        weatherSource: document.getElementById("weatherSource"),
        weatherErrors: document.getElementById("weatherErrors"),
        tempBadge: document.getElementById("tempBadge"),
        psiBadge: document.getElementById("psiBadge"),
        rainfallBadge: document.getElementById("rainfallBadge"),
    };

    if (!els.map) return;

    const map = L.map("map", { zoomControl: true }).setView([SENTOSA.lat, SENTOSA.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const placeIcon = L.icon({
        iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        shadowSize: [41, 41],
    });

    const userIcon = L.icon({
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
    });

    const state = {
        coords: { ...SENTOSA },
        userHasSharedLocation: false,
        userMarker: null,
        placeMarkers: [],
        selectedPlaceId: null,
        selectedCategory: "",
        allPlaces: [],
        categories: [],
        slider: { index: 0, items: [], timer: null },
        reviewsExpanded: false,
        weatherCache: { fetchedAt: 0, forecast: null, rainfall: null, psi: null, temp: null },
    };

    function isWithinSingapore(coords) {
        if (!coords) return false;
        const { lat, lng } = coords;
        return (
            lat >= SINGAPORE_BOUNDS.minLat &&
            lat <= SINGAPORE_BOUNDS.maxLat &&
            lng >= SINGAPORE_BOUNDS.minLng &&
            lng <= SINGAPORE_BOUNDS.maxLng
        );
    }

    function togglePlacePanel(active) {
        if (!els.placePanel) return;
        if (active) {
            els.placePanel.classList.remove("is-collapsed");
            els.placePanel.classList.add("is-active");
        } else {
            els.placePanel.classList.add("is-collapsed");
            els.placePanel.classList.remove("is-active");
        }
    }

    function showPlaceholder() {
        if (els.placeDetails) els.placeDetails.hidden = true;
        if (els.placePlaceholder) els.placePlaceholder.hidden = false;
        if (els.mapHint) els.mapHint.hidden = false;
        state.selectedPlaceId = null;
        state.reviewsExpanded = false;
        togglePlacePanel(false);
    }

    function setUserLocation(coords, { pan = true } = {}) {
        state.coords = { ...coords }; state.userHasSharedLocation = true;
        if (state.userMarker) {
            state.userMarker.setLatLng([coords.lat, coords.lng]);
        } else {
            state.userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon })
                .addTo(map)
                .bindTooltip("You are here", { permanent: false });
        }
        if (pan) {
            map.flyTo([coords.lat, coords.lng], 14, { duration: 0.8 });
        }
    }

    function clearUserMarker() {
        if (state.userMarker) {
            map.removeLayer(state.userMarker);
            state.userMarker = null;
        }
    }

    function updateToolbarMessage(message, isWarning = false) {
        if (!els.placeCount) return;
        els.placeCount.textContent = message;
        els.placeCount.style.color = isWarning ? "#dc2626" : "";
    }

    function formatDistance(distanceKm) {
        if (typeof distanceKm !== "number" || Number.isNaN(distanceKm)) return null;
        if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
        return `${distanceKm.toFixed(2)} km away`;
    }

    function formatPhone(phone) {
        if (!phone) return "--";
        const dial = String(phone).replace(/\s+/g, "");
        return `<a href="tel:${dial}">${phone}</a>`;
    }

    function formatWebsite(url) {
        if (!url) return { href: "", label: "--" };
        try {
            const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
            return { href: parsed.href, label: parsed.hostname.replace(/^www\./, "") };
        } catch {
            return { href: url, label: url };
        }
    }

    function buildStarMarkup(rating) {
        if (rating == null) return "<span class=\"review-rating\">No rating</span>";
        const clamped = Math.max(0, Math.min(5, Number(rating)));
        const full = Math.floor(clamped);
        const hasHalf = clamped - full >= 0.5;
        const empty = 5 - full - (hasHalf ? 1 : 0);
        const stars = [
            ...Array.from({ length: full }, () => '<i class="fas fa-star"></i>'),
            ...(hasHalf ? ['<i class="fas fa-star-half-alt"></i>'] : []),
            ...Array.from({ length: empty }, () => '<i class="far fa-star"></i>'),
        ].join(" ");
        return `<span class="review-rating" aria-label="Rating ${clamped} out of 5">${stars}<span class="sr-only">Rating ${clamped} out of 5</span></span>`;
    }

    function renderOpeningHours(opening) {
        if (!els.placeHours) return;
        els.placeHours.innerHTML = "";
        if (!opening) {
            els.placeHours.innerHTML = "<li>Not available</li>";
            return;
        }
        const todayName = new Date().toLocaleDateString("en-SG", { weekday: "long" });
        if (Array.isArray(opening.weekday_text) && opening.weekday_text.length) {
            opening.weekday_text.forEach(text => {
                const line = document.createElement("li");
                line.textContent = text;
                if (text.toLowerCase().startsWith(todayName.toLowerCase())) {
                    line.classList.add("current");
                }
                els.placeHours.appendChild(line);
            });
            return;
        }
        els.placeHours.innerHTML = "<li>Hours unavailable</li>";
    }

    function getSavedPlaces() {
        return storage.getSavedPlaces();
    }

    function setSavedPlaces(list) {
        storage.setSavedPlaces(list);
    }

    function isPlaceSaved(placeId) {
        return getSavedPlaces().some(item => item.place_id === placeId);
    }

    function updateSaveButton(placeId) {
        if (!els.saveBtn) return;
        const saved = isPlaceSaved(placeId);
        els.saveBtn.classList.toggle("saved", saved);
        els.saveBtn.setAttribute("aria-pressed", saved ? "true" : "false");
        els.saveBtn.innerHTML = saved ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
        els.saveBtn.setAttribute("title", saved ? "Remove from saved" : "Save this place");
    }

    function toggleSaveForPlace(placeId) {
        const saved = getSavedPlaces();
        const index = saved.findIndex(item => item.place_id === placeId);
        if (index === -1) {
            const place = state.allPlaces.find(p => p.place_id === placeId);
            if (place) {
                saved.push({ ...place, saved_at: new Date().toISOString() });
            }
        } else {
            saved.splice(index, 1);
        }
        setSavedPlaces(saved);
        updateSaveButton(placeId);
        renderSavedPlaces();
    }

    function formatReviewDate(dateStr) {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric" });
    }

    function getCombinedReviews(place) {
        const seed = Array.isArray(place.reviews) ? place.reviews : [];
        
        // Add CSV reviews for this place
        const csvReviews = [];
        for (let i = 1; i <= 5; i++) {
            const authorName = place[`review_${i}_author_name`];
            const rating = place[`review_${i}_rating`];
            const date = place[`review_${i}_exact_date`];
            const text = place[`review_${i}_text`];
            
            if (authorName && text) {
                csvReviews.push({
                    id: `csv-${place.place_id}-${i}`,
                    author: authorName,
                    rating: rating ? Number(rating) : null,
                    date: date ? formatReviewDate(date) : "",
                    text: text,
                    source: "csv"
                });
            }
        }
        
        const user = storage.getUserReviewsByPlace(place.place_id)
            .map(review => ({
                id: review.id,
                author: review.author || "Anonymous",
                rating: review.rating != null ? Number(review.rating) : null,
                date: review.created_at ? formatReviewDate(review.created_at) : "",
                text: review.text || "",
                source: "user",
            }))
            .sort((a, b) => (a.date && b.date ? new Date(b.date) - new Date(a.date) : 0));
        
        // Combine all reviews and sort by date (newest first)
        const allReviews = [...seed, ...csvReviews, ...user];
        return allReviews.sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date) - new Date(a.date);
        });
    }
    function renderPlaceReviews(place) {
        if (!els.placeReviewsList || !els.placeReviewsSummary || !els.placeReviewsToggle) return;
        const reviews = getCombinedReviews(place);
        const total = reviews.length;
        els.placeReviewsSummary.textContent = total ? `${total} review${total === 1 ? '' : 's'}` : "No reviews yet";
        els.placeReviewsList.innerHTML = "";
        if (!total) {
            els.placeReviewsToggle.hidden = true;
            return;
        }
        const visibleCount = state.reviewsExpanded ? total : Math.min(REVIEW_PREVIEW_LIMIT, total);
        reviews.slice(0, visibleCount).forEach(review => {
            const card = document.createElement("article");
            card.className = "review-card";

            const header = document.createElement("div");
            header.className = "review-header";
            header.innerHTML = `<span>${buildStarMarkup(review.rating)}</span><span>${review.author}</span>`;
            card.appendChild(header);

            if (review.date) {
                const dateEl = document.createElement("div");
                dateEl.className = "review-date";
                dateEl.textContent = review.date;
                card.appendChild(dateEl);
            }

            const textEl = document.createElement("p");
            textEl.className = "review-text";
            const fullText = review.text || "(No comment provided.)";
            const truncated = fullText.length > REVIEW_SNIPPET_LIMIT
                ? `${fullText.slice(0, REVIEW_SNIPPET_LIMIT).trim()}...`
                : fullText;
            textEl.textContent = state.reviewsExpanded ? fullText : truncated;
            card.appendChild(textEl);

            if (fullText.length > REVIEW_SNIPPET_LIMIT) {
                const toggle = document.createElement("button");
                toggle.className = "review-toggle";
                toggle.type = "button";
                toggle.textContent = state.reviewsExpanded ? "Show less" : "Read full review";
                toggle.addEventListener("click", () => {
                    const expanded = toggle.getAttribute("data-expanded") === "true";
                    toggle.setAttribute("data-expanded", expanded ? "false" : "true");
                    textEl.textContent = expanded ? truncated : fullText;
                    toggle.textContent = expanded ? "Read full review" : "Show less";
                });
                card.appendChild(toggle);
            }

            els.placeReviewsList.appendChild(card);
        });

        if (total > REVIEW_PREVIEW_LIMIT) {
            els.placeReviewsToggle.hidden = false;
            els.placeReviewsToggle.textContent = state.reviewsExpanded ? "Show fewer reviews" : "Show more reviews";
        } else {
            els.placeReviewsToggle.hidden = true;
        }
    }

    function renderGlobalReviews() {
        if (!els.reviewsList) return;
        const csvReviews = [];
        
        // Extract reviews from CSV data
        state.allPlaces.forEach(place => {
            for (let i = 1; i <= 5; i++) {
                const authorName = place[`review_${i}_author_name`];
                const rating = place[`review_${i}_rating`];
                const date = place[`review_${i}_exact_date`];
                const text = place[`review_${i}_text`];
                
                if (authorName && text) {
                    csvReviews.push({
                        placeName: place.name,
                        authorName,
                        rating,
                        date,
                        text
                    });
                }
            }
        });
        
        // Sort by date (newest first)
        csvReviews.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        
        els.reviewsList.innerHTML = "";
        if (!csvReviews.length) {
            els.reviewsList.innerHTML = '<div class="empty">No reviews available.</div>';
            return;
        }
        
        csvReviews.forEach((review, index) => {
            const row = document.createElement("div");
            row.className = "review-item";
            
            // Truncate review text to 200 words
            const words = (review.text || '').split(/\s+/);
            const isTruncated = words.length > 200;
            const truncatedText = words.slice(0, 200).join(' ');
            
            const ratingDisplay = review.rating ? `${review.rating}/5` : "No rating";
            const dateDisplay = review.date ? new Date(review.date).toLocaleDateString() : 'No date';
            
            row.innerHTML = `
                <div class="title">${review.placeName || 'Unknown place'}</div>
                <div class="sub">${review.authorName || 'Anonymous'} • ${ratingDisplay} • ${dateDisplay}</div>
                <div class="text" data-full-text="${encodeURIComponent(review.text || '')}">
                    ${isTruncated ? truncatedText + '...' : review.text || 'No comment'}
                    ${isTruncated ? `<span class="expand-link" onclick="toggleReviewExpansion(this)" style="color: #007bff; cursor: pointer; text-decoration: underline;"> Read more</span>` : ''}
                </div>
            `;
            els.reviewsList.appendChild(row);
        });
    }

    // Global function for review expansion (needs to be accessible from onclick)
    window.toggleReviewExpansion = function(linkElement) {
        const textDiv = linkElement.parentElement;
        const fullText = decodeURIComponent(textDiv.getAttribute('data-full-text') || '');
        const words = fullText.split(/\s+/);
        const isExpanded = linkElement.textContent.trim() === 'Show less';
        
        if (isExpanded) {
            // Collapse - show truncated version
            const truncatedText = words.slice(0, 200).join(' ');
            textDiv.innerHTML = `${truncatedText}...<span class="expand-link" onclick="toggleReviewExpansion(this)" style="color: #007bff; cursor: pointer; text-decoration: underline;"> Read more</span>`;
        } else {
            // Expand - show full text
            textDiv.innerHTML = `${fullText}<span class="expand-link" onclick="toggleReviewExpansion(this)" style="color: #007bff; cursor: pointer; text-decoration: underline;"> Show less</span>`;
        }
    };

    function handleReviewSubmit(event) {
        event.preventDefault();
        if (!state.selectedPlaceId) return;
        const ratingValue = Number(els.reviewRating?.value || "");
        const textValue = (els.reviewText?.value || "").trim();
        const nameValue = (els.reviewName?.value || "").trim() || "Anonymous";

        if (!ratingValue || ratingValue < 1 || ratingValue > 5) {
            if (els.reviewMessage) els.reviewMessage.textContent = "Please select a rating between 1 and 5.";
            return;
        }
        if (textValue.length < 10) {
            if (els.reviewMessage) els.reviewMessage.textContent = "Please enter at least 10 characters.";
            return;
        }

        const review = {
            id: `${state.selectedPlaceId}-${Date.now()}`,
            place_id: state.selectedPlaceId,
            author: nameValue,
            rating: ratingValue,
            text: textValue,
            created_at: new Date().toISOString(),
            source: "user",
        };
        storage.addUserReview(review);
        if (els.reviewText) els.reviewText.value = "";
        if (els.reviewRating) els.reviewRating.value = "";
        if (els.reviewName) els.reviewName.value = "";
        if (els.reviewMessage) els.reviewMessage.textContent = "Review saved locally.";
        const place = state.allPlaces.find(p => p.place_id === state.selectedPlaceId);
        if (place) {
            renderPlaceReviews(place);
        }
        renderGlobalReviews();
    }

    function renderSavedPlaces() {
        if (!els.savedList) return;
        const saved = getSavedPlaces().sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
        els.savedList.innerHTML = "";
        if (!saved.length) {
            els.savedList.innerHTML = '<div class="empty">No saved places yet.</div>';
            return;
        }
        saved.forEach(place => {
            const item = document.createElement("div");
            item.className = "saved-item";
            item.innerHTML = `
                <div class="title">${place.name || 'Unknown place'}</div>
                <div class="sub">${place.category || 'Unknown category'}</div>
                <div class="meta">
                    <span class="badge"><i class="fas fa-star"></i> ${place.rating || 'No rating'}</span>
                    <button class="btn ghost" data-action="show" data-id="${place.place_id}"><i class="fas fa-map-marker-alt"></i> Show on map</button>
                    <button class="btn ghost" data-action="remove" data-id="${place.place_id}"><i class="fas fa-trash"></i> Remove</button>
                </div>
            `;
            els.savedList.appendChild(item);
        });

        els.savedList.querySelectorAll("button[data-action='show']").forEach(btn => {
            btn.addEventListener("click", e => {
                const id = e.currentTarget.getAttribute("data-id");
                const place = state.allPlaces.find(p => p.place_id === id);
                if (place) {
                    map.flyTo([place.latitude, place.longitude], 15, { duration: 0.6 });
                    displayPlaceDetails(place);
                }
            });
        });

        els.savedList.querySelectorAll("button[data-action='remove']").forEach(btn => {
            btn.addEventListener("click", e => {
                const id = e.currentTarget.getAttribute("data-id");
                const updated = getSavedPlaces().filter(item => item.place_id !== id);
                setSavedPlaces(updated);
                renderSavedPlaces();
                if (state.selectedPlaceId === id) {
                    updateSaveButton(id);
                }
            });
        });
    }
    function displayPlaceDetails(place) {
        if (!place || !els.placeDetails || !els.placePlaceholder) return;
        state.selectedPlaceId = place.place_id;
        state.reviewsExpanded = false;

        els.placePlaceholder.hidden = true;
        els.placeDetails.hidden = false;
        if (els.mapHint) els.mapHint.hidden = true;
        togglePlacePanel(true);

        els.placeName.textContent = place.name || "--";
        els.placeCategory.textContent = place.category || "--";
        const rating = place.rating != null ? Number(place.rating).toFixed(1) : "--";
        els.placeRating.innerHTML = `<i class="fas fa-star"></i> ${rating}`;
        const reviewsTotal = place.user_ratings_total != null ? Number(place.user_ratings_total).toLocaleString() : "--";
        els.placeReviewsCount.innerHTML = `<i class="fas fa-users"></i> ${reviewsTotal}`;

        if (place.price_text) {
            els.placePrice.hidden = false;
            els.placePrice.innerHTML = `<i class="fas fa-dollar-sign"></i> ${place.price_text}`;
        } else if (els.placePrice) {
            els.placePrice.hidden = true;
        }

        if (typeof place.distance_km === "number") {
            const distanceText = formatDistance(place.distance_km);
            if (distanceText) {
                els.placeDistance.hidden = false;
                els.placeDistance.innerHTML = `<i class="fas fa-route"></i> ${distanceText}`;
            }
        } else if (els.placeDistance) {
            els.placeDistance.hidden = true;
        }

        const status = computeOpenStatus(place.opening_hours);
        els.placeStatus.textContent = status.label;
        els.placeStatus.setAttribute("data-state", status.state);

        els.placeAddress.textContent = place.formatted_address || "--";
        els.placePhone.innerHTML = formatPhone(place.phone);
        const websiteInfo = formatWebsite(place.website);
        if (websiteInfo.href) {
            els.placeWebsiteLink.textContent = websiteInfo.label;
            els.placeWebsiteLink.href = websiteInfo.href;
            els.placeWebsite.hidden = false;
        } else {
            els.placeWebsiteLink.textContent = "--";
            els.placeWebsiteLink.removeAttribute("href");
        }

        renderOpeningHours(place.opening_hours);
        renderPlaceReviews(place);
        updateSaveButton(place.place_id);
        updateWeather({ lat: place.latitude, lng: place.longitude, label: place.name });
    }

    function resetMarkers() {
        state.placeMarkers.forEach(marker => marker.remove());
        state.placeMarkers = [];
    }

    function renderMarkers(places) {
        resetMarkers();
        if (!places.length) return;
        places.forEach(place => {
            const marker = L.marker([place.latitude, place.longitude], { icon: placeIcon });
            marker.addTo(map).bindTooltip(`<strong>${place.name}</strong>`, { direction: "top" });
            marker.on("click", () => {
                displayPlaceDetails(place);
            });
            state.placeMarkers.push(marker);
        });
        const bounds = L.latLngBounds(places.map(item => [item.latitude, item.longitude]));
        if (state.userMarker) {
            bounds.extend(state.userMarker.getLatLng());
        }
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    function buildCategories(places) {
        const set = new Set();
        places.forEach(place => set.add(place.category));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

    function populateCategorySelect() {
        if (!els.categorySelect) return;
        els.categorySelect.innerHTML = "";
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select a category...";
        els.categorySelect.appendChild(defaultOption);
        state.categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            els.categorySelect.appendChild(option);
        });
    }

    function loadPlacesForCategory(category) {
        if (!category) {
            resetMarkers();
            showPlaceholder();
            updateToolbarMessage("Select a category to view nearby places.");
            return;
        }
        const enriched = state.allPlaces
            .filter(place => place.category === category)
            .map(place => ({
                ...place,
                distance_km: haversine(state.coords.lat, state.coords.lng, place.latitude, place.longitude),
            }));
        enriched.sort((a, b) => a.distance_km - b.distance_km || (b.rating ?? 0) - (a.rating ?? 0));
        let picks = enriched.slice(0, MAX_PINS);
        if (!picks.length) {
            const fallback = state.allPlaces.map(place => ({
                ...place,
                distance_km: haversine(state.coords.lat, state.coords.lng, place.latitude, place.longitude),
            }));
            fallback.sort((a, b) => a.distance_km - b.distance_km || (b.rating ?? 0) - (a.rating ?? 0));
            picks = fallback.slice(0, MAX_PINS);
        }
        renderMarkers(picks);
        showPlaceholder();
        if (picks.length) {
            const prefix = state.userHasSharedLocation ? "Nearest" : "Popular";
            updateToolbarMessage(`${prefix} ${picks.length} places${category ? ` for ${category}` : ""}.`);
        } else {
            updateToolbarMessage(`No places found for ${category}.`, true);
        }
    }

    function selectCategory(category) {
        state.selectedCategory = category;
        if (els.categorySelect) els.categorySelect.value = category;
        loadPlacesForCategory(category);
    }

    function computeRecommendations() {
        const byCategory = new Map();
        state.allPlaces.forEach(place => {
            const list = byCategory.get(place.category) || [];
            list.push(place);
            byCategory.set(place.category, list);
        });
        const entries = [];
        byCategory.forEach((places, category) => {
            const sorted = places.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0));
            if (sorted[0]) {
                entries.push({ category, place: sorted[0] });
            }
        });
        entries.sort((a, b) => (b.place.rating ?? 0) - (a.place.rating ?? 0));
        return entries.slice(0, RECS_MAX);
    }

    function updateRecommendations() {
        if (!els.recTrack || !els.recDots) return;
        const items = computeRecommendations();
        state.slider.items = items;
        els.recTrack.innerHTML = "";
        els.recDots.innerHTML = "";
        if (!items.length) {
            els.recTrack.innerHTML = '<div class="slider-placeholder">Daily picks unavailable. Try refreshing.</div>';
            return;
        }
        items.forEach((entry, index) => {
            const slide = document.createElement("div");
            slide.className = "slider-item";
            slide.innerHTML = `
                <div class="details">
                    <h3>${entry.place.name}</h3>
                    <p>${entry.place.formatted_address || "--"}</p>
                    <div class="meta">
                        <span class="badge"><i class="fas fa-star"></i> ${(entry.place.rating ?? "--")}</span>
                        <span class="badge muted"><i class="fas fa-users"></i> ${(entry.place.user_ratings_total ?? "--")}</span>
                        ${entry.place.price_text ? `<span class="badge price"><i class="fas fa-dollar-sign"></i> ${entry.place.price_text}</span>` : ""}
                    </div>
                    <button class="btn ghost rec-load" data-category="${entry.category}"><i class="fas fa-map-marker-alt"></i> View ${entry.category}</button>
                </div>
                <div class="map-preview">
                    <div class="category">${entry.category}</div>
                    <p>${entry.place.distance_km ? `${formatDistance(entry.place.distance_km)}` : "Top rated pick"}</p>
                </div>
            `;
            els.recTrack.appendChild(slide);

            const dot = document.createElement("span");
            dot.className = "slider-dot";
            dot.dataset.index = String(index);
            dot.addEventListener("click", () => {
                goToSlide(index);
                stopSliderAutoPlay();
                startSliderAutoPlay();
            });
            els.recDots.appendChild(dot);
        });
        state.slider.index = 0;
        els.recTrack.style.transform = "translateX(0)";
        updateSliderIndicators();
        bindRecommendationActions();
        startSliderAutoPlay();
    }

    function bindRecommendationActions() {
        document.querySelectorAll(".rec-load").forEach(button => {
            button.addEventListener("click", event => {
                const category = event.currentTarget.getAttribute("data-category");
                if (category) {
                    selectCategory(category);
                }
            });
        });
    }

    function goToSlide(index) {
        if (!state.slider.items.length) return;
        const clamped = ((index % state.slider.items.length) + state.slider.items.length) % state.slider.items.length;
        state.slider.index = clamped;
        els.recTrack.style.transform = `translateX(-${clamped * 100}%)`;
        updateSliderIndicators();
    }

    function nextSlide() {
        goToSlide(state.slider.index + 1);
    }

    function prevSlide() {
        goToSlide(state.slider.index - 1);
    }

    function updateSliderIndicators() {
        els.recDots.querySelectorAll(".slider-dot").forEach((dot, idx) => {
            if (idx === state.slider.index) dot.classList.add("active");
            else dot.classList.remove("active");
        });
    }

    function startSliderAutoPlay() {
        if (!state.slider.items.length) return;
        stopSliderAutoPlay();
        state.slider.timer = window.setInterval(nextSlide, SLIDE_INTERVAL_MS);
    }

    function stopSliderAutoPlay() {
        if (state.slider.timer) {
            clearInterval(state.slider.timer);
            state.slider.timer = null;
        }
    }
    async function fetchWeatherApis() {
        if (Date.now() - state.weatherCache.fetchedAt < 10 * 60 * 1000) {
            return;
        }
        try {
            const [forecast, rainfall, psi, temp] = await Promise.all([
                fetch(WEATHER_API).then(res => res.json()),
                fetch(RAINFALL_API).then(res => res.json()),
                fetch(PSI_API).then(res => res.json()),
                fetch(TEMPERATURE_API).then(res => res.json()),
            ]);
            state.weatherCache = {
                forecast,
                rainfall,
                psi,
                temp,
                fetchedAt: Date.now(),
            };
        } catch (err) {
            console.warn("Weather fetch failed", err);
        }
    }

    function nearestForecast(lat, lng) {
        const data = state.weatherCache.forecast || {};
        const metadata = data.area_metadata || [];
        const forecasts = data.items?.[0]?.forecasts || [];
        if (!metadata.length || !forecasts.length) return null;
        const metaMap = new Map(metadata.map(item => [item.name, item]));
        let best = null;
        forecasts.forEach(entry => {
            const meta = metaMap.get(entry.area);
            if (!meta || !meta.label_location) return;
            const dist = haversine(lat, lng, meta.label_location.latitude, meta.label_location.longitude);
            if (!best || dist < best.distance) {
                best = {
                    distance: dist,
                    area: entry.area,
                    forecast: entry.forecast,
                    update: data.items?.[0]?.update_timestamp,
                };
            }
        });
        return best;
    }

    function nearestRainfall(lat, lng) {
        const data = state.weatherCache.rainfall || {};
        const stations = data.metadata?.stations || [];
        const readings = data.items?.[0]?.readings || [];
        const readingsMap = new Map(readings.map(item => [item.station_id, item.value]));
        let best = null;
        stations.forEach(station => {
            const value = readingsMap.get(station.id);
            if (value == null) return;
            const loc = station.location || {};
            if (loc.latitude == null || loc.longitude == null) return;
            const dist = haversine(lat, lng, loc.latitude, loc.longitude);
            if (!best || dist < best.distance) {
                best = {
                    distance: dist,
                    amount: value,
                    station: station.name,
                    update: data.items?.[0]?.timestamp,
                };
            }
        });
        return best;
    }

    function nearestPsi(lat, lng) {
        const data = state.weatherCache.psi || {};
        const regions = data.region_metadata || [];
        const readings = data.items?.[0]?.readings?.psi_twenty_four_hourly || {};
        let best = null;
        regions.forEach(region => {
            const value = readings[region.name];
            if (value == null || !region.label_location) return;
            const dist = haversine(lat, lng, region.label_location.latitude, region.label_location.longitude);
            if (!best || dist < best.distance) {
                best = {
                    distance: dist,
                    psi: value,
                    region: region.name,
                    update: data.items?.[0]?.update_timestamp,
                };
            }
        });
        return best;
    }

    function nearestTemperature(lat, lng) {
        const data = state.weatherCache.temp || {};
        const stations = data.metadata?.stations || [];
        const readings = data.items?.[0]?.readings || [];
        const readingsMap = new Map(readings.map(entry => [(entry.station_id ?? entry.stationId), entry.value]));
        let best = null;
        stations.forEach(station => {
            const value = readingsMap.get(station.id);
            if (value == null || !station.location) return;
            const dist = haversine(lat, lng, station.location.latitude, station.location.longitude);
            if (!best || dist < best.distance) {
                best = {
                    distance: dist,
                    value,
                    station: station.name,
                    update: data.items?.[0]?.timestamp,
                };
            }
        });
        return best;
    }

    async function updateWeather(target = null) {
        await fetchWeatherApis();
        const coords = target || { lat: state.coords.lat, lng: state.coords.lng, label: target?.label || (state.userHasSharedLocation ? "Your location" : "Sentosa") };
        const forecast = nearestForecast(coords.lat, coords.lng);
        const rainfall = nearestRainfall(coords.lat, coords.lng);
        const psi = nearestPsi(coords.lat, coords.lng);
        const temp = nearestTemperature(coords.lat, coords.lng);
        const errors = [];

        if (forecast) {
            els.weatherArea.textContent = `${coords.label} � ${forecast.area}`;
            els.weatherDescription.textContent = forecast.forecast;
            if (forecast.update) {
                els.weatherUpdated.textContent = new Date(forecast.update).toLocaleString();
            }
            els.weatherSource.textContent = forecast.area;
        } else {
            errors.push({ source: "Weather", message: "Forecast unavailable" });
        }

        if (temp) {
            els.tempBadge.textContent = `Temp: ${temp.value?.toFixed?.(1) ?? temp.value}�C`;
        } else {
            els.tempBadge.textContent = "Temp: --";
        }

        if (psi) {
            els.psiBadge.textContent = `PSI: ${psi.psi}`;
        } else {
            els.psiBadge.textContent = "PSI: --";
        }

        if (rainfall) {
            els.rainfallBadge.textContent = `Rainfall: ${rainfall.amount} mm`;
        } else {
            els.rainfallBadge.textContent = "Rainfall: --";
        }

        if (els.weatherErrors) {
            els.weatherErrors.innerHTML = "";
            errors.forEach(error => {
                const div = document.createElement("div");
                div.textContent = `${error.source}: ${error.message}`;
                els.weatherErrors.appendChild(div);
            });
        }
    }

    function requestLocation({ force = false } = {}) {
        if (!navigator.geolocation) {
            updateToolbarMessage("Geolocation unavailable. Defaulting to Sentosa.", true);
            setUserLocation(SENTOSA, { pan: !state.userHasSharedLocation });
            loadPlacesForCategory(state.selectedCategory);
            return;
        }
        updateToolbarMessage("Locating you...");
        navigator.geolocation.getCurrentPosition(
            position => {
                const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
                if (!isWithinSingapore(coords)) {
                    clearUserMarker();
                    setUserLocation(SENTOSA, { pan: true });
                    state.userHasSharedLocation = false;
                    updateToolbarMessage("Outside Singapore. Defaulting to Sentosa.", true);
                    loadPlacesForCategory(state.selectedCategory);
                    updateWeather();
                    return;
                }
                setUserLocation(coords, { pan: !state.userHasSharedLocation || force });
                updateToolbarMessage("Live location enabled.");
                updateWeather({ lat: coords.lat, lng: coords.lng, label: "Your location" });
                if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory);
            },
            () => {
                clearUserMarker();
                setUserLocation(SENTOSA, { pan: true });
                state.userHasSharedLocation = false;
                updateToolbarMessage("Location access denied. Using Sentosa.", true);
                loadPlacesForCategory(state.selectedCategory);
                updateWeather();
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        );
    }

    function buildViz() {
        if (!els.ratingsChart) return;
        const ctx = els.ratingsChart.getContext("2d");
        const byCategory = new Map();
        state.allPlaces.forEach(place => {
            const list = byCategory.get(place.category) || [];
            if (place.rating != null) list.push(Number(place.rating));
            byCategory.set(place.category, list);
        });
        const labels = Array.from(byCategory.keys());
        const averages = labels.map(category => {
            const values = byCategory.get(category) || [];
            if (!values.length) return 0;
            return values.reduce((sum, value) => sum + value, 0) / values.length;
        });
        new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Avg Rating",
                    data: averages.map(value => Number(value.toFixed(2))),
                    backgroundColor: "#60a5fa",
                }],
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, max: 5 },
                },
            },
        });
    }

    function attachEvents() {
        els.locateBtn?.addEventListener("click", () => requestLocation({ force: true }));
        els.refreshBtn?.addEventListener("click", () => {
            if (state.selectedPlaceId) {
                const place = state.allPlaces.find(item => item.place_id === state.selectedPlaceId);
                if (place) {
                    updateWeather({ lat: place.latitude, lng: place.longitude, label: place.name });
                } else {
                    updateWeather();
                }
            } else {
                updateWeather();
            }
            updateRecommendations();
            if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory);
        });

        els.categorySelect?.addEventListener("change", event => {
            const value = event.target.value;
            state.selectedCategory = value;
            loadPlacesForCategory(value);
        });

        els.recNext?.addEventListener("click", () => {
            stopSliderAutoPlay();
            nextSlide();
            startSliderAutoPlay();
        });
        els.recPrev?.addEventListener("click", () => {
            stopSliderAutoPlay();
            prevSlide();
            startSliderAutoPlay();
        });
        map.on("movestart", stopSliderAutoPlay);

        els.navSaved?.addEventListener("click", () => {
            document.getElementById("saved")?.scrollIntoView({ behavior: "smooth" });
        });
        els.navReviews?.addEventListener("click", () => {
            document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" });
        });

        els.saveBtn?.addEventListener("click", () => {
            if (!state.selectedPlaceId) return;
            toggleSaveForPlace(state.selectedPlaceId);
        });

        els.placeReviewsToggle?.addEventListener("click", () => {
            const place = state.allPlaces.find(p => p.place_id === state.selectedPlaceId);
            if (!place) return;
            state.reviewsExpanded = !state.reviewsExpanded;
            renderPlaceReviews(place);
        });

        els.reviewForm?.addEventListener("submit", handleReviewSubmit);
    }

    async function bootstrap() {
        attachEvents();
        try {
            const places = await loadPlacesData();
            state.allPlaces = places;
            state.categories = buildCategories(places);
            populateCategorySelect();
            updateRecommendations();
            buildViz();
            renderSavedPlaces();
            renderGlobalReviews();
            // Auto-request location immediately on page load
            requestLocation({ force: true });
            updateWeather();
            if (state.categories.length) {
                selectCategory(state.categories[0]);
            } else {
                updateToolbarMessage("No categories available. Try refreshing data.", true);
            }
        } catch (err) {
            console.error("Failed to load places data", err);
            updateToolbarMessage("Unable to load places data.", true);
        }
    }

    showPlaceholder();
    bootstrap();
})();





