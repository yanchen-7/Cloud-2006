import express from "express";
import { pool } from "../mysql.js";
import { getJson as getCachedJson, setJson as setCachedJson } from "../cache/redis.js";

const router = express.Router();

const DEFAULT_LIST_TTL = 300;
const DEFAULT_DETAIL_TTL = 120;
const DEFAULT_LIST_QUERY_TIMEOUT_MS = 10000;
const DEFAULT_DETAIL_QUERY_TIMEOUT_MS = 8000;
const DEFAULT_CLICKS_QUERY_TIMEOUT_MS = 5000;
const DEFAULT_PLACE_REVIEWS_LIMIT = 50;
const MYSQL_BAD_FIELD_ERROR = "ER_BAD_FIELD_ERROR";

function resolveTtl(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function resolveNumber(
  value,
  fallback,
  { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}
) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return Math.floor(clamped);
}

const listTtl = resolveTtl(process.env.PLACES_CACHE_TTL_SECONDS, DEFAULT_LIST_TTL);
const detailTtl = resolveTtl(process.env.PLACE_CACHE_TTL_SECONDS, DEFAULT_DETAIL_TTL);
const listQueryTimeoutMs = resolveNumber(
  process.env.PLACES_QUERY_TIMEOUT_MS,
  DEFAULT_LIST_QUERY_TIMEOUT_MS,
  { min: 500, max: 60000 }
);
const detailQueryTimeoutMs = resolveNumber(
  process.env.PLACE_QUERY_TIMEOUT_MS,
  DEFAULT_DETAIL_QUERY_TIMEOUT_MS,
  { min: 500, max: 60000 }
);
const clicksQueryTimeoutMs = resolveNumber(
  process.env.PLACE_CLICKS_QUERY_TIMEOUT_MS,
  DEFAULT_CLICKS_QUERY_TIMEOUT_MS,
  { min: 250, max: 60000 }
);
const placeReviewsLimit = resolveNumber(
  process.env.PLACE_REVIEWS_LIMIT,
  DEFAULT_PLACE_REVIEWS_LIMIT,
  { min: 10, max: 500 }
);

const LIST_CACHE_KEY = "places:all";
const PLACE_DETAIL_LOG_PREFIX = "/api/places";

function withQueryTimeout(sql, timeoutMs) {
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return { sql, timeout: timeoutMs };
  }
  return sql;
}

/**
 * Fetch reviews with multi-schema fallback.
 * Supports:
 *  1) modern schema: rating, status, deleted_at, sentiment_score, sentiment_label
 *  2) current schema (your DB): ratings (plural), deleted_at, sentiment_label
 *  3) legacy schema: ratings only
 */
async function fetchPlaceReviews(placeId, limit) {
  // 1) Modern schema
  const modernReviewsSql = `SELECT place_id, place_name, address, rating, review_text, publish_time, author_name, sentiment_score, sentiment_label
         FROM review
         WHERE place_id = ? AND status = 'approved' AND deleted_at IS NULL
         ORDER BY publish_time DESC
         LIMIT ${limit}`;
  const modernSummarySql = `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating
         FROM review
         WHERE place_id = ? AND rating IS NOT NULL AND status = 'approved' AND deleted_at IS NULL`;

  try {
    const [reviewsRows] = await pool.query(
      withQueryTimeout(modernReviewsSql, detailQueryTimeoutMs),
      [placeId]
    );
    const [summaryRows] = await pool.query(
      withQueryTimeout(modernSummarySql, detailQueryTimeoutMs),
      [placeId]
    );
    return { reviewsRows, summaryStats: summaryRows?.[0] ?? {} };
  } catch (err) {
    if (err?.code !== MYSQL_BAD_FIELD_ERROR) throw err;
  }

  // 2) Current schema (ratings plural)
  const currentReviewsSql = `SELECT place_id, place_name, address, ratings AS rating, review_text, publish_time, author_name, sentiment_label
         FROM review
         WHERE place_id = ? AND deleted_at IS NULL
         ORDER BY publish_time DESC
         LIMIT ${limit}`;
  const currentSummarySql = `SELECT COUNT(*) AS total_reviews, AVG(ratings) AS average_rating
         FROM review
         WHERE place_id = ? AND ratings IS NOT NULL AND deleted_at IS NULL`;

  try {
    const [reviewsRows] = await pool.query(
      withQueryTimeout(currentReviewsSql, detailQueryTimeoutMs),
      [placeId]
    );
    const [summaryRows] = await pool.query(
      withQueryTimeout(currentSummarySql, detailQueryTimeoutMs),
      [placeId]
    );
    return { reviewsRows, summaryStats: summaryRows?.[0] ?? {} };
  } catch (err) {
    if (err?.code !== MYSQL_BAD_FIELD_ERROR) throw err;
  }

  // 3) Legacy schema (ratings plural, no deleted_at)
  const legacyReviewsSql = `SELECT place_id, place_name, address, ratings AS rating, review_text, publish_time, author_name
         FROM review
         WHERE place_id = ?
         ORDER BY publish_time DESC
         LIMIT ${limit}`;
  const legacySummarySql = `SELECT COUNT(*) AS total_reviews, AVG(ratings) AS average_rating
         FROM review
         WHERE place_id = ? AND ratings IS NOT NULL`;

  const [reviewsRows] = await pool.query(
    withQueryTimeout(legacyReviewsSql, detailQueryTimeoutMs),
    [placeId]
  );
  const [summaryRows] = await pool.query(
    withQueryTimeout(legacySummarySql, detailQueryTimeoutMs),
    [placeId]
  );
  return { reviewsRows, summaryStats: summaryRows?.[0] ?? {} };
}

