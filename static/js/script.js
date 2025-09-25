(() => {
    const REFRESH_INTERVAL = 5 * 60 * 1000;
    const mapCenter = [1.3521, 103.8198];

    const statusMessage = document.getElementById("statusMessage");
    const lastUpdatedEl = document.getElementById("lastUpdated");
    const loadingIndicator = document.getElementById("loadingIndicator");
    const weatherInfo = document.getElementById("weatherInfo");
    const weatherIcon = document.getElementById("weatherIcon");
    const regionNameEl = document.getElementById("regionName");
    const weatherDescEl = document.getElementById("weatherDesc");
    const closeBtn = document.getElementById("closeInfo");
    const searchBox = document.getElementById("searchBox");
    const refreshBtn = document.getElementById("refreshBtn");

    const regionStore = new Map();
    let mapInitialized = false;
    let markerLayer;

    const mapColors = {
        sunny: "#fbbf24",
        cloudy: "#94a3b8",
        rainy: "#38bdf8",
        thunderstorm: "#6366f1",
        estimated: "#a855f7"
    };

    function initMap() {
        if (mapInitialized) {
            return;
        }
        window.weatherMap = L.map("map").setView(mapCenter, 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(window.weatherMap);
        markerLayer = L.layerGroup().addTo(window.weatherMap);
        mapInitialized = true;
    }

    function showStatus(message, type = "success", timeout = 4000) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = "block";
        if (timeout) {
            setTimeout(() => {
                statusMessage.style.display = "none";
            }, timeout);
        }
    }

    function setLoadingState(isLoading) {
        loadingIndicator.style.display = isLoading ? "flex" : "none";
        weatherInfo.style.display = isLoading ? "none" : "grid";
    }

    function toCategory(forecastText) {
        const text = forecastText.toLowerCase();
        if (text.includes("thunder")) {
            return "thunderstorm";
        }
        if (text.includes("shower") || text.includes("rain")) {
            return "rainy";
        }
        if (text.includes("cloud") || text.includes("overcast")) {
            return "cloudy";
        }
        return "sunny";
    }

    function categoryIcon(category) {
        switch (category) {
            case "thunderstorm":
                return "fa-bolt";
            case "rainy":
                return "fa-cloud-showers-heavy";
            case "cloudy":
                return "fa-cloud";
            case "estimated":
                return "fa-location-arrow";
            default:
                return "fa-sun";
        }
    }

    function renderRegions(metadata, forecasts) {
        markerLayer.clearLayers();
        regionStore.clear();

        const metadataMap = new Map(metadata.map(item => [item.name, item]));
        const fallback = metadata[0]?.label_location;

        forecasts.forEach(forecast => {
            const area = forecast.area;
            const meta = metadataMap.get(area);
            let coords = meta?.label_location;
            let category = toCategory(forecast.forecast);
            let markerCategory = category;

            if (!coords && fallback) {
                coords = fallback;
                markerCategory = "estimated";
            }

            if (!coords) {
                return;
            }

            const latlng = [coords.latitude, coords.longitude];
            const marker = L.circleMarker(latlng, {
                radius: 8,
                color: mapColors[markerCategory],
                fillColor: mapColors[markerCategory],
                fillOpacity: 0.8,
                weight: 2
            });

            marker.on("click", () => {
                focusRegion(area, forecast);
            });

            marker.bindTooltip(`<strong>${area}</strong><br>${forecast.forecast}`, {
                direction: "top"
            });

            marker.addTo(markerLayer);

            regionStore.set(area.toLowerCase(), {
                area,
                forecast,
                marker,
                category: markerCategory
            });
        });
    }

    function focusRegion(area, forecast) {
        const key = area.toLowerCase();
        const stored = regionStore.get(key);
        if (!stored) {
            return;
        }

        const category = stored.category;
        weatherIcon.innerHTML = `<i class="fas ${categoryIcon(category)}"></i>`;
        regionNameEl.textContent = stored.area;
        weatherDescEl.textContent = forecast.forecast;
        stored.marker.setStyle({
            radius: 10,
            weight: 3
        });
        setTimeout(() => {
            stored.marker.setStyle({ radius: 8, weight: 2 });
        }, 1200);

        if (mapInitialized) {
            window.weatherMap.flyTo(stored.marker.getLatLng(), 12, { duration: 0.6 });
        }
    }

    function handleSearch(event) {
        const query = event.target.value.trim().toLowerCase();
        if (!query) {
            return;
        }

        const match = Array.from(regionStore.keys()).find(name => name.includes(query));
        if (match) {
            const item = regionStore.get(match);
            focusRegion(item.area, item.forecast);
        }
    }

    function updateTimestamp(timestamp) {
        if (!timestamp) {
            return;
        }
        const date = new Date(timestamp);
        lastUpdatedEl.textContent = `Last updated: ${date.toLocaleString()}`;
    }

    async function loadWeather(triggeredByUser = false) {
        setLoadingState(true);
        try {
            initMap();
            const response = await fetch("/api/weather");
            if (!response.ok) {
                throw new Error(`Weather API responded with status ${response.status}`);
            }
            const data = await response.json();
            const metadata = data.area_metadata || [];
            const forecasts = data.items?.[0]?.forecasts || [];
            const timestamp = data.items?.[0]?.update_timestamp || data.items?.[0]?.timestamp;

            if (!metadata.length || !forecasts.length) {
                throw new Error("Weather payload missing metadata or forecasts");
            }

            renderRegions(metadata, forecasts);
            focusRegion(forecasts[0].area, forecasts[0]);
            updateTimestamp(timestamp);
            setLoadingState(false);
            if (triggeredByUser) {
                showStatus("Weather refreshed successfully", "success");
            }
        } catch (error) {
            console.error("Weather load error", error);
            setLoadingState(false);
            showStatus("Unable to load weather data. Please try again shortly.", "error", 6000);
        }
    }

    closeBtn.addEventListener("click", () => {
        weatherInfo.style.display = "none";
        loadingIndicator.style.display = "none";
        showStatus("Select a region marker to view details.", "success", 3000);
    });

    searchBox.addEventListener("input", handleSearch);
    refreshBtn.addEventListener("click", () => loadWeather(true));

    loadWeather();
    setInterval(loadWeather, REFRESH_INTERVAL);
})();
