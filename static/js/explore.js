(() => {
    const page = document.body?.dataset?.page || "home";
    if (page !== "explore") return;

    const dataApi = window.CloudData;
    const storage = window.CloudStorage;
    if (!dataApi || !storage) {
        console.error("Cloud modules unavailable. Explore map cannot load.");
        return;
    }

    const { SENTOSA, loadPlacesData, haversine, computeOpenStatus } = dataApi;

    const els = {
        map: document.getElementById("exploreMap"),
        categorySelect: document.getElementById("exploreCategory"),
        savedToggle: document.getElementById("exploreSavedToggle"),
        list: document.getElementById("exploreList"),
        count: document.getElementById("exploreCount"),
        detailsPanel: document.getElementById("exploreDetailsPanel"),
        detailsClose: document.getElementById("exploreDetailsClose"),
        detailName: document.getElementById("exploreDetailName"),
        detailCategory: document.getElementById("exploreDetailCategory"),
        detailRating: document.getElementById("exploreDetailRating"),
        detailReviews: document.getElementById("exploreDetailReviews"),
        detailStatus: document.getElementById("exploreDetailStatus"),
        detailAddress: document.getElementById("exploreDetailAddress"),
        detailPhone: document.getElementById("exploreDetailPhone"),
        detailWebsite: document.getElementById("exploreDetailWebsite"),
        detailHours: document.getElementById("exploreDetailHours"),
        detailSave: document.getElementById("exploreDetailSave"),
    };

    if (!els.map) return;

    const map = L.map("exploreMap", { zoomControl: true }).setView([SENTOSA.lat, SENTOSA.lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const defaultIcon = L.icon({
        iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        shadowSize: [41, 41],
    });

    const savedIcon = L.icon({
        iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-gold.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        shadowSize: [41, 41],
    });

    const state = {
        allPlaces: [],
        selectedCategory: "",
        showSavedOnly: false,
        markers: [],
        selectedPlaceId: null,
    };

    function getSavedSet() {
        return new Set((storage.getSavedPlaces() || []).map(item => item.place_id));
    }

    function renderHours(opening) {
        if (!els.detailHours) return;
        els.detailHours.innerHTML = "";
        if (!opening || !Array.isArray(opening.weekday_text) || !opening.weekday_text.length) {
            els.detailHours.innerHTML = "<li>Not available</li>";
            return;
        }
        const todayName = new Date().toLocaleDateString("en-SG", { weekday: "long" }).toLowerCase();
        opening.weekday_text.forEach(text => {
            const li = document.createElement("li");
            li.textContent = text;
            if (text.toLowerCase().startsWith(todayName)) li.classList.add("current");
            els.detailHours.appendChild(li);
        });
    }

    function updateCount(count) {
        if (!els.count) return;
        els.count.textContent = count;
    }

    function resetMarkers() {
        state.markers.forEach(marker => marker.remove());
        state.markers = [];
    }

    function renderMarkers(places) {
        resetMarkers();
        const savedSet = getSavedSet();
        if (!places.length) return;
        places.forEach(place => {
            const isSaved = savedSet.has(place.place_id);
            const marker = L.marker([place.latitude, place.longitude], { icon: isSaved ? savedIcon : defaultIcon });
            marker.addTo(map).bindTooltip(`<strong>${place.name}</strong>`, { direction: "top" });
            marker.on("click", () => showDetails(place));
            state.markers.push(marker);
        });
        const bounds = L.latLngBounds(places.map(place => [place.latitude, place.longitude]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    function truncate(text, max = 60) {
        if (!text) return "--";
        return text.length > max ? `${text.slice(0, max).trim()}...` : text;
    }

    function renderList(places) {
        if (!els.list) return;
        els.list.innerHTML = "";
        if (!places.length) {
            els.list.innerHTML = '<div class="empty">No places match your filters.</div>';
            return;
        }
        places.forEach(place => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "explore-item";
            item.dataset.id = place.place_id;
            item.innerHTML = `
                <div class="title">${place.name}</div>
                <span class="badge rating"><i class="fas fa-star"></i> ${(place.rating ?? "--")}</span>
                <div class="meta">${truncate(place.formatted_address)}</div>
            `;
            item.addEventListener("click", () => showDetails(place));
            els.list.appendChild(item);
        });
    }

    function formatStatus(opening) {
        const status = computeOpenStatus(opening);
        return status;
    }

    function showDetails(place) {
        if (!place || !els.detailsPanel) return;
        state.selectedPlaceId = place.place_id;
        els.detailsPanel.classList.add("is-active");

        els.detailName.textContent = place.name || "--";
        els.detailCategory.textContent = place.category || "--";
        els.detailRating.innerHTML = `<i class="fas fa-star"></i> ${place.rating != null ? Number(place.rating).toFixed(1) : "--"}`;
        els.detailReviews.innerHTML = `<i class="fas fa-users"></i> ${place.user_ratings_total != null ? Number(place.user_ratings_total).toLocaleString() : "--"}`;

        const status = formatStatus(place.opening_hours);
        els.detailStatus.innerHTML = `<span class="badge status" data-state="${status.state}">${status.label}</span>`;
        els.detailAddress.textContent = place.formatted_address || "--";
        els.detailPhone.textContent = place.phone || "--";
        if (place.website) {
            try {
                const info = place.website.startsWith("http") ? place.website : `https://${place.website}`;
                const parsed = new URL(info);
                els.detailWebsite.textContent = parsed.hostname.replace(/^www\./, "");
                els.detailWebsite.href = parsed.href;
            } catch (error) {
                els.detailWebsite.textContent = place.website;
                els.detailWebsite.href = place.website;
            }
        } else {
            els.detailWebsite.textContent = "--";
            els.detailWebsite.removeAttribute("href");
        }
        renderHours(place.opening_hours);
        updateDetailSave(place.place_id);
    }

    function hideDetails() {
        els.detailsPanel?.classList.remove("is-active");
        state.selectedPlaceId = null;
    }

    function updateDetailSave(placeId) {
        if (!els.detailSave) return;
        const saved = getSavedSet().has(placeId);
        els.detailSave.classList.toggle("saved", saved);
        els.detailSave.setAttribute("aria-pressed", saved ? "true" : "false");
        els.detailSave.innerHTML = saved ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    }

    function toggleSave(place) {
        const saved = storage.getSavedPlaces();
        const index = saved.findIndex(item => item.place_id === place.place_id);
        if (index === -1) {
            saved.push({ ...place, saved_at: new Date().toISOString() });
        } else {
            saved.splice(index, 1);
        }
        storage.setSavedPlaces(saved);
        updateDetailSave(place.place_id);
        applyFilters();
    }

    function populateCategorySelect(categories) {
        if (!els.categorySelect) return;
        els.categorySelect.innerHTML = "";
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "All categories";
        els.categorySelect.appendChild(defaultOption);
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            els.categorySelect.appendChild(option);
        });
    }

    function applyFilters() {
        const savedSet = getSavedSet();
        let dataset = state.allPlaces.slice();
        if (state.selectedCategory) {
            dataset = dataset.filter(place => place.category === state.selectedCategory);
        }
        if (state.showSavedOnly) {
            dataset = dataset.filter(place => savedSet.has(place.place_id));
        }
        dataset.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0));
        const top = dataset.slice(0, 25);
        updateCount(top.length);
        renderList(top);
        renderMarkers(top);
        if (state.selectedPlaceId && !top.some(place => place.place_id === state.selectedPlaceId)) {
            hideDetails();
        }
    }

    function attachEvents() {
        els.categorySelect?.addEventListener("change", event => {
            state.selectedCategory = event.target.value;
            applyFilters();
        });

        els.savedToggle?.addEventListener("click", () => {
            state.showSavedOnly = !state.showSavedOnly;
            els.savedToggle.classList.toggle("active", state.showSavedOnly);
            applyFilters();
        });

        els.detailsClose?.addEventListener("click", hideDetails);

        els.detailSave?.addEventListener("click", () => {
            if (!state.selectedPlaceId) return;
            const place = state.allPlaces.find(item => item.place_id === state.selectedPlaceId);
            if (place) {
                toggleSave(place);
            }
        });
    }

    async function bootstrap() {
        attachEvents();
        try {
            const places = await loadPlacesData();
            state.allPlaces = places;
            const categories = Array.from(new Set(places.map(place => place.category))).sort((a, b) => a.localeCompare(b));
            populateCategorySelect(categories);
            applyFilters();
        } catch (err) {
            console.error("Failed to initialise explore view", err);
            if (els.list) {
                els.list.innerHTML = '<div class="empty">Unable to load places data.</div>';
            }
        }
    }

    bootstrap();
})();