/**
 * Safely parses the opening_hours JSON string from the database.
 * The data is stored as a Python dict repr, so it needs cleaning.
 * @param {string | null | undefined} hoursString
 * @returns {object | null}
 */
function parseOpeningHours(hoursString) {
  if (!hoursString || typeof hoursString !== "string") {
    return null;
  }
  try {
    // Convert Python-style dict string to valid JSON
    const jsonString = hoursString
      .replace(/'/g, '"')
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null");
    return JSON.parse(jsonString);
  } catch (e) {
    return null; // Return null if parsing fails
  }
}

router.get("/", async (_req, res) => {
  try {
    const cachedPlaces = await getCachedJson(LIST_CACHE_KEY);
    if (cachedPlaces) {
      return res.json(cachedPlaces);
    }

    const [rows] = await pool.query(
      withQueryTimeout(
        // Align with existing schema in database.txt; alias to keep frontend fields consistent
        `SELECT
         place_id,
         place_name AS name,
         address AS formatted_address,
         address,
         latitude,
         longitude,
         category,
         international_phone_number,
         website,
         opening_hours,
         rating,
         price_level
       FROM business_info`,
        listQueryTimeoutMs
      )
    );

    // Parse opening_hours for each place
    const places = rows.map((place) => ({
      ...place,
      opening_hours: parseOpeningHours(place.opening_hours),
    }));

    if (listTtl > 0) {
      await setCachedJson(LIST_CACHE_KEY, places, listTtl);
    }
    res.json(places);
  } catch (e) {
    // Enhanced error logging to capture more details
    console.error("/api/places error:", {
      message: e.message,
      code: e.code,
      errno: e.errno,
      sqlState: e.sqlState,
    });
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

router.get("/recommendations", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      withQueryTimeout(
        `SELECT
         c.place_id,
         COUNT(*) AS clicks,
         b.place_name AS name,
         b.address,
         b.latitude,
         b.longitude,
         b.category,
         b.international_phone_number,
         b.website,
         b.opening_hours,
         b.rating,
         b.price_level
       FROM clicks c
       INNER JOIN business_info b
         ON c.place_id COLLATE utf8mb4_unicode_ci =
            b.place_id COLLATE utf8mb4_unicode_ci
       GROUP BY c.place_id, b.place_name, b.address, b.latitude, b.longitude,
                b.category, b.international_phone_number, b.website,
                b.opening_hours, b.rating, b.price_level
       ORDER BY clicks DESC
       LIMIT 5`,
        listQueryTimeoutMs
      )
    );

    const results = rows.map((row, index) => ({
      rank: index + 1,
      score: Number(row.clicks),
      place: {
        place_id: row.place_id,
        name: row.name,
        formatted_address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        category: row.category,
        international_phone_number: row.international_phone_number,
        website: row.website,
        opening_hours: parseOpeningHours(row.opening_hours),
        rating: row.rating,
        price_level: row.price_level,
      },
    }));

    res.json(results);
  } catch (e) {
    console.error("/api/places/recommendations error:", e);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

function pushClickRecord({ req, placeId, page, element, deviceType }) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
  // clicks.account_id is NOT NULL; use session user if present, else 0 (guest)
  const accountId = req.session?.user?.account_id ?? 0;
  const clickedAt = Math.floor(Date.now() / 1000);
  return pool.query(
    withQueryTimeout(
      `INSERT INTO clicks (place_id, account_id, page, element, device_type, ip_address, clicked_at)
       VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
      clicksQueryTimeoutMs
    ),
    [placeId, accountId, page || null, element || null, deviceType || null, ip, clickedAt]
  );
}

async function logClick(req, res) {
  const data = req.method === "GET" ? req.query : req.body;
  const { place_id: placeId, page, element, device_type: deviceType } =
    data || {};
  if (!placeId) return res.status(400).json({ error: "place_id is required" });

  try {
    await pushClickRecord({ req, placeId, page, element, deviceType });
    res.status(req.method === "GET" ? 200 : 201).json({ ok: true });
  } catch (e) {
    console.error("/api/places/clicks error:", e);
    res.status(500).json({ error: "Failed to log click" });
  }
}

router.post("/clicks", logClick);
// Fallback for environments that block POST; allows click logging via GET query params.
router.get("/clicks/log", logClick);

router.get("/:placeId/clicks", async (req, res) => {
  const placeId = req.params.placeId;
  const limit = resolveNumber(req.query.limit, 20, { min: 1, max: 200 });
  try {
    const [[metrics]] = await pool.query(
      withQueryTimeout(
        `SELECT COUNT(*) AS total_clicks
         FROM clicks
         WHERE place_id = ?`,
        clicksQueryTimeoutMs
      ),
      [placeId]
    );

    const clicksSql = `SELECT
           place_id,
           account_id,
           page,
           element,
           device_type,
           clicked_at
         FROM clicks
         WHERE place_id = ?
         ORDER BY clicked_at DESC
         LIMIT ${limit}`;

    const [rows] = await pool.query(
      withQueryTimeout(clicksSql, clicksQueryTimeoutMs),
      [placeId]
    );

    const clicks = rows.map((row) => ({
      place_id: row.place_id,
      account_id: Number(row.account_id ?? 0),
      page: row.page,
      element: row.element,
      device_type: row.device_type,
      clicked_at:
        row.clicked_at instanceof Date
          ? row.clicked_at.toISOString()
          : row.clicked_at,
    }));

    res.json({
      place_id: placeId,
      total: Number(metrics?.total_clicks || 0),
      returned: clicks.length,
      limit,
      clicks,
    });
  } catch (e) {
    console.error(`/api/places/${placeId}/clicks error:`, e);
    res.status(500).json({ error: "Failed to fetch logged clicks" });
  }
});

router.get("/:placeId", async (req, res) => {
  const started = Date.now();
  try {
    const placeId = req.params.placeId;
    const cacheKey = `places:${placeId}`;
    const cachedPlace = await getCachedJson(cacheKey);
    if (cachedPlace) {
      return res.json(cachedPlace);
    }

    const [rows] = await pool.query(
      withQueryTimeout(
        `SELECT
         place_id,
         place_name AS name,
         address AS formatted_address,
         address,
         latitude,
         longitude,
         category,
         international_phone_number,
         website,
         opening_hours,
         rating,
         price_level
       FROM business_info WHERE place_id = ? LIMIT 1`,
        detailQueryTimeoutMs
      ),
      [placeId]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Place not found" });

    const placeRecord = {
      ...rows[0],
      opening_hours: parseOpeningHours(rows[0].opening_hours),
    };

    const { reviewsRows, summaryStats } = await fetchPlaceReviews(
      placeId,
      placeReviewsLimit
    );

    const summary = {
      count: Number(summaryStats.total_reviews || 0),
      average:
        summaryStats.average_rating != null
          ? Number(summaryStats.average_rating)
          : null,
      limit: placeReviewsLimit,
    };

    const place = {
      ...placeRecord,
      user_reviews: reviewsRows,
      user_reviews_summary: summary,
    };

    if (detailTtl > 0) {
      await setCachedJson(cacheKey, place, detailTtl);
    }

    const duration = Date.now() - started;
    if (duration > detailQueryTimeoutMs * 0.9) {
      console.warn(
        `${PLACE_DETAIL_LOG_PREFIX}/${placeId} responded slowly: ${duration}ms`
      );
    }
    res.json(place);
  } catch (e) {
    console.error(`${PLACE_DETAIL_LOG_PREFIX}/${req.params.placeId} error:`, {
      message: e.message,
      code: e.code,
      errno: e.errno,
      sqlState: e.sqlState,
    });
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

export default router;
