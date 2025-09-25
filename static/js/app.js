(() => {
	const SENTOSA = { lat: 1.249404, lng: 103.830321 };
	const SINGAPORE_BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.2 };
	const MAX_PINS = 10;
	const RECS_MAX = 5;
	const SLIDE_INTERVAL_MS = 6500;

	const WEATHER_API = "https://api.data.gov.sg/v1/environment/2-hour-weather-forecast";
	const RAINFALL_API = "https://api.data.gov.sg/v1/environment/rainfall";
	const PSI_API = "https://api.data.gov.sg/v1/environment/psi";
	const TEMPERATURE_API = "https://api.data.gov.sg/v1/environment/air-temperature";

	const els = {
		locateBtn: document.getElementById("locateMe"),
		refreshBtn: document.getElementById("refreshData"),
		categorySelect: document.getElementById("categorySelect"),
		placeCount: document.getElementById("placeCount"),
		panelPlaceholder: document.querySelector(".panel-placeholder"),
		placeDetails: document.getElementById("placeDetails"),
		placeName: document.getElementById("placeName"),
		placeCategory: document.getElementById("placeCategory"),
		placeRating: document.getElementById("placeRating"),
		placeReviews: document.getElementById("placeReviews"),
		placePrice: document.getElementById("placePrice"),
		placeDistance: document.getElementById("placeDistance"),
		placeStatus: document.getElementById("placeStatus"),
		placeAddress: document.getElementById("placeAddress"),
		placePhone: document.getElementById("placePhone"),
		placeWebsite: document.getElementById("placeWebsite"),
		placeWebsiteLink: document.getElementById("placeWebsiteLink"),
		placeHours: document.getElementById("placeHours"),
		weatherArea: document.getElementById("weatherArea"),
		weatherDescription: document.getElementById("weatherDescription"),
		weatherUpdated: document.getElementById("weatherUpdated"),
		weatherSource: document.getElementById("weatherSource"),
		weatherErrors: document.getElementById("weatherErrors"),
		tempBadge: document.getElementById("tempBadge"),
		psiBadge: document.getElementById("psiBadge"),
		rainfallBadge: document.getElementById("rainfallBadge"),
		recTrack: document.getElementById("recommendationTrack"),
		recDots: document.getElementById("recommendationDots"),
		recPrev: document.getElementById("recPrev"),
		recNext: document.getElementById("recNext"),
		saveBtn: document.getElementById("savePlace"),
		commentText: document.getElementById("commentText"),
		postComment: document.getElementById("postComment"),
		commentsList: document.getElementById("commentsList"),
		savedList: document.getElementById("savedList"),
		reviewsList: document.getElementById("reviewsList"),
		navSaved: document.getElementById("navSaved"),
		navReviews: document.getElementById("navReviews"),
		ratingsChart: document.getElementById("ratingsChart"),
	};

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
		weatherCache: null,
		rainfallCache: null,
		psiCache: null,
		temperatureCache: null,
	};

	const map = L.map("map", { zoomControl: true }).setView([SENTOSA.lat, SENTOSA.lng], 13);
	L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

	const placeIcon = L.icon({
		iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png",
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
		shadowSize: [41, 41],
	});

	function isWithinSingapore(coords) {
		if (!coords) return false;
		const { lat, lng } = coords;
		return lat >= SINGAPORE_BOUNDS.minLat && lat <= SINGAPORE_BOUNDS.maxLat && lng >= SINGAPORE_BOUNDS.minLng && lng <= SINGAPORE_BOUNDS.maxLng;
	}

	function clearUserMarker() { if (state.userMarker) { map.removeLayer(state.userMarker); state.userMarker = null; } }

	const userIcon = L.icon({
		iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
		shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41],
	});

	function setUserLocation(coords, options = {}) {
		state.coords = { ...coords }; state.userHasSharedLocation = true;
		if (state.userMarker) { state.userMarker.setLatLng([coords.lat, coords.lng]); }
		else { state.userMarker = L.marker([coords.lat, coords.lng], { icon: userIcon }).addTo(map).bindTooltip("You are here", { permanent: false }); }
		if (options.pan !== false) { map.flyTo([coords.lat, coords.lng], 14, { duration: 0.8 }); }
	}

	function showToolbarMessage(message, isWarning = false) { if (!els.placeCount) return; els.placeCount.textContent = message; els.placeCount.style.color = isWarning ? "#dc2626" : ""; }
	function clearPlaceMarkers() { state.placeMarkers.forEach(m => m.remove()); state.placeMarkers = []; }

	function haversine(lat1, lng1, lat2, lng2) {
		const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180;
		const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
	}

	function parseOpeningHours(raw) { if (!raw) return null; try { const obj = typeof raw === "string" ? JSON.parse(raw) : raw; if (obj && typeof obj === "object") return obj; } catch {} return null; }

	function loadCSV() {
		return new Promise((resolve, reject) => {
			Papa.parse("/csv", { download: true, header: true, dynamicTyping: true, complete: r => resolve(r.data || []), error: reject });
		});
	}

	function normalizePlace(row) {
		const lat = Number(row.latitude); const lng = Number(row.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		const priceLevel = row.price_level != null ? Number(row.price_level) : null;
		const opening = parseOpeningHours(row.opening_hours);
		return {
			place_id: row.place_id || `${row.name}-${lat}-${lng}`,
			name: row.name || "Unknown",
			latitude: lat,
			longitude: lng,
			rating: row.rating != null ? Number(row.rating) : null,
			user_ratings_total: row.user_ratings_total != null ? Number(row.user_ratings_total) : null,
			price_level: priceLevel,
			price_text: Number.isInteger(priceLevel) && priceLevel > 0 ? "$".repeat(priceLevel) : null,
			formatted_address: row.formatted_address || row.vicinity || "",
			vicinity: row.vicinity || "",
			phone: row.international_phone_number || "",
			website: row.website || row.url || "",
			category: (row.category || "General").trim(),
			types: Array.isArray(row.types) ? row.types : null,
			opening_hours: opening,
			is_open_now: null,
		};
	}

	function buildCategories(places) { const set = new Set(); places.forEach(p => set.add(p.category)); return Array.from(set).sort((a,b)=>a.localeCompare(b)); }

	function populateCategorySelect() {
		if (!els.categorySelect) return; els.categorySelect.innerHTML = "";
		const opt0 = document.createElement("option"); opt0.value = ""; opt0.selected = true; opt0.textContent = "Select a category..."; els.categorySelect.appendChild(opt0);
		state.categories.forEach(cat => { const opt = document.createElement("option"); opt.value = cat; opt.textContent = cat; els.categorySelect.appendChild(opt); });
	}

	function loadPlacesForCategory(category) {
		if (!category) { clearPlaceMarkers(); state.selectedCategory = ""; state.selectedPlaceId = null; els.placeDetails?.setAttribute("hidden","hidden"); if (els.panelPlaceholder) els.panelPlaceholder.hidden = false; showToolbarMessage("Select a category to load up to 10 places."); return; }
		showToolbarMessage(`Loading ${category}...`);
		const nearby = state.allPlaces.filter(p => p.category === category).map(p => ({ place: p, distance: haversine(state.coords.lat, state.coords.lng, p.latitude, p.longitude) }));
		nearby.sort((a,b) => a.distance - b.distance || (b.place.rating ?? 0) - (a.place.rating ?? 0) || (b.place.user_ratings_total ?? 0) - (a.place.user_ratings_total ?? 0));
		let picks = nearby.slice(0, MAX_PINS).map(x => ({ ...x.place, distance_km: x.distance }));
		// Fallback: if no items for this category nearby, show top nearest across all categories
		if (!picks.length) {
			const all = state.allPlaces.map(p => ({ place: p, distance: haversine(state.coords.lat, state.coords.lng, p.latitude, p.longitude) }))
				.sort((a,b) => a.distance - b.distance || (b.place.rating ?? 0) - (a.place.rating ?? 0));
			picks = all.slice(0, MAX_PINS).map(x => ({ ...x.place, distance_km: x.distance }));
		}
		renderPlaces(picks);
		if (picks.length) { const count = Math.min(picks.length, MAX_PINS); if (state.userHasSharedLocation) showToolbarMessage(`${count} nearby places${category ? ` for ${category}` : ''}.`); else showToolbarMessage(`${count} popular places near Sentosa${category ? ` for ${category}` : ''}. Share location for personal results.`); }
		else { showToolbarMessage(`No places found for ${category} nearby.`, true); }
	}

	function renderPlaces(places) {
		clearPlaceMarkers(); if (!places.length) return;
		places.forEach(place => { const marker = L.marker([place.latitude, place.longitude], { icon: placeIcon }); marker.addTo(map).bindTooltip(`<strong>${place.name}</strong>`, { direction: "top" }); marker.on("click", () => displayPlaceDetails(place)); state.placeMarkers.push(marker); });
		const bounds = L.latLngBounds(places.map(p => [p.latitude, p.longitude])); if (state.userHasSharedLocation && state.userMarker) bounds.extend(state.userMarker.getLatLng()); map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
		// Show details only when a user clicks on a pin (no auto-open)
	}

	function displayPlaceDetails(place) {
		if (!els.placeDetails || !els.panelPlaceholder) return;
		state.selectedPlaceId = place.place_id; els.panelPlaceholder.hidden = true; els.placeDetails.hidden = false;
		els.placeName.textContent = place.name || "--"; els.placeCategory.textContent = place.category || "--";
		const rating = place.rating != null ? Number(place.rating).toFixed(1) : "--"; els.placeRating.innerHTML = `<i class="fas fa-star"></i> ${rating}`;
		const reviews = place.user_ratings_total != null ? Number(place.user_ratings_total).toLocaleString() : "--"; els.placeReviews.innerHTML = `<i class="fas fa-users"></i> ${reviews}`;
		if (place.price_text) { els.placePrice.hidden = false; els.placePrice.innerHTML = `<i class="fas fa-dollar-sign"></i> ${place.price_text}`; } else { els.placePrice.hidden = true; }
		if (typeof place.distance_km === "number") { els.placeDistance.hidden = false; els.placeDistance.innerHTML = `<i class="fas fa-route"></i> ${place.distance_km.toFixed(2)} km away`; } else { els.placeDistance.hidden = true; }
		const statusBadge = els.placeStatus?.querySelector(".badge.status"); if (statusBadge) { statusBadge.dataset.state = "unknown"; statusBadge.innerHTML = `<i class=\"fas fa-circle-question\"></i> Unknown`; }
		els.placeAddress.textContent = place.formatted_address || "--";
		if (place.phone) { const dial = String(place.phone).replace(/\s+/g, ""); els.placePhone.innerHTML = `<a href="tel:${dial}">${place.phone}</a>`; } else { els.placePhone.textContent = "--"; }
		if (place.website) { els.placeWebsite.hidden = false; els.placeWebsiteLink.textContent = place.website; els.placeWebsiteLink.href = place.website; } else { els.placeWebsiteLink.textContent = "--"; els.placeWebsiteLink.removeAttribute("href"); }
		renderOpeningHours(place.opening_hours);
		updateSaveStar(place.place_id);
		updateWeather({ lat: place.latitude, lng: place.longitude, label: place.name });
		renderComments(place.place_id);
	}

	function isPlaceSaved(placeId) { return !!getSavedPlaces().find(p => p.place_id === placeId); }

	function updateSaveStar(placeId) {
		if (!els.saveBtn) return;
		const saved = isPlaceSaved(placeId);
		els.saveBtn.classList.toggle("saved", saved);
		els.saveBtn.setAttribute("aria-pressed", saved ? "true" : "false");
		els.saveBtn.innerHTML = saved
			? '<i class="fas fa-star"></i> Saved'
			: '<i class="far fa-star"></i> Save';
	}

	function renderOpeningHours(opening) { if (!els.placeHours) return; els.placeHours.innerHTML = ""; if (!opening) { els.placeHours.innerHTML = "<li>Not available</li>"; return; } if (Array.isArray(opening.weekday_text) && opening.weekday_text.length) { opening.weekday_text.forEach(e => { const li = document.createElement("li"); li.textContent = e; els.placeHours.appendChild(li); }); return; } if (Array.isArray(opening.periods) && opening.periods.length) { opening.periods.forEach(period => { const open = period.open || {}; const close = period.close || {}; const li = document.createElement("li"); li.textContent = `${open.time ?? "--"} - ${close.time ?? "--"}`; els.placeHours.appendChild(li); }); return; } els.placeHours.innerHTML = "<li>Hours unavailable</li>"; }

	async function fetchWeatherApis() {
		try { const r = await fetch(WEATHER_API); state.weatherCache = await r.json(); } catch {}
		try { const r2 = await fetch(RAINFALL_API); state.rainfallCache = await r2.json(); } catch {}
		try { const r3 = await fetch(PSI_API); state.psiCache = await r3.json(); } catch {}
		try { const r4 = await fetch(TEMPERATURE_API); state.temperatureCache = await r4.json(); } catch {}
	}

	function nearestForecast(lat, lng) { const d = state.weatherCache || {}; const meta = d.area_metadata || []; const items = d.items || []; const forecasts = (items[0] && items[0].forecasts) || []; if (!meta.length || !forecasts.length) return null; const metaMap = new Map(meta.filter(m => m.label_location).map(m => [m.name, m])); let best = null; for (const fc of forecasts) { const mm = metaMap.get(fc.area); if (!mm) continue; const c = mm.label_location; const dist = haversine(lat, lng, c.latitude, c.longitude); const payload = { area: fc.area, forecast: fc.forecast, distance_km: Number(dist.toFixed(2)), update_timestamp: items[0]?.update_timestamp, valid_period: items[0]?.valid_period }; if (!best || dist < best.dist) best = { dist, payload }; } return best ? best.payload : null; }
	function nearestRainfall(lat, lng) { const d = state.rainfallCache || {}; const stations = (d.metadata && d.metadata.stations) || []; const items = d.items || []; const readings = (items[0] && items[0].readings) || []; const readingMap = new Map(readings.map(r => [r.station_id, r.value])); let best = null; for (const st of stations) { const amount = readingMap.get(st.id); if (amount == null) continue; const loc = st.location || {}; if (loc.latitude == null || loc.longitude == null) continue; const dist = haversine(lat, lng, loc.latitude, loc.longitude); const payload = { station_id: st.id, station_name: st.name, amount_mm: amount, distance_km: Number(dist.toFixed(2)), timestamp: items[0]?.timestamp }; if (!best || dist < best.dist) best = { dist, payload }; } return best ? best.payload : null; }
	function nearestPsi(lat, lng) { const d = state.psiCache || {}; const regions = d.region_metadata || []; const items = d.items || []; const readingsBlock = (items[0] && items[0].readings) || {}; const psiReadings = readingsBlock.psi_twenty_four_hourly || {}; let best = null; for (const region of regions) { const name = region.name; if (!(name in psiReadings)) continue; const c = region.label_location; if (!c) continue; const dist = haversine(lat, lng, c.latitude, c.longitude); const payload = { region: name, psi: psiReadings[name], distance_km: Number(dist.toFixed(2)), update_timestamp: items[0]?.update_timestamp }; if (!best || dist < best.dist) best = { dist, payload }; } return best ? best.payload : null; }

	function nearestTemperature(lat, lng) {
		const d = state.temperatureCache || {};
		const stations = (d.metadata && d.metadata.stations) || [];
		const items = d.items || [];
		const readings = (items[0] && items[0].readings) || [];
		// Support station_id or stationId keys
		const getStationId = r => r.station_id ?? r.stationId;
		const readingMap = new Map(readings.map(r => [getStationId(r), r.value]));
		let best = null;
		for (const st of stations) {
			const value = readingMap.get(st.id);
			if (value == null) continue;
			const loc = st.location || {};
			if (loc.latitude == null || loc.longitude == null) continue;
			const dist = haversine(lat, lng, loc.latitude, loc.longitude);
			const payload = {
				station_id: st.id,
				station_name: st.name,
				value_c: value,
				distance_km: Number(dist.toFixed(2)),
				timestamp: items[0]?.timestamp,
			};
			if (!best || dist < best.dist) best = { dist, payload };
		}
		return best ? best.payload : null;
	}

	function renderWeatherErrors(errors) { if (!els.weatherErrors) return; els.weatherErrors.innerHTML = ""; (errors || []).forEach(err => { const div = document.createElement("div"); const source = err.source ? err.source.toUpperCase() : "INFO"; div.textContent = `${source}: ${err.message}`; els.weatherErrors.appendChild(div); }); }

	async function updateWeather(ctx = {}) {
		const { lat, lng, label } = ctx;
		if (!state.weatherCache || !state.rainfallCache || !state.psiCache || !state.temperatureCache) {
			await fetchWeatherApis();
		}
		const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
		const errors = [];
		if (hasCoords) {
			const fc = nearestForecast(lat, lng);
			const rf = nearestRainfall(lat, lng);
			const psi = nearestPsi(lat, lng);
			const tmp = nearestTemperature(lat, lng);
			els.weatherArea.textContent = label || fc?.area || "Local weather";
			els.weatherSource.textContent = label || fc?.area || "--";
			els.weatherDescription.textContent = fc?.forecast || "Weather details unavailable.";
			const updatedAt = fc?.update_timestamp || rf?.timestamp || tmp?.timestamp || psi?.update_timestamp;
			els.weatherUpdated.textContent = updatedAt ? new Date(updatedAt).toLocaleString() : "--";
			if (tmp && tmp.value_c != null) {
				const st = tmp.station_name ? ` at ${tmp.station_name}` : "";
				els.tempBadge && (els.tempBadge.innerHTML = `<i class=\"fas fa-temperature-three-quarters\"></i> Temp: ${Number(tmp.value_c).toFixed(1)}°C${st}`);
			} else { if (els.tempBadge) els.tempBadge.innerHTML = `<i class=\"fas fa-temperature-three-quarters\"></i> Temp: --`; }
			if (psi && psi.psi != null) { const tag = psi.region ? ` (${psi.region})` : ""; els.psiBadge.innerHTML = `<i class=\"fas fa-wind\"></i> PSI: ${psi.psi}${tag}`; } else { els.psiBadge.innerHTML = `<i class=\"fas fa-wind\"></i> PSI: --`; }
			if (rf && rf.amount_mm != null) { const formatted = Number(rf.amount_mm).toFixed(2); const st = rf.station_name ? ` at ${rf.station_name}` : ""; els.rainfallBadge.innerHTML = `<i class=\"fas fa-umbrella\"></i> Rainfall: ${formatted} mm/h${st}`; } else { els.rainfallBadge.innerHTML = `<i class=\"fas fa-umbrella\"></i> Rainfall: --`; }
			if (!fc) errors.push({ source: "weather", message: "No nearby forecast found." });
			if (!rf) errors.push({ source: "rainfall", message: "No rainfall station match found." });
			if (!psi) errors.push({ source: "psi", message: "No PSI region match found." });
			if (!tmp) errors.push({ source: "temperature", message: "No temperature station match found." });
			renderWeatherErrors(errors);
		} else {
			const d = state.weatherCache || {};
			const items = d.items || [];
			const forecasts = (items[0] && items[0].forecasts) || [];
			const updateTs = items[0]?.update_timestamp;
			els.weatherArea.textContent = "Singapore (island-wide)";
			els.weatherDescription.textContent = forecasts.length ? `Most areas expect ${forecasts[0].forecast?.toLowerCase?.() || "varying"} conditions.` : "Latest island-wide outlook from Data.gov.sg.";
			els.weatherUpdated.textContent = updateTs ? new Date(updateTs).toLocaleString() : "--";
			els.weatherSource.textContent = "Island-wide";
			const psi = state.psiCache?.items?.[0]?.readings?.psi_twenty_four_hourly; const psiNational = psi?.national; els.psiBadge.innerHTML = `<i class=\"fas fa-wind\"></i> PSI: ${psiNational ?? "--"}`;
			const rfReadings = state.rainfallCache?.items?.[0]?.readings || []; let rfAvg = null; if (rfReadings.length) { const nums = rfReadings.map(r => Number(r.value)).filter(v => Number.isFinite(v)); rfAvg = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length) : null; } els.rainfallBadge.innerHTML = `<i class=\"fas fa-umbrella\"></i> Rainfall: ${rfAvg != null ? rfAvg.toFixed(2)+" mm/h avg" : "--"}`;
			const tReadings = state.temperatureCache?.items?.[0]?.readings || []; let tAvg = null; if (tReadings.length) { const tnums = tReadings.map(r => Number(r.value)).filter(v => Number.isFinite(v)); tAvg = tnums.length ? (tnums.reduce((a,b)=>a+b,0)/tnums.length) : null; } if (els.tempBadge) els.tempBadge.innerHTML = `<i class=\"fas fa-temperature-three-quarters\"></i> Temp: ${tAvg != null ? tAvg.toFixed(1)+"°C avg" : "--"}`;
			els.weatherErrors.innerHTML = "";
		}
	}

	function updateRecommendations() { if (!els.recTrack) return; const byCat = new Map(); state.categories.forEach(cat => { const candidates = state.allPlaces.filter(p => p.category === cat); if (!candidates.length) return; const ranked = candidates.map(p => ({ p, d: haversine(state.coords.lat, state.coords.lng, p.latitude, p.longitude) })).sort((a,b) => a.d - b.d || (b.p.rating ?? 0) - (a.p.rating ?? 0) || (b.p.user_ratings_total ?? 0) - (a.p.user_ratings_total ?? 0)); byCat.set(cat, ranked[0]?.p); }); const items = Array.from(byCat.entries()).slice(0, RECS_MAX).map(([category, place]) => ({ category, place })); renderRecommendations(items); }

	function renderRecommendations(items) { stopSliderAutoPlay(); state.slider.items = items; state.slider.index = 0; els.recTrack.innerHTML = ""; els.recDots.innerHTML = ""; if (!items.length) { const ph = document.createElement("div"); ph.className = "slider-placeholder"; ph.textContent = "No recommendations available right now."; els.recTrack.appendChild(ph); return; } items.forEach((item, idx) => { const slide = document.createElement("div"); slide.className = "slider-item"; slide.setAttribute("data-category", item.category); const details = document.createElement("div"); details.className = "details"; details.innerHTML = `
			<span class=\"badge muted\">${item.category}</span>
			<h3>${item.place.name}</h3>
			<p>${item.place.formatted_address || "--"}</p>
			<div class=\"meta\">
				<span class=\"badge\"><i class=\"fas fa-star\"></i> ${(item.place.rating ?? "--")}</span>
				<span class=\"badge muted\"><i class=\"fas fa-users\"></i> ${(item.place.user_ratings_total ?? "--")}</span>
				${item.place.price_text ? `<span class=\"badge price\"><i class=\"fas fa-dollar-sign\"></i> ${item.place.price_text}</span>` : ""}
			</div>
			<button class=\"btn ghost rec-load\" data-category=\"${item.category}\"><i class=\"fas fa-map-marker-alt\"></i> View ${item.category}</button>`; const meta = document.createElement("div"); meta.className = "map-preview"; meta.innerHTML = `<div class=\"category\">${item.place.category}</div><p>${item.place.distance_km ? `${Number(item.place.distance_km).toFixed(2)} km from you` : "Top rated pick"}</p>`; slide.append(details, meta); els.recTrack.appendChild(slide); const dot = document.createElement("span"); dot.className = "slider-dot"; dot.setAttribute("data-index", String(idx)); dot.addEventListener("click", () => goToSlide(idx)); els.recDots.appendChild(dot); }); els.recTrack.style.transform = "translateX(0)"; updateSliderIndicators(); startSliderAutoPlay(); bindRecommendationActions(); }
	function bindRecommendationActions() { document.querySelectorAll(".rec-load").forEach(button => { button.addEventListener("click", e => { const category = e.currentTarget.getAttribute("data-category"); if (category && els.categorySelect) { els.categorySelect.value = category; loadPlacesForCategory(category); } }); }); }
	function goToSlide(i) { if (!state.slider.items.length) return; const clamped = (i + state.slider.items.length) % state.slider.items.length; state.slider.index = clamped; els.recTrack.style.transform = `translateX(-${clamped * 100}%)`; updateSliderIndicators(); }
	function nextSlide() { goToSlide(state.slider.index + 1); }
	function prevSlide() { goToSlide(state.slider.index - 1); }
	function updateSliderIndicators() { els.recDots.querySelectorAll(".slider-dot").forEach((dot, idx) => { if (idx === state.slider.index) dot.classList.add("active"); else dot.classList.remove("active"); }); }
	function startSliderAutoPlay() { if (!state.slider.items.length) return; stopSliderAutoPlay(); state.slider.timer = window.setInterval(nextSlide, SLIDE_INTERVAL_MS); }
	function stopSliderAutoPlay() { if (state.slider.timer) { clearInterval(state.slider.timer); state.slider.timer = null; } }

	function requestLocation({ force = false } = {}) {
		if (!navigator.geolocation) { showToolbarMessage("Geolocation unavailable. Defaulting to Sentosa.", true); state.coords = { ...SENTOSA }; updateWeather(); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); return; }
		showToolbarMessage("Locating you...");
		navigator.geolocation.getCurrentPosition(pos => { const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; if (!isWithinSingapore(coords)) { state.coords = { ...SENTOSA }; state.userHasSharedLocation = false; setUserLocation(SENTOSA, { pan: true }); showToolbarMessage("Outside Singapore. Defaulting to Sentosa.", true); updateWeather(); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); return; } setUserLocation(coords, { pan: !state.userHasSharedLocation || force }); showToolbarMessage("Live location enabled."); updateWeather({ lat: coords.lat, lng: coords.lng, label: "Your location" }); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); }, () => { state.coords = { ...SENTOSA }; state.userHasSharedLocation = false; setUserLocation(SENTOSA, { pan: true }); showToolbarMessage("Location access denied. Using Sentosa.", true); updateWeather(); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
	}

	function saveToLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
	function loadFromLocal(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
	function getSavedPlaces() { return loadFromLocal("saved_places", []); }
	function setSavedPlaces(list) { saveToLocal("saved_places", list); }
	function getComments() { return loadFromLocal("comments", []); }
	function setComments(list) { saveToLocal("comments", list); }

	function bindSaveAndComment(placeId) {
		if (els.saveBtn) {
			els.saveBtn.onclick = () => {
				const saved = getSavedPlaces();
				const idx = saved.findIndex(p => p.place_id === placeId);
				if (idx === -1) {
					const place = state.allPlaces.find(p => p.place_id === placeId);
					if (place) {
						saved.push({ ...place, saved_at: new Date().toISOString() });
						setSavedPlaces(saved);
						renderSaved();
						updateSaveStar(placeId);
					}
				} else {
					saved.splice(idx, 1);
					setSavedPlaces(saved);
					renderSaved();
					updateSaveStar(placeId);
				}
			};
		}
		if (els.postComment) { els.postComment.onclick = () => { const text = (els.commentText?.value || "").trim(); if (!text) return; const name = prompt("Enter your name (optional)", "Anonymous") || "Anonymous"; const comments = getComments(); comments.push({ id: `${placeId}-${Date.now()}`, place_id: placeId, user: name, text, created_at: new Date().toISOString() }); setComments(comments); els.commentText.value = ""; renderComments(placeId); renderReviews(); }; }
	}

	function renderComments(placeId) { bindSaveAndComment(placeId); if (!els.commentsList) return; els.commentsList.innerHTML = ""; const comments = getComments().filter(c => c.place_id === placeId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); if (!comments.length) { els.commentsList.innerHTML = '<div class="empty">No comments yet.</div>'; return; } comments.forEach(c => { const div = document.createElement("div"); div.className = "comment"; div.innerHTML = `<div class="meta"><strong>${c.user}</strong> • ${new Date(c.created_at).toLocaleString()}</div><div class="text">${c.text}</div>`; els.commentsList.appendChild(div); }); }

	function renderSaved() { if (!els.savedList) return; els.savedList.innerHTML = ""; const saved = getSavedPlaces().sort((a,b) => new Date(b.saved_at) - new Date(a.saved_at)); if (!saved.length) { els.savedList.innerHTML = '<div class="empty">No saved places yet.</div>'; return; } saved.forEach(p => { const item = document.createElement("div"); item.className = "saved-item"; item.innerHTML = `
			<div class="title">${p.name}</div>
			<div class="sub">${p.category} • ${p.formatted_address || "--"}</div>
			<div class="meta"><span class="badge"><i class="fas fa-star"></i> ${(p.rating ?? "--")}</span> <button class="btn ghost go" data-id="${p.place_id}"><i class="fas fa-map-marker-alt"></i> Show on map</button> <button class="btn ghost remove" data-id="${p.place_id}"><i class="fas fa-trash"></i> Remove</button></div>`; els.savedList.appendChild(item); }); els.savedList.querySelectorAll(".go").forEach(btn => btn.addEventListener("click", e => { const id = e.currentTarget.getAttribute("data-id"); const place = state.allPlaces.find(x => x.place_id === id); if (place) { map.flyTo([place.latitude, place.longitude], 15, { duration: 0.6 }); displayPlaceDetails(place); } })); els.savedList.querySelectorAll(".remove").forEach(btn => btn.addEventListener("click", e => { const id = e.currentTarget.getAttribute("data-id"); const rest = getSavedPlaces().filter(x => x.place_id !== id); setSavedPlaces(rest); renderSaved(); })); }

	function renderReviews() { if (!els.reviewsList) return; els.reviewsList.innerHTML = ""; const comments = getComments().sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); if (!comments.length) { els.reviewsList.innerHTML = '<div class="empty">No comments yet.</div>'; return; } comments.forEach(c => { const place = state.allPlaces.find(p => p.place_id === c.place_id); const row = document.createElement("div"); row.className = "review-item"; row.innerHTML = `<div class="title">${place?.name || c.place_id}</div><div class="sub">by ${c.user} on ${new Date(c.created_at).toLocaleString()}</div><div class="text">${c.text}</div>`; els.reviewsList.appendChild(row); }); }

	function buildViz() { if (!els.ratingsChart) return; const ctx = els.ratingsChart.getContext("2d"); const byCat = new Map(); state.allPlaces.forEach(p => { const list = byCat.get(p.category) || []; if (p.rating != null) list.push(Number(p.rating)); byCat.set(p.category, list); }); const labels = Array.from(byCat.keys()); const averages = labels.map(cat => { const vals = byCat.get(cat) || []; if (!vals.length) return 0; return vals.reduce((a,b)=>a+b,0) / vals.length; }); new Chart(ctx, { type: "bar", data: { labels, datasets: [{ label: "Avg Rating", data: averages.map(v => Number(v.toFixed(2))), backgroundColor: "#60a5fa" }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 5 } } } }); }

	function attachEvents() { els.locateBtn?.addEventListener("click", () => requestLocation({ force: true })); els.refreshBtn?.addEventListener("click", () => { if (state.selectedPlaceId) { const place = state.allPlaces.find(item => item.place_id === state.selectedPlaceId); if (place) updateWeather({ lat: place.latitude, lng: place.longitude, label: place.name }); else updateWeather(); } else if (state.userHasSharedLocation) { updateWeather({ lat: state.coords.lat, lng: state.coords.lng, label: "Your location" }); } else { updateWeather(); } updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); }); els.categorySelect?.addEventListener("change", e => { const value = e.target.value; state.selectedCategory = value; loadPlacesForCategory(value); }); els.recNext?.addEventListener("click", () => { stopSliderAutoPlay(); nextSlide(); startSliderAutoPlay(); }); els.recPrev?.addEventListener("click", () => { stopSliderAutoPlay(); prevSlide(); startSliderAutoPlay(); }); map.on("movestart", stopSliderAutoPlay); els.navSaved?.addEventListener("click", () => { document.getElementById("saved")?.scrollIntoView({ behavior: "smooth" }); }); els.navReviews?.addEventListener("click", () => { document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" }); }); }

	function goToSlide(i) { if (!state.slider.items.length) return; const clamped = (i + state.slider.items.length) % state.slider.items.length; state.slider.index = clamped; els.recTrack.style.transform = `translateX(-${clamped * 100}%)`; updateSliderIndicators(); }
	function nextSlide() { goToSlide(state.slider.index + 1); }
	function prevSlide() { goToSlide(state.slider.index - 1); }
	function updateSliderIndicators() { els.recDots.querySelectorAll(".slider-dot").forEach((dot, idx) => { if (idx === state.slider.index) dot.classList.add("active"); else dot.classList.remove("active"); }); }
	function startSliderAutoPlay() { if (!state.slider.items.length) return; stopSliderAutoPlay(); state.slider.timer = window.setInterval(nextSlide, SLIDE_INTERVAL_MS); }
	function stopSliderAutoPlay() { if (state.slider.timer) { clearInterval(state.slider.timer); state.slider.timer = null; } }

	function requestLocation({ force = false } = {}) {
		if (!navigator.geolocation) { showToolbarMessage("Geolocation unavailable. Defaulting to Sentosa.", true); state.coords = { ...SENTOSA }; updateWeather(); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); return; }
		showToolbarMessage("Locating you...");
		navigator.geolocation.getCurrentPosition(pos => { const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; if (!isWithinSingapore(coords)) { clearUserMarker(); state.coords = { ...SENTOSA }; state.userHasSharedLocation = false; showToolbarMessage("Outside Singapore. Defaulting to Sentosa.", true); updateWeather(); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); return; } setUserLocation(coords, { pan: !state.userHasSharedLocation || force }); showToolbarMessage("Live location enabled."); updateWeather({ lat: coords.lat, lng: coords.lng, label: "Your location" }); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); }, () => { clearUserMarker(); state.coords = { ...SENTOSA }; state.userHasSharedLocation = false; showToolbarMessage("Location access denied. Using Sentosa.", true); updateWeather(); updateRecommendations(); if (state.selectedCategory) loadPlacesForCategory(state.selectedCategory); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
	}

	function bootstrap() {
		attachEvents();
		(async () => {
			const rows = await loadCSV();
			state.allPlaces = rows.map(normalizePlace).filter(Boolean);
			state.categories = buildCategories(state.allPlaces);
			populateCategorySelect();
			// Preselect first category (if any) so nearby facilities pins appear
			if (state.categories.length && !state.selectedCategory) {
				state.selectedCategory = state.categories[0];
				if (els.categorySelect) els.categorySelect.value = state.selectedCategory;
				loadPlacesForCategory(state.selectedCategory);
			}
			buildViz();
			updateWeather();
			updateRecommendations();
			renderSaved();
			renderReviews();
			requestLocation();
		})();
	}

	bootstrap();
})();
