(() => {
    const SENTOSA = { lat: 1.249404, lng: 103.830321 };
    const SINGAPORE_BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.2 };
    const WEEK_MINUTES = 7 * 24 * 60;
    let cachedPlaces = null;

    function pythonishToObject(raw) {
        if (!raw) return null;
        if (typeof raw === "object") return raw;
        let text = String(raw).trim();
        if (!text) return null;
        if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
            text = text.slice(1, -1);
        }
        text = text.replace(/\r?\n/g, "\\n");
        text = text.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null");
        try {
            return Function("\"use strict\";return (" + text + ");")();
        } catch (err) {
            console.warn("CloudData: failed to parse Python-style JSON", err);
            return null;
        }
    }

    function cleanHoursText(value) {
        if (typeof value !== "string") return "";
        return value
            .replace(/[\u202f\u2009\u200a]/g, " ")
            .replace(/[\u2013\u2014\u2212]/g, " - ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function sanitizeWeekdayText(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map(item => cleanHoursText(String(item || "")))
            .filter(Boolean);
    }

    function normalizeTime(value) {
        if (value == null) return null;
        const str = String(value).padStart(4, "0");
        const hh = Number(str.slice(0, 2));
        const mm = Number(str.slice(2));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return { raw: str, minutes: hh * 60 + mm };
    }

    function sanitizePeriods(periods) {
        if (!Array.isArray(periods)) return [];
        return periods
            .map(period => {
                const open = period?.open || {};
                const close = period?.close || {};
                const openDay = Number(open.day);
                const closeDay = close.day != null ? Number(close.day) : openDay;
                const openTime = normalizeTime(open.time);
                const closeTime = normalizeTime(close.time);
                if (!Number.isFinite(openDay) || !openTime) return null;
                return {
                    open: { day: openDay, time: openTime.raw, minutes: openTime.minutes },
                    close: closeTime
                        ? {
                              day: Number.isFinite(closeDay) ? closeDay : openDay,
                              time: closeTime.raw,
                              minutes: closeTime.minutes,
                          }
                        : null,
                };
            })
            .filter(Boolean);
    }

    function parseOpeningHours(raw) {
        const obj = pythonishToObject(raw);
        if (!obj) return null;
        const openNow = typeof obj.open_now === "boolean" ? obj.open_now : null;
        const periods = sanitizePeriods(obj.periods);
        const weekdayText = sanitizeWeekdayText(obj.weekday_text);
        return { open_now: openNow, periods, weekday_text: weekdayText };
    }

    function computeOpenStatus(opening, referenceDate = new Date()) {
        if (!opening) {
            return { isOpen: null, state: "unknown", label: "Hours unavailable" };
        }
        let computed = typeof opening.open_now === "boolean" ? opening.open_now : null;
        if (computed == null && opening.periods && opening.periods.length) {
            computed = false;
            const now = referenceDate;
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const nowDay = now.getDay();
            const totals = [nowDay * 1440 + nowMinutes, nowDay * 1440 + nowMinutes + WEEK_MINUTES];
            for (const period of opening.periods) {
                const open = period.open;
                if (!open || typeof open.minutes !== "number") continue;
                const closeCandidate = period.close && typeof period.close.minutes === "number"
                    ? period.close
                    : { day: period.close && Number.isFinite(period.close.day) ? period.close.day : open.day, minutes: (open.minutes + 60) % (24 * 60) };
                const start = open.day * 1440 + open.minutes;
                let end = (closeCandidate.day ?? open.day) * 1440 + closeCandidate.minutes;
                if (end <= start) end += WEEK_MINUTES;
                if (totals.some(total => total >= start && total < end)) {
                    computed = true;
                    break;
                }
            }
        }
        if (computed === true) return { isOpen: true, state: "open", label: "Open now" };
        if (computed === false) return { isOpen: false, state: "closed", label: "Closed now" };
        return { isOpen: null, state: "unknown", label: "Status unknown" };
    }

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function extractReviews(row, placeId) {
        const reviews = [];
        for (let i = 1; i <= 5; i += 1) {
            const author = row[`review_${i}_author_name`];
            const rating = toNumber(row[`review_${i}_rating`]);
            const dateRaw = row[`review_${i}_exact_date`];
            const text = row[`review_${i}_text`];
            if (!author && !text) continue;
            reviews.push({
                id: `${placeId}-seed-${i}`,
                author: author ? String(author).trim() : "Anonymous",
                rating: rating != null ? Math.max(0, Math.min(5, rating)) : null,
                date: dateRaw ? String(dateRaw).split(" ")[0] : "",
                text: text ? String(text).trim() : "",
                source: "csv",
            });
        }
        return reviews;
    }

    function buildPriceText(priceLevel) {
        if (!Number.isInteger(priceLevel) || priceLevel <= 0) return null;
        return "$".repeat(Math.min(priceLevel, 4));
    }

    function normalizePlace(row) {
        const lat = toNumber(row.latitude);
        const lng = toNumber(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const placeId = row.place_id || `${row.name || "place"}-${Date.now()}`;
        const opening = parseOpeningHours(row.opening_hours);
        const reviews = extractReviews(row, placeId);
        const priceLevel = toNumber(row.price_level);
        const normalized = {
            place_id: placeId,
            name: row.name || "Unknown",
            latitude: lat,
            longitude: lng,
            rating: toNumber(row.rating),
            user_ratings_total: toNumber(row.user_ratings_total),
            price_level: priceLevel,
            price_text: buildPriceText(priceLevel),
            formatted_address: row.formatted_address || row.vicinity || "",
            vicinity: row.vicinity || "",
            phone: row.international_phone_number || "",
            website: row.website || row.url || "",
            category: (row.category || "General").trim(),
            types: row.types,
            opening_hours: opening,
            reviews,
        };
        normalized.is_open_now = computeOpenStatus(opening).isOpen;
        return normalized;
    }

    function loadPlacesData() {
        if (cachedPlaces) {
            return Promise.resolve(cachedPlaces);
        }
        
        return fetch('/api/places')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(places => {
                // Transform database data to match the expected format
                const normalizedPlaces = places.map(place => {
                    // Add any missing fields and normalize the structure
                    return {
                        ...place,
                        latitude: Number(place.latitude),
                        longitude: Number(place.longitude),
                        rating: place.rating ? Number(place.rating) : null,
                        user_ratings_total: place.user_ratings_total ? Number(place.user_ratings_total) : 0,
                        price_level: place.price_level ? Number(place.price_level) : null,
                        vicinity: place.vicinity || place.formatted_address || '',
                        phone: place.international_phone_number || '',
                        types: place.types || [],
                        reviews: [], // Reviews will be loaded separately from the database
                    };
                });
                cachedPlaces = normalizedPlaces;
                return normalizedPlaces;
            })
            .catch(error => {
                console.error('Failed to load places from API:', error);
                // Fallback to CSV if API fails
                return new Promise((resolve, reject) => {
                    Papa.parse("./singapore_data_with_category.csv", {
                        download: true,
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        complete: results => {
                            const rows = results?.data || [];
                            const places = rows.map(normalizePlace).filter(Boolean);
                            cachedPlaces = places;
                            resolve(places);
                        },
                        error: err => reject(err),
                    });
                });
            });
    }

    function haversine(lat1, lng1, lat2, lng2) {
        const toRad = value => (value * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function storageAvailable() {
        try {
            const testKey = "__cloud_test__";
            window.localStorage.setItem(testKey, "1");
            window.localStorage.removeItem(testKey);
            return true;
        } catch (err) {
            console.warn("CloudStorage disabled", err);
            return false;
        }
    }

    const STORAGE_OK = storageAvailable();
    const STORAGE_KEYS = {
        saved: "saved_places",
        userReviews: "user_reviews_v2",
        legacyComments: "comments",
    };

    function readKey(key, fallback = []) {
        if (!STORAGE_OK) return Array.isArray(fallback) ? [...fallback] : fallback;
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return Array.isArray(fallback) ? [...fallback] : fallback;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [...fallback];
        } catch {
            return Array.isArray(fallback) ? [...fallback] : fallback;
        }
    }

    function writeKey(key, value) {
        if (!STORAGE_OK) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* ignore storage errors */
        }
    }

    function getSavedPlaces() {
        return readKey(STORAGE_KEYS.saved, []);
    }

    function setSavedPlaces(list) {
        writeKey(STORAGE_KEYS.saved, list);
    }

    function getUserReviews() {
        let reviews = readKey(STORAGE_KEYS.userReviews, []);
        if (!reviews.length) {
            const legacy = readKey(STORAGE_KEYS.legacyComments, []);
            if (legacy.length) {
                reviews = legacy.map(item => ({
                    id: item.id,
                    place_id: item.place_id,
                    author: item.user || "Anonymous",
                    rating: null,
                    text: item.text,
                    created_at: item.created_at,
                    source: "user",
                }));
                writeKey(STORAGE_KEYS.userReviews, reviews);
                if (STORAGE_OK) {
                    window.localStorage.removeItem(STORAGE_KEYS.legacyComments);
                }
            }
        }
        return reviews;
    }

    function setUserReviews(list) {
        writeKey(STORAGE_KEYS.userReviews, list);
    }

    function addUserReview(review) {
        const reviews = getUserReviews();
        reviews.push(review);
        setUserReviews(reviews);
    }

    function getUserReviewsByPlace(placeId) {
        return getUserReviews().filter(review => review.place_id === placeId);
    }

    function removeUserReview(reviewId) {
        const reviews = getUserReviews().filter(review => review.id !== reviewId);
        setUserReviews(reviews);
    }

    window.CloudData = {
        SENTOSA,
        SINGAPORE_BOUNDS,
        loadPlacesData,
        normalizePlace,
        parseOpeningHours,
        computeOpenStatus,
        haversine,
    };

    window.CloudStorage = {
        getSavedPlaces,
        setSavedPlaces,
        getUserReviews,
        setUserReviews,
        addUserReview,
        getUserReviewsByPlace,
        removeUserReview,
    };
})();
